# ViSurf API Gateway - 服务聚合器

这是一个统一的API网关，负责聚合各个独立的ViSurf API服务，提供统一的付费接口和试用功能。

## 🏗️ 架构概述

```
┌─────────────────────────────────────────────┐
│           ViSurf API Gateway                │
├─────────────────────────────────────────────┤
│  1. 统一入口: /api/v1/*                     │
│  2. 负载均衡: 多实例部署                   │
│  3. 限流保护: 防止恶意调用                 │
│  4. 缓存优化: Redis缓存热点数据            │
│  5. 监控告警: 实时监控服务状态             │
└─────────────────────────────────────────────┘
```

## 📋 服务聚合

### 后端服务映射
```javascript
const SERVICE_MAP = {
  'parser': 'http://visurf-parser-api:3001',
  'layout': 'http://visurf-layout-api:3002', 
  'renderer': 'http://visurf-renderer-api:3003',
  'combo': 'http://visurf-combo-api:3004'
};
```

### 统一响应格式
```javascript
{
  "success": true,
  "code": 200,
  "message": "success",
  "data": { /* 具体数据 */ },
  "timestamp": "2024-01-31T12:00:00Z",
  "requestId": "req_123456789"
}
```

## 💰 付费管理

### 计费规则
```javascript
const PRICING_RULES = {
  parser: { base: 0.001, unit: 'character', min: 0.1 },
  layout: { base: 0.01, unit: 'node', min: 0.5 },
  renderer: { base: 0.05, unit: 'node', min: 1.0 },
  combo: { base: 0.08, unit: 'node', min: 0.8 }
};
```

### 试用额度
```javascript
const TRIAL_LIMITS = {
  parser: 1000,  // 字符数
  layout: 100,    // 节点数
  renderer: 50,   // 节点数
  combo: 20       // 节点数
};
```

## 🔐 安全机制

### API密钥验证
```javascript
// 请求头验证
Authorization: Bearer {api_key}
X-Request-ID: {request_id}
```

### 限流策略
```javascript
const RATE_LIMITS = {
  free: { requests: 100, window: '1h' },
  basic: { requests: 1000, window: '1h' },
  pro: { requests: 10000, window: '1h' },
  enterprise: { requests: 100000, window: '1h' }
};
```

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install express axios redis jsonwebtoken cors helmet morgan
```

### 2. 配置环境变量
```bash
# .env
NODE_ENV=production
PORT=3000
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_jwt_secret
PARSER_API_URL=http://visurf-parser-api:3001
LAYOUT_API_URL=http://visurf-layout-api:3002
RENDERER_API_URL=http://visurf-renderer-api:3003
COMBO_API_URL=http://visurf-combo-api:3004
```

### 3. 启动服务
```bash
npm start
```

## 📖 API文档

### 文本解析API
```http
POST /api/v1/parse
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "text": "人工智能包含机器学习",
  "options": {
    "language": "zh",
    "extractMode": "smart"
  }
}
```

### 布局计算API
```http
POST /api/v1/layout
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "entities": [...],
  "relations": [...],
  "layoutMode": "FORCE",
  "width": 800,
  "height": 600
}
```

### 渲染生成API
```http
POST /api/v1/render
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "entities": [...],
  "relations": [...],
  "theme": "COSMIC",
  "displayLanguage": "both"
}
```

### 组合服务API
```http
POST /api/v1/combo
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "text": "人工智能包含机器学习",
  "theme": "COSMIC",
  "layoutMode": "HIERARCHICAL",
  "width": 1200,
  "height": 800
}
```

## 📊 监控指标

### 业务指标
- API调用成功率
- 平均响应时间
- 错误率统计
- 用户活跃度

### 系统指标
- CPU使用率
- 内存使用量
- 网络吞吐量
- 数据库连接数

### 业务指标
- 收入统计
- 用户增长率
- 付费转化率
- 客户满意度

## 🔧 部署配置

### Docker部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  gateway:
    build: .
    ports:
      - "80:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      - parser-api
      - layout-api
      - renderer-api
      - combo-api
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    
  parser-api:
    build: ../visurf-parser-api
    restart: unless-stopped
    
  layout-api:
    build: ../visurf-layout-api
    restart: unless-stopped
    
  renderer-api:
    build: ../visurf-renderer-api
    restart: unless-stopped
    
  combo-api:
    build: ../visurf-combo-api
    restart: unless-stopped
```

## 🛡️ 错误处理

### 标准错误码
```javascript
const ERROR_CODES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout'
};
```

### 错误响应格式
```javascript
{
  "success": false,
  "code": 429,
  "message": "Too Many Requests",
  "error": {
    "type": "RATE_LIMIT_EXCEEDED",
    "details": "Rate limit exceeded. Try again in 3600 seconds."
  },
  "timestamp": "2024-01-31T12:00:00Z",
  "requestId": "req_123456789"
}
```

## 📈 性能优化

### 缓存策略
```javascript
// Redis缓存配置
const CACHE_CONFIG = {
  ttl: 3600, // 1小时
  maxSize: 1000, // 最大缓存条目
  strategy: 'LRU' // 最近最少使用
};
```

### 连接池优化
```javascript
// HTTP连接池
const HTTP_POOL_CONFIG = {
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
  keepAlive: true
};
```

这个网关服务将作为整个ViSurf API生态系统的统一入口，提供安全、可靠、高性能的API聚合服务。