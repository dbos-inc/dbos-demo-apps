plugins {
  application
  id("com.diffplug.spotless") version "8.3.0"
  id("com.gradleup.shadow") version "9.3.2"
}

repositories { mavenCentral() }

dependencies {
  // `+` is the latest version published, prereleases included — every build of
  // the SDK's main branch publishes one (1.1.0-mN). This app needs application
  // names and DBOS.enqueuePortableWorkflow, which are in a prerelease ahead of
  // the 1.0.0 release, so resolving releases only would not see them.
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
