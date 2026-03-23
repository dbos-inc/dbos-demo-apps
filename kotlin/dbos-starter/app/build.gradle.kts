plugins {
  alias(libs.plugins.kotlin.jvm)
  application
  id("com.diffplug.spotless") version "8.3.0"
}

repositories { mavenCentral() }

configurations { create("mockitoAgent") }

dependencies {
  implementation("dev.dbos:transact:0.8.+") // TODO: update when released

  implementation("io.javalin:javalin:7.0.1")
  implementation("org.slf4j:slf4j-simple:2.0.17")

  testImplementation("org.jetbrains.kotlin:kotlin-test")
  testImplementation(libs.junit.jupiter.engine)
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
  testImplementation("org.mockito.kotlin:mockito-kotlin:6.2.3")

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
    ktfmt("0.61").googleStyle()
    trimTrailingWhitespace()
    endWithNewline()
  }
  kotlinGradle {
    target("*.gradle.kts")
    ktfmt("0.61").googleStyle()
    trimTrailingWhitespace()
    endWithNewline()
  }
}

application {
  // Define the main class for the application.
  mainClass = "org.example.AppKt"
}

tasks.named<Test>("test") {
  // Use JUnit Platform for unit tests.
  useJUnitPlatform()
}
