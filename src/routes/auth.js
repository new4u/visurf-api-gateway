const express = require('express');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('../db/sqlite');
const { generateApiKey, revokeApiKey, authenticateToken } = require('../middleware/auth');

const router = express.Router();

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
    
    // 检查邮箱是否已存在
    const existingUser = db.findUserByEmail(email);
    if (existingUser) {
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
    
    // 创建用户
    const userId = db.createUser(email, name, hashedPassword);
    
    // 更新额外信息
    if (company || phone) {
      db.updateUser(userId, { company, phone });
    }
    
    // 生成API密钥
    const apiKey = generateApiKey(userId);
    
    // 保存API密钥
    db.saveApiKey(userId, apiKey);

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
    const user = db.findUserByEmail(email);
    
    if (!user) {
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
    let apiKey = db.getApiKey(user.id);
    if (!apiKey) {
      // 生成新的API密钥
      apiKey = generateApiKey(user.id);
      db.saveApiKey(user.id, apiKey);
    }

    // 记录登录时间
    db.updateLastLogin(user.id);

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
        trialUsed: user.trial_used === 1,
        apiCalls: user.api_calls || 0,
        totalSpent: user.total_spent || 0
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
router.post('/refresh-apikey', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    
    // 获取旧的API密钥
    const oldApiKey = db.getApiKey(userId);
    
    // 生成新的API密钥
    const newApiKey = generateApiKey(userId);
    
    // 撤销旧的API密钥（如果存在）
    if (oldApiKey) {
      revokeApiKey(oldApiKey);
    }
    
    // 保存新的API密钥
    db.saveApiKey(userId, newApiKey);
    
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
router.get('/profile', authenticateToken, (req, res) => {
  try {
    console.log('Profile route - req.user:', req.user);
    
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: 401,
        message: 'Authentication required',
        error: {
          type: 'NO_USER',
          details: 'User not authenticated'
        },
        requestId: req.id
      });
    }
    
    const userId = req.user.id;
    const user = db.findUserById(userId);
    
    if (!user) {
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
        trialUsed: user.trial_used === 1,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        apiCalls: user.api_calls || 0,
        totalSpent: user.total_spent || 0
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