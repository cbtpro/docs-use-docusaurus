# docs-use-docusaurus

基于 [Docusaurus 3](https://docusaurus.io/) 的技术文档站，支持 React / Vue 组件嵌入 MDX 文章。

- 线上地址（Vercel）：<https://docs-use-docusaurus.vercel.app/>
- 包管理器：pnpm
- 博客文章使用 MDX 格式，交互组件放在 `src/components/{feature-name}/`

## 常用命令

```bash
pnpm start          # 启动本地开发服务器，浏览器自动打开，修改实时热更新
pnpm build          # 生产构建，输出到 build/ 目录（baseUrl: /）
pnpm serve          # 本地预览 build/ 产物
pnpm deploy         # 构建并部署到 GitHub Pages（baseUrl: /docs-use-docusaurus/）
pnpm clear          # 清除 .docusaurus 缓存和 build 产物
```

## 全部 Scripts 说明

| 命令 | 用途 |
|------|------|
| `docusaurus` | Docusaurus CLI 入口，可直接跟子命令（如 `pnpm docusaurus info`） |
| `start` | 启动本地开发服务器，带热更新 |
| `build` | 生产环境构建，生成静态文件到 `build/`，baseUrl 为 `/` |
| `swizzle` | 抽取/覆盖 Docusaurus 内置组件，用于深度自定义主题 |
| `deploy` | 构建并部署到 GitHub Pages，baseUrl 自动设为 `/docs-use-docusaurus/` |
| `clear` | 清除 `.docusaurus` 缓存目录和 `build/` 产物 |
| `serve` | 本地启动静态服务器预览 `build/` 构建结果 |
| `write-translations` | 扫描代码提取翻译文案，输出到 `i18n/` 目录 |
| `write-heading-ids` | 为 MDX 文档的标题自动生成锚点 ID |
| `typecheck` | 运行 TypeScript 类型检查 |

## 项目结构

```
├── blog/                  # 博客文章（MDX）
├── docs/                  # 文档页面
├── src/
│   ├── components/        # 交互组件（按功能分目录）
│   ├── pages/             # 自定义页面
│   └── css/               # 全局样式
├── plugins/               # 自定义插件（如 use-vue.js）
├── docusaurus.config.ts   # 站点配置
└── sidebars.ts            # 文档侧边栏配置
```
