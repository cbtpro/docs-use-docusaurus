---
title: Java 的 Finalizer 与 Cleaner：官方为什么要移除终结机制
authors: [cbtpro]
description: 用显式关闭管理资源生命周期，理解 Finalizer 的调度问题与 Cleaner 的注册、线程和清理边界。
tags:
  - java
  - jvm
  - 垃圾回收
  - 资源管理
  - cleaner
---

文件句柄、Socket 和堆外内存都有自己的使用期限。Java 对象暂时占用的堆空间很小，也可能持有昂贵的外部资源，因此资源释放最好由使用它的代码明确安排。

`finalize()` 曾承担调用方忘记关闭时的兜底。JDK 9 将其弃用，JDK 18 的 JEP 421 进一步标记为待移除。Cleaner 提供了显式注册清理动作的方式，适合补充资源管理；需要及时释放的资源仍使用 close 和 try-with-resources。

{/* truncate */}

## 显式关闭作为主路径

资源生命周期在一个作用域内时，实现 AutoCloseable 并使用 try-with-resources：

```java
try (FileInputStream input = new FileInputStream(file)) {
    doSomething(input);
}
```

正常结束和异常退出都会执行 close。多个资源按声明的相反顺序关闭，关闭异常按语言规定保留为 suppressed exception，调用方可以统一处理。

生命周期跨越多个方法时，由持有者明确承担 close 责任，例如连接池归还连接、服务停止时关闭线程池。资源的所有权与关闭位置一起设计，排查泄漏时就有明确入口。

## Finalizer 的时机与代价

GC 根据收集器策略、分配和内存压力等因素安排工作，外部资源即将耗尽并不会自动促使它及时调用 finalize。终结动作可能延迟，也可能在进程退出前始终没有执行。

终结机制还需要额外的可达性处理与调度，延长对象保留时间。具体回收过程取决于 JVM 和收集器，性能评估应使用实际负载。

finalize 可以访问 this，因而存在对象复活和部分构造对象暴露的问题。对象至少完成 Object 构造函数后，后续构造失败也可能进入终结处理。一个对象的终结方法最多由 JVM 自动调用一次；终结方法抛出的异常会被忽略。

这些问题及迁移方向在 [JEP 421](https://openjdk.org/jeps/421) 中有详细说明。

## Cleaner 将资源状态单独保存

Cleaner 注册一个对象和对应的 Runnable。清理动作只保存资源句柄，与持有资源的对象分离：

```java title="NativeResource.java"
import java.lang.ref.Cleaner;

public final class NativeResource implements AutoCloseable {
    private static final Cleaner CLEANER = Cleaner.create();

    private static final class State implements Runnable {
        private long handle;

        State(long handle) {
            this.handle = handle;
        }

        @Override
        public void run() {
            if (handle != 0) {
                freeNative(handle);
                handle = 0;
            }
        }
    }

    private final Cleaner.Cleanable cleanable;

    public NativeResource() {
        long handle = allocateNative();
        Cleaner.Cleanable registration;
        try {
            registration = CLEANER.register(this, new State(handle));
        } catch (RuntimeException | Error error) {
            freeNative(handle);
            throw error;
        }
        cleanable = registration;
    }

    @Override
    public void close() {
        cleanable.clean();
    }

    private static native long allocateNative();
    private static native void freeNative(long handle);
}
```

这里假设底层约定 0 为无效句柄，释放函数可靠且快速。构造时注册失败也释放已申请资源。`close()` 主动执行清理，重复调用同一个 Cleanable 最多执行一次动作。

State 使用静态嵌套类，持有句柄而不引用 NativeResource。若动作通过 lambda 或内部类捕获 this，强引用会阻止对象进入幻象可达状态，自动清理也就不会发生。

加入实际资源操作方法时，还要协调操作与 close 的并发；涉及原生句柄时，可在必要的位置使用 `Reference.reachabilityFence(this)` 保持对象可达直到操作完成。

## 清理线程与异常

自动清理由 Cleaner 关联的线程执行；显式 clean 在调用线程执行。清理动作保持短小，避免阻塞同一个 Cleaner 下的其他动作。库内通常共享一个 Cleaner，也可按隔离需求分组。

自动清理忽略动作异常，显式调用的异常行为则需要按实际 Cleanable 实现处理。关键资源的关闭结果由显式 close 路径负责记录和反馈。进程退出时，自动清理是否执行没有保证。

Cleaner 的注册、线程和清理动作约束见 [Cleaner API 文档](https://docs.oracle.com/en/java/javase/26/docs/api/java.base/java/lang/ref/Cleaner.html)。

## 适合 Cleaner 的场景

有些 API 的使用方式不适合暴露 close，例如内部用原生内存实现的值对象。Cleaner 可以在对象不再使用后释放这部分资源，代价是释放时间由 GC 调度。

对可以关闭的资源，Cleaner 可用作遗漏 close 时的补充。文件句柄、连接和锁仍在业务路径中及时释放。管理原生内存时，JDK 22 正式提供的 Foreign Function & Memory API 还可以通过 Arena 表达作用域：

```java
try (Arena arena = Arena.ofConfined()) {
    MemorySegment segment = arena.allocate(1024);
    // 在 arena 生命周期内使用 segment。
}
```

## 迁移排查

先定位覆写 finalize 和调用 runFinalization 的代码，再检查依赖库。编译器的弃用警告和运行期观测可以一起使用：

```bash
rg 'finalize\s*\(|runFinalization\s*\(' src --glob '*.java'

# 在支持该选项的 JDK 中，对相同测试负载比较资源占用。
java -jar app.jar
java --finalization=disabled -jar app.jar

# 查看待终结对象情况。
jcmd <pid> GC.finalizer_info
```

比较句柄数、RSS、吞吐量和异常，并覆盖正常关闭、异常退出及长时间运行。没有观察到差异只能说明当前负载未暴露依赖，还需覆盖第三方组件与资源峰值场景。

迁移顺序通常是明确所有权、补上 close、用 try-with-resources 收束作用域，再为适合的原生资源添加 Cleaner 兜底。JDK 版本中的具体开关状态可查对应发行版文档；JDK 18 引入了禁用选项，标记待移除与默认禁用是两个发布步骤。
