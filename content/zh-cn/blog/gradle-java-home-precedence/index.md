---
title: "java -version 是 JDK 8，Gradle 为何仍使用 JDK 21"
date: 2026-07-08
draft: false
tags: ["android", "gradle", "jdk", "java-home", "build"]
categories: ["移动端开发"]
description: "一次老 Android 项目打包失败的排查：终端 java 命令来自 JDK 8，但 Gradle Wrapper 实际优先使用了 JAVA_HOME 中的 JDK 21。"
---

一个使用 Gradle 6.8 和 Android Gradle Plugin 4.2 的老 Android 项目，在 extractDeepLinks 任务失败，错误提示 Java 模块没有开放 java.io。这个错误通常出现在老构建工具运行于较新的模块化 JDK 上。

奇怪的是，同一个 PowerShell 窗口执行 java -version 明明显示 JDK 8。继续围绕代码、Manifest 或 Build Tools 警告排查，很可能浪费时间。

## PATH 与 JAVA_HOME 不是一回事

java -version 只说明 shell 从 PATH 中找到的 java.exe 版本。Gradle Wrapper 的启动脚本会优先检查 JAVA_HOME；只要它存在，就直接使用 JAVA_HOME 下的 Java，而不理会 PATH 中排在前面的版本。

检查 gradlew --version 和 Gradle daemon 日志后，实际 JVM 清楚地显示为 JDK 21。终端中的状态因此是：

~~~text
PATH 中的 java      -> JDK 8
JAVA_HOME           -> JDK 21
gradlew.bat 使用     -> JDK 21
~~~

这完全解释了模块访问错误。Build Tools 版本过低的提示只是警告，并不是导致任务失败的原因。

## 用可证伪的方式确认

为了排除代码、签名和资源问题，我没有先修改项目，而是在当前 PowerShell 会话中临时把 JAVA_HOME 指向已安装的 JDK 8，然后重新执行同一个 release 构建命令。

构建成功并生成 APK，证明：

- 源码和资源可以编译；
- 签名和 Manifest 不是失败点；
- 失败只与 Gradle 实际运行的 JVM 有关；
- 不需要为了绕过错误而给老项目添加危险的模块开放参数。

临时覆盖只作用于当前终端，也避免影响机器上需要 JDK 21 的其他项目。

## 后续防护

对于必须并行维护多套 Java 版本的工作站，可以在项目启动脚本中显式选择 JAVA_HOME，并在构建前输出 gradlew --version。CI 也应固定 JDK，而不是依赖执行机器的全局环境。

这次排障最值得记住的是：工具报告的版本必须来自真正执行任务的进程。遇到“版本明明正确但行为不对”时，检查 wrapper、daemon、IDE 和环境变量各自选择了哪个运行时。一个 java -version 不能代表整条构建链。
