require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Redis = require('redis');
const jwt = require('jsonwebtoken');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');

const authRoutes = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const apiRoutes = require('./routes/api');
const { authenticateToken, checkRateLimit } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error');

const app = express();
const PORT = process.env.PORT || 4000;  // 修改端口避免冲突

// 日志配置
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Redis客户端
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  logger.error('Redis连接错误:', err);
});

redisClient.connect();

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', { reason, promise });
});

process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

// 中间件配置
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// 请求限流
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 限制每个IP 1000次请求
  message: {
    success: false,
    code: 429,
    message: 'Too many requests from this IP',
    error: {
      type: 'RATE_LIMIT_EXCEEDED',
      details: 'Please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// 请求ID中间件
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    code: 200,
    message: 'Gateway is healthy',
    data: {
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime()
    },
    requestId: req.id
  });
});

// API路由
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/billing', authenticateToken, billingRoutes);
app.use('/api/v1', authenticateToken, checkRateLimit, apiRoutes);

// 代理服务配置
const serviceProxies = {
  'parser': {
    target: process.env.PARSER_API_URL || 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: {
      '^/api/v1/parse': '/api/parse'
    }
  },
  'layout': {
    target: process.env.LAYOUT_API_URL || 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: {
      '^/api/v1/layout': '/api/layout'
    }
  },
  'renderer': {
    target: process.env.RENDERER_API_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: {
      '^/api/v1/render': '/api/render'
    }
  },
  'combo': {
    target: process.env.COMBO_API_URL || 'http://localhost:3004',
    changeOrigin: true,
    pathRewrite: {
      '^/api/v1/combo': '/api/combo'
    }
  }
};

// 创建代理中间件
Object.entries(serviceProxies).forEach(([service, config]) => {
  app.use(`/api/v1/${service}`, createProxyMiddleware({
    ...config,
    onError: (err, req, res) => {
      logger.error(`代理错误 - ${service}:`, err);
      res.status(503).json({
        success: false,
        code: 503,
        message: 'Service temporarily unavailable',
        error: {
          type: 'SERVICE_UNAVAILABLE',
          details: `The ${service} service is currently unavailable`
        },
        requestId: req.id
      });
    },
    onProxyReq: (proxyReq, req, res) => {
      // 添加原始请求信息
      proxyReq.setHeader('X-Original-URL', req.originalUrl);
      proxyReq.setHeader('X-Request-ID', req.id);
      proxyReq.setHeader('X-User-ID', req.user?.id || 'anonymous');
      
      logger.info(`代理请求 - ${service}: ${req.method} ${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      logger.info(`代理响应 - ${service}: ${proxyRes.statusCode}`);
    }
  }));
});

// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    code: 404,
    message: 'API endpoint not found',
    error: {
      type: 'NOT_FOUND',
      details: `The requested endpoint ${req.originalUrl} does not exist`
    },
    requestId: req.id
  });
});

// 全局错误处理
app.use(errorHandler);

// 启动服务器
app.listen(PORT, () => {
  logger.info(`🚀 ViSurf API Gateway 启动成功`);
  logger.info(`📡 端口: ${PORT}`);
  logger.info(`🔧 环境: ${process.env.NODE_ENV}`);
  logger.info(`📊 健康检查: http://localhost:${PORT}/health`);
});

module.exports = app;