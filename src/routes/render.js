/**
 * 渲染路由 — POST /api/v1/render
 * 核心付费接口: JSON (entities + relations) → SVG
 */
const express = require('express');
const router = express.Router();
const { render } = require('../services/renderService');
const { updateUserStats, logUsage, getApiConfig } = require('../db/sqlite');

router.post('/', (req, res) => {
  const startTime = new Date();
  const startTimeISO = startTime.toISOString();
  
  try {
    const { entities, relations, options = {} } = req.body;

    if (!entities || !Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'entities array is required and must not be empty',
        requestId: req.id
      });
    }

    if (!relations || !Array.isArray(relations)) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'relations array is required',
        requestId: req.id
      });
    }

    const result = render(entities, relations, options);

    // 计算执行时间
    const endTime = new Date();
    const endTimeISO = endTime.toISOString();
    const durationMs = endTime - startTime;
    const durationSeconds = durationMs / 1000;

    // 从数据库读取计费配置
    const apiConfig = getApiConfig('render');
    let cost = 0;
    
    if (apiConfig) {
      if (apiConfig.billing_mode === 'per_time') {
        // 按时间计费：单价(元/秒) * 执行时间(秒)
        cost = (apiConfig.time_unit_price || 0.01) * durationSeconds;
      } else {
        // 按次计费
        cost = apiConfig.cost || 0.05;
      }
    } else {
      cost = 0.05; // 默认值
    }
    
    if (req.user) {
      updateUserStats(req.user.id, cost);
      logUsage(req.user.id, 'render', cost, {
        nodeCount: entities.length,
        relationCount: relations.length,
        durationMs,
        durationSeconds: durationSeconds.toFixed(3),
        billingMode: apiConfig?.billing_mode || 'per_call'
      }, startTimeISO, endTimeISO, durationMs);
    }

    res.json({
      success: true,
      code: 200,
      message: 'SVG rendered successfully',
      data: {
        svg: result.svg,
        metadata: {
          ...result.metadata,
          cost
        }
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: `Render failed: ${error.message}`,
      requestId: req.id
    });
  }
});

module.exports = router;
