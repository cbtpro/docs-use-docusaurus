---
title: CRUD 之外 - 中文 IME 合成期在控件层的自洽处理
authors: [cbtpro]
description: 在文本控件中区分合成草稿与已提交值，处理最终值去重，并说明重置、提交和外层防抖的限制。
tags:
  - crud
  - 搜索
  - 防抖
  - 前端
  - react
  - 表单
  - 状态管理
  - 工程实践
  - 鲁棒性
  - 输入法
---

拼音输入“北京”时，输入框里会先出现尚未确认的拼音。防抖只判断时间间隔，用户选字前停顿一下，中间值仍可能触发搜索。

控件内部保留正在输入的文本，合成期间让用户正常看见拼音，选字结束后再把最终值提交给表单。同一个最终值只通知一次，外层搜索和校验就能围绕完整输入工作。

{/* truncate */}

## 两层值承担不同职责

控件内部的 `draft` 用于显示输入过程，外部 `value` 是表单已经接收的值。只拦截 `onChange`、却仍把旧的外部值传给受控输入框，可能导致文本回退或合成被干扰。

这是一个受控文本输入框的示例，`onChange` 直接接收字符串，适合交给 Form.Item 采集：

```tsx title="受控文本输入的合成处理示例"
import { useEffect, useRef, useState } from 'react'

type IMEInputProps = {
  value?: string
  onChange?: (value: string) => void
}

function IMEInput({ value = '', onChange }: IMEInputProps) {
  const [draft, setDraft] = useState(value)
  const composing = useRef(false)
  const lastCommitted = useRef(value)

  useEffect(() => {
    if (!composing.current) {
      setDraft(value)
      lastCommitted.current = value
    }
  }, [value])

  const commit = (next: string) => {
    if (next === lastCommitted.current) return
    lastCommitted.current = next
    onChange?.(next)
  }

  return (
    <input
      value={draft}
      onCompositionStart={() => { composing.current = true }}
      onCompositionEnd={(event) => {
        composing.current = false
        const next = event.currentTarget.value
        setDraft(next)
        commit(next)
      }}
      onChange={(event) => {
        const next = event.currentTarget.value
        setDraft(next)
        if (composing.current || (event.nativeEvent as InputEvent).isComposing) return
        commit(next)
      }}
    />
  )
}
```

`compositionend` 主动提交最终值，不依赖之后一定出现一次 change。若浏览器随后又上报相同字符串，`lastCommitted` 会过滤重复通知。这是值变化回调的语义；如果业务需要记录每个输入事件，就不应按字符串去重。

`compositionstart` 同步设置 ref，后续 change 同时检查 ref 和原生 `isComposing`，确认当前是否仍处于合成阶段。

## 外部重置和主动提交

合成期间保留当前草稿。外部清空字段或切换记录时，通过编辑会话 ID 作为控件 key，结束旧输入并按新值挂载；普通 value 更新则在非合成期同步。这样重置与用户输入各有明确的生效时机。

表单在合成期间保存的还是旧值。查询按钮、快捷键和提交按钮需要考虑这个事实：可以在合成期间禁用提交，或者把“提交当前输入”的动作交给控件协调。Enter 在合成阶段用于确认候选字，完成选字后才参与表单提交。

焦点移出时，浏览器和输入法可能提交或取消合成。验证 Tab 行为时，同时检查输入框最终显示值与 Form store，确认两者与用户完成的输入一致。

## 与防抖的配合

控件不报告中间拼音，可以减少新的搜索调度，但外层在合成开始前已经设好的计时器仍然可能到期。这时查到的是上一次已提交的值。如果要求合成期间完全不搜索，需要在 compositionstart 通知查询层取消待执行任务，并让手动查询检查合成状态。

控件自身管理的建议查询或远程校验计时器，也要在开始合成和卸载时清理。事件处理时取出字符串快照，延迟回调直接消费这个值。

`InputNumber` 的 onChange 返回数值或 null，其内部解析和格式化逻辑也不同。适配时以数值回调为入口，分别验证清空、全角数字和受控值更新。

验证时覆盖中文拼音、选字后追加输入、Enter 确认、Tab 移出、清空、外部重置和快速切路由。不同浏览器和输入法各跑一遍这些操作，记录最终值与通知次数。

相关实现：[composition 模块](https://github.com/cbtpro/action-in-reactjs/tree/main/apps/web/src/components/composition)。
