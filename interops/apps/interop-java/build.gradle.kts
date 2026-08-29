plugins {
  application
  id("com.diffplug.spotless") version "8.3.0"
  id("com.gradleup.shadow") version "9.3.2"
}

repositories { mavenCentral() }

dependencies {
  implementation("dev.dbos:transact:+")
  implementation("io.javalin:javalin-bundle:7.0.1")
  implementation("org.slf4j:slf4j-simple:2.0.17")
}

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

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

application { mainClass = "com.example.interop.App" }
