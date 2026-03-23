plugins {
  application
  id("com.diffplug.spotless") version "8.3.0"
}

repositories { mavenCentral() }

// Configuration for Mockito's underlying ByteBuddy agent
configurations { create("mockitoAgent") }

dependencies {
  implementation("dev.dbos:transact:0.8.+") // TODO: update when released

  implementation("io.javalin:javalin:7.0.1")
  implementation("org.slf4j:slf4j-simple:2.0.17")

  testImplementation(libs.junit.jupiter)
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
  testImplementation("org.mockito:mockito-core:5.22.0")

  // Add ByteBuddy agent (required by Mockito for inline mocking)
  add("mockitoAgent", "net.bytebuddy:byte-buddy-agent:1.17.7")
}

java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }

tasks.test {
  // Configure Mockito agent to avoid self-attaching warnings
  jvmArgs("-javaagent:${configurations["mockitoAgent"].asPath}")

  // Suppress JVM warning about class data sharing when agents are loaded
  jvmArgs("-Xshare:off")

  testLogging {
    // Show all test events
    events("passed", "skipped", "failed", "standardOut", "standardError")

    // Maximum detail for failures
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    showExceptions = true
    showCauses = true
    showStackTraces = true
    showStandardStreams = true

    // Show detailed info
    minGranularity = 0 // Show individual test methods
  }
}

spotless {
  java {
    googleJavaFormat()
    importOrder("dev.dbos", "java", "javax", "")
    removeUnusedImports()
    trimTrailingWhitespace()
    endWithNewline()
  }
  kotlin {
    target("src/**/*.kt")
    targetExclude("build/**/*.kt")
    ktfmt("0.61").googleStyle() // has its own section below
    trimTrailingWhitespace()
    endWithNewline()
  }
  kotlinGradle {
    target("*.gradle.kts")
    ktfmt("0.61").googleStyle() // has its own section below
    trimTrailingWhitespace()
    endWithNewline()
  }
}

application { mainClass = "org.example.App" }

tasks.named<Test>("test") { useJUnitPlatform() }
