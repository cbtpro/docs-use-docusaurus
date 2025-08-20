import { useState } from 'react';

export default function BracketValidator() {
  const [inputValue, setInputValue] = useState('');
  const [isValid, setIsValid] = useState(null);
  const [error, setError] = useState('');

  // 检查括号有效性的函数
  const checkValidity = (s) => {
      const stack = [];
      const bracketMap = {
          '(': ')',
          '[': ']',
          '{': '}'
      };
      
      for (let i = 0; i < s.length; i++) {
          const char = s[i];
          
          // 如果是左括号，压入栈
          if (bracketMap[char]) {
              stack.push(char);
          } 
          // 如果是右括号
          else {
              // 如果栈为空，说明没有匹配的左括号
              if (stack.length === 0) return false;
              
              // 弹出栈顶元素并检查是否匹配
              const last = stack.pop();
              if (bracketMap[last] !== char) return false;
          }
      }
      
      // 如果栈不为空，说明有未匹配的左括号
      return stack.length === 0;
  };

  const handleCheck = () => {
      setError('');
      
      if (inputValue.trim() === '') {
          setError('请输入括号字符串');
          setIsValid(false);
          return;
      }
      
      // 验证输入是否只包含括号
      if (!/^[\(\)\[\]\{\}]*$/.test(inputValue)) {
          setError('输入只能包含 ()[]{} 字符');
          setIsValid(false);
          return;
      }
      
      const isValidString = checkValidity(inputValue);
      setIsValid(isValidString);
  };

  const handleInputChange = (e) => {
      setInputValue(e.target.value);
      // 清除之前的结果
      if (isValid !== null) setIsValid(null);
      if (error) setError('');
  };

  const handleKeyPress = (e) => {
      if (e.key === 'Enter') {
          handleCheck();
      }
  };

  const getResultMessage = () => {
      if (error) return error;
      if (isValid === null) return '等待输入...';
      return isValid ? '有效 ✓' : '无效 ✗';
  };

  return (
      <div className="container">
          <h1>React括号有效性检查器</h1>
          <p>输入一个只包含括号字符( (){}[] )的字符串，检查括号是否有效匹配。</p>
          
          <div>
              <input 
                  type="text" 
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder="输入括号字符串，如: ()[]{}" 
                  autoComplete="off"
              />
          </div>
          
          <button onClick={handleCheck}>检查有效性</button>
          
          <div className={`result ${isValid ? 'valid' : isValid === false ? 'invalid' : ''}`}>
              {getResultMessage()}
          </div>
          
          <div className="examples">
              <h3>示例:</h3>
              <div>"()" → true</div>
              <div>"()[]{}" → true</div>
              <div>"(]" → false</div>
              <div>"([)]" → false</div>
          </div>
      </div>
  );
};