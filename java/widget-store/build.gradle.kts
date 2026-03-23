plugins {
  java
  id("org.springframework.boot") version "4.0.3"
  id("io.spring.dependency-management") version "1.1.7"
  id("com.diffplug.spotless") version "8.3.0"
}

group = "com.example"

version = "0.0.1-SNAPSHOT"

description = "Demo project for Spring Boot"

java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }

repositories { mavenCentral() }

configurations { create("mockitoAgent") }

dependencies {
  implementation("dev.dbos:transact:0.8.+") // TODO: update when released

  implementation("org.springframework.boot:spring-boot-starter-webmvc")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.flywaydb:flyway-core")
  implementation("org.flywaydb:flyway-database-postgresql")

  runtimeOnly("org.postgresql:postgresql")
  testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")

  // Add ByteBuddy agent (required by Mockito for inline mocking)
  add("mockitoAgent", "net.bytebuddy:byte-buddy-agent:1.17.7")
}

tasks.withType<Test> { useJUnitPlatform() }

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
