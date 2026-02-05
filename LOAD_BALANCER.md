# 负载均衡架构设计

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    客户端请求                            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              中心网关 (Gateway Master)                   │
│  - 接收所有客户端请求                                    │
│  - 用户认证和鉴权                                        │
│  - 计费管理                                              │
│  - 负载均衡调度                                          │
└────────────────────┬────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Worker 1 │  │ Worker 2 │  │ Worker 3 │
│ 渲染节点  │  │ 解析节点  │  │ 组合节点  │
└──────────┘  └──────────┘  └──────────┘
     │             │             │
     └─────────────┴─────────────┘
              │
              ▼
        ┌──────────┐
        │ 结果返回  │
        └──────────┘
```

## 📋 核心功能

### 1. 工作节点管理
- **节点注册**: Worker 启动时向 Master 注册
- **心跳检测**: 定期发送心跳保持在线状态
- **健康检查**: Master 定期检查节点健康状态
- **自动剔除**: 超时未响应的节点自动下线

### 2. 负载均衡策略

#### 轮询 (Round Robin)
```javascript
// 依次分配给每个节点
Worker 1 → Worker 2 → Worker 3 → Worker 1 ...
```

#### 最少连接 (Least Connections)
```javascript
// 选择当前连接数最少的节点
connections: { worker1: 5, worker2: 3, worker3: 7 }
→ 选择 worker2
```

#### 加权轮询 (Weighted Round Robin)
```javascript
// 根据节点性能分配权重
{ worker1: weight=3, worker2: weight=2, worker3: weight=1 }
→ worker1 处理 50%, worker2 处理 33%, worker3 处理 17%
```

#### 响应时间 (Response Time)
```javascript
// 选择平均响应时间最短的节点
avgTime: { worker1: 120ms, worker2: 80ms, worker3: 150ms }
→ 选择 worker2
```

### 3. 数据库设计

#### worker_nodes 表
```sql
CREATE TABLE worker_nodes (
  id TEXT PRIMARY KEY,              -- 节点ID
  name TEXT NOT NULL,               -- 节点名称
  host TEXT NOT NULL,               -- 主机地址
  port INTEGER NOT NULL,            -- 端口
  service_type TEXT NOT NULL,       -- 服务类型 (render/parse/combo)
  status TEXT DEFAULT 'online',     -- 状态 (online/offline/busy)
  weight INTEGER DEFAULT 1,         -- 权重
  max_connections INTEGER DEFAULT 100,  -- 最大连接数
  current_connections INTEGER DEFAULT 0, -- 当前连接数
  total_requests INTEGER DEFAULT 0, -- 总请求数
  failed_requests INTEGER DEFAULT 0,-- 失败请求数
  avg_response_time REAL DEFAULT 0, -- 平均响应时间(ms)
  last_heartbeat TEXT,              -- 最后心跳时间
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

#### worker_stats 表
```sql
CREATE TABLE worker_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id TEXT NOT NULL,
  requests INTEGER DEFAULT 0,       -- 请求数
  success INTEGER DEFAULT 0,        -- 成功数
  failed INTEGER DEFAULT 0,         -- 失败数
  avg_time REAL DEFAULT 0,          -- 平均时间
  timestamp TEXT DEFAULT (datetime('now'))
);
```

## 🔄 工作流程

### 1. 节点注册流程
```javascript
// Worker 启动
POST /api/v1/worker/register
{
  "name": "render-worker-1",
  "host": "192.168.1.100",
  "port": 5001,
  "serviceType": "render",
  "weight": 2
}

// Master 响应
{
  "success": true,
  "data": {
    "workerId": "worker-uuid-123",
    "heartbeatInterval": 30000  // 30秒
  }
}
```

### 2. 心跳机制
```javascript
// Worker 每30秒发送心跳
POST /api/v1/worker/heartbeat
{
  "workerId": "worker-uuid-123",
  "status": "online",
  "currentConnections": 5,
  "cpuUsage": 45.2,
  "memoryUsage": 60.5
}
```

### 3. 请求分发流程
```javascript
// 1. 客户端请求到达 Master
POST /api/v1/render
Authorization: Bearer {api_key}

// 2. Master 验证用户身份和权限
authenticateToken(req)

// 3. 负载均衡器选择最优节点
const worker = loadBalancer.selectWorker('render')

// 4. 转发请求到 Worker
const response = await axios.post(
  `http://${worker.host}:${worker.port}/render`,
  req.body
)

// 5. 记录统计和计费
updateWorkerStats(worker.id, responseTime)
logUsage(userId, cost, startTime, endTime)

// 6. 返回结果给客户端
res.json(response.data)
```

## 🎯 负载均衡算法实现

### 轮询算法
```javascript
class RoundRobinBalancer {
  constructor() {
    this.currentIndex = 0;
  }
  
  selectWorker(workers) {
    if (workers.length === 0) return null;
    const worker = workers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % workers.length;
    return worker;
  }
}
```

### 最少连接算法
```javascript
class LeastConnectionsBalancer {
  selectWorker(workers) {
    if (workers.length === 0) return null;
    return workers.reduce((min, worker) => 
      worker.current_connections < min.current_connections ? worker : min
    );
  }
}
```

### 加权轮询算法
```javascript
class WeightedRoundRobinBalancer {
  constructor() {
    this.currentWeights = new Map();
  }
  
  selectWorker(workers) {
    if (workers.length === 0) return null;
    
    let totalWeight = 0;
    let maxWeight = -1;
    let selectedWorker = null;
    
    for (const worker of workers) {
      const currentWeight = (this.currentWeights.get(worker.id) || 0) + worker.weight;
      this.currentWeights.set(worker.id, currentWeight);
      totalWeight += worker.weight;
      
      if (currentWeight > maxWeight) {
        maxWeight = currentWeight;
        selectedWorker = worker;
      }
    }
    
    if (selectedWorker) {
      this.currentWeights.set(
        selectedWorker.id, 
        this.currentWeights.get(selectedWorker.id) - totalWeight
      );
    }
    
    return selectedWorker;
  }
}
```

## 🛡️ 容错机制

### 1. 节点健康检查
```javascript
// 每10秒检查一次所有节点
setInterval(() => {
  const now = Date.now();
  const timeout = 60000; // 60秒超时
  
  for (const worker of workers) {
    const lastHeartbeat = new Date(worker.last_heartbeat).getTime();
    if (now - lastHeartbeat > timeout) {
      markWorkerOffline(worker.id);
    }
  }
}, 10000);
```

### 2. 请求重试
```javascript
async function forwardRequest(worker, request, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios.post(
        `http://${worker.host}:${worker.port}${request.path}`,
        request.body,
        { timeout: 30000 }
      );
    } catch (error) {
      if (i === retries - 1) throw error;
      
      // 标记节点失败，选择新节点
      recordWorkerFailure(worker.id);
      worker = loadBalancer.selectWorker(request.serviceType);
    }
  }
}
```

### 3. 熔断机制
```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failures = new Map();
    this.threshold = threshold;
    this.timeout = timeout;
  }
  
  isOpen(workerId) {
    const failure = this.failures.get(workerId);
    if (!failure) return false;
    
    if (failure.count >= this.threshold) {
      if (Date.now() - failure.timestamp < this.timeout) {
        return true; // 熔断打开
      } else {
        this.failures.delete(workerId); // 超时重置
      }
    }
    return false;
  }
  
  recordFailure(workerId) {
    const failure = this.failures.get(workerId) || { count: 0, timestamp: Date.now() };
    failure.count++;
    failure.timestamp = Date.now();
    this.failures.set(workerId, failure);
  }
}
```

## 📊 监控指标

### 节点指标
- 在线节点数
- 总请求数
- 平均响应时间
- 错误率
- CPU/内存使用率

### 系统指标
- 请求分发速率
- 负载均衡效率
- 节点故障次数
- 请求重试次数

## 🚀 部署方案

### Master 节点 (中心网关)
```bash
# 端口 4000
node src/simple-server.js
```

### Worker 节点 (工作节点)
```bash
# Render Worker - 端口 5001
node src/worker-server.js --type=render --port=5001

# Parse Worker - 端口 5002
node src/worker-server.js --type=parse --port=5002

# Combo Worker - 端口 5003
node src/worker-server.js --type=combo --port=5003
```

### Docker Compose 部署
```yaml
version: '3.8'

services:
  gateway-master:
    build: .
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
      - ROLE=master
    
  render-worker-1:
    build: .
    environment:
      - NODE_ENV=production
      - ROLE=worker
      - SERVICE_TYPE=render
      - MASTER_URL=http://gateway-master:4000
    
  render-worker-2:
    build: .
    environment:
      - NODE_ENV=production
      - ROLE=worker
      - SERVICE_TYPE=render
      - MASTER_URL=http://gateway-master:4000
```

## 🔧 配置示例

```javascript
// config/load-balancer.js
module.exports = {
  strategy: 'weighted-round-robin',  // 负载均衡策略
  healthCheck: {
    interval: 10000,      // 健康检查间隔 (ms)
    timeout: 60000        // 节点超时时间 (ms)
  },
  retry: {
    maxRetries: 3,        // 最大重试次数
    timeout: 30000        // 请求超时时间 (ms)
  },
  circuitBreaker: {
    threshold: 5,         // 失败阈值
    timeout: 60000        // 熔断超时 (ms)
  }
};
```

## 📈 性能优化

### 1. 连接池
```javascript
const agents = new Map();

function getAgent(worker) {
  const key = `${worker.host}:${worker.port}`;
  if (!agents.has(key)) {
    agents.set(key, new http.Agent({
      keepAlive: true,
      maxSockets: 100,
      maxFreeSockets: 10
    }));
  }
  return agents.get(key);
}
```

### 2. 请求缓存
```javascript
const cache = new LRU({
  max: 1000,
  ttl: 60000  // 1分钟
});

function getCachedResponse(key) {
  return cache.get(key);
}
```

### 3. 批量处理
```javascript
// 合并多个小请求为一个批量请求
const batchQueue = [];
const BATCH_SIZE = 10;
const BATCH_TIMEOUT = 100; // ms

function addToBatch(request) {
  batchQueue.push(request);
  if (batchQueue.length >= BATCH_SIZE) {
    processBatch();
  }
}
```

## 🎯 下一步计划

- [ ] 实现节点注册和心跳机制
- [ ] 实现负载均衡调度器
- [ ] 修改 API 路由支持节点分发
- [ ] 添加节点管理界面
- [ ] 实现监控和告警
- [ ] 性能测试和优化
