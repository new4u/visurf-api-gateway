const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Redis = require('redis');

// Redis客户端
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis连接错误:', err);
});

redisClient.connect();

/**
 * JWT认证中间件
 */
const authenticateToken = async (req, res, next) => {
  try {
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
    const isRevoked = await redisClient.get(`revoked:${token}`);
    if (isRevoked) {
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
    const userKey = `user:${decoded.userId}`;
    const userData = await redisClient.hGetAll(userKey);
    
    if (!userData || !userData.id) {
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
    if (userData.status !== 'active') {
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
      id: userData.id,
      email: userData.email,
      plan: userData.plan || 'free',
      trialUsed: userData.trialUsed === 'true',
      createdAt: userData.createdAt,
      apiKey: token
    };

    next();
  } catch (error) {
    console.error('认证错误:', error);
    
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
 * 限流中间件
 */
const checkRateLimit = async (req, res, next) => {
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
    const window = limit.window;
    const maxRequests = limit.requests;

    // 生成限流键
    const rateLimitKey = `ratelimit:${userId}:${service}:${Math.floor(Date.now() / (window * 1000))}`;
    
    // 获取当前计数
    const current = await redisClient.incr(rateLimitKey);
    
    // 设置过期时间（仅在第一次设置）
    if (current === 1) {
      await redisClient.expire(rateLimitKey, window);
    }

    // 检查是否超限
    if (current > maxRequests) {
      const ttl = await redisClient.ttl(rateLimitKey);
      
      return res.status(429).json({
        success: false,
        code: 429,
        message: 'Rate limit exceeded',
        error: {
          type: 'RATE_LIMIT_EXCEEDED',
          details: `Rate limit exceeded for ${service} service. Try again in ${ttl} seconds.`,
          limit: maxRequests,
          current: current,
          resetIn: ttl
        },
        requestId: req.id
      });
    }

    // 设置响应头
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
    res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + window);

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
const checkTrialUsage = async (req, res, next) => {
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
const revokeApiKey = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const expiresAt = decoded.exp * 1000;
    const ttl = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    
    // 将令牌加入撤销列表
    if (ttl > 0) {
      await redisClient.setEx(`revoked:${token}`, ttl, '1');
    }
    
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