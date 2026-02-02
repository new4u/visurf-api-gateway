const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'visurf.db');

let db;

/**
 * 初始化数据库连接和表结构
 */
function initDatabase() {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      plan TEXT DEFAULT 'free',
      status TEXT DEFAULT 'active',
      trial_used INTEGER DEFAULT 0,
      company TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      api_calls INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      key TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id),
      service TEXT NOT NULL,
      cost REAL DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS api_config (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      cost REAL NOT NULL,
      description TEXT,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_revoked_expires ON revoked_tokens(expires_at);
  `);

  // 初始化默认 API 配置
  const defaultConfigs = [
    { id: 'render', name: 'SVG 渲染', endpoint: '/api/v1/render', cost: 0.05, description: '将实体关系数据渲染为 SVG 图形' },
    { id: 'parse', name: '文本解析', endpoint: '/api/v1/parse', cost: 0.10, description: '从文本中提取知识图谱' },
    { id: 'combo', name: '组合服务', endpoint: '/api/v1/combo', cost: 0.12, description: '文本解析 + SVG 渲染一站式服务' }
  ];

  const checkConfig = db.prepare('SELECT COUNT(*) as count FROM api_config').get();
  if (checkConfig.count === 0) {
    const insertConfig = db.prepare(
      'INSERT INTO api_config (id, name, endpoint, cost, description) VALUES (?, ?, ?, ?, ?)'
    );
    for (const config of defaultConfigs) {
      insertConfig.run(config.id, config.name, config.endpoint, config.cost, config.description);
    }
  }

  return db;
}

/**
 * 获取数据库实例
 */
function getDb() {
  if (!db) initDatabase();
  return db;
}

// ============ 用户操作 ============

function createUser(email, name, hashedPassword) {
  const id = uuidv4();
  const stmt = getDb().prepare(
    'INSERT INTO users (id, email, name, password) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, email, name, hashedPassword);
  return id;
}

function findUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findUserById(id) {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function updateUserStats(userId, costIncrement) {
  getDb().prepare(
    'UPDATE users SET api_calls = api_calls + 1, total_spent = total_spent + ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(costIncrement, userId);
}

// ============ API Key 操作 ============

function saveApiKey(userId, key) {
  getDb().prepare(
    'INSERT OR REPLACE INTO api_keys (user_id, key) VALUES (?, ?)'
  ).run(userId, key);
}

function getApiKey(userId) {
  const row = getDb().prepare('SELECT key FROM api_keys WHERE user_id = ?').get(userId);
  return row ? row.key : null;
}

// ============ 用量日志 ============

function logUsage(userId, service, cost, metadata) {
  getDb().prepare(
    'INSERT INTO usage_log (user_id, service, cost, metadata) VALUES (?, ?, ?, ?)'
  ).run(userId, service, cost, JSON.stringify(metadata || {}));
}

function getUserUsage(userId, limit = 50) {
  return getDb().prepare(
    'SELECT * FROM usage_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, limit);
}

// ============ 撤销令牌操作 ============

function revokeToken(token, userId, expiresAt) {
  getDb().prepare(
    'INSERT OR REPLACE INTO revoked_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(token, userId, expiresAt);
}

function isTokenRevoked(token) {
  const row = getDb().prepare('SELECT 1 FROM revoked_tokens WHERE token = ?').get(token);
  return !!row;
}

function cleanExpiredTokens() {
  const now = new Date().toISOString();
  getDb().prepare('DELETE FROM revoked_tokens WHERE expires_at < ?').run(now);
}

// ============ 用户更新操作 ============

function updateUser(userId, updates) {
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = ?`);
    values.push(value);
  }
  
  if (fields.length === 0) return;
  
  fields.push('updated_at = datetime(\'now\')');
  values.push(userId);
  
  const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
  getDb().prepare(sql).run(...values);
}

// ============ API 配置操作 ============

function getAllApiConfigs() {
  return getDb().prepare('SELECT * FROM api_config ORDER BY id').all();
}

function getApiConfig(id) {
  return getDb().prepare('SELECT * FROM api_config WHERE id = ?').get(id);
}

function updateApiConfig(id, updates) {
  const fields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (['name', 'endpoint', 'cost', 'description', 'enabled'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = datetime(\'now\')');
  values.push(id);
  
  const sql = `UPDATE api_config SET ${fields.join(', ')} WHERE id = ?`;
  const result = getDb().prepare(sql).run(...values);
  return result.changes > 0;
}

function updateLastLogin(userId) {
  getDb().prepare(
    'UPDATE users SET last_login = datetime(\'now\') WHERE id = ?'
  ).run(userId);
}

function markTrialUsed(userId) {
  getDb().prepare(
    'UPDATE users SET trial_used = 1, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(userId);
}

// ============ 统计查询 ============

function getUserStats(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  
  const usageStats = getDb().prepare(`
    SELECT 
      service,
      COUNT(*) as count,
      SUM(cost) as total_cost
    FROM usage_log 
    WHERE user_id = ?
    GROUP BY service
  `).all(userId);
  
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      apiCalls: user.api_calls,
      totalSpent: user.total_spent,
      trialUsed: user.trial_used === 1
    },
    usageByService: usageStats
  };
}

module.exports = {
  initDatabase,
  getDb,
  createUser,
  findUserByEmail,
  findUserById,
  updateUserStats,
  updateUser,
  updateLastLogin,
  markTrialUsed,
  saveApiKey,
  getApiKey,
  logUsage,
  getUserUsage,
  getUserStats,
  revokeToken,
  isTokenRevoked,
  cleanExpiredTokens,
  getAllApiConfigs,
  getApiConfig,
  updateApiConfig
};
