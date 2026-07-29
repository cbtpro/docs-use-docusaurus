/**
 * 创建一个用于生成模拟数据的 Web Worker
 * 使用 inline Blob URL 方式，无需额外文件配置，兼容 Docusaurus 构建
 * Worker 会在生成过程中发送进度更新：{ type: 'progress', percent: number }
 * 完成后发送：{ type: 'done', data: array }
 */
export function createDataWorker(): Worker {
  const workerCode = `
    self.onmessage = function (e) {
      const count = e.data.count;
      const data = new Array(count);
      // 每生成 1% 报告一次进度，最少每 1000 条报告一次
      const step = Math.max(1000, Math.floor(count / 100));
      const startTime = performance.now();

      for (let i = 0; i < count; i++) {
        data[i] = {
          id: i,
          name: '用户_' + i,
          email: 'user' + i + '@example.com',
          role: i % 3 === 0 ? '管理员' : i % 3 === 1 ? '编辑者' : '查看者',
        };
        if ((i + 1) % step === 0 || i === count - 1) {
          const percent = Math.round(((i + 1) / count) * 100);
          self.postMessage({ type: 'progress', percent: percent });
        }
      }

      const elapsed = Math.round(performance.now() - startTime);
      self.postMessage({ type: 'done', data: data, elapsed: elapsed });
    };
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  // Worker 加载后 Blob URL 可以释放，Worker 已经持有代码的副本
  URL.revokeObjectURL(url);

  return worker;
}
