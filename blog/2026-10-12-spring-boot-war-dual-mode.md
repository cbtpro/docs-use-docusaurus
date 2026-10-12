---
title: 同一个 WAR，两种启动方式：Spring Boot 的 WAR 双模式部署
authors: [cbtpro]
slug: spring-boot-war-dual-mode
description: 从 WAR 目录结构、provided 依赖和 Servlet 初始化入口，解释 Spring Boot 应用如何同时支持 java -jar 与外部 Tomcat 部署，以及本地调试和部署时需要注意的配置。
tags: [spring, java, 后端, 部署]
---

> 本文代码托管在 [github.com/cbtpro/action-in-spring](https://github.com/cbtpro/action-in-spring)，对应 [commit `8181c5c`](https://github.com/cbtpro/action-in-spring/commit/8181c5c)，模块目录 `action-war-demo`。

工作中遇到过这样一种开发流程：服务器使用外部 `Servlet` 容器部署应用，本地开发也照着搭一套 `Tomcat`。每次修改代码，都要重新编译、打包，把 `WAR` 部署进去，再启动服务、连接调试器。

这让我想起十年前开发 `JSP` 的时候。改代码、打 `WAR`、部署 `Tomcat`，然后打开页面验证。一圈走下来，花在等待和部署上的时间，有时比修改代码本身还多。

但已经很久不需要这样折腾了。

{/* truncate */}

`Spring Boot` 在首个正式版本 **1.0.0.RELEASE** 中就已支持内嵌 `Tomcat` 和 `Jetty`，[当时的官方文档第 24.2 节](https://docs.spring.io/spring-boot/docs/1.0.0.RELEASE/reference/htmlsingle/#boot-features-embedded-container)有具体说明。1.0 正式版发布于 [2014 年 4 月 1 日](https://spring.io/blog/2014/04/01/spring-boot-1-0-ga-released/)。

开发时，直接在 IDE 中运行启动类，`Tomcat` 随着应用一起启动，断点调试也和平常运行 `Java` 程序一样，不必先打 `WAR`、再部署到外部 `Tomcat`。这里说的内嵌容器是 `Tomcat` 这样的 `Servlet` 容器，与 `Docker` 容器是两个概念。

生产环境如果要求部署到外部 `Tomcat`，可以把应用打成 `WAR`，将内嵌 `Tomcat` 依赖标记为 `provided`，通过 `SpringBootServletInitializer` 接入外部容器的启动流程。本地继续在 IDE 中运行启动类就行。

`action-war-demo` 演示了这两种用法。`Spring Boot` 插件生成的可执行 `WAR` 还可以直接通过 `java -jar` 启动。下面看看打包配置，以及同一个 `WAR` 在两种启动方式下有什么区别。

本文使用 `Spring Boot 3.5.13`、`Java 21`，面向 `Spring MVC` / `Servlet` 应用。`WebFlux` 不支持这种 `WAR` 部署方式。

## 两种启动方式

`action-war-demo` 提供 `/hello` 和 `/deploy-info` 两个接口，启动过程如下：

```text
同一个 action-war-demo.war
├─ java -jar
│  └─ MANIFEST.MF → WarLauncher → WarDemoApplication.main()
│     └─ SpringApplication → 创建内嵌 Tomcat
└─ 外部 Tomcat 部署
   └─ SpringServletContainerInitializer → WebApplicationInitializer
      └─ SpringBootServletInitializer.configure()
         └─ SpringApplication → 使用已有 ServletContext

两条路径均加载业务代码，提供 /deploy-info 和 /hello。
```

## 看一下 `WAR` 里的文件

先构建：

```bash
./mvnw -pl action-war-demo clean package
```

产物有两个：`action-war-demo.war`（可执行包）和 `action-war-demo.war.original`（`Maven` 原生产物，`Spring Boot` 的 `repackage` 会把它改造成前者）。

用 `unzip -l` 看一眼可执行 `WAR` 的顶层结构：

```text
META-INF/MANIFEST.MF                      ← java -jar 的入口在这里
META-INF/services/...
org/springframework/boot/loader/...       ← Spring Boot Loader，自启动的核心
WEB-INF/classes/                          ← 业务代码
WEB-INF/lib/                              ← 普通依赖
WEB-INF/lib-provided/                     ← provided 依赖（内嵌 Tomcat）
WEB-INF/classpath.idx
WEB-INF/layers.idx
```

先记住两个位置：`org/springframework/boot/loader/` 是 `java -jar` 的自启动代码，`WEB-INF/lib-provided/` 装的是 `provided` 依赖。

`MANIFEST.MF` 的内容（从构建产物里取出）：

```text
Manifest-Version: 1.0
Created-By: Maven WAR Plugin 3.4.0
Build-Jdk-Spec: 21
Implementation-Title: action-war-demo
Implementation-Version: 0.0.1-SNAPSHOT
Main-Class: org.springframework.boot.loader.launch.WarLauncher
Start-Class: com.example.actioninspring.war.WarDemoApplication
Spring-Boot-Version: 3.5.13
Spring-Boot-Classes: WEB-INF/classes/
Spring-Boot-Lib: WEB-INF/lib/
Spring-Boot-Classpath-Index: WEB-INF/classpath.idx
Spring-Boot-Layers-Index: WEB-INF/layers.idx
```

`Main-Class` 和 `Start-Class` 是这里的两条关键信息。

`java -jar` 时 `JVM` 读 `Main-Class`，启动 `WarLauncher`；`WarLauncher` 再按 `Start-Class` 去调 `WarDemoApplication.main()`。

外置容器不会使用 `MANIFEST.MF` 中的 `Main-Class` 和 `Start-Class` 启动应用。它按 `Servlet` 规范扫描 `WEB-INF/`，触发 `ServletContainerInitializer`，走的是另一条路。

## 配置 `WAR` 打包和启动入口

主要配置在 `action-war-demo/pom.xml` 和启动类里，父 `POM` 还需注册模块。

### 将 `packaging` 设为 `war`

`action-war-demo/pom.xml`：

```xml
<artifactId>action-war-demo</artifactId>
<packaging>war</packaging>
```

这是一个多模块项目，父 `POM` 的 `modules` 中还要注册该模块：

```xml
<module>action-war-demo</module>
```

这样 `action-war-demo` 就会参与 `Maven` `reactor` 构建。

### 将内嵌 `Tomcat` 标记为 `provided`

`action-war-demo/pom.xml`：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-tomcat</artifactId>
    <scope>provided</scope>
</dependency>
```

### 配置打包插件

模块中还配置了 `maven-war-plugin`：

```xml
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-war-plugin</artifactId>
    <configuration>
        <failOnMissingWebXml>false</failOnMissingWebXml>
    </configuration>
</plugin>
```

`failOnMissingWebXml=false` 允许 `WAR` 中没有 `web.xml`。`Maven WAR Plugin` 从 3.1.0 起，对依赖 `Servlet 3.0` 或更高版本 API 的项目默认采用这一行为。本文使用 3.4.0，显式保留了这项配置。应用由 `Servlet` 初始化机制注册。

还要声明 `Spring Boot` 打包插件，才能把普通 `WAR` 重打包为可执行 `WAR`：

```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
</plugin>
```

本项目继承 `spring-boot-starter-parent`，声明插件后会使用父 `POM` 预配置的 `repackage` 执行。不继承这个父 `POM` 的项目，需要自行绑定 `repackage` goal。`repackage` 会加入 `Boot Loader`、写入启动清单，并整理依赖目录。

### 配置启动类

`action-war-demo/src/main/java/com/example/actioninspring/war/WarDemoApplication.java`：

```java
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.support.SpringBootServletInitializer;

@SpringBootApplication
public class WarDemoApplication extends SpringBootServletInitializer {

    /**
     * 外部 Servlet 容器（Tomcat / Jetty）的入口。
     * 由容器在部署时通过 ServletContainerInitializer 调用。
     */
    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
        return builder.sources(WarDemoApplication.class);
    }

    /**
     * 内嵌模式（java -jar）的入口。
     */
    public static void main(String[] args) {
        SpringApplication.run(WarDemoApplication.class, args);
    }
}
```

两个入口互不干扰：`java -jar` 时没人调 `configure()`，外置容器时没人调 `main()`。

换成其他外部容器时，需要检查 `Servlet`、`Java` 版本和类加载规则。例如，`WebLogic` 还可能需要启动类直接声明 `implements WebApplicationInitializer`，以及配置日志依赖的加载优先级，具体见 [Spring Boot 3.5 的部署说明](https://docs.spring.io/spring-boot/3.5/how-to/deployment/traditional-deployment.html)。

两个入口最终都通过 `SpringApplication` 创建应用上下文，加载相同的业务代码。

## 容器启动和停止时，Bean 会发生什么

前面说到，外部 `Tomcat` 会把应用启动起来。应用中那些 `Spring Bean` 又是谁创建的？停止 `Tomcat` 或重新部署 `WAR` 时，连接池、线程池这些资源由谁释放？

这里涉及两层管理：`Tomcat` 管理 Web 应用和 `Servlet`，`Spring` 的 `ApplicationContext` 管理业务 `Bean`。外部容器部署时，`SpringBootServletInitializer` 把这两层接起来。

### 启动：创建上下文，再初始化 Bean

外部 `Tomcat` 部署本文的 `WAR` 时，大致会经过下面的过程：

```text
Tomcat 部署 Web 应用，创建 ServletContext
  → SpringServletContainerInitializer 找到 WebApplicationInitializer
  → SpringBootServletInitializer.onStartup()
  → configure() 配置 SpringApplication 的启动源
  → 创建并刷新 Spring ApplicationContext
  → 创建普通非懒加载单例 Bean、注入依赖、执行初始化回调
  → 注册 DispatcherServlet 等 Servlet
  → Servlet 容器调用 Servlet.init()，之后通过 service() 处理请求
```

这张图省略了上下文刷新中的内部步骤。`Servlet` 可以在应用启动时初始化，也可以延迟到首次请求时初始化，由 `load-on-startup` 等配置决定。懒加载 `Bean` 同样可以到第一次使用时才创建。

一个普通 `Bean` 创建时，先执行构造方法，再完成依赖注入，然后执行初始化回调。需要使用已注入的依赖时，可以把初始化代码放进 `@PostConstruct` 标注的方法。

`Servlet.init()` 和 `Bean` 的初始化回调分别由两个容器调用。多数业务 `Bean` 由应用上下文创建，整个应用可以共用；不会每初始化一个 `Servlet`，就把这些 `Bean` 再创建一次。

### 停止：关闭上下文，执行 Bean 的销毁回调

外部 `Tomcat` 正常停止、卸载应用或重新部署 `WAR` 时，会销毁该 Web 应用。容器结束 `Servlet` 的服务后调用 `Servlet.destroy()`，并通知上下文监听器应用正在销毁。

本文的 `SpringBootServletInitializer` 在启动时注册了 `ContextLoaderListener`，监听器的 `contextDestroyed()` 会关闭根 `ApplicationContext`，进而触发其中受管理 `Bean` 的销毁：

```text
Tomcat 停止或卸载 Web 应用
  → 停止该应用的请求处理，调用 Servlet.destroy()
  → ContextLoaderListener.contextDestroyed()
  → 关闭 Spring ApplicationContext
  → 发布 ContextClosedEvent，停止 Lifecycle / SmartLifecycle 组件
  → 销毁受管理的单例 Bean，执行销毁回调
```

外部 `Tomcat` 中卸载一个 `WAR`，关闭的是这个应用的上下文；其他 Web 应用可以继续运行。这里也要区分 `DispatcherServlet.destroy()` 和根上下文的关闭：本文由初始化器创建的根上下文，通过上述监听器关闭；如果某个 `DispatcherServlet` 自己创建了子上下文，它会在销毁时关闭自己持有的子上下文。

换成内嵌模式，入口是 Java 进程的关闭流程。`Spring Boot` 默认注册 JVM 关闭钩子，正常退出时关闭 `ApplicationContext`，由上下文协调内嵌 Web 服务停止和 `Bean` 销毁。两种模式最终都走到 `Spring` 的关闭流程，业务 `Bean` 可以使用相同的清理方法。

### 初始化和销毁，分别可以写在哪个方法里

下面列出 `Servlet` 和 `Spring Bean` 各自的回调。它们在应用启动、停止过程中衔接，但调用对象和调用方不同：

| 管理对象 | 初始化 | 销毁 | 调用方 |
| --- | --- | --- | --- |
| `Servlet` | `Servlet.init(ServletConfig)` | `Servlet.destroy()` | `Servlet` 容器 |
| 使用注解的 `Bean` | `@PostConstruct` 标注的方法 | `@PreDestroy` 标注的方法 | `Spring` |
| 实现生命周期接口的 `Bean` | `InitializingBean.afterPropertiesSet()` | `DisposableBean.destroy()` | `Spring` |
| 使用自定义方法的 `Bean` | `@Bean(initMethod = "init")` 指定的方法 | `@Bean(destroyMethod = "close")` 指定的方法 | `Spring` |

比如，一个使用注解的单例 `Bean` 可以这样观察初始化和销毁。在 `action-war-demo` 的组件扫描范围内加入下面这个类即可；这是本文补充的示例，仓库中的引用提交不包含它。

```java
package com.example.actioninspring.war;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LifecycleDemo {

    private static final Logger log = LoggerFactory.getLogger(LifecycleDemo.class);

    @PostConstruct
    public void init() {
        log.info("LifecycleDemo 初始化完成");
    }

    @PreDestroy
    public void cleanup() {
        log.info("LifecycleDemo 正在销毁");
    }
}
```

启动应用时，依赖注入完成后会调用 `init()`。正常关闭应用上下文时会调用 `cleanup()`，实际项目中可以在这里关闭该 `Bean` 自己创建的连接、文件或线程池。方法叫 `cleanup()` 还是其他名字都可以，`Spring` 根据 `@PreDestroy` 找到它。使用 `Spring Boot 3` 时，这两个注解来自 `jakarta.annotation`。

如果一个 `Bean` 同时配置了多种回调，并且使用不同的方法，初始化顺序是 `@PostConstruct` → `afterPropertiesSet()` → 自定义初始化方法；销毁顺序是 `@PreDestroy` → `DisposableBean.destroy()` → 自定义销毁方法。通常选一种就够了。对于通过 `@Bean` 声明的对象，`Spring` 默认还会推断公开的 `close()` 或 `shutdown()` 方法作为销毁回调。

需要按阶段停止消息消费者、后台任务等组件时，可以实现 `SmartLifecycle`。正常关闭上下文时，它的 `stop()` / `stop(Runnable)` 阶段在单例销毁回调之前，用于先停止工作，再释放资源；`@PostConstruct` 只表示当前 `Bean` 完成初始化，应用整体就绪后的任务应放在合适的应用事件或启动回调中。

上面讨论的是正常关闭，以及由 `Spring` 管理销毁的对象。`prototype` 类型的 `Bean` 由调用方负责清理；直接 `new` 出来的普通对象也不会自动得到这些回调。`kill -9`、进程崩溃或断电时，JVM 关闭钩子和销毁方法都可能没有机会执行。

这部分可以结合 [Servlet 6.0 的生命周期说明](https://jakarta.ee/specifications/servlet/6.0/apidocs/jakarta.servlet/jakarta/servlet/Servlet.html)、[Spring Framework 6.2 的 Bean 生命周期文档](https://docs.spring.io/spring-framework/reference/6.2/core/beans/factory-nature.html)和 [SpringBootServletInitializer 源码](https://github.com/spring-projects/spring-boot/blob/v3.5.13/spring-boot-project/spring-boot/src/main/java/org/springframework/boot/web/servlet/support/SpringBootServletInitializer.java)来看。

## 标记为 `provided` 后，`Tomcat` 从哪里加载

`provided` 表示运行时由环境提供依赖，普通 `Maven` `WAR` 不会把它放进 `WEB-INF/lib`。可执行 `WAR` 在 `java -jar` 时仍需要内嵌 `Tomcat`，这部分依赖放在哪里？

`Spring Boot` 的 `repackage` 会将它们放进 `WEB-INF/lib-provided/`：

```text
WEB-INF/lib-provided/tomcat-embed-core-10.1.53.jar
WEB-INF/lib-provided/tomcat-embed-el-10.1.53.jar
WEB-INF/lib-provided/tomcat-embed-websocket-10.1.53.jar
```

而 `WEB-INF/classpath.idx` 里，两类目录都被列了进去：

```text
- "WEB-INF/lib/spring-boot-3.5.13.jar"
- "WEB-INF/lib/spring-webmvc-6.2.17.jar"
...
- "WEB-INF/lib-provided/tomcat-embed-core-10.1.53.jar"
- "WEB-INF/lib-provided/tomcat-embed-el-10.1.53.jar"
- "WEB-INF/lib-provided/tomcat-embed-websocket-10.1.53.jar"
```

分工是这样的：

- `WarLauncher` 加载 `WEB-INF/classes`、`WEB-INF/lib` 和 `WEB-INF/lib-provided`，`lib-provided` 里的内嵌 `Tomcat` 会被加载，`java -jar` 能起服务
- 外置容器只把 `WEB-INF/classes` 和 `WEB-INF/lib` 加入 `classpath`，`lib-provided` 不在其中，内嵌 `Tomcat` 不会被加载，也不会和容器自带的 `Tomcat` 打架

`classpath.idx` 记录依赖顺序，目录的加载规则定义在 `WarLauncher` 中。即使没有这个索引，`Loader` 也能按目录规则查找依赖。

## 外部 `Tomcat` 的版本要匹配

`Spring Boot 3` 使用 `jakarta.servlet`，`Tomcat 9` 使用 `javax.servlet`。本文的 `WAR` 需要部署到兼容的容器中，示例选择 `Tomcat 10.1`。

```java
import jakarta.servlet.ServletContext;
```

`ServletContext`、`HttpServletRequest`、`HttpServlet` 等类型属于 `Servlet API`。应用按 API 编写代码，容器提供运行环境，负责调用 `Servlet` 的 `init()`、`service()` 和 `destroy()`。`Spring MVC` 的 `DispatcherServlet` 也是一个 `Servlet`。

包名从 `Servlet 5.0` 起改为 `jakarta.servlet`，可以查看 [Jakarta Servlet 5.0 文档](https://jakarta.ee/specifications/servlet/5.0/)。本文 `Spring Boot 3.5` 的内嵌 `Tomcat` 是 10.1.53，外部容器的运行记录使用 10.1.44，均属于 `Tomcat 10.1` 系列。`Java`、`Servlet` 和容器版本要求见 [Spring Boot 3.5 系统要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)。

如果使用 `Jetty` 或 `Undertow`，需要从 `spring-boot-starter-web` 中排除默认的 `Tomcat` `starter`，再加入目标容器的 `starter`，并配置 `provided`。外部容器还要满足应用使用的 API 版本。

## `getServerInfo()` 能判断部署模式吗

模块里提供了一个 `/deploy-info` 接口，想用 `ServletContext.getServerInfo()` 判断当前是哪种模式。

`action-war-demo/src/main/java/com/example/actioninspring/war/controller/DeployInfoController.java`：

```java
@GetMapping("/deploy-info")
public Map<String, Object> deployInfo() {
    Map<String, Object> info = new LinkedHashMap<>();

    info.put("serverInfo", servletContext.getServerInfo());
    info.put("contextPath", servletContext.getContextPath());
    info.put("servletContextName", servletContext.getServletContextName());

    String serverInfo = servletContext.getServerInfo();
    boolean embedded = serverInfo != null && !serverInfo.startsWith("Apache");
    info.put("deploymentMode", embedded ? "EMBEDDED (java -jar)" : "EXTERNAL (Servlet Container)");

    info.put("javaVersion", System.getProperty("java.version"));
    info.put("osName", System.getProperty("os.name"));

    return info;
}
```

注释里的假设是：内嵌 `Tomcat` 返回 `Tomcat/10.1.x`，外部 `Tomcat` 返回 `Apache Tomcat/10.1.x`，所以用 `startsWith("Apache")` 就能区分。

两种模式的运行记录如下：

| 启动方式                           | `serverInfo`            | 这段逻辑给出的 `deploymentMode`       |
| ------------------------------ | ----------------------- | ------------------------------ |
| `java -jar`（内嵌 `Tomcat 10.1.53`） | `Apache Tomcat/10.1.53` | `EXTERNAL (Servlet Container)` |
| 外部 `Tomcat 10.1.44`              | `Apache Tomcat/10.1.44` | `EXTERNAL (Servlet Container)` |

两种模式都带 `Apache` 前缀，这段逻辑给出的结果也就都是 `EXTERNAL`。

> `ServletContext.getServerInfo()` 返回的是容器的名字加版本。内嵌 `Tomcat` 和外部 `Tomcat` 用的是同一份 `ServerInfo`，前缀一样。

还可以观察 `classpath` 上有没有 `WarLauncher`：

```java
import org.springframework.util.ClassUtils;

info.put("warLauncherOnClasspath", ClassUtils.isPresent(
        "org.springframework.boot.loader.launch.WarLauncher",
        getClass().getClassLoader()));
```

该示例在两种启动方式下的记录：

| 启动方式              | `warLauncherOnClasspath` |
| ----------------- | ------------------------ |
| `java -jar`       | `true`                   |
| 外部 `Tomcat 10.1.44` | `false`                  |

依据就是前面那套 `classpath` 规则：`WAR` 根目录下的 `org/springframework/boot/loader/` 不在外部容器的 `classpath` 里，而 `java -jar` 时它正是 `Main-Class`。

这个字段用于观察包的加载情况，所引用提交中没有加入它。IDE 启动和自定义类加载器下的结果可能不同，业务代码需要区分模式时，可以在两个入口中分别设置属性。

例如，在 `configure()` 中设置外部容器模式：

```java
@Override
protected SpringApplicationBuilder configure(SpringApplicationBuilder builder) {
    return builder.sources(WarDemoApplication.class)
            .properties("app.deployment-mode=external");
}
```

相应地，将 `main()` 改为：

```java
public static void main(String[] args) {
    new SpringApplicationBuilder(WarDemoApplication.class)
            .properties("app.deployment-mode=embedded")
            .run(args);
}
```

读取 `app.deployment-mode` 就能得到入口设置的模式。`properties()` 添加的是默认属性，配置文件、环境变量和命令行的优先级都比它高，公共 `application.yml` 中不再设置这个属性。这两处配置是本文补充的改法，仓库中的接口仍使用 `serverInfo` 判断。

## 启动并请求接口

下面的日志和响应来自示例的两次运行记录，对应仓库中尚未修改部署模式判断的代码。

在仓库根目录构建：

```bash
./mvnw -pl action-war-demo clean package
```

### 方式一：`java -jar`

```bash
java -jar action-war-demo/target/action-war-demo.war
```

端口取 `application.yml` 里的 `server.port`。

环境变量 `SERVER_PORT` 可以覆盖配置文件中的 `server.port`。为了固定示例端口，可使用 `java -jar action-war-demo/target/action-war-demo.war --server.port=8081`；命令行属性的优先级高于环境变量。

内嵌模式的启动日志：

```text
o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port 8081 (http)
o.apache.catalina.core.StandardEngine    : Starting Servlet engine: [Apache Tomcat/10.1.53]
o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port 8081 (http) with context path '/'
c.e.a.war.WarDemoApplication             : Started WarDemoApplication in 1.13 seconds
```

请求接口：

```bash
curl http://localhost:8081/deploy-info
```

```json
{
  "serverInfo": "Apache Tomcat/10.1.53",
  "contextPath": "",
  "servletContextName": "application",
  "deploymentMode": "EXTERNAL (Servlet Container)",
  "javaVersion": "21.0.8",
  "osName": "Mac OS X"
}
```

`contextPath` 是空字符串，对应日志里的 `context path '/'`。

### 方式二：外部 `Tomcat`

先将 `CATALINA_HOME` 指向 `Tomcat` 安装目录、`CATALINA_BASE` 指向实例目录；只有一份实例时两者可以相同。这里使用 8080 端口，并启用 `Tomcat` 自动部署：

```bash
cp action-war-demo/target/action-war-demo.war "$CATALINA_BASE/webapps/"
"$CATALINA_HOME/bin/startup.sh"
```

这次日志里没有 `Tomcat initialized with port`，也没有 `Tomcat started on port`——容器已经在了，`Spring Boot` 不会再起一个：

```text
org.apache.catalina.startup.HostConfig.deployWAR  正在部署web应用程序存档文件[.../webapps/action-war-demo.war]
c.e.a.war.WarDemoApplication  : Starting WarDemoApplication ... (.../webapps/action-war-demo/WEB-INF/classes started by pe7er ...)
w.s.c.ServletWebServerApplicationContext : Root WebApplicationContext: initialization completed in 306 ms
org.apache.catalina.startup.HostConfig.deployWAR  web应用程序存档文件[...]的部署已在[1,831]ms内完成
```

`contextPath` 变成了 `WAR` 的文件名：

```bash
curl http://localhost:8080/action-war-demo/deploy-info
```

```json
{
  "serverInfo": "Apache Tomcat/10.1.44",
  "contextPath": "/action-war-demo",
  "servletContextName": null,
  "deploymentMode": "EXTERNAL (Servlet Container)",
  "javaVersion": "21.0.8",
  "osName": "Mac OS X"
}
```

两种模式的 `contextPath` 不一样：内嵌模式默认是 `/`，外置模式默认是 `WAR` 文件名。

> 这个差异会直接影响前端的静态资源路径和接口前缀，资源和 API 地址应根据应用的 context path 或前端部署基址生成，避免写死根路径；简单相对路径在嵌套路由下也可能解析错误。

模块的 `application.yml`：

```yaml
spring:
  application:
    name: action-war-demo

server:
  port: 8081
```

`server.port` 在内嵌模式下生效；在外置模式下，端口由容器的 `Connector` 决定，这一项不生效。

## 回到本地开发

本地调试时，在 IDE 中运行 `WarDemoApplication.main()`，由应用启动内嵌 `Tomcat`。修改代码后的编译、重启可以交给 IDE 处理，调试器直接连接这个 `Java` 进程。

交付外部 `Tomcat` 时，再执行 `Maven` 打包，部署生成的 `WAR`。需要独立运行时，同一个 `WAR` 也可以用 `java -jar` 启动。

这样，本地开发和服务器部署各用适合的启动方式，平时调试就不用反复走一遍 `WAR` 部署流程了。

## 参考资料

- [本文对应的模块源码](https://github.com/cbtpro/action-in-spring/tree/8181c5c/action-war-demo)
- [Spring Boot 3.5：传统部署](https://docs.spring.io/spring-boot/3.5/how-to/deployment/traditional-deployment.html)
- [Spring Boot 3.5：系统与 Servlet 容器要求](https://docs.spring.io/spring-boot/3.5/system-requirements.html)
- [Spring Boot 3.5.13：WarLauncher 源码](https://github.com/spring-projects/spring-boot/blob/v3.5.13/spring-boot-project/spring-boot-tools/spring-boot-loader/src/main/java/org/springframework/boot/loader/launch/WarLauncher.java)
- [Maven WAR Plugin：failOnMissingWebXml](https://maven.apache.org/plugins/maven-war-plugin/war-mojo.html#failOnMissingWebXml)
- [Jakarta Servlet 5.0](https://jakarta.ee/specifications/servlet/5.0/)
