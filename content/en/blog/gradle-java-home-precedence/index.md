---
title: "Why Gradle Used JDK 21 While java -version Reported JDK 8"
date: 2026-07-08
draft: false
tags: ["android", "gradle", "jdk", "java-home", "build"]
categories: ["Mobile Engineering"]
description: "Diagnosing an older Android build where the shell used JDK 8 but the Gradle Wrapper followed JAVA_HOME to JDK 21."
---

An older Android project using Gradle 6.8 and Android Gradle Plugin 4.2 failed in the extractDeepLinks task with an error saying that the Java module system did not open java.io. That error is typical when an old build tool runs on a newer modular JDK.

The confusing part was that java -version in the same PowerShell window reported JDK 8. It would have been easy to spend time changing application code, the Manifest, or the Build Tools version warning.

## PATH and JAVA_HOME select different runtimes

The java -version command only shows the java.exe resolved from PATH. The Gradle Wrapper startup script checks JAVA_HOME first. When JAVA_HOME is present, the wrapper launches its Java executable directly and does not care which version appears first on PATH.

Both gradlew --version and the Gradle daemon log identified the actual runtime as JDK 21. The environment effectively looked like this:

~~~text
java resolved from PATH  -> JDK 8
JAVA_HOME                -> JDK 21
runtime used by gradlew  -> JDK 21
~~~

That explained the module-access exception completely. The message about an older Android Build Tools version was only a warning and was not the failing condition.

## Confirm with a falsifiable test

Instead of editing the project first, I temporarily pointed JAVA_HOME to an installed JDK 8 in the current PowerShell session and reran the exact same release build.

The build completed and produced the APK. That single comparison established that:

- source code and resources were buildable;
- signing and Manifest configuration were not the failure;
- the error depended on the JVM that launched Gradle;
- adding broad module-opening flags to an old project was unnecessary.

The override was limited to the current shell, so projects that required JDK 21 elsewhere on the workstation were unaffected.

## Preventing the mismatch

On a workstation that maintains several Java generations, project scripts should select JAVA_HOME explicitly and print gradlew --version before important builds. CI should pin its JDK as well instead of inheriting a machine-wide default.

The broader lesson is that a version check is only meaningful when it comes from the process performing the work. If a tool behaves as though the wrong runtime is active, inspect wrappers, daemons, IDE settings, and environment-variable precedence. A single java -version command does not describe the complete build chain.
