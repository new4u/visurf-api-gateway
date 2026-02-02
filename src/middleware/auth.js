const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/sqlite');

// 定期清理过期令牌（每小时）
setInterval(() => {
  try {
    db.cleanExpiredTokens();
  } catch (error) {
    console.error('清理过期令牌错误:', error);
  }
}, 60 * 60 * 1000);

/**
 * JWT认证中间件
 */
const authenticateToken = (req, res, next) => {
  try {
    // 确保 req.id 存在
    if (!req.id) {
      req.id = uuidv4();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Access token required',
        error: {
          type: 'UNAUTHORIZED',
          details: 'Please provide a valid API key in the Authorization header'
        },
        requestId: req.id
      });
    }

    // 验证JWT令牌
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    // 检查令牌是否被撤销
    if (db.isTokenRevoked(token)) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Token has been revoked',
        error: {
          type: 'TOKEN_REVOKED',
          details: 'This API key has been revoked. Please contact support.'
        },
        requestId: req.id
      });
    }

    // 获取用户信息
    const user = db.findUserById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Invalid user',
        error: {
          type: 'INVALID_USER',
          details: 'User not found or account suspended'
        },
        requestId: req.id
      });
    }

    // 检查账户状态
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 403,
        message: 'Account suspended',
        error: {
          type: 'ACCOUNT_SUSPENDED',
          details: 'Your account has been suspended. Please contact support.'
        },
        requestId: req.id
      });
    }

    // 设置用户信息
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan || 'free',
      trialUsed: user.trial_used === 1,
      createdAt: user.created_at,
      apiKey: token
    };

    next();
  } catch (error) {
    console.error('认证错误:', error);
    
    // 确保 req.id 存在
    if (!req.id) {
      req.id = uuidv4();
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Invalid token',
        error: {
          type: 'INVALID_TOKEN',
          details: 'The provided API key is invalid'
        },
        requestId: req.id
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Token expired',
        error: {
          type: 'TOKEN_EXPIRED',
          details: 'This API key has expired. Please generate a new one.'
        },
        requestId: req.id
      });
    }

    return res.status(500).json({
      success: false,
      code: 500,
      message: 'Authentication error',
      error: {
        type: 'AUTH_ERROR',
        details: 'An error occurred during authentication'
      },
      requestId: req.id
    });
  }
};

/**
 * 限流中间件（简化版，基于内存）
 * 生产环境建议使用 Redis 或其他分布式缓存
 */
const rateLimitStore = new Map();

// 定期清理过期的限流记录
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60 * 1000); // 每分钟清理一次

const checkRateLimit = (req, res, next) => {
  try {
    const userId = req.user.id;
    const plan = req.user.plan;
    const service = req.path.split('/')[3]; // /api/v1/{service}
    
    // 限流配置
    const rateLimits = {
      free: { requests: 100, window: 3600 },     // 100次/小时
      basic: { requests: 1000, window: 3600 },   // 1000次/小时
      pro: { requests: 10000, window: 3600 },    // 10000次/小时
      enterprise: { requests: 100000, window: 3600 } // 100000次/小时
    };

    const limit = rateLimits[plan] || rateLimits.free;
    const window = limit.window * 1000; // 转换为毫秒
    const maxRequests = limit.requests;

    // 生成限流键
    const now = Date.now();
    const windowStart = Math.floor(now / window) * window;
    const rateLimitKey = `${userId}:${service}:${windowStart}`;
    
    // 获取或创建计数器
    let record = rateLimitStore.get(rateLimitKey);
    if (!record) {
      record = { count: 0, resetAt: windowStart + window };
      rateLimitStore.set(rateLimitKey, record);
    }
    
    record.count++;

    // 检查是否超限
    if (record.count > maxRequests) {
      const resetIn = Math.ceil((record.resetAt - now) / 1000);
      
      return res.status(429).json({
        success: false,
        code: 429,
        message: 'Rate limit exceeded',
        error: {
          type: 'RATE_LIMIT_EXCEEDED',
          details: `Rate limit exceeded for ${service} service. Try again in ${resetIn} seconds.`,
          limit: maxRequests,
          current: record.count,
          resetIn: resetIn
        },
        requestId: req.id
      });
    }

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.floor(record.resetAt / 1000));

    next();
  } catch (error) {
    console.error('限流错误:', error);
    
    // 限流错误不应该阻止请求，记录错误但继续处理
    next();
  }
};

/**
 * 试用检查中间件
 */
const checkTrialUsage = (req, res, next) => {
  try {
    const user = req.user;
    
    // 检查是否已使用过试用
    if (user.trialUsed) {
      return res.status(403).json({
        success: false,
        code: 403,
        message: 'Trial already used',
        error: {
          type: 'TRIAL_USED',
          details: 'You have already used your free trial. Please upgrade to a paid plan.'
        },
        requestId: req.id
      });
    }

    next();
  } catch (error) {
    console.error('试用检查错误:', error);
    next();
  }
};

/**
 * 生成API密钥
 */
const generateApiKey = (userId, expiresIn = '365d') => {
  return jwt.sign(
    { 
      userId,
      type: 'api_key',
      iat: Math.floor(Date.now() / 1000),
      jti: uuidv4()
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn }
  );
};

/**
 * 撤销API密钥
 */
const revokeApiKey = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const expiresAt = new Date(decoded.exp * 1000).toISOString();
    
    // 将令牌加入撤销列表
    db.revokeToken(token, decoded.userId, expiresAt);
    
    return true;
  } catch (error) {
    console.error('撤销令牌错误:', error);
    return false;
  }
};

module.exports = {
  authenticateToken,
  checkRateLimit,
  checkTrialUsage,
  generateApiKey,
  revokeApiKey
};