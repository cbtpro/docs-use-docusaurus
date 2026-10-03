---
title: OmniRoute Docker 长期维护部署方案
authors: [cbtpro]
description: 一套完整的 Docker Compose 部署方案，覆盖初始化、升级、回滚、备份、恢复和日常维护，适合长期运行的自建服务。
tags:
  - docker
  - 部署
  - 运维
---

项目地址：

```text
https://github.com/diegosouzapw/OmniRoute
```

Docker Image：

```text
diegosouzapw/omniroute
```

服务端口：

```text
20128
```

本方案用于长期维护 OmniRoute，提供：

- Docker Compose 管理
- 独立持久化目录
- Named Volume
- `.env` 配置管理
- `latest` / 固定 Tag 支持
- Docker Digest 精确版本记录
- 升级前自动备份
- 自动记录部署历史
- 精确镜像回滚
- 数据恢复
- 日志查看
- 备份自动清理
- Git 管理部署配置

{/* truncate */}

## 1. 最终目录结构

```text
~/Developer/docker/
│
├── omniroute/
│   ├── docker-compose.yml
│   ├── .env
│   ├── .env.example
│   ├── .gitignore
│   │
│   ├── upgrade.sh
│   ├── rollback.sh
│   ├── backup.sh
│   ├── restore.sh
│   ├── status.sh
│   │
│   └── history/
│       └── deployment-history.log
│
├── omniroute-data/
│   └── OmniRoute 持久化数据
│
└── backups/
    └── omniroute/
        ├── 20260924-170000/
        │   ├── data.tar.gz
        │   └── deployment.env
        │
        └── ...
```

其中：

```text
omniroute/
```

保存部署配置和脚本。

```text
omniroute-data/
```

保存真正的 OmniRoute 数据。

```text
backups/omniroute/
```

保存历史备份。

---

## 2. 初始化目录

执行：

```bash
mkdir -p ~/Developer/docker/omniroute/history
mkdir -p ~/Developer/docker/omniroute-data
mkdir -p ~/Developer/docker/backups/omniroute

cd ~/Developer/docker/omniroute
```

---

## 3. 创建 Docker Volume

只需要执行一次：

```bash
docker volume create \
  --driver local \
  --opt type=none \
  --opt o=bind \
  --opt device="$HOME/Developer/docker/omniroute-data" \
  omniroute-data
```

检查：

```bash
docker volume inspect omniroute-data
```

最终关系：

```text
Docker Volume
omniroute-data
      │
      ▼
~/Developer/docker/omniroute-data
      │
      ▼
Container
/app/data
```

---

## 4. .env

创建：

```text
.env
```

内容：

```dotenv
OMNIROUTE_IMAGE=diegosouzapw/omniroute
OMNIROUTE_VERSION=latest

OMNIROUTE_PORT=20128

BACKUP_RETENTION_DAYS=30
```

以后如果官方提供固定版本：

```dotenv
OMNIROUTE_VERSION=v1.2.3
```

即可锁定版本。

---

## 5. .env.example

创建：

```text
.env.example
```

内容：

```dotenv
OMNIROUTE_IMAGE=diegosouzapw/omniroute
OMNIROUTE_VERSION=latest

OMNIROUTE_PORT=20128

BACKUP_RETENTION_DAYS=30
```

---

## 6. docker-compose.yml

创建：

```text
docker-compose.yml
```

内容：

```yaml
services:

  omniroute:
    image: ${OMNIROUTE_IMAGE}:${OMNIROUTE_VERSION}

    container_name: omniroute

    restart: unless-stopped

    stop_grace_period: 40s

    ports:
      - "127.0.0.1:${OMNIROUTE_PORT}:20128"

    volumes:
      - omniroute-data:/app/data

    networks:
      - ainetwork

volumes:

  omniroute-data:
    external: true
```

检查最终配置：

```bash
docker compose config
```

---

## 7. 首次安装

拉取：

```bash
docker compose pull
```

启动：

```bash
docker compose up -d
```

检查：

```bash
docker compose ps
```

日志：

```bash
docker compose logs --tail 100 omniroute
```

---

## 8. backup.sh

升级前自动创建完整数据备份。

创建：

```text
backup.sh
```

内容：

```bash
#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "$0")"

source .env

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

BACKUP_ROOT="$HOME/Developer/docker/backups/omniroute"
BACKUP_DIR="$BACKUP_ROOT/$TIMESTAMP"

DATA_DIR="$HOME/Developer/docker/omniroute-data"

mkdir -p "$BACKUP_DIR"

echo "========================================"
echo " OmniRoute Backup"
echo "========================================"

echo "Backup:"
echo "$BACKUP_DIR"

# --------------------------------------------------
# 获取当前部署信息
# --------------------------------------------------

CURRENT_IMAGE=""

if docker inspect omniroute >/dev/null 2>&1; then
    CURRENT_IMAGE=$(docker inspect \
        --format '{{.Image}}' \
        omniroute)
fi

cat > "$BACKUP_DIR/deployment.env" <<EOF
BACKUP_TIME=$TIMESTAMP
OMNIROUTE_IMAGE=$OMNIROUTE_IMAGE
OMNIROUTE_VERSION=$OMNIROUTE_VERSION
IMAGE_ID=$CURRENT_IMAGE
EOF

# --------------------------------------------------
# 停止应用
# --------------------------------------------------

WAS_RUNNING=false

if docker ps \
    --format '{{.Names}}' |
    grep -qx 'omniroute'; then

    WAS_RUNNING=true

    echo
    echo "Stopping OmniRoute..."

    docker compose stop omniroute
fi

restart_container() {

    if [ "$WAS_RUNNING" = true ]; then

        echo
        echo "Starting OmniRoute..."

        docker compose up -d
    fi
}

trap restart_container EXIT

# --------------------------------------------------
# 备份数据
# --------------------------------------------------

echo
echo "Backing up data..."

tar -czf \
    "$BACKUP_DIR/data.tar.gz" \
    -C "$(dirname "$DATA_DIR")" \
    "$(basename "$DATA_DIR")"

echo
echo "Backup size:"

du -h "$BACKUP_DIR/data.tar.gz"

# --------------------------------------------------
# 清理历史备份
# --------------------------------------------------

echo
echo "Cleaning backups older than ${BACKUP_RETENTION_DAYS} days..."

find "$BACKUP_ROOT" \
    -mindepth 1 \
    -maxdepth 1 \
    -type d \
    -mtime "+${BACKUP_RETENTION_DAYS}" \
    -exec rm -rf {} \;

echo
echo "Backup completed:"
echo "$BACKUP_DIR"
```

---

## 9. upgrade.sh

这是整个方案的核心。

功能：

```text
检查当前版本
      ↓
记录旧 Image ID
      ↓
自动备份
      ↓
pull 新镜像
      ↓
获取新 Image ID
      ↓
比较镜像
      ↓
重新部署
      ↓
记录部署历史
      ↓
显示运行状态
```

创建：

```text
upgrade.sh
```

内容：

```bash
#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "$0")"

source .env

HISTORY_DIR="./history"
HISTORY_FILE="$HISTORY_DIR/deployment-history.log"

mkdir -p "$HISTORY_DIR"

TARGET_VERSION="${1:-$OMNIROUTE_VERSION}"

IMAGE="${OMNIROUTE_IMAGE}:${TARGET_VERSION}"

echo "========================================"
echo " OmniRoute Upgrade"
echo "========================================"

echo
echo "Target:"
echo "$IMAGE"

# --------------------------------------------------
# 当前 Image
# --------------------------------------------------

OLD_IMAGE_ID=""

if docker inspect omniroute >/dev/null 2>&1; then

    OLD_IMAGE_ID=$(docker inspect \
        --format '{{.Image}}' \
        omniroute)

fi

echo
echo "Current Image ID:"
echo "${OLD_IMAGE_ID:-N/A}"

# --------------------------------------------------
# 备份
# --------------------------------------------------

echo
echo "[1/5] Backup"

./backup.sh

# --------------------------------------------------
# Pull
# --------------------------------------------------

echo
echo "[2/5] Pull image"

docker pull "$IMAGE"

NEW_IMAGE_ID=$(docker image inspect \
    "$IMAGE" \
    --format '{{.Id}}')

echo
echo "New Image ID:"
echo "$NEW_IMAGE_ID"

# --------------------------------------------------
# 修改版本
# --------------------------------------------------

if [ "$TARGET_VERSION" != "$OMNIROUTE_VERSION" ]; then

    sed -i.bak \
        "s/^OMNIROUTE_VERSION=.*/OMNIROUTE_VERSION=$TARGET_VERSION/" \
        .env

    rm -f .env.bak

fi

# --------------------------------------------------
# 部署
# --------------------------------------------------

echo
echo "[3/5] Deploy"

docker compose up -d

# --------------------------------------------------
# 记录历史
# --------------------------------------------------

echo
echo "[4/5] Record deployment"

TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

echo \
"$TIMESTAMP | $IMAGE | $NEW_IMAGE_ID | previous=$OLD_IMAGE_ID" \
>> "$HISTORY_FILE"

# --------------------------------------------------
# 状态
# --------------------------------------------------

echo
echo "[5/5] Status"

docker compose ps

echo
echo "Recent logs:"

docker compose logs \
    --tail 50 \
    omniroute

echo
echo "========================================"

if [ "$OLD_IMAGE_ID" = "$NEW_IMAGE_ID" ]; then

    echo "Image has not changed."

else

    echo "Upgrade completed."
    echo
    echo "Previous:"
    echo "$OLD_IMAGE_ID"
    echo
    echo "Current:"
    echo "$NEW_IMAGE_ID"

fi

echo "========================================"
```

---

## 10. rollback.sh

回滚不能只依赖：

```text
latest
```

而应该使用 Docker Image ID。

创建：

```text
rollback.sh
```

内容：

```bash
#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "$0")"

HISTORY_FILE="./history/deployment-history.log"

if [ ! -f "$HISTORY_FILE" ]; then

    echo "No deployment history."
    exit 1

fi

LAST_RECORD=$(tail -n 1 "$HISTORY_FILE")

OLD_IMAGE_ID=$(echo "$LAST_RECORD" |
    sed -n 's/.*previous=\(.*\)$/\1/p')

if [ -z "$OLD_IMAGE_ID" ]; then

    echo "Previous image not found."
    exit 1

fi

if ! docker image inspect "$OLD_IMAGE_ID" >/dev/null 2>&1; then

    echo "Previous Docker image no longer exists:"
    echo "$OLD_IMAGE_ID"

    exit 1
fi

echo "========================================"
echo " OmniRoute Rollback"
echo "========================================"

echo
echo "Rollback Image:"
echo "$OLD_IMAGE_ID"

# --------------------------------------------------
# 回滚前再次备份
# --------------------------------------------------

echo
echo "Creating safety backup..."

./backup.sh

# --------------------------------------------------
# 创建临时 Compose Override
# --------------------------------------------------

ROLLBACK_FILE="docker-compose.rollback.yml"

cat > "$ROLLBACK_FILE" <<EOF
services:

  omniroute:
    image: $OLD_IMAGE_ID
EOF

cleanup() {
    rm -f "$ROLLBACK_FILE"
}

trap cleanup EXIT

# --------------------------------------------------
# 回滚
# --------------------------------------------------

echo
echo "Rolling back..."

docker compose \
    -f docker-compose.yml \
    -f "$ROLLBACK_FILE" \
    up -d

echo
echo "Status:"

docker compose ps

echo
echo "Recent logs:"

docker compose logs \
    --tail 100 \
    omniroute

echo
echo "========================================"
echo " Rollback completed"
echo "========================================"
```

这样即使：

```text
latest → latest
```

也可以区分：

```text
旧 latest
sha256:AAA

新 latest
sha256:BBB
```

---

## 11. restore.sh

镜像回滚和数据回滚是两回事。

如果新版本修改了数据库结构，需要同时恢复数据。

创建：

```text
restore.sh
```

内容：

```bash
#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "$0")"

BACKUP_ROOT="$HOME/Developer/docker/backups/omniroute"
DATA_DIR="$HOME/Developer/docker/omniroute-data"

if [ $# -ne 1 ]; then

    echo "Usage:"
    echo
    echo "./restore.sh <backup-directory>"
    echo
    echo "Available backups:"
    echo

    ls -1 "$BACKUP_ROOT"

    exit 1

fi

BACKUP="$BACKUP_ROOT/$1"

if [ ! -f "$BACKUP/data.tar.gz" ]; then

    echo "Backup not found:"
    echo "$BACKUP"

    exit 1

fi

echo "========================================"
echo " OmniRoute Restore"
echo "========================================"

echo
echo "Backup:"
echo "$BACKUP"

echo
echo "Stopping OmniRoute..."

docker compose stop omniroute

TIMESTAMP=$(date +"%Y%m%d-%H%M%S")

if [ -d "$DATA_DIR" ]; then

    echo
    echo "Preserving current data..."

    mv \
        "$DATA_DIR" \
        "${DATA_DIR}.before-restore-$TIMESTAMP"

fi

echo
echo "Restoring..."

tar -xzf \
    "$BACKUP/data.tar.gz" \
    -C "$(dirname "$DATA_DIR")"

echo
echo "Starting OmniRoute..."

docker compose up -d

echo
echo "Status:"

docker compose ps

echo
echo "Recent logs:"

docker compose logs \
    --tail 100 \
    omniroute

echo
echo "========================================"
echo " Restore completed"
echo "========================================"
```

---

## 12. status.sh

创建：

```text
status.sh
```

内容：

```bash
#!/usr/bin/env bash

set -Eeuo pipefail

cd "$(dirname "$0")"

echo "========================================"
echo " OmniRoute Status"
echo "========================================"

echo
echo "Container:"
docker compose ps

echo
echo "Image:"

docker inspect \
    --format '{{.Config.Image}}' \
    omniroute 2>/dev/null || true

echo
echo "Image ID:"

docker inspect \
    --format '{{.Image}}' \
    omniroute 2>/dev/null || true

echo
echo "Data:"

du -sh \
    "$HOME/Developer/docker/omniroute-data" \
    2>/dev/null || true

echo
echo "Latest backups:"

ls -1dt \
    "$HOME/Developer/docker/backups/omniroute/"* \
    2>/dev/null |
    head -5 || true

echo
echo "Recent deployment history:"

tail -5 \
    ./history/deployment-history.log \
    2>/dev/null || true

echo
echo "========================================"
```

---

## 13. 添加执行权限

一次执行：

```bash
chmod +x \
  upgrade.sh \
  rollback.sh \
  backup.sh \
  restore.sh \
  status.sh
```

---

## 14. .gitignore

创建：

```text
.gitignore
```

内容：

```gitignore
.env

*.bak

.DS_Store

docker-compose.rollback.yml
```

这里建议：

```text
history/
```

**不要忽略。**

部署历史本身非常有价值，可以根据你的需要纳入 Git。

如果不希望机器相关的 Image ID 进入 Git，再添加：

```gitignore
history/
```

即可。

---

## 15. 初始化 Git

```bash
git init

git add .

git commit -m "chore: initialize OmniRoute docker deployment"
```

建议 Git 中保存：

```text
docker-compose.yml
.env.example
.gitignore
upgrade.sh
rollback.sh
backup.sh
restore.sh
status.sh
```

不要保存：

```text
.env
omniroute-data/
backups/
```

---

## 16. 日常使用

### 查看状态

```bash
./status.sh
```

### 查看日志

```bash
docker compose logs -f omniroute
```

### 重启

```bash
docker compose restart omniroute
```

### 停止

```bash
docker compose stop
```

### 启动

```bash
docker compose up -d
```

---

## 17. 普通升级

如果使用：

```dotenv
OMNIROUTE_VERSION=latest
```

以后只需要：

```bash
./upgrade.sh
```

它会：

```text
自动备份
   ↓
pull latest
   ↓
记录旧 Image ID
   ↓
获取新 Image ID
   ↓
重新部署
   ↓
记录部署历史
```

---

## 18. 指定版本升级

如果官方提供：

```text
v1.2.3
```

执行：

```bash
./upgrade.sh v1.2.3
```

脚本会自动修改：

```dotenv
OMNIROUTE_VERSION=v1.2.3
```

---

## 19. 回滚

升级后发现问题：

```bash
./rollback.sh
```

脚本：

```text
再次备份当前数据
      ↓
读取上一镜像 Image ID
      ↓
确认旧镜像仍存在
      ↓
使用旧 Image ID 创建容器
      ↓
检查状态
      ↓
输出日志
```

---

## 20. 数据恢复

查看备份：

```bash
ls -lah \
  ~/Developer/docker/backups/omniroute
```

例如：

```text
20260924-170000
20260925-093000
20260930-201500
```

恢复：

```bash
./restore.sh 20260924-170000
```

恢复前的当前数据不会立即删除，而是移动成：

```text
omniroute-data.before-restore-20260924-180000
```

因此还有一道保险。

---

## 21. 查看部署历史

执行：

```bash
cat history/deployment-history.log
```

类似：

```text
2026-09-24 17:00:00 | diegosouzapw/omniroute:latest | sha256:BBB | previous=sha256:AAA
2026-10-02 20:30:00 | diegosouzapw/omniroute:latest | sha256:CCC | previous=sha256:BBB
```

于是可以明确知道：

```text
第一次：

AAA
 ↓
BBB


第二次：

BBB
 ↓
CCC
```

即使 Tag 始终都是：

```text
latest
```

镜像版本仍然有明确记录。

---

## 22. 不要自动清理 Docker Image

不要在 `upgrade.sh` 中执行：

```bash
docker image prune -f
```

因为：

```text
旧 Docker Image
       │
       └── 是快速回滚的重要保障
```

建议新版本稳定运行一段时间后，再手动：

```bash
docker image prune
```

---

## 23. 关于数据备份

目前采用：

```text
停止 OmniRoute
    ↓
tar 数据目录
    ↓
重新启动
```

优点是简单，而且比应用运行过程中直接复制数据更加可靠。

如果未来确认 `/app/data` 使用的是：

```text
SQLite
```

或者其他数据库，还可以进一步针对数据库实现原生备份。

例如 SQLite 可以考虑：

```text
sqlite3 .backup
```

而不是简单复制数据库文件。

在没有确认 OmniRoute 内部持久化机制之前，停止应用后备份整个 `/app/data` 是更通用的方案。

---

## 24. 关于健康检查

当前没有在 Compose 中强行加入：

```yaml
healthcheck:
```

原因是健康检查必须知道 OmniRoute 确切存在的健康接口，例如：

```text
/health
/api/health
```

同时还要确认容器内部是否存在：

```text
curl
wget
```

不能凭空假设。

因此当前使用：

```bash
docker compose ps
docker compose logs
```

进行基础检查。

如果后续 OmniRoute 官方提供明确的 Health Endpoint，再加入真正的 Docker Healthcheck。

---

## 25. 灾难恢复

如果 Docker Container 被删除：

```bash
docker compose up -d
```

即可。

如果 Image 被删除：

```bash
docker compose pull
docker compose up -d
```

即可。

如果 Compose Container 和 Image 都被删除，只要：

```text
docker-compose.yml
.env
omniroute-data/
```

还在，就可以重新创建。

如果：

```text
omniroute-data/
```

损坏，则使用：

```bash
./restore.sh <backup>
```

恢复。

---

## 26. 完全卸载

停止：

```bash
docker compose down
```

删除镜像：

```bash
docker rmi diegosouzapw/omniroute:latest
```

如果确定以后不再需要数据：

```bash
docker volume rm omniroute-data
```

然后：

```bash
rm -rf ~/Developer/docker/omniroute-data
```

最后删除配置：

```bash
rm -rf ~/Developer/docker/omniroute
```

备份是否删除建议单独决定：

```text
~/Developer/docker/backups/omniroute
```

---

## 27. 最终维护模型

整个部署最终形成：

```text
                 OmniRoute
                     │
                     ▼
              Docker Compose
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
      Container              Image
      omniroute        diegosouzapw/omniroute
          │                     │
          │                     ├── Tag
          │                     │
          │                     └── Image ID
          │
          ▼
    omniroute-data
      Docker Volume
          │
          ▼
~/Developer/docker/omniroute-data
          │
          │ backup
          ▼
~/Developer/docker/backups/omniroute
```

---

## 28. 最终日常操作

以后真正需要记住的只有几个命令。

进入目录：

```bash
cd ~/Developer/docker/omniroute
```

状态：

```bash
./status.sh
```

日志：

```bash
docker compose logs -f omniroute
```

备份：

```bash
./backup.sh
```

升级：

```bash
./upgrade.sh
```

指定版本：

```bash
./upgrade.sh v1.2.3
```

回滚镜像：

```bash
./rollback.sh
```

恢复数据：

```bash
./restore.sh 20260924-170000
```

---

## 29. 长期维护原则

最终只需要坚持几个原则：

```text
Container
    可删除、可重建

Image
    可升级、可回滚

Compose
    Git 管理

.env
    管理当前部署版本

Volume
    长期保留

omniroute-data
    真正需要保护的数据

backups
    灾难恢复保障

deployment-history
    部署审计记录
```

升级流程统一为：

```text
            ./upgrade.sh
                  │
                  ▼
              自动备份
                  │
                  ▼
             记录旧镜像
                  │
                  ▼
              Pull Image
                  │
                  ▼
              重新部署
                  │
                  ▼
             记录部署历史
                  │
                  ▼
              检查运行
             ╱          ╲
           正常          异常
            │             │
            ▼             ▼
         继续运行    ./rollback.sh
                          │
                  ┌───────┴────────┐
                  ▼                ▼
               镜像问题          数据问题
                  │                │
                  ▼                ▼
             回滚 Image      ./restore.sh
```

这套结构作为 OmniRoute 的长期 Docker 部署方案即可，不需要再围绕 `docker run`、`latest`、Volume、备份和回滚分别维护不同流程。