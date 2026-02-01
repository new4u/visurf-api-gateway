/**
 * 渲染路由 — POST /api/v1/render
 * 核心付费接口: JSON (entities + relations) → SVG
 */
const express = require('express');
const router = express.Router();
const { render } = require('../services/renderService');
const { updateUserStats, logUsage } = require('../db/sqlite');

router.post('/', (req, res) => {
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

    // 计费: ¥0.05/次
    const cost = 0.05;
    if (req.user) {
      updateUserStats(req.user.id, cost);
      logUsage(req.user.id, 'render', cost, {
        nodeCount: entities.length,
        relationCount: relations.length
      });
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
