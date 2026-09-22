---
title: CRUD 之外 - 吸底操作栏的三态布局
authors: [cbtpro]
description: 区分操作栏隐藏、吸底和原位三种状态，处理锚点占位、滚动容器、降级路径和移动端安全区。
tags:
  - crud
  - 滚动
  - 布局
  - 前端
  - react
  - antd
  - 工程实践
  - 鲁棒性
---

长表单的提交按钮在底部，用户填到中间也可能想先保存。吸底栏能缩短操作距离，但是否一进入页面就显示，需要按产品场景决定。

这里采用三种状态：长表单首次进入时隐藏浮动栏，开始滚动后吸底，操作栏原本的位置进入可视区后恢复文档流。短表单直接显示底部按钮。

{/* truncate */}

## 判定状态与保留位置

```ts
type StickyState = 'hidden' | 'sticky' | 'inline'

function resolveState(anchorVisible: boolean, hasScrolled: boolean): StickyState {
  if (anchorVisible) return 'inline'
  return hasScrolled ? 'sticky' : 'hidden'
}
```

`hasScrolled` 表示本次挂载后已经发生过滚动，而不是当前 scrollTop 是否大于零。恢复到非零滚动位置时，也应按已滚动初始化。若要回到顶部就隐藏，需要改成基于当前位置的规则，状态判定统一采用所选规则。

锚点留在操作栏的正常位置。观察它是否进入滚动容器，并在 scroll 时更新“已滚动”标记；IntersectionObserver 不会因为用户第一次滚动就必然回调，因此需要两种事件配合。

操作栏切换为悬浮布局时，应保留相同的文档流高度。否则栏消失后内容变短，锚点进入视口；恢复栏后内容变长，锚点又移出，可能发生来回切换。锚点可见也不一定代表整条按钮栏都放得下，计算时要为栏高度留出空间。

本站的[表单演示](./2026-09-20-crud-beyond-form-create-detail-edit.mdx)使用持续挂载的操作栏：hidden 时用 visibility 保留高度，sticky 时用 CSS sticky，inline 时回到普通定位。它与上游采用 fixed 的实现不同，目的是让读者在一个独立滚动容器里观察状态。

## root 与降级路径

IntersectionObserver 的 root 设置为实际滚动容器，锚点与操作栏都相对该容器测量。滚动和尺寸变化时重新检查几何位置，使用少量像素容差处理小数尺寸与整数滚动高度的舍入。

容器和操作栏高度会因窗口大小、文字换行而变化，需要重新计算观察范围。ResizeObserver 可以监听这些变化。没有 IntersectionObserver 时，在 scroll 和 resize 回调中测量锚点，或者退回普通底部按钮。

清理时解除 scroll/resize 监听并断开 observer。按钮本身保持同一份挂载，能减少模式切换导致的焦点丢失。

## fixed 的包含块

如果使用 fixed，让它相对浏览器视口定位，可能会覆盖侧栏。给稳定的外层 Content 设置 transform，可以为后代 fixed 建立包含块：

```css
.app-content {
  position: relative;
  transform: translateZ(0);
}
.app-content__body {
  min-height: 0;
  overflow: auto;
}
.sticky-actions--fixed {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
}
```

包含块放在滚动区外的稳定容器。transform 会创建层叠上下文，后代 fixed 元素和 z-index 按新的包含关系布局；弹层根据实际挂载容器确定定位与层级。

## 安全区交给 CSS

移动设备的安全区可能随横竖屏和浏览器界面变化，交给 CSS 的 env 值随布局变化更新更方便。

```css
.sticky-actions {
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
```

浏览器更新 env 值后，操作栏的尺寸观察响应高度变化。需要 JS 偏移时，在布局变化后读取元素的实际尺寸。

隐藏首屏操作栏是一种交互选择，不应妨碍键盘用户完成表单。需要始终可达的场景可以直接保留 sticky 两态或固定的主操作入口。

上游实现参考：[StickyActions.tsx](https://github.com/cbtpro/action-in-reactjs/blob/main/apps/web/src/components/StickyActions.tsx)。
