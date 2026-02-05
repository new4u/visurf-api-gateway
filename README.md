# ViSurf API Gateway

> 统一的 API 网关服务，提供用户认证、计费管理、SVG 渲染等完整功能

[![Test Status](https://img.shields.io/badge/tests-9%2F9%20passing-brightgreen)](./test.html)
[![Production Ready](https://img.shields.io/badge/status-production%20ready-success)]()
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)]()

## ✨ 项目状态

- ✅ **核心功能**: 100% 完成
- ✅ **测试覆盖**: 9/9 通过 (100%)
- ✅ **生产就绪**: 可直接部署
- ✅ **文档完善**: 完整的 API 文档和测试工具

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

## 💰 计费管理

### 计费模式

系统支持两种计费模式，可通过管理界面动态切换：

**1. 按次计费 (per_call)**
- 每次 API 调用固定费用
- 适合执行时间稳定的服务

**2. 按时间计费 (per_time)** ⭐ 当前默认
- 根据实际执行时间计费
- 计费公式：`费用 = 时间单价(元/秒) × 执行时间(秒)`
- 更公平、更精确

### 当前计费配置

```javascript
const API_PRICING = {
  render: {
    mode: 'per_time',
    timeUnitPrice: 0.01,  // ¥0.01/秒
    description: 'SVG 渲染服务'
  },
  parse: {
    mode: 'per_time',
    timeUnitPrice: 0.02,  // ¥0.02/秒
    description: '文本解析服务'
  },
  combo: {
    mode: 'per_time',
    timeUnitPrice: 0.03,  // ¥0.03/秒
    description: '组合服务（解析+渲染）'
  }
};
```

### 计费示例

**render API (¥0.01/秒)**
```
执行时间: 15ms = 0.015秒
费用 = 0.01 × 0.015 = ¥0.00015
```

**parse API (¥0.02/秒)**
```
执行时间: 2.5秒
费用 = 0.02 × 2.5 = ¥0.05
```

**combo API (¥0.03/秒)**
```
执行时间: 3.8秒
费用 = 0.03 × 3.8 = ¥0.114
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
npm install
```

### 2. 配置环境变量
```bash
# 复制配置文件
cp .env.development .env

# 编辑 .env，设置必需的配置
# JWT_SECRET=your-strong-secret-key-here
# CLAUDE_API_KEY=your-claude-api-key (可选)
```

### 3. 启动服务
```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 4. 测试验证
```bash
# 运行自动化测试
node test-api.js

# 或在浏览器打开可视化测试页面
open http://localhost:8080/test.html
```

## 🎛️ 管理界面

### 启动管理后台
```bash
# 启动管理界面服务器（端口 8081）
node serve-admin.js

# 在浏览器中打开
open http://localhost:8081
```

### 功能特性
- ✅ **实时配置管理** - 查看所有 API 配置
- ✅ **计费模式切换** - 按次计费 ⇄ 按时间计费
- ✅ **动态调价** - 实时修改费用和时间单价
- ✅ **服务开关** - 启用/禁用 API 服务
- ✅ **可视化界面** - 美观的卡片式布局

### 管理 API
- `GET /api/v1/admin/configs` - 获取所有 API 配置
- `GET /api/v1/admin/configs/:id` - 获取单个 API 配置
- `PUT /api/v1/admin/configs/:id` - 更新 API 配置

## 📖 API 端点

### 认证相关
- `POST /api/v1/auth/register` - 用户注册
- `POST /api/v1/auth/login` - 用户登录
- `GET /api/v1/auth/profile` - 获取用户信息
- `POST /api/v1/auth/refresh-apikey` - 刷新 API 密钥

### 核心服务
- `POST /api/v1/render` - SVG 渲染（按时间计费）
- `POST /api/v1/parse` - 文本解析（按时间计费，需要 Claude API Key）
- `POST /api/v1/combo` - 组合服务（按时间计费，需要 Claude API Key）

### 统计查询
- `GET /api/v1/stats` - 用户统计
- `GET /api/v1/stats/usage` - 用量历史（包含时间信息）

### 系统
- `GET /health` - 健康检查

### 示例：用户注册
```bash
curl -X POST http://localhost:4000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```

### 示例：SVG 渲染
```bash
curl -X POST http://localhost:4000/api/v1/render \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "entities": [
      {"id": "1", "label": "人工智能", "labelEn": "AI"},
      {"id": "2", "label": "机器学习", "labelEn": "ML"}
    ],
    "relations": [
      {"source": "1", "target": "2", "label": "包含"}
    ]
  }'
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

## 🧪 测试

### 自动化测试
```bash
# 运行完整测试套件
node test-api.js

# 快速测试
node quick-test.js
```

### 可视化测试
```bash
# 启动测试页面服务器
node serve-test.js

# 在浏览器打开
open http://localhost:8080
```

**测试结果**: ✅ 9/9 通过 (100%)

## 🔧 部署

### Docker 部署
```bash
# 使用 docker-compose
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### PM2 部署
```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start src/simple-server.js --name visurf-api-gateway

# 设置开机自启
pm2 startup
pm2 save
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

## 📊 数据库结构

### api_config 表
存储 API 配置信息，支持动态计费配置：

```sql
CREATE TABLE api_config (
  id TEXT PRIMARY KEY,              -- API 标识
  name TEXT NOT NULL,               -- API 名称
  endpoint TEXT NOT NULL,           -- API 端点
  cost REAL NOT NULL,               -- 按次计费金额
  billing_mode TEXT DEFAULT 'per_call',  -- 计费模式
  time_unit_price REAL DEFAULT 0,   -- 时间单价(元/秒)
  description TEXT,                 -- 描述
  enabled INTEGER DEFAULT 1,        -- 是否启用
  created_at DATETIME,              -- 创建时间
  updated_at DATETIME               -- 更新时间
);
```

### usage_log 表
记录 API 使用情况，包含详细的时间信息：

```sql
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  cost REAL DEFAULT 0,
  start_time TEXT,        -- 开始时间
  end_time TEXT,          -- 结束时间
  duration_ms INTEGER,    -- 执行时长(毫秒)
  metadata TEXT,          -- 元数据(JSON)
  created_at TEXT
);
```

## 🔄 数据库迁移

如果从旧版本升级，需要运行迁移脚本：

```bash
# 迁移数据库结构，添加时间计费字段
node migrate-db.js
```

## 📚 相关文档

- **[TIME_BILLING.md](./TIME_BILLING.md)** - 按时间计费详细说明
- **[test.html](http://localhost:8080/test.html)** - API 测试页面
- **[admin.html](http://localhost:8081)** - 管理后台界面

---

这个网关服务将作为整个ViSurf API生态系统的统一入口，提供安全、可靠、高性能的API聚合服务。