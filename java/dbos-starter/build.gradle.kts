plugins {
  java
  id("org.springframework.boot") version "4.0.1"
  id("io.spring.dependency-management") version "1.1.7"
}

group = "com.example"
version = "0.0.1-SNAPSHOT"
description = "DBOS for Java Starter App"

java {
  toolchain {
    languageVersion = JavaLanguageVersion.of(17)
  }
}

repositories {
  mavenCentral()
}

dependencies {
  implementation("dev.dbos:transact:0.6.+")
  implementation("org.springframework.boot:spring-boot-starter-web")
  testImplementation("org.springframework.boot:spring-boot-starter-web-test")
  testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<Test> {
  useJUnitPlatform()
}
