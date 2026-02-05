# 按时间计费功能说明

## 📊 计费模式

系统已从**按次计费**改为**按时间计费**，根据每个 API 的实际执行时间来计算费用。

### 计费公式

```
费用 = 时间单价(元/秒) × 执行时间(秒)
```

## 🎯 当前配置

| API | 服务名称 | 端点 | 时间单价 | 计费模式 |
|-----|----------|------|----------|----------|
| render | SVG 渲染 | /api/v1/render | ¥0.01/秒 | per_time |
| parse | 文本解析 | /api/v1/parse | ¥0.02/秒 | per_time |
| combo | 组合服务 | /api/v1/combo | ¥0.03/秒 | per_time |

## 🔄 工作流程

### 1. API 调用开始
```javascript
const startTime = new Date();
const startTimeISO = startTime.toISOString();
```

### 2. 执行业务逻辑
```javascript
const result = render(entities, relations, options);
// 或
const result = await extractKnowledgeGraph(text, options);
```

### 3. 计算执行时间
```javascript
const endTime = new Date();
const endTimeISO = endTime.toISOString();
const durationMs = endTime - startTime;
const durationSeconds = durationMs / 1000;
```

### 4. 从数据库读取计费配置
```javascript
const apiConfig = getApiConfig('render');
```

### 5. 计算费用
```javascript
if (apiConfig.billing_mode === 'per_time') {
  // 按时间计费
  cost = apiConfig.time_unit_price * durationSeconds;
} else {
  // 按次计费（兼容模式）
  cost = apiConfig.cost;
}
```

### 6. 记录用量
```javascript
logUsage(userId, 'render', cost, metadata, startTimeISO, endTimeISO, durationMs);
```

## 📝 数据库结构

### api_config 表（新增字段）
```sql
CREATE TABLE api_config (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  cost REAL NOT NULL,                    -- 保留用于兼容
  billing_mode TEXT DEFAULT 'per_call',  -- 新增：计费模式
  time_unit_price REAL DEFAULT 0,        -- 新增：时间单价(元/秒)
  description TEXT,
  enabled INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### usage_log 表（新增字段）
```sql
CREATE TABLE usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  cost REAL DEFAULT 0,
  start_time TEXT,          -- 新增：开始时间
  end_time TEXT,            -- 新增：结束时间
  duration_ms INTEGER,      -- 新增：执行时长(毫秒)
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 💡 计费示例

### 示例 1: render API

**场景**: 渲染 10 个节点，执行时间 15ms

```
时间单价: ¥0.01/秒
执行时间: 15ms = 0.015秒
费用 = 0.01 × 0.015 = ¥0.00015
```

### 示例 2: parse API

**场景**: 解析 500 字文本，执行时间 2.5秒

```
时间单价: ¥0.02/秒
执行时间: 2.5秒
费用 = 0.02 × 2.5 = ¥0.05
```

### 示例 3: combo API

**场景**: 组合服务，执行时间 3.8秒

```
时间单价: ¥0.03/秒
执行时间: 3.8秒
费用 = 0.03 × 3.8 = ¥0.114
```

## 📊 用量记录示例

```json
{
  "id": 1,
  "user_id": "user-123",
  "service": "render",
  "cost": 0.00015,
  "start_time": "2026-02-02T08:12:23.185Z",
  "end_time": "2026-02-02T08:12:23.200Z",
  "duration_ms": 15,
  "metadata": {
    "nodeCount": 10,
    "relationCount": 5,
    "durationMs": 15,
    "durationSeconds": "0.015",
    "billingMode": "per_time"
  },
  "created_at": "2026-02-02T08:12:23.200Z"
}
```

## 🎛️ 管理配置

### 通过管理 API 修改时间单价

```bash
# 修改 render API 的时间单价为 ¥0.02/秒
curl -X PUT http://localhost:4000/api/v1/admin/configs/render \
  -H "Content-Type: application/json" \
  -d '{"time_unit_price": 0.02}'
```

### 切换计费模式

```bash
# 切换回按次计费
curl -X PUT http://localhost:4000/api/v1/admin/configs/render \
  -H "Content-Type: application/json" \
  -d '{"billing_mode": "per_call", "cost": 0.05}'

# 切换为按时间计费
curl -X PUT http://localhost:4000/api/v1/admin/configs/render \
  -H "Content-Type: application/json" \
  -d '{"billing_mode": "per_time", "time_unit_price": 0.01}'
```

## ⚙️ 技术细节

### 时间精度
- 记录精度：毫秒(ms)
- 计费精度：秒(s)
- 费用精度：保留所有小数位

### 性能影响
- 时间记录开销：< 1ms
- 对 API 性能影响：可忽略不计

### 兼容性
- 支持两种计费模式并存
- 可以为不同 API 配置不同的计费模式
- 旧的按次计费逻辑仍然可用

## 🔍 查询统计

### 查看用户总消费
```javascript
GET /api/v1/stats
```

### 查看用量历史（包含时间信息）
```javascript
GET /api/v1/stats/usage?limit=50
```

返回示例：
```json
{
  "success": true,
  "data": {
    "count": 10,
    "usage": [
      {
        "service": "render",
        "cost": 0.00015,
        "start_time": "2026-02-02T08:12:23.185Z",
        "end_time": "2026-02-02T08:12:23.200Z",
        "duration_ms": 15,
        "metadata": {
          "nodeCount": 10,
          "durationSeconds": "0.015",
          "billingMode": "per_time"
        }
      }
    ]
  }
}
```

## ✅ 优势

1. **更公平**: 只为实际使用的计算时间付费
2. **更精确**: 精确到毫秒级别的时间记录
3. **更灵活**: 可以根据服务复杂度调整单价
4. **可追溯**: 完整记录每次调用的时间信息

## 📝 注意事项

1. **极短时间**: 如果执行时间 < 1ms，费用可能为 ¥0
2. **时间波动**: 服务器负载可能影响执行时间
3. **单价设置**: 建议根据服务成本合理设置时间单价
4. **数据迁移**: 已有数据库需要运行 `migrate-db.js` 进行迁移

## 🚀 下一步

- [ ] 更新管理界面显示时间计费信息
- [ ] 添加时间计费的可视化图表
- [ ] 支持阶梯定价（不同时长不同单价）
- [ ] 添加费用预估功能
