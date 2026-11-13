ThisBuild / scalaVersion := "3.7.0"
ThisBuild / organization := "org.example"
ThisBuild / semanticdbEnabled := true
ThisBuild / semanticdbVersion := scalafixSemanticdb.revision

val dbosVersion = "1.3.0"

lazy val root = (project in file("."))
  .settings(
    name := "dbos-starter-scala",
    libraryDependencies ++= Seq(
      "dev.dbos"      % "transact"            % dbosVersion,
      // Needed to connect to DBOS Conductor (DBOS_CONDUCTOR_KEY)
      "dev.dbos"      % "transact-enterprise" % dbosVersion,
      "com.lihaoyi"   %% "cask"               % "0.11.3",
      "org.slf4j"     % "slf4j-simple"        % "2.0.18",
      "org.scalameta" %% "munit"              % "1.0.0"    % Test,
      "org.mockito"   % "mockito-core"        % "5.23.0"   % Test,
    ),
    Compile / mainClass := Some("org.example.App"),
    scalacOptions += "-Wunused:all",
  )
