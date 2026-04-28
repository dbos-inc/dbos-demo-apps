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

dependencies {
  implementation("dev.dbos:transact-spring-boot-starter:0.8.0")
  implementation("org.springframework.boot:spring-boot-starter-webmvc")
  implementation("org.springframework.boot:spring-boot-starter-data-jpa")
  implementation("org.flywaydb:flyway-core")
  implementation("org.flywaydb:flyway-database-postgresql")

  runtimeOnly("org.postgresql:postgresql")
  testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

spotless {
  setEnforceCheck(false)
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

tasks.test {
  useJUnitPlatform()
  testLogging {
    events("passed", "skipped", "failed")
    showStandardStreams = true
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}
