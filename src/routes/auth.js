const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Redis = require('redis');

const router = express.Router();
const redisClient = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
  console.error('Redis连接错误:', err);
});

redisClient.connect();

/**
 * 用户注册
 */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Validation error',
        error: {
          type: 'VALIDATION_ERROR',
          details: errors.array()
        },
        requestId: req.id
      });
    }

    const { email, password, name, company = '', phone = '' } = req.body;
    const userId = uuidv4();
    
    // 检查邮箱是否已存在
    const existingUser = await redisClient.hGetAll(`user:email:${email}`);
    if (existingUser && existingUser.id) {
      return res.status(409).json({
        success: false,
        code: 409,
        message: 'Email already exists',
        error: {
          type: 'EMAIL_EXISTS',
          details: 'This email address is already registered'
        },
        requestId: req.id
      });
    }

    // 密码加密
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // 创建用户数据
    const userData = {
      id: userId,
      email,
      name,
      company,
      phone,
      password: hashedPassword,
      plan: 'free',
      status: 'active',
      trialUsed: 'false',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      apiCalls: '0',
      totalSpent: '0'
    };

    // 保存用户信息
    await redisClient.hSet(`user:${userId}`, userData);
    await redisClient.hSet(`user:email:${email}`, { id: userId });
    
    // 生成API密钥
    const apiKey = jwt.sign(
      { userId, type: 'api_key' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '365d' }
    );
    
    // 保存API密钥
    await redisClient.setEx(`apikey:${userId}`, 365 * 24 * 60 * 60, apiKey);

    // 记录注册统计
    await redisClient.incr('stats:registrations');

    res.status(201).json({
      success: true,
      code: 201,
      message: 'User registered successfully',
      data: {
        userId,
        email,
        name,
        plan: 'free',
        apiKey,
        trialAvailable: true
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Registration failed',
      error: {
        type: 'REGISTRATION_ERROR',
        details: 'An error occurred during registration'
      },
      requestId: req.id
    });
  }
});

/**
 * 用户登录
 */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').exists().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Validation error',
        error: {
          type: 'VALIDATION_ERROR',
          details: errors.array()
        },
        requestId: req.id
      });
    }

    const { email, password } = req.body;
    
    // 查找用户
    const emailMapping = await redisClient.hGetAll(`user:email:${email}`);
    if (!emailMapping || !emailMapping.id) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Invalid credentials',
        error: {
          type: 'INVALID_CREDENTIALS',
          details: 'Email or password is incorrect'
        },
        requestId: req.id
      });
    }

    const userId = emailMapping.id;
    const user = await redisClient.hGetAll(`user:${userId}`);
    
    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Invalid credentials',
        error: {
          type: 'INVALID_CREDENTIALS',
          details: 'Email or password is incorrect'
        },
        requestId: req.id
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Invalid credentials',
        error: {
          type: 'INVALID_CREDENTIALS',
          details: 'Email or password is incorrect'
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

    // 获取API密钥
    let apiKey = await redisClient.get(`apikey:${userId}`);
    if (!apiKey) {
      // 生成新的API密钥
      apiKey = jwt.sign(
        { userId: user.id, type: 'api_key' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '365d' }
      );
      await redisClient.setEx(`apikey:${userId}`, 365 * 24 * 60 * 60, apiKey);
    }

    // 记录登录统计
    await redisClient.incr('stats:logins');
    await redisClient.hSet(`user:${userId}`, 'lastLogin', new Date().toISOString());

    res.json({
      success: true,
      code: 200,
      message: 'Login successful',
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        company: user.company,
        apiKey,
        trialUsed: user.trialUsed === 'true',
        apiCalls: parseInt(user.apiCalls) || 0,
        totalSpent: parseFloat(user.totalSpent) || 0
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Login failed',
      error: {
        type: 'LOGIN_ERROR',
        details: 'An error occurred during login'
      },
      requestId: req.id
    });
  }
});

/**
 * 刷新API密钥
 */
router.post('/refresh-apikey', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取旧的API密钥
    const oldApiKey = await redisClient.get(`apikey:${userId}`);
    
    // 生成新的API密钥
    const newApiKey = jwt.sign(
      { userId, type: 'api_key' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '365d' }
    );
    
    // 撤销旧的API密钥（如果存在）
    if (oldApiKey) {
      const decoded = jwt.verify(oldApiKey, process.env.JWT_SECRET || 'your-secret-key');
      const expiresAt = decoded.exp * 1000;
      const ttl = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      
      if (ttl > 0) {
        await redisClient.setEx(`revoked:${oldApiKey}`, ttl, '1');
      }
    }
    
    // 保存新的API密钥
    await redisClient.setEx(`apikey:${userId}`, 365 * 24 * 60 * 60, newApiKey);
    
    res.json({
      success: true,
      code: 200,
      message: 'API key refreshed successfully',
      data: {
        apiKey: newApiKey,
        expiresIn: '365 days'
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('刷新API密钥错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to refresh API key',
      error: {
        type: 'REFRESH_ERROR',
        details: 'An error occurred while refreshing the API key'
      },
      requestId: req.id
    });
  }
});

/**
 * 获取用户信息
 */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await redisClient.hGetAll(`user:${userId}`);
    
    if (!user || !user.id) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'User not found',
        error: {
          type: 'USER_NOT_FOUND',
          details: 'The requested user does not exist'
        },
        requestId: req.id
      });
    }

    res.json({
      success: true,
      code: 200,
      message: 'User profile retrieved successfully',
      data: {
        userId: user.id,
        email: user.email,
        name: user.name,
        company: user.company,
        phone: user.phone,
        plan: user.plan,
        status: user.status,
        trialUsed: user.trialUsed === 'true',
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        apiCalls: parseInt(user.apiCalls) || 0,
        totalSpent: parseFloat(user.totalSpent) || 0
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve user profile',
      error: {
        type: 'PROFILE_ERROR',
        details: 'An error occurred while retrieving the user profile'
      },
      requestId: req.id
    });
  }
});

module.exports = router;