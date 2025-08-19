import React, { useRef, useState, useEffect } from 'react';
import CountdownTimer, { CountdownTimerRef } from './SetTimeoutFunction';

export default function Demo() {
  const timerRef = useRef<CountdownTimerRef>(null);
  const [, forceUpdate] = useState({}); // 用来刷新UI

  // 监听倒计时状态（让外部按钮能实时刷新禁用状态）
  useEffect(() => {
    const interval  = window.setInterval(() => {
      forceUpdate({});
    }, 200);
    return () => window.clearInterval(interval);
  }, []);

  const isRunning = timerRef.current?.isRunning ?? false;
  const count = timerRef.current?.count ?? 0;

  return (
    <div>
      <h2>外部控制倒计时</h2>
      <CountdownTimer
        ref={timerRef}
        countdown={5}
        onEnd={() => console.log('倒计时结束')}
        onStop={() => console.log('倒计时暂停')}
        onCompleted={() => console.log('倒计时完成/暂停')}
      />

      <div style={{ marginTop: 10 }}>
        <button onClick={() => timerRef.current?.start()} disabled={isRunning}>
          外部开始
        </button>
        <button onClick={() => timerRef.current?.pause()} disabled={!isRunning}>
          外部暂停
        </button>
        <button
          onClick={() => timerRef.current?.resume()}
          disabled={isRunning || count === 0}
        >
          外部继续
        </button>
        <button onClick={() => timerRef.current?.reset()}>外部重置</button>
      </div>
    </div>
  );
}
