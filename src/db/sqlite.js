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
      api_calls INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
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

    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_log(created_at);
  `);

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

module.exports = {
  initDatabase,
  getDb,
  createUser,
  findUserByEmail,
  findUserById,
  updateUserStats,
  saveApiKey,
  getApiKey,
  logUsage,
  getUserUsage
};
