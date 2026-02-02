/**
 * 统计路由 - 用户用量统计和账单查询
 */
const express = require('express');
const router = express.Router();
const db = require('../db/sqlite');

/**
 * 获取用户统计信息
 */
router.get('/', (req, res) => {
  try {
    const userId = req.user.id;
    const stats = db.getUserStats(userId);
    
    if (!stats) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'User not found',
        requestId: req.id
      });
    }

    res.json({
      success: true,
      code: 200,
      message: 'User statistics retrieved successfully',
      data: stats,
      requestId: req.id
    });

  } catch (error) {
    console.error('获取统计信息错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve statistics',
      error: {
        type: 'STATS_ERROR',
        details: 'An error occurred while retrieving statistics'
      },
      requestId: req.id
    });
  }
});

/**
 * 获取用户用量历史
 */
router.get('/usage', (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 50;
    
    if (limit > 500) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Limit cannot exceed 500',
        requestId: req.id
      });
    }

    const usage = db.getUserUsage(userId, limit);
    
    // 解析 metadata JSON
    const parsedUsage = usage.map(record => ({
      ...record,
      metadata: JSON.parse(record.metadata || '{}')
    }));

    res.json({
      success: true,
      code: 200,
      message: 'Usage history retrieved successfully',
      data: {
        count: parsedUsage.length,
        usage: parsedUsage
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('获取用量历史错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve usage history',
      error: {
        type: 'USAGE_ERROR',
        details: 'An error occurred while retrieving usage history'
      },
      requestId: req.id
    });
  }
});

module.exports = router;
