plugins {
  application
  id("com.diffplug.spotless") version "8.3.0"
}

repositories { mavenCentral() }

dependencies {
  implementation("dev.dbos:transact:0.8.+") // TODO: update when released

  implementation("io.javalin:javalin:7.0.1")
  implementation("org.slf4j:slf4j-simple:2.0.17")
}

java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }

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

application { mainClass = "org.example.App" }
