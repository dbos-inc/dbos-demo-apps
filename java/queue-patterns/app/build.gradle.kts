plugins {
  application
  id("com.diffplug.spotless") version "8.6.0"
}

repositories { mavenCentral() }

dependencies {
  implementation("dev.dbos:transact:1.0.0")

  implementation("io.javalin:javalin:7.2.2")
  implementation("org.slf4j:slf4j-simple:2.0.18")

  implementation("com.fasterxml.jackson.core:jackson-databind:2.21.3")
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
  kotlinGradle {
    target("*.gradle.kts")
    ktfmt("0.61").googleStyle()
    trimTrailingWhitespace()
    endWithNewline()
  }
}

application { mainClass = "org.example.App" }

// The frontend is built at the project root, and Javalin resolves the external static
// files directory relative to the working directory, so run from there.
tasks.named<JavaExec>("run") { workingDir = rootProject.projectDir }
