---
title: 从零实现支持跨天对齐的开发任务日历
authors: [cbtpro]
description: 基于 React、TypeScript、Ant Design 与 Emotion，实现支持重叠任务分行、跨天固定行位对齐、编辑拖拽与工作日计算的任务日历
tags:
  - react
  - typescript
  - antd
  - 日历
  - 算法
  - 组件
---

# 从零实现支持跨天对齐的开发任务日历

在团队协作中，开发任务通常跨越多个工作日，且经常存在并行重叠。如何在一个日历视图里清晰地展示这些任务的排期，保证同一任务跨天时始终对齐在同一行，同时让重叠任务自动分行？本文基于开源项目 [antd-calendar-demo](https://github.com/cbtpro/antd-calendar-demo) 介绍一套完整的实现方案。

{/* truncate */}

## 问题背景

Ant Design 6 的 Calendar 官方文档提供了「跨日期事件」示例，可以把一个跨天任务拆成多个日期单元格里的片段，按首段、中间段、末段分别绘制，再通过样式把相邻片段连接起来。但对于仍然使用 antd 5 的内网项目，直接升级到 v6 并不现实——仅为了这一个功能而升级整个 UI 库版本，风险与成本都不划算。

这个 demo 的目标就是：**在 antd 5 上实现与 v6 等价的跨天任务展示，并在此基础上加入泳道算法解决重叠任务的跨天对齐问题。**

## 核心难点：跨天对齐

最容易想到的实现方式是：每天用 `filter` 筛出当天的任务，再用 `map` 渲染到日期单元格中。但这样会导致错位——假设任务 A 占 1 月 7–9 日，任务 B 占 1 月 8–10 日：

- 8 日过滤出的数组是 `[A, B]`，B 在第二行
- 10 日只剩 `[B]`，普通纵向列表会把 B 放到第一行

日期筛选没有错，**缺少的是贯穿整个任务区间的行号**。因此需要先在完整任务集合上分配行号，再筛选某天任务，筛选时保留行号，不按当天数组索引重新编号。

## 泳道 lane 算法

泳道（lane）是任务在时间轴上的固定纵向位置。先给整个任务分配泳道，再让它在每一天的片段使用同一个泳道，跨天才能对齐。

### 三条规则

1. **重叠隔离**：同一天仍在进行的两个任务必须使用不同泳道。
2. **跨天固定**：一个任务的所有日期片段使用相同泳道，不能因为当天任务数量减少而上移。
3. **结束后复用**：某条泳道上的任务结束后，后续任务可以复用它；首尾日期均计入占用，复用只能从结束日的下一天开始。

### 分配算法

```ts
import type { Dayjs } from 'dayjs';

interface EventRange {
  key: string;
  start: Dayjs;
  end: Dayjs;
}

export const assignEventLanes = <T extends EventRange>(events: readonly T[]) => {
  const laneEnds: Dayjs[] = [];
  const sortedEvents = [...events].sort(
    (a, b) =>
      a.start.startOf('day').valueOf() - b.start.startOf('day').valueOf() ||
      b.end.startOf('day').valueOf() - a.end.startOf('day').valueOf() ||
      a.key.localeCompare(b.key),
  );

  return sortedEvents.map((event) => {
    // 结束日仍被任务占用，泳道只能从结束日的下一天开始复用。
    const availableLane = laneEnds.findIndex((end) => end.isBefore(event.start, 'day'));
    const lane = availableLane === -1 ? laneEnds.length : availableLane;
    laneEnds[lane] = event.end;

    return { ...event, lane };
  });
};
```

排序策略保证分配结果稳定：按开始日期升序，同一天开始的任务结束更晚的排在前面，起止日期都相同时按唯一 `key` 排序。`laneEnds[i]` 记录第 i 条泳道最后占用的日期，新任务寻找第一条结束日期严格早于自身开始日期的泳道来复用。

### 分配推演

以四个任务为例：

| 任务 | 开始 | 结束 | 分配过程 | lane |
| --- | --- | --- | --- | --- |
| A | 1 月 7 日 | 1 月 9 日 | 没有已有行，新建 | 0 |
| B | 1 月 8 日 | 1 月 10 日 | 第 0 行尚未结束，新建 | 1 |
| C | 1 月 9 日 | 1 月 13 日 | A、B 均占用当天，新建 | 2 |
| D | 1 月 10 日 | 1 月 10 日 | 第 0 行已于 9 日结束，复用 | 0 |

分配完成后按日期渲染，每一横行就是一条泳道：

| 行位 | 1/7 | 1/8 | 1/9 | 1/10 | 1/11 | 1/12 | 1/13 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| lane 0 | A | A | A | D | 空 | 空 | 空 |
| lane 1 | 空 | B | B | B | 空 | 空 | 空 |
| lane 2 | 空 | 空 | C | C | C | C | C |

11 日只有 C，但它仍在第 3 行。前两行留空正是对齐要求的一部分——这就是泳道算法要实现的效果。

## antd 5 的样式接入方案

v6 提供了 `styles.itemContent` 和 `classNames.itemContent` 语义节点，但在 antd 5 中这些接口不存在。解决方案是使用 `dateCellRender` 自定义日期单元格渲染，再通过 Emotion 的嵌套选择器覆盖内容区溢出：

```ts
calendar: css`
  &&& .${prefixCls}-calendar-date-content {
    overflow: visible;
  }
`,
```

`&&&` 提升 Emotion 生成类名的优先级，嵌套选择器只作用于当前日历实例，不会污染全局样式。组件内部使用 `getPrefixCls('picker', customizePrefixCls)` 与 Calendar 保持一致的前缀，支持 ConfigProvider 的自定义 `prefixCls`。

## 组件接口设计

组件继承 Calendar 的 props，但移除了原始单元格渲染入口（`cellRender`、`dateCellRender` 等），避免调用方覆盖负责对齐的布局。业务内容通过 `renderEvent` 扩展，外层任务条仍由组件管理：

```tsx
export type EventCalendarProps<T extends CalendarEvent = CalendarEvent> = Omit<
  CalendarProps<Dayjs>,
  | 'styles' | 'classNames'
  | 'cellRender' | 'fullCellRender'
  | 'dateCellRender' | 'dateFullCellRender'
  | 'monthCellRender' | 'monthFullCellRender'
> & {
  events: readonly T[];
  editable?: boolean;
  onEventMove?: (event: T, range: { start: Dayjs; end: Dayjs }) => void;
  onEventResize?: (event: T, range: { start: Dayjs; end: Dayjs }) => void;
  dateMarks?: readonly CalendarDateMark[];
  renderEvent?: (event: T, info: EventRenderInfo) => ReactNode;
  onEventClick?: (event: T, info: EventRenderInfo) => void;
};
```

泛型 `T extends CalendarEvent` 允许任务携带 `owner`、`priority` 等业务字段，并在自定义渲染函数里保持类型推断。`readonly T[]` 表示组件不会修改传入数组，符合不可变数据的原则。

## 编辑模式与拖拽

开启 `editable` 后，鼠标悬停任务真实两端显示拖拽手柄：

- **`onEventResize`**：拖动两端手柄直接修改对应日期，不自动顺延工期
- **`onEventMove`**：拖动任务主体整体移动，保持原工作日数——跳过周末、节假日和请假，补班计入

工作日计算口径与悬停 Tooltip 显示的有效工作日数一致。拖动时同一任务的所有可见片段变为半透明并显示阴影，完成后恢复原样式。拖动取消或日期未变化不提交回调。

### 工作日计算

整体移动时保持工作日数的逻辑：新落点为开始日期，从该日期后续的工作日开始计数，跳过周末和 `dateMarks` 中标记的 `holiday`、`leave`，计入 `workday`（补班）。落在非工作日时保留落点，从后续工作日开始计数。这保证了「3 个工作日的任务」移动后仍然是 3 个工作日。

## 日期标记系统

组件支持三类日期标记，由业务方提供，周末由组件自动识别：

- **`holiday`（节假日）**：红字、红色透明背景，任务片段显示半透明灰色
- **`workday`（补班）**：灰底白字「班」，恢复任务原色
- **`leave`（请假）**：灰底白字「请」，任务片段显示半透明灰色

补班优先覆盖周末和节假日样式；请假可以与其他标记并列。标记不占泳道，也不改变日期选择逻辑。`renderEvent` 和 `onEventClick` 回调的 `info.isWorkingDay` 表示当前片段是否计入工作量。

## 工程结构

整个实现按职责分离组织：

```text
src/components/EventCalendar/
├── index.ts          # 统一导出
├── types.ts          # 类型定义与组件接口
├── eventLayout.ts    # 泳道分配算法
├── useStyle.ts       # Emotion 样式 hook
└── EventCalendar.tsx # 主组件
```

业务示例、布局算法和通用组件三者分离，布局函数和样式 hook 可整体迁移复用。数据层使用 localStorage 持久化，支持任务与日期标记的增删改查，demo 中修改后的日期刷新仍保留。

## 小结

这个 demo 展示了如何在不升级 antd 版本的前提下，实现跨天任务日历的核心能力：

1. **泳道算法**解决跨天对齐——先在完整任务集合上分配行号，再按日期筛选保留行号
2. **Emotion 嵌套选择器**替代 v6 的语义样式入口，实现 antd 5 的样式接入
3. **泛型接口**让组件可扩展业务字段，同时保持类型安全
4. **工作日计算**让任务整体移动保持工期，口径与标记系统一致
5. **拖拽编辑**通过 `onEventMove` 和 `onEventResize` 两个独立回调，职责清晰

项目地址：[https://github.com/cbtpro/antd-calendar-demo](https://github.com/cbtpro/antd-calendar-demo)，包含完整的从零搭建教程、组件使用说明和本地存储接口文档。
