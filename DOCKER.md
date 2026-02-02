# Docker 部署指南

## 📋 前置要求

### 安装 Docker

**Windows:**
1. 下载 Docker Desktop: https://www.docker.com/products/docker-desktop
2. 安装并启动 Docker Desktop
3. 验证安装: `docker --version`

**Linux:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

**macOS:**
```bash
brew install --cask docker
```

---

## 🚀 快速开始（单机版）

### 1. 使用 Docker Compose（推荐）

```bash
# 启动服务
docker-compose -f docker-compose.simple.yml up -d

# 查看日志
docker-compose -f docker-compose.simple.yml logs -f

# 停止服务
docker-compose -f docker-compose.simple.yml down
```

### 2. 使用 Docker 命令

```bash
# 构建镜像
docker build -t visurf-api-gateway .

# 运行容器
docker run -d \
  --name visurf-gateway \
  -p 4000:4000 \
  -e JWT_SECRET=your-secret-key \
  -v $(pwd)/data:/app/data \
  visurf-api-gateway

# 查看日志
docker logs -f visurf-gateway

# 停止容器
docker stop visurf-gateway

# 删除容器
docker rm visurf-gateway
```

---

## 🔧 配置说明

### 环境变量

在项目根目录创建 `.env` 文件：

```bash
# 必需配置
JWT_SECRET=your-super-secret-jwt-key-at-least-32-characters

# 可选配置
CLAUDE_API_KEY=sk-ant-xxxxx
PORT=4000
NODE_ENV=production
```

### 使用 .env 文件启动

```bash
docker-compose -f docker-compose.simple.yml --env-file .env up -d
```

---

## 📊 验证部署

### 1. 健康检查

```bash
curl http://localhost:4000/health
```

**预期响应:**
```json
{
  "success": true,
  "code": 200,
  "message": "Gateway is healthy",
  "data": {
    "timestamp": "2026-02-02T...",
    "uptime": 10.5,
    "version": "1.0.0"
  }
}
```

### 2. 用户注册测试

```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

---

## 🔍 故障排查

### 查看容器状态

```bash
docker ps -a
```

### 查看容器日志

```bash
# 使用 docker-compose
docker-compose -f docker-compose.simple.yml logs -f gateway

# 使用 docker
docker logs -f visurf-gateway
```

### 进入容器调试

```bash
docker exec -it visurf-gateway sh
```

### 检查数据库

```bash
# 进入容器
docker exec -it visurf-gateway sh

# 查看数据库文件
ls -la /app/data/

# 检查数据库
sqlite3 /app/data/visurf.db "SELECT * FROM users;"
```

---

## 🌐 完整微服务部署

如果您有完整的微服务（parser-api, layout-api 等），使用原始的 `docker-compose.yml`：

```bash
# 确保所有服务都在正确的目录
# visurf-api-gateway/
# visurf-parser-api/
# visurf-layout-api/
# visurf-renderer-api/
# visurf-combo-api/
# visurf-api-platform/

# 启动所有服务
docker-compose up -d

# 查看所有服务状态
docker-compose ps

# 查看特定服务日志
docker-compose logs -f gateway
```

---

## 📦 数据持久化

### 数据卷

Docker 会自动创建以下数据卷：

- `data/` - SQLite 数据库
- `logs/` - 应用日志

### 备份数据

```bash
# 备份数据库
docker cp visurf-gateway:/app/data/visurf.db ./backup/

# 恢复数据库
docker cp ./backup/visurf.db visurf-gateway:/app/data/
```

---

## 🔄 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose -f docker-compose.simple.yml up -d --build

# 或使用 docker 命令
docker build -t visurf-api-gateway .
docker stop visurf-gateway
docker rm visurf-gateway
docker run -d --name visurf-gateway -p 4000:4000 visurf-api-gateway
```

---

## 🎯 生产环境建议

### 1. 使用环境变量文件

```bash
# .env.production
NODE_ENV=production
PORT=4000
JWT_SECRET=<强随机密钥>
ALLOWED_ORIGINS=https://your-domain.com
```

### 2. 配置反向代理（Nginx）

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 3. 配置 HTTPS

```bash
# 使用 Let's Encrypt
certbot --nginx -d api.your-domain.com
```

### 4. 监控和日志

```bash
# 查看资源使用
docker stats visurf-gateway

# 限制资源
docker run -d \
  --name visurf-gateway \
  --memory="512m" \
  --cpus="1.0" \
  -p 4000:4000 \
  visurf-api-gateway
```

---

## 📝 常用命令

```bash
# 查看镜像
docker images

# 删除镜像
docker rmi visurf-api-gateway

# 清理未使用的资源
docker system prune -a

# 查看容器资源使用
docker stats

# 导出镜像
docker save visurf-api-gateway > visurf-gateway.tar

# 导入镜像
docker load < visurf-gateway.tar
```

---

## ✅ 当前状态

- ✅ Dockerfile 已创建
- ✅ .dockerignore 已配置
- ✅ docker-compose.simple.yml 已创建（单机版）
- ✅ docker-compose.yml 已存在（完整微服务版）

**下一步:**
1. 安装 Docker Desktop
2. 启动 Docker
3. 运行 `docker-compose -f docker-compose.simple.yml up -d`
4. 访问 http://localhost:4000/health

---

**注意:** 当前系统未检测到 Docker，请先安装 Docker Desktop 后再使用。
