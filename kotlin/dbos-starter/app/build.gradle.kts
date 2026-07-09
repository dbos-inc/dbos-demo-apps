plugins {
  application
  id("org.jetbrains.kotlin.jvm") version "2.3.21"
  id("com.diffplug.spotless") version "8.3.0"
}

repositories { mavenCentral() }

dependencies {
  implementation("dev.dbos:transact:1.0.0")

  implementation("io.javalin:javalin:7.2.2")
  implementation("org.slf4j:slf4j-simple:2.0.18")

  implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.18.9")

  testImplementation("org.jetbrains.kotlin:kotlin-test")
  testImplementation("org.junit.jupiter:junit-jupiter:6.1.0")
  testImplementation("org.mockito.kotlin:mockito-kotlin:6.2.3")
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

application { mainClass = "org.example.AppKt" }

tasks.test {
  useJUnitPlatform()
  testLogging {
    events("passed", "skipped", "failed")
    showStandardStreams = true
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}
