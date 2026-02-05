const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'visurf.db');
const db = new Database(DB_PATH);

console.log('开始数据库迁移...\n');

try {
  // 1. 为 api_config 表添加新字段
  console.log('1. 更新 api_config 表结构...');
  
  try {
    db.exec(`ALTER TABLE api_config ADD COLUMN billing_mode TEXT DEFAULT 'per_call'`);
    console.log('   ✓ 添加 billing_mode 字段');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('   - billing_mode 字段已存在');
    } else {
      throw e;
    }
  }
  
  try {
    db.exec(`ALTER TABLE api_config ADD COLUMN time_unit_price REAL DEFAULT 0`);
    console.log('   ✓ 添加 time_unit_price 字段');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('   - time_unit_price 字段已存在');
    } else {
      throw e;
    }
  }

  // 2. 为 usage_log 表添加新字段
  console.log('\n2. 更新 usage_log 表结构...');
  
  try {
    db.exec(`ALTER TABLE usage_log ADD COLUMN start_time TEXT`);
    console.log('   ✓ 添加 start_time 字段');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('   - start_time 字段已存在');
    } else {
      throw e;
    }
  }
  
  try {
    db.exec(`ALTER TABLE usage_log ADD COLUMN end_time TEXT`);
    console.log('   ✓ 添加 end_time 字段');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('   - end_time 字段已存在');
    } else {
      throw e;
    }
  }
  
  try {
    db.exec(`ALTER TABLE usage_log ADD COLUMN duration_ms INTEGER DEFAULT 0`);
    console.log('   ✓ 添加 duration_ms 字段');
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log('   - duration_ms 字段已存在');
    } else {
      throw e;
    }
  }

  // 3. 更新现有 API 配置为按时间计费
  console.log('\n3. 更新 API 配置为按时间计费模式...');
  
  const updates = [
    { id: 'render', billing_mode: 'per_time', time_unit_price: 0.01, description: '将实体关系数据渲染为 SVG 图形，按执行时间计费 ¥0.01/秒' },
    { id: 'parse', billing_mode: 'per_time', time_unit_price: 0.02, description: '从文本中提取知识图谱，按执行时间计费 ¥0.02/秒' },
    { id: 'combo', billing_mode: 'per_time', time_unit_price: 0.03, description: '文本解析 + SVG 渲染一站式服务，按执行时间计费 ¥0.03/秒' }
  ];
  
  const updateStmt = db.prepare(`
    UPDATE api_config 
    SET billing_mode = ?, time_unit_price = ?, description = ?, updated_at = datetime('now')
    WHERE id = ?
  `);
  
  for (const config of updates) {
    updateStmt.run(config.billing_mode, config.time_unit_price, config.description, config.id);
    console.log(`   ✓ 更新 ${config.id}: ${config.billing_mode}, ¥${config.time_unit_price}/秒`);
  }

  console.log('\n✅ 数据库迁移完成！\n');
  
  // 显示当前配置
  console.log('当前 API 配置:');
  const configs = db.prepare('SELECT * FROM api_config').all();
  configs.forEach(config => {
    console.log(`\n  ${config.name} (${config.id})`);
    console.log(`    端点: ${config.endpoint}`);
    console.log(`    计费模式: ${config.billing_mode}`);
    console.log(`    时间单价: ¥${config.time_unit_price}/秒`);
    console.log(`    描述: ${config.description}`);
  });

} catch (error) {
  console.error('\n❌ 迁移失败:', error.message);
  process.exit(1);
} finally {
  db.close();
}
