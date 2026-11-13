ThisBuild / scalaVersion := "3.7.0"
ThisBuild / organization := "org.example"
ThisBuild / semanticdbEnabled := true
ThisBuild / semanticdbVersion := scalafixSemanticdb.revision

lazy val root = (project in file("."))
  .settings(
    name := "dbos-starter-scala",
    libraryDependencies ++= Seq(
      "dev.dbos"      % "transact"            % "1.3.0",
      // Needed to connect to DBOS Conductor (DBOS_CONDUCTOR_KEY), at the same version as transact
      "dev.dbos"      % "transact-enterprise" % "1.3.0",
      "com.lihaoyi"   %% "cask"               % "0.11.3",
      "org.slf4j"     % "slf4j-simple"        % "2.0.18",
      "org.scalameta" %% "munit"              % "1.0.0"    % Test,
      "org.mockito"   % "mockito-core"        % "5.23.0"   % Test,
    ),
    Compile / mainClass := Some("org.example.App"),
    scalacOptions += "-Wunused:all",
  )
