/**
 * 管理员路由 - API 配置管理
 */
const express = require('express');
const router = express.Router();
const { getAllApiConfigs, getApiConfig, updateApiConfig } = require('../db/sqlite');

/**
 * 获取所有 API 配置
 */
router.get('/configs', (req, res) => {
  try {
    const configs = getAllApiConfigs();
    
    res.json({
      success: true,
      code: 200,
      message: 'API configurations retrieved successfully',
      data: {
        configs,
        count: configs.length
      },
      requestId: req.id
    });
  } catch (error) {
    console.error('Get configs error:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve API configurations',
      error: {
        type: 'CONFIG_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * 获取单个 API 配置
 */
router.get('/configs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const config = getApiConfig(id);
    
    if (!config) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'API configuration not found',
        requestId: req.id
      });
    }
    
    res.json({
      success: true,
      code: 200,
      message: 'API configuration retrieved successfully',
      data: config,
      requestId: req.id
    });
  } catch (error) {
    console.error('Get config error:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve API configuration',
      error: {
        type: 'CONFIG_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * 更新 API 配置
 */
router.put('/configs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // 验证配置是否存在
    const config = getApiConfig(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'API configuration not found',
        requestId: req.id
      });
    }
    
    // 验证输入
    if (updates.cost !== undefined) {
      const cost = parseFloat(updates.cost);
      if (isNaN(cost) || cost < 0) {
        return res.status(400).json({
          success: false,
          code: 400,
          message: 'Invalid cost value',
          requestId: req.id
        });
      }
      updates.cost = cost;
    }
    
    if (updates.enabled !== undefined) {
      updates.enabled = updates.enabled ? 1 : 0;
    }
    
    // 更新配置
    const success = updateApiConfig(id, updates);
    
    if (!success) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'No valid fields to update',
        requestId: req.id
      });
    }
    
    // 获取更新后的配置
    const updatedConfig = getApiConfig(id);
    
    res.json({
      success: true,
      code: 200,
      message: 'API configuration updated successfully',
      data: updatedConfig,
      requestId: req.id
    });
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to update API configuration',
      error: {
        type: 'CONFIG_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

module.exports = router;
