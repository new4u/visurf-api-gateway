require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// 数据库、中间件和路由
const db = require('./db/sqlite');
const { authenticateToken } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/error');
const authRouter = require('./routes/auth');
const renderRouter = require('./routes/render');
const parseRouter = require('./routes/parse');
const comboRouter = require('./routes/combo');
const statsRouter = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 4000;

// 初始化数据库
db.initDatabase();

// 日志
const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};

// JWT 密钥 (生产环境必须设置环境变量)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-this-to-a-random-secret-string') {
  logger.error('WARNING: JWT_SECRET is not properly configured! Using fallback for development only.');
}
const jwtSecret = JWT_SECRET || 'dev-only-fallback-secret';

// ============ 中间件配置 ============

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8080').split(','),
  credentials: true
}));

app.use(morgan('combined'));

// 请求限流
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
  message: {
    success: false,
    code: 429,
    message: 'Too many requests from this IP'
  }
});
app.use('/api', limiter);

// 请求 ID 中间件
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.use(express.json({ limit: '10mb' }));

// ============ 健康检查 ============

app.get('/health', (req, res) => {
  res.json({
    success: true,
    code: 200,
    message: 'Gateway is healthy',
    data: {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      services: ['render', 'parse', 'combo']
    },
    requestId: req.id
  });
});

// ============ 认证路由 ============

app.use('/api/v1/auth', authRouter);

// ============ 核心 API 路由 ============

app.use('/api/v1/render', authenticateToken, renderRouter);
app.use('/api/v1/parse', authenticateToken, parseRouter);
app.use('/api/v1/combo', authenticateToken, comboRouter);
app.use('/api/v1/stats', authenticateToken, statsRouter);

// ============ 404 和错误处理 ============

app.use('*', notFoundHandler);
app.use(errorHandler);

// ============ 启动服务器 ============

app.listen(PORT, () => {
  logger.info(`ViSurf API Gateway started`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API endpoints:`);
  logger.info(`  POST /api/v1/render              (JSON -> SVG)`);
  logger.info(`  POST /api/v1/parse               (Text -> JSON)`);
  logger.info(`  POST /api/v1/combo               (Text -> SVG)`);
  logger.info(`  POST /api/v1/auth/register       (User registration)`);
  logger.info(`  POST /api/v1/auth/login          (User login)`);
  logger.info(`  GET  /api/v1/auth/profile        (Get user profile)`);
  logger.info(`  POST /api/v1/auth/refresh-apikey (Refresh API key)`);
  logger.info(`  GET  /api/v1/stats               (User statistics)`);
  logger.info(`  GET  /api/v1/stats/usage         (Usage history)`);
});

module.exports = app;
