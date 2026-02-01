require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// 数据库和路由
const db = require('./db/sqlite');
const renderRouter = require('./routes/render');
const parseRouter = require('./routes/parse');
const comboRouter = require('./routes/combo');

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

// ============ 认证中间件 ============

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      code: 401,
      message: 'Access token required',
      requestId: req.id
    });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const user = db.findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Invalid user',
        requestId: req.id
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      code: 401,
      message: 'Invalid token',
      requestId: req.id
    });
  }
};

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

// 用户注册
app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Missing required fields: email, password, name',
        requestId: req.id
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Password must be at least 6 characters',
        requestId: req.id
      });
    }

    // 检查邮箱是否已存在
    const existing = db.findUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        code: 409,
        message: 'Email already exists',
        requestId: req.id
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = db.createUser(email, name, hashedPassword);

    // 生成 API 密钥 (JWT)
    const apiKey = jwt.sign({ userId, type: 'api_key' }, jwtSecret, { expiresIn: '365d' });
    db.saveApiKey(userId, apiKey);

    logger.info(`User registered: ${email}`);

    res.status(201).json({
      success: true,
      code: 201,
      message: 'User registered successfully',
      data: {
        userId,
        email,
        name,
        plan: 'free',
        apiKey
      },
      requestId: req.id
    });

  } catch (error) {
    logger.error(`Register error: ${error.message}`);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Registration failed',
      requestId: req.id
    });
  }
});

// 用户登录
app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Missing email or password',
        requestId: req.id
      });
    }

    const user = db.findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Invalid credentials',
        requestId: req.id
      });
    }

    const apiKey = db.getApiKey(user.id) ||
      jwt.sign({ userId: user.id, type: 'api_key' }, jwtSecret, { expiresIn: '365d' });

    res.json({
      success: true,
      code: 200,
      message: 'Login successful',
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        apiKey,
        apiCalls: user.api_calls,
        totalSpent: user.total_spent
      },
      requestId: req.id
    });

  } catch (error) {
    logger.error(`Login error: ${error.message}`);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Login failed',
      requestId: req.id
    });
  }
});

// 获取用户信息
app.get('/api/v1/auth/profile', authenticateToken, (req, res) => {
  res.json({
    success: true,
    code: 200,
    message: 'User profile retrieved successfully',
    data: {
      userId: req.user.id,
      email: req.user.email,
      name: req.user.name,
      plan: req.user.plan,
      apiCalls: req.user.api_calls,
      totalSpent: req.user.total_spent
    },
    requestId: req.id
  });
});

// ============ 核心 API 路由 ============

app.use('/api/v1/render', authenticateToken, renderRouter);
app.use('/api/v1/parse', authenticateToken, parseRouter);
app.use('/api/v1/combo', authenticateToken, comboRouter);

// ============ 404 和错误处理 ============

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    code: 404,
    message: 'API endpoint not found',
    requestId: req.id
  });
});

app.use((err, req, res, next) => {
  logger.error(`Server error: ${err.message}`);
  res.status(500).json({
    success: false,
    code: 500,
    message: 'Internal server error',
    requestId: req.id
  });
});

// ============ 启动服务器 ============

app.listen(PORT, () => {
  logger.info(`ViSurf API Gateway started`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`API endpoints:`);
  logger.info(`  POST /api/v1/render  (JSON -> SVG)`);
  logger.info(`  POST /api/v1/parse   (Text -> JSON)`);
  logger.info(`  POST /api/v1/combo   (Text -> SVG)`);
  logger.info(`  POST /api/v1/auth/register`);
  logger.info(`  POST /api/v1/auth/login`);
  logger.info(`  GET  /api/v1/auth/profile`);
});

module.exports = app;
