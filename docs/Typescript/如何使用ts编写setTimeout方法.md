<!--
 Copyright 2022 peter
 
 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at
 
     http://www.apache.org/licenses/LICENSE-2.0
 
 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
-->

使用reactjs拥抱typescript

## 在ts中编写setTimeout

```javascript
// demo.tsx
interface Props {
  enabled: boolean; // 启用倒计时
  countdown: number; // 倒计时读秒时间
  onEnd: () => {}; // 读秒结束回调
  onStop: () => {}; // 读秒停止回调
  onCompleted () => {}; // 定时器结束、停止都会执行
}

export default function Demo(props: Props) {
  const {
    enabled: false,
    countdown = 10,
    onEnd = () => {},
    onStop,
    onCompleted,
  } = props;
  const [count, setCount] = useState(countdown);
  const [isEnabled, setIsEnabled] = useState(enabled);
  // 使用ReturnType<typeof setTimeout>推断定时器的返回类型。
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout>>();

  const startCount = (currentCount = count) => {
    setCount(currentCount);
    if (currentCount > 0) {
      const timerId = setTimeout(() => {
        const nextCount = currentCount - 1;
        startCount(nextCount);
      }, 1000)
      setTimer(timerId);
    }
  };
  const closeHandler = () => {
    // 清除定时器
    clearTimeout(timer as unknown as number);
  };
  useEffect(() => {
    if (enabled) {
      setIsEnabled(true);
    } else {
      closeHandler();
    }
  }, [enabled]);
  return (
    <div>
      <div>
        倒计时{countdown}
      </div>
    </div>
  );
}

```