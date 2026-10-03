---
title: next-ai-draw-io Docker Compose 部署与长期维护
authors: [cbtpro]
description: 用 Docker Compose + .env + upgrade.sh 统一管理 next-ai-draw-io 的部署与升级，覆盖多 AI Provider 配置、局域网访问、版本固定与 API Key 安全。
tags:
  - docker
  - 部署
  - 运维
---

## 项目介绍

next-ai-draw-io 是一个结合 AI 与 draw.io 的图表生成工具，可以通过自然语言生成和修改 draw.io 图表，并支持多种 AI Provider。

项目地址：

```text
https://github.com/DayuanJiang/next-ai-draw-io
```

Docker 部署文档：

```text
https://github.com/DayuanJiang/next-ai-draw-io/blob/main/docs/cn/docker.md
```

Docker 镜像：

```text
ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

默认服务端口：

```text
3000
```

本文采用：

```text
Docker Compose
      +
.env
      +
本地持久化目录
      +
Docker Named Volume
      +
upgrade.sh
```

进行部署和长期维护。

---

# 目录规划

统一将 Docker 相关文件存放到：

```text
~/Developer/docker/
```

最终目录结构：

```text
~/Developer/docker/
│
├── next-ai-draw-io/
│   ├── docker-compose.yml
│   ├── .env
│   ├── .env.example
│   ├── .gitignore
│   └── upgrade.sh
│
└── next-ai-draw-io-data/
    └── 持久化数据
```

其中：

```text
~/Developer/docker/next-ai-draw-io
```

用于保存 Docker Compose 配置和维护脚本。

```text
~/Developer/docker/next-ai-draw-io-data
```

用于保存持久化数据。

Docker 中创建：

```text
next-ai-draw-io-data
```

Named Volume。

最终关系：

```text
Docker Container
next-ai-draw-io
        │
        ▼
Docker Volume
next-ai-draw-io-data
        │
        ▼
~/Developer/docker/next-ai-draw-io-data
```

这样 Container 可以随时删除和重新创建，而数据独立保存在宿主机。

---

# 创建目录

执行：

```bash
mkdir -p ~/Developer/docker/next-ai-draw-io
mkdir -p ~/Developer/docker/next-ai-draw-io-data
```

进入配置目录：

```bash
cd ~/Developer/docker/next-ai-draw-io
```

检查：

```bash
ls -lah ~/Developer/docker/
```

应该存在：

```text
next-ai-draw-io/
next-ai-draw-io-data/
```

---

# 创建 Docker Volume

创建：

```text
next-ai-draw-io-data
```

Docker Named Volume，并绑定宿主机目录：

```bash
docker volume create \
  --driver local \
  --opt type=none \
  --opt o=bind \
  --opt device="$HOME/Developer/docker/next-ai-draw-io-data" \
  next-ai-draw-io-data
```

这个命令只需要执行一次。

检查 Volume：

```bash
docker volume inspect next-ai-draw-io-data
```

应该可以看到类似：

```json
[
  {
    "Name": "next-ai-draw-io-data",
    "Driver": "local",
    "Options": {
      "device": "/Users/username/Developer/docker/next-ai-draw-io-data",
      "o": "bind",
      "type": "none"
    }
  }
]
```

重点确认：

```text
Name
    next-ai-draw-io-data

device
    ~/Developer/docker/next-ai-draw-io-data
```

---

# 创建 .env

进入：

```bash
cd ~/Developer/docker/next-ai-draw-io
```

创建：

```text
.env
```

例如使用 OpenAI：

```dotenv
# Docker
NEXT_AI_DRAW_IO_VERSION=latest
NEXT_AI_DRAW_IO_PORT=3000

# AI
AI_PROVIDER=openai
AI_MODEL=gpt-4o

OPENAI_API_KEY=your_api_key
```

将：

```text
your_api_key
```

替换为自己的 API Key。

---

# OpenAI 兼容 API

如果使用兼容 OpenAI API 的第三方服务，可以增加：

```dotenv
AI_PROVIDER=openai
AI_MODEL=gpt-4o

OPENAI_API_KEY=your_api_key
OPENAI_BASE_URL=https://your-api.example.com/v1
```

其中：

```text
OPENAI_BASE_URL
```

用于指定自定义 API Endpoint。

---

# DeepSeek 配置

如果使用 DeepSeek：

```dotenv
NEXT_AI_DRAW_IO_VERSION=latest
NEXT_AI_DRAW_IO_PORT=3000

AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat

DEEPSEEK_API_KEY=your_api_key
```

如果需要自定义 API 地址：

```dotenv
DEEPSEEK_BASE_URL=https://your-custom-endpoint
```

---

# Gemini 配置

例如：

```dotenv
AI_PROVIDER=google
AI_MODEL=gemini-2.0-flash

GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
```

自定义地址：

```dotenv
GOOGLE_BASE_URL=https://your-custom-endpoint
```

---

# Anthropic 配置

例如：

```dotenv
AI_PROVIDER=anthropic
AI_MODEL=claude-sonnet-4-5-20250514

ANTHROPIC_API_KEY=your_api_key
```

也可以使用：

```dotenv
ANTHROPIC_AUTH_TOKEN=your_auth_token
```

`ANTHROPIC_API_KEY` 和 `ANTHROPIC_AUTH_TOKEN` 根据实际认证方式选择，不建议同时配置。

---

# Ollama 本地模型

如果使用宿主机上的 Ollama：

```dotenv
AI_PROVIDER=ollama

AI_MODEL=llama3.2

OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Docker Container 内部：

```text
localhost
```

指向的是 Container 自己，而不是宿主机。

因此在 macOS / Windows Docker Desktop 环境中，访问宿主机服务通常使用：

```text
host.docker.internal
```

而不是：

```text
localhost
```

---

# 创建 .env.example

建议同时创建：

```text
.env.example
```

内容：

```dotenv
# Docker
NEXT_AI_DRAW_IO_VERSION=latest
NEXT_AI_DRAW_IO_PORT=3000

# AI Provider
AI_PROVIDER=openai
AI_MODEL=gpt-4o

# OpenAI
OPENAI_API_KEY=
OPENAI_BASE_URL=
```

以后重新部署时可以：

```bash
cp .env.example .env
```

然后修改：

```bash
vim .env
```

---

# 创建 docker-compose.yml

创建：

```text
docker-compose.yml
```

内容：

```yaml
services:
  next-ai-draw-io:
    image: ghcr.io/dayuanjiang/next-ai-draw-io:${NEXT_AI_DRAW_IO_VERSION:-latest}

    container_name: next-ai-draw-io

    restart: unless-stopped

    stop_grace_period: 30s

    ports:
      - "127.0.0.1:${NEXT_AI_DRAW_IO_PORT:-3000}:3000"

    env_file:
      - .env

    volumes:
      - next-ai-draw-io-data:/app/data

volumes:
  next-ai-draw-io-data:
    external: true
```

这里：

```yaml
external: true
```

表示：

```text
next-ai-draw-io-data
```

由 Docker 独立管理，而不是由当前 Compose Project 创建。

因此执行：

```bash
docker compose down
```

不会删除该 Volume。

---

# 持久化关系

最终数据关系：

```text
next-ai-draw-io
    Container
        │
        │ /app/data
        ▼
next-ai-draw-io-data
    Docker Volume
        │
        │ bind
        ▼
~/Developer/docker/next-ai-draw-io-data
```

Container：

```text
可删除
可重新创建
可升级
```

Volume：

```text
长期保留
```

宿主机目录：

```text
长期保留
方便备份
方便迁移
```

---

# 检查 Compose 配置

执行：

```bash
docker compose config
```

重点检查：

```text
image
ports
env_file
volumes
```

例如镜像应该解析成：

```text
ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

Volume：

```text
next-ai-draw-io-data
```

---

# 首次启动

拉取镜像：

```bash
docker compose pull
```

启动：

```bash
docker compose up -d
```

也可以：

```bash
docker compose pull && docker compose up -d
```

---

# 查看运行状态

执行：

```bash
docker compose ps
```

或者：

```bash
docker ps --filter name=next-ai-draw-io
```

正常情况下：

```text
next-ai-draw-io
```

应该处于：

```text
Up
```

状态。

---

# 访问应用

浏览器打开：

```text
http://127.0.0.1:3000
```

或者：

```text
http://localhost:3000
```

如果修改：

```dotenv
NEXT_AI_DRAW_IO_PORT=3010
```

则访问：

```text
http://127.0.0.1:3010
```

---

# 为什么绑定 127.0.0.1

Compose 中使用：

```yaml
ports:
  - "127.0.0.1:${NEXT_AI_DRAW_IO_PORT:-3000}:3000"
```

表示服务只允许本机访问。

这样更加适合：

- 本机使用
- Nginx 反向代理
- Caddy 反向代理
- Cloudflare Tunnel
- 其他网关代理

不会直接把：

```text
3000
```

端口暴露给整个局域网。

---

# 如果需要局域网访问

将：

```yaml
ports:
  - "127.0.0.1:${NEXT_AI_DRAW_IO_PORT:-3000}:3000"
```

修改为：

```yaml
ports:
  - "${NEXT_AI_DRAW_IO_PORT:-3000}:3000"
```

相当于：

```text
0.0.0.0:3000
```

局域网设备就可以通过：

```text
http://宿主机IP:3000
```

访问。

如果没有局域网访问需求，建议继续使用：

```text
127.0.0.1
```

---

# 查看日志

查看：

```bash
docker compose logs next-ai-draw-io
```

最近 100 行：

```bash
docker compose logs \
  --tail 100 \
  next-ai-draw-io
```

持续查看：

```bash
docker compose logs \
  -f \
  next-ai-draw-io
```

退出：

```text
Ctrl + C
```

---

# 常用操作

启动：

```bash
docker compose up -d
```

停止：

```bash
docker compose stop
```

重启：

```bash
docker compose restart
```

删除 Container：

```bash
docker compose down
```

重新创建：

```bash
docker compose up -d
```

因为：

```yaml
next-ai-draw-io-data:
  external: true
```

所以：

```bash
docker compose down
```

不会删除持久化 Volume。

---

# 修改 AI 配置

例如原来：

```dotenv
AI_PROVIDER=openai
AI_MODEL=gpt-4o
```

修改为：

```dotenv
AI_PROVIDER=deepseek
AI_MODEL=deepseek-chat

DEEPSEEK_API_KEY=your_api_key
```

重新创建：

```bash
docker compose up -d --force-recreate
```

然后：

```bash
docker compose logs \
  --tail 100 \
  next-ai-draw-io
```

检查启动情况。

---

# 升级

使用：

```dotenv
NEXT_AI_DRAW_IO_VERSION=latest
```

时，升级只需要：

```bash
cd ~/Developer/docker/next-ai-draw-io

docker compose pull
docker compose up -d
```

工作过程：

```text
GHCR
 │
 │ pull
 ▼
最新 Docker Image
 │
 ▼
docker compose up -d
 │
 ├── Image 未变化
 │
 │
 │   保持现有 Container
 │
 └── Image 发生变化
     │
     ▼
   重新创建 Container
     │
     ▼
next-ai-draw-io-data
     │
     ▼
原有持久化数据继续使用
```

---

# 创建 upgrade.sh

为了简化长期维护，创建：

```text
upgrade.sh
```

内容：

```bash
#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "$0")"

echo "========================================"
echo " next-ai-draw-io Upgrade"
echo "========================================"

echo
echo "[1/4] Pull latest image..."

docker compose pull

echo
echo "[2/4] Update container..."

docker compose up -d

echo
echo "[3/4] Container status..."

docker compose ps

echo
echo "[4/4] Recent logs..."

docker compose logs \
  --tail 50 \
  next-ai-draw-io

echo
echo "========================================"
echo " Upgrade completed"
echo "========================================"
```

添加执行权限：

```bash
chmod +x upgrade.sh
```

---

# 日常升级

以后只需要：

```bash
cd ~/Developer/docker/next-ai-draw-io

./upgrade.sh
```

或者直接：

```bash
~/Developer/docker/next-ai-draw-io/upgrade.sh
```

脚本内部：

```bash
cd "$(dirname "$0")"
```

会自动切换到脚本所在目录。

---

# 固定版本

如果项目提供固定版本 Tag，例如：

```text
v1.2.3
```

可以将：

```dotenv
NEXT_AI_DRAW_IO_VERSION=latest
```

修改为：

```dotenv
NEXT_AI_DRAW_IO_VERSION=v1.2.3
```

然后：

```bash
docker compose pull
docker compose up -d
```

这样不会自动跟随：

```text
latest
```

更新。

对于长期稳定运行的服务，如果官方提供稳定版本 Tag，优先使用明确版本通常更容易控制升级节奏和回滚。

---

# 持久化数据备份

因为数据最终位于：

```text
~/Developer/docker/next-ai-draw-io-data
```

可以直接备份。

建议备份前停止 Container：

```bash
docker compose stop
```

创建备份：

```bash
tar -czf \
  ~/Developer/docker/next-ai-draw-io-data-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C ~/Developer/docker \
  next-ai-draw-io-data
```

然后重新启动：

```bash
docker compose up -d
```

最终得到类似：

```text
~/Developer/docker/
│
├── next-ai-draw-io/
├── next-ai-draw-io-data/
└── next-ai-draw-io-data-20260930-093000.tar.gz
```

---

# 数据恢复

停止：

```bash
cd ~/Developer/docker/next-ai-draw-io

docker compose stop
```

保留当前数据：

```bash
mv \
  ~/Developer/docker/next-ai-draw-io-data \
  ~/Developer/docker/next-ai-draw-io-data.old
```

重新创建目录：

```bash
mkdir -p ~/Developer/docker/next-ai-draw-io-data
```

解压：

```bash
tar -xzf \
  ~/Developer/docker/next-ai-draw-io-data-YYYYMMDD-HHMMSS.tar.gz \
  -C ~/Developer/docker
```

重新启动：

```bash
docker compose up -d
```

查看日志：

```bash
docker compose logs \
  --tail 100 \
  next-ai-draw-io
```

确认恢复成功后，再决定是否删除：

```text
next-ai-draw-io-data.old
```

---

# API Key 安全

`.env` 可能包含：

```text
OPENAI_API_KEY
DEEPSEEK_API_KEY
ANTHROPIC_API_KEY
GOOGLE_GENERATIVE_AI_API_KEY
```

等敏感信息。

因此：

```text
.env
```

不要提交到 Git。

创建：

```text
.gitignore
```

内容：

```gitignore
.env

*.bak

.DS_Store
```

---

# Git 管理

可以将：

```text
~/Developer/docker/next-ai-draw-io
```

作为独立 Git Repository：

```bash
cd ~/Developer/docker/next-ai-draw-io

git init
```

然后：

```bash
git add .

git commit -m "chore: initialize next-ai-draw-io docker deployment"
```

建议 Git 管理：

```text
docker-compose.yml    ✓
.env.example          ✓
.gitignore            ✓
upgrade.sh            ✓
```

不要提交：

```text
.env                   ✗
```

同时：

```text
~/Developer/docker/next-ai-draw-io-data
```

位于 Git Repository 外部，本身不会被提交。

---

# 清理旧 Docker Image

升级成功后可以：

```bash
docker images
```

查看旧镜像。

确认新版本稳定后：

```bash
docker image prune
```

或者：

```bash
docker image prune -f
```

不建议把：

```bash
docker image prune -f
```

加入 `upgrade.sh`。

旧 Image 在升级发生问题时具有一定的回滚价值。

---

# 查看当前镜像

查看 Container 使用的镜像：

```bash
docker inspect next-ai-draw-io \
  --format '{{.Config.Image}}'
```

查看 Image ID：

```bash
docker inspect next-ai-draw-io \
  --format '{{.Image}}'
```

查看当前本地 `latest`：

```bash
docker image inspect \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest \
  --format '{{.Id}}'
```

---

# 完全卸载

停止并删除 Container：

```bash
cd ~/Developer/docker/next-ai-draw-io

docker compose down
```

删除镜像：

```bash
docker rmi \
  ghcr.io/dayuanjiang/next-ai-draw-io:latest
```

如果确定不再需要持久化数据，删除 Volume：

```bash
docker volume rm next-ai-draw-io-data
```

然后删除数据：

```bash
rm -rf \
  ~/Developer/docker/next-ai-draw-io-data
```

最后删除部署配置：

```bash
rm -rf \
  ~/Developer/docker/next-ai-draw-io
```

注意：

```bash
rm -rf
```

会直接删除数据。

执行前应确认数据已经不再需要或者已经完成备份。

---

# 最终目录结构

长期维护后的目录：

```text
~/Developer/docker/
│
├── next-ai-draw-io/
│   │
│   ├── docker-compose.yml
│   ├── .env
│   ├── .env.example
│   ├── .gitignore
│   └── upgrade.sh
│
└── next-ai-draw-io-data/
    │
    └── 持久化数据
```

Docker 结构：

```text
Docker
│
├── Container
│   │
│   └── next-ai-draw-io
│
├── Image
│   │
│   └── ghcr.io/dayuanjiang/next-ai-draw-io:latest
│
└── Volume
    │
    └── next-ai-draw-io-data
              │
              ▼
      ~/Developer/docker/
          next-ai-draw-io-data
```

---

# 日常维护

以后日常操作基本只需要进入：

```bash
cd ~/Developer/docker/next-ai-draw-io
```

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f next-ai-draw-io
```

启动：

```bash
docker compose up -d
```

停止：

```bash
docker compose stop
```

重启：

```bash
docker compose restart
```

修改 `.env` 后重新创建：

```bash
docker compose up -d --force-recreate
```

升级：

```bash
./upgrade.sh
```

备份数据：

```bash
docker compose stop

tar -czf \
  ~/Developer/docker/next-ai-draw-io-data-$(date +%Y%m%d-%H%M%S).tar.gz \
  -C ~/Developer/docker \
  next-ai-draw-io-data

docker compose up -d
```

---

# 长期维护原则

整个部署可以归纳为：

```text
Container
    │
    └── 可删除、可重新创建

Docker Image
    │
    └── 可升级、可替换

docker-compose.yml
    │
    └── Git 管理

.env
    │
    ├── AI Provider
    ├── Model
    ├── API Key
    └── 不提交 Git

Docker Volume
    │
    └── next-ai-draw-io-data
              │
              ▼
~/Developer/docker/next-ai-draw-io-data
              │
              └── 长期保存、定期备份
```

核心原则：

> Container 和 Docker Image 都应该视为可替换资源，真正需要长期保护的是部署配置、API 配置以及持久化数据。

以后普通升级：

```bash
./upgrade.sh
```

重要版本升级：

```text
停止服务
   ↓
备份 next-ai-draw-io-data
   ↓
阅读 Release Notes
   ↓
拉取新 Image
   ↓
重新部署
   ↓
检查日志
   ↓
验证 AI / draw.io 功能
   ↓
确认稳定后再清理旧 Image
```

这样即可形成一套适合长期维护的 next-ai-draw-io Docker 部署环境。
