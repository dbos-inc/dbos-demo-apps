plugins {
  application
  id("com.diffplug.spotless") version "8.6.0"
}

repositories { mavenCentral() }

dependencies {
  // using latest 0.9 milestone release of DBOS
  implementation("dev.dbos:transact:0.9.+")

  implementation("io.javalin:javalin:7.2.2")
  implementation("org.slf4j:slf4j-simple:2.0.18")

  testImplementation("org.junit.jupiter:junit-jupiter:6.1.0")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
  testImplementation("org.mockito:mockito-core:5.23.0")
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

application { mainClass = "org.example.App" }

tasks.test {
  useJUnitPlatform()
  testLogging {
    events("passed", "skipped", "failed")
    showStandardStreams = true
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}
