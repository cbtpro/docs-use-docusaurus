import React, { useState } from "react";

/**
 * 线性时间、常量空间解法：异或
 * 原理：a^a=0, a^0=a，所有成对数字异或为0，剩下的唯一数字就是答案
 */
function singleNumber(nums) {
  return nums.reduce((acc, num) => acc ^ num, 0);
}

export default function SingleNumber() {
  const [input, setInput] = useState('4,4,1');
  const [result, setResult] = useState(null);

  const handleChange = (e) => {
    setInput(e.target.value);
  };

  const handleClick = () => {
    // 支持逗号或空格分隔
    const nums = input
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    if (!nums.length || nums.some(isNaN)) {
      setResult("输入格式错误");
      return;
    }
    setResult(singleNumber(nums));
  };

  return (
    <div>
      <input
        placeholder="输入数字数组，如：4,1,2,1,2"
        value={input}
        onChange={handleChange}
      />
      <button onClick={handleClick}>计算唯一数字</button>
      {result !== null && (
        <div>结果: {result}</div>
      )}
    </div>
  );
}