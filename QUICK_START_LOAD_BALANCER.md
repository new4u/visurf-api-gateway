# 负载均衡快速开始指南

## 🚀 快速启动

### 1. 启动 Master 服务器（中心网关）

```bash
# 端口 4000
node src/simple-server.js
```

### 2. 启动多个 Worker 节点

**启动 3 个 Render Worker:**
```bash
# Worker 1 - 端口 5001，权重 2
node worker-server.js --type=render --port=5001 --name=render-worker-1 --weight=2

# Worker 2 - 端口 5002，权重 1
node worker-server.js --type=render --port=5002 --name=render-worker-2 --weight=1

# Worker 3 - 端口 5003，权重 1
node worker-server.js --type=render --port=5003 --name=render-worker-3 --weight=1
```

**启动 Parse Worker:**
```bash
# Parse Worker - 端口 5004
node worker-server.js --type=parse --port=5004 --name=parse-worker-1
```

**启动 Combo Worker:**
```bash
# Combo Worker - 端口 5005
node worker-server.js --type=combo --port=5005 --name=combo-worker-1
```

### 3. 查看已注册的 Worker 节点

```bash
curl http://localhost:4000/api/v1/worker/list
```

### 4. 运行负载均衡测试

```bash
node test-load-balancer.js
```

## 📊 命令行参数说明

Worker 服务器支持以下参数：

| 参数 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| `--type` | 服务类型 | render | `--type=parse` |
| `--port` | 监听端口 | 5001 | `--port=5002` |
| `--name` | 节点名称 | worker-{timestamp} | `--name=my-worker` |
| `--master` | Master URL | http://localhost:4000 | `--master=http://192.168.1.100:4000` |
| `--weight` | 节点权重 | 1 | `--weight=2` |

## 🎯 负载均衡策略

系统支持以下负载均衡策略（默认：加权轮询）：

### 1. 轮询 (Round Robin)
```javascript
// 依次分配给每个节点
Worker 1 → Worker 2 → Worker 3 → Worker 1 ...
```

### 2. 最少连接 (Least Connections)
```javascript
// 选择当前连接数最少的节点
```

### 3. 加权轮询 (Weighted Round Robin) ⭐ 默认
```javascript
// 根据节点权重分配请求
// 权重 2 的节点处理 2 倍的请求
```

### 4. 响应时间 (Response Time)
```javascript
// 选择平均响应时间最短的节点
```

## 📝 API 端点

### Worker 管理

**注册节点**
```bash
POST /api/v1/worker/register
{
  "name": "render-worker-1",
  "host": "192.168.1.100",
  "port": 5001,
  "serviceType": "render",
  "weight": 2
}
```

**发送心跳**
```bash
POST /api/v1/worker/heartbeat
{
  "workerId": "worker-uuid-123",
  "status": "online",
  "currentConnections": 5,
  "cpuUsage": 45.2,
  "memoryUsage": 60.5
}
```

**查看所有节点**
```bash
GET /api/v1/worker/list
```

**查看单个节点**
```bash
GET /api/v1/worker/{workerId}
```

**查看节点统计**
```bash
GET /api/v1/worker/{workerId}/stats
```

**标记节点离线**
```bash
POST /api/v1/worker/{workerId}/offline
```

**删除节点**
```bash
DELETE /api/v1/worker/{workerId}
```

## 🔍 监控和调试

### 查看 Master 状态
```bash
curl http://localhost:4000/health
```

### 查看 Worker 状态
```bash
curl http://localhost:5001/health
```

### 查看所有在线节点
```bash
curl http://localhost:4000/api/v1/worker/list | jq '.data.workers[] | select(.status=="online")'
```

### 查看节点统计
```bash
curl http://localhost:4000/api/v1/worker/{workerId}/stats
```

## 🧪 测试场景

### 场景 1: 基本负载均衡
```bash
# 启动 1 个 Master + 3 个 Render Worker
node src/simple-server.js
node worker-server.js --type=render --port=5001
node worker-server.js --type=render --port=5002
node worker-server.js --type=render --port=5003

# 运行测试
node test-load-balancer.js
```

### 场景 2: 加权负载均衡
```bash
# 启动不同权重的 Worker
node worker-server.js --type=render --port=5001 --weight=3
node worker-server.js --type=render --port=5002 --weight=2
node worker-server.js --type=render --port=5003 --weight=1

# Worker 1 将处理 50% 的请求
# Worker 2 将处理 33% 的请求
# Worker 3 将处理 17% 的请求
```

### 场景 3: 节点故障恢复
```bash
# 1. 启动 3 个 Worker
# 2. 运行测试脚本
# 3. 手动停止一个 Worker (Ctrl+C)
# 4. 观察请求自动转发到其他节点
# 5. 重新启动 Worker
# 6. 观察节点自动重新加入负载均衡
```

## 🛡️ 容错机制

### 1. 心跳检测
- Worker 每 30 秒发送心跳
- Master 每 10 秒检查节点健康
- 60 秒无心跳自动标记为离线

### 2. 请求重试
- 请求失败自动重试（最多 3 次）
- 自动选择其他健康节点

### 3. 熔断机制
- 连续失败 5 次触发熔断
- 熔断持续 60 秒后自动恢复
- 保护系统避免雪崩

## 📈 性能优化建议

### 1. Worker 数量
```
推荐配置：
- 小型部署: 1 Master + 2-3 Workers
- 中型部署: 1 Master + 5-10 Workers
- 大型部署: 1 Master + 10+ Workers (考虑多 Master)
```

### 2. 权重设置
```
根据机器性能设置权重：
- 高性能机器: weight=3
- 中等性能机器: weight=2
- 低性能机器: weight=1
```

### 3. 连接池
```
每个 Worker 建议配置：
- max_connections: 100
- 根据实际负载调整
```

## 🔧 故障排查

### Worker 无法注册
```bash
# 检查 Master 是否运行
curl http://localhost:4000/health

# 检查网络连接
ping localhost

# 查看 Worker 日志
# Worker 会自动重试注册
```

### 请求未分发到 Worker
```bash
# 检查 Worker 状态
curl http://localhost:4000/api/v1/worker/list

# 确认 Worker 状态为 online
# 确认 service_type 匹配
```

### Worker 频繁离线
```bash
# 检查心跳间隔设置
# 检查网络稳定性
# 检查 Worker 进程是否正常运行
```

## 📚 相关文档

- [LOAD_BALANCER.md](./LOAD_BALANCER.md) - 详细架构设计
- [README.md](./README.md) - 项目总览
- [TIME_BILLING.md](./TIME_BILLING.md) - 按时间计费说明

## 🎉 下一步

1. ✅ 基本负载均衡已实现
2. 🔄 可以添加更多负载均衡策略
3. 📊 可以添加可视化监控界面
4. 🔐 可以添加 Worker 认证机制
5. 🌐 可以支持跨机器部署
