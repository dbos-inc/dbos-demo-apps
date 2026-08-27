plugins {
  application
  id("com.diffplug.spotless") version "8.3.0"
  id("com.gradleup.shadow") version "9.3.2"
}

// TEMPORARY — drop this commit once the SDK fixes are published.
// dbos-transact-java `skip-unrecognized-serialization` fixes two bugs this demo hit:
// getWorkflowStatus threw on a peer application's payload, and on the empty
// error column the Go SDK writes. Until that is released, the app builds
// against a local `./gradlew :transact:publishToMavenLocal` of that branch.
// The version is pinned rather than resolved: a branch build is `1.1.0-aN-gHASH`,
// which sorts *below* main's `1.1.0-mN`, so `+` would ignore it.
repositories {
  mavenLocal()
  mavenCentral()
}

dependencies {
  implementation("dev.dbos:transact:1.1.0-a11-g11897bc")
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
