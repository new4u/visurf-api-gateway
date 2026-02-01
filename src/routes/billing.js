const express = require('express');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * 获取计费信息
 */
router.get('/info', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // 这里应该从数据库获取用户的计费信息
    // 现在返回模拟数据
    const billingInfo = {
      userId,
      currentPlan: req.user.plan,
      balance: 100.00, // 账户余额
      totalSpent: parseFloat(req.user.totalSpent) || 0,
      monthlyUsage: {
        parser: { calls: 150, cost: 15.30 },
        layout: { calls: 80, cost: 24.50 },
        renderer: { calls: 45, cost: 38.25 },
        combo: { calls: 25, cost: 32.00 }
      },
      lastBillingDate: '2024-01-01T00:00:00Z',
      nextBillingDate: '2024-02-01T00:00:00Z'
    };

    res.json({
      success: true,
      code: 200,
      message: 'Billing information retrieved successfully',
      data: billingInfo,
      requestId: req.id
    });

  } catch (error) {
    console.error('获取计费信息错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve billing information',
      error: {
        type: 'BILLING_ERROR',
        details: 'An error occurred while retrieving billing information'
      },
      requestId: req.id
    });
  }
});

/**
 * 充值账户
 */
router.post('/recharge', [
  body('amount').isFloat({ min: 10, max: 10000 }).withMessage('Amount must be between 10 and 10000'),
  body('paymentMethod').isIn(['alipay', 'wechat', 'card']).withMessage('Invalid payment method')
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

    const { amount, paymentMethod } = req.body;
    const userId = req.user.id;
    
    // 生成订单号
    const orderId = `VISURF_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 这里应该集成真实的支付接口
    // 现在返回模拟的支付信息
    const paymentInfo = {
      orderId,
      amount: parseFloat(amount),
      currency: 'CNY',
      paymentMethod,
      status: 'pending',
      qrCode: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=PAYMENT_' + orderId,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15分钟过期
      description: `ViSurf API充值 ¥${amount}`
    };

    // 保存订单信息到Redis（15分钟）
    const orderData = {
      orderId,
      userId,
      amount,
      paymentMethod,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    // 这里应该使用Redis保存订单信息
    // await redisClient.setEx(`order:${orderId}`, 15 * 60, JSON.stringify(orderData));

    res.json({
      success: true,
      code: 200,
      message: 'Recharge order created successfully',
      data: paymentInfo,
      requestId: req.id
    });

  } catch (error) {
    console.error('充值错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Recharge failed',
      error: {
        type: 'RECHARGE_ERROR',
        details: 'An error occurred while creating the recharge order'
      },
      requestId: req.id
    });
  }
});

/**
 * 获取使用记录
 */
router.get('/usage', async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, service, limit = 50, offset = 0 } = req.query;
    
    // 这里应该从数据库获取使用记录
    // 现在返回模拟数据
    const usageRecords = [
      {
        id: 'usage_123456789',
        userId,
        service: 'parser',
        requestId: 'req_123456789',
        cost: 0.15,
        metadata: {
          charCount: 150,
          entityCount: 8,
          relationCount: 5
        },
        timestamp: '2024-01-31T10:30:00Z',
        status: 'completed'
      },
      {
        id: 'usage_123456790',
        userId,
        service: 'renderer',
        requestId: 'req_123456790',
        cost: 2.5,
        metadata: {
          nodeCount: 50,
          theme: 'COSMIC',
          svgSize: 15320
        },
        timestamp: '2024-01-31T09:15:00Z',
        status: 'completed'
      },
      {
        id: 'usage_123456791',
        userId,
        service: 'combo',
        requestId: 'req_123456791',
        cost: 4.8,
        metadata: {
          charCount: 600,
          nodeCount: 60,
          theme: 'TERRA',
          layoutMode: 'HIERARCHICAL'
        },
        timestamp: '2024-01-31T08:45:00Z',
        status: 'completed'
      }
    ];

    const total = 156; // 总记录数
    const filtered = usageRecords.filter(record => {
      if (service && record.service !== service) return false;
      if (startDate && new Date(record.timestamp) < new Date(startDate)) return false;
      if (endDate && new Date(record.timestamp) > new Date(endDate)) return false;
      return true;
    });

    const paginated = filtered.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      code: 200,
      message: 'Usage records retrieved successfully',
      data: {
        records: paginated,
        pagination: {
          total: filtered.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: filtered.length > parseInt(offset) + parseInt(limit)
        },
        summary: {
          totalCost: filtered.reduce((sum, record) => sum + record.cost, 0),
          totalCalls: filtered.length,
          byService: {
            parser: filtered.filter(r => r.service === 'parser').reduce((sum, r) => sum + r.cost, 0),
            layout: filtered.filter(r => r.service === 'layout').reduce((sum, r) => sum + r.cost, 0),
            renderer: filtered.filter(r => r.service === 'renderer').reduce((sum, r) => sum + r.cost, 0),
            combo: filtered.filter(r => r.service === 'combo').reduce((sum, r) => sum + r.cost, 0)
          }
        }
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('获取使用记录错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve usage records',
      error: {
        type: 'USAGE_ERROR',
        details: 'An error occurred while retrieving usage records'
      },
      requestId: req.id
    });
  }
});

/**
 * 升级套餐
 */
router.post('/upgrade', [
  body('plan').isIn(['basic', 'pro', 'enterprise']).withMessage('Invalid plan'),
  body('duration').isIn(['monthly', 'yearly']).withMessage('Invalid duration')
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

    const { plan, duration } = req.body;
    const userId = req.user.id;
    const currentPlan = req.user.plan;
    
    // 套餐价格配置
    const planPricing = {
      basic: { monthly: 29, yearly: 290 },
      pro: { monthly: 99, yearly: 990 },
      enterprise: { monthly: 299, yearly: 2990 }
    };
    
    const price = planPricing[plan][duration];
    
    // 检查是否已经是更高级套餐
    const planHierarchy = ['free', 'basic', 'pro', 'enterprise'];
    const currentIndex = planHierarchy.indexOf(currentPlan);
    const targetIndex = planHierarchy.indexOf(plan);
    
    if (currentIndex >= targetIndex) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid upgrade',
        error: {
          type: 'INVALID_UPGRADE',
          details: `You are already on ${currentPlan} plan or higher`
        },
        requestId: req.id
      });
    }

    // 生成升级订单
    const orderId = `UPGRADE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const upgradeInfo = {
      orderId,
      userId,
      currentPlan,
      targetPlan: plan,
      duration,
      amount: price,
      status: 'pending',
      createdAt: new Date().toISOString(),
      features: {
        rateLimit: plan === 'basic' ? 1000 : plan === 'pro' ? 10000 : 100000,
        support: plan === 'enterprise' ? '24/7 priority' : plan === 'pro' ? 'email' : 'community',
        analytics: plan !== 'basic',
        customThemes: plan === 'enterprise',
        whiteLabel: plan === 'enterprise'
      }
    };

    res.json({
      success: true,
      code: 200,
      message: 'Upgrade order created successfully',
      data: upgradeInfo,
      requestId: req.id
    });

  } catch (error) {
    console.error('升级套餐错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Upgrade failed',
      error: {
        type: 'UPGRADE_ERROR',
        details: 'An error occurred while creating the upgrade order'
      },
      requestId: req.id
    });
  }
});

/**
 * 获取发票列表
 */
router.get('/invoices', async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate, status, limit = 20, offset = 0 } = req.query;
    
    // 这里应该从数据库获取发票信息
    // 现在返回模拟数据
    const invoices = [
      {
        id: 'INV_202401_001',
        userId,
        amount: 156.75,
        currency: 'CNY',
        status: 'paid',
        items: [
          { service: 'parser', quantity: 1500, unitPrice: 0.001, total: 1.50 },
          { service: 'layout', quantity: 800, unitPrice: 0.01, total: 8.00 },
          { service: 'renderer', quantity: 450, unitPrice: 0.05, total: 22.50 },
          { service: 'combo', quantity: 200, unitPrice: 0.08, total: 16.00 }
        ],
        period: {
          start: '2024-01-01',
          end: '2024-01-31'
        },
        createdAt: '2024-01-31T23:59:59Z',
        paidAt: '2024-02-01T10:30:00Z',
        downloadUrl: '/api/billing/invoices/INV_202401_001/download'
      },
      {
        id: 'INV_202312_001',
        userId,
        amount: 89.20,
        currency: 'CNY',
        status: 'paid',
        items: [
          { service: 'parser', quantity: 800, unitPrice: 0.001, total: 0.80 },
          { service: 'renderer', quantity: 300, unitPrice: 0.05, total: 15.00 },
          { service: 'combo', quantity: 150, unitPrice: 0.08, total: 12.00 }
        ],
        period: {
          start: '2023-12-01',
          end: '2023-12-31'
        },
        createdAt: '2023-12-31T23:59:59Z',
        paidAt: '2024-01-01T09:15:00Z',
        downloadUrl: '/api/billing/invoices/INV_202312_001/download'
      }
    ];

    const total = 12; // 总发票数
    const filtered = invoices.filter(invoice => {
      if (status && invoice.status !== status) return false;
      if (startDate && new Date(invoice.createdAt) < new Date(startDate)) return false;
      if (endDate && new Date(invoice.createdAt) > new Date(endDate)) return false;
      return true;
    });

    const paginated = filtered.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    res.json({
      success: true,
      code: 200,
      message: 'Invoices retrieved successfully',
      data: {
        invoices: paginated,
        pagination: {
          total: filtered.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: filtered.length > parseInt(offset) + parseInt(limit)
        }
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('获取发票列表错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve invoices',
      error: {
        type: 'INVOICE_ERROR',
        details: 'An error occurred while retrieving invoices'
      },
      requestId: req.id
    });
  }
});

module.exports = router;