import { useCallback, useEffect, useRef } from 'react'

// 防抖:静默 wait 毫秒后执行,期间重置计时器,中间事件全部丢弃。
export function useDebouncedCallback<F extends (...args: any[]) => void>(
  fn: F,
  wait: number,
): (...args: Parameters<F>) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn // 每次渲染拿到最新闭包,避免依赖数组里漏 fn。

  const debounced = useCallback(
    (...args: Parameters<F>) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        fnRef.current(...args)
      }, wait)
    },
    [wait],
  )

  // 卸载时清理,避免对已卸载组件 setState。
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return debounced
}

// 节流:首次立即执行,之后按 interval 间隔触发,末次响应保证最后一次输入被处理。
export function useThrottledCallback<F extends (...args: any[]) => void>(
  fn: F,
  interval: number,
): (...args: Parameters<F>) => void {
  const lastRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const throttled = useCallback(
    (...args: Parameters<F>) => {
      const now = Date.now()
      const remaining = interval - (now - lastRef.current)
      if (remaining <= 0) {
        // 间隔已过,立即执行。
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
        lastRef.current = now
        fnRef.current(...args)
      } else if (!timerRef.current) {
        // 间隔未到,安排末次响应,避免最后一次拖动被丢。
        timerRef.current = setTimeout(() => {
          lastRef.current = Date.now()
          timerRef.current = null
          fnRef.current(...args)
        }, remaining)
      }
    },
    [interval],
  )

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  return throttled
}

// rAF 节流:跟随类场景用 rAF,让浏览器决定节奏,避免固定 interval 和帧率错位。
export function useRafThrottle<F extends (...args: any[]) => void>(
  fn: F,
): (...args: Parameters<F>) => void {
  const scheduledRef = useRef(false)
  const latestArgsRef = useRef<Parameters<F> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const throttled = useCallback((...args: Parameters<F>) => {
    latestArgsRef.current = args
    if (scheduledRef.current) return
    scheduledRef.current = true
    requestAnimationFrame(() => {
      scheduledRef.current = false
      if (latestArgsRef.current) {
        fnRef.current(...latestArgsRef.current)
      }
    })
  }, [])

  useEffect(
    () => () => {
      scheduledRef.current = false
    },
    [],
  )

  return throttled
}
