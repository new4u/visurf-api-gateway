/**
 * 语义分析路由 — POST /api/v1/parse
 * 文本 → JSON (entities + relations)
 */
const express = require('express');
const router = express.Router();
const { extractKnowledgeGraph } = require('../services/parseService');
const { updateUserStats, logUsage, getApiConfig } = require('../db/sqlite');

router.post('/', async (req, res) => {
  try {
    const { text, options = {} } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'text is required and must be a non-empty string',
        requestId: req.id
      });
    }

    // 文本长度限制 (50000 字符)
    if (text.length > 50000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'text must be less than 50000 characters',
        requestId: req.id
      });
    }

    const result = await extractKnowledgeGraph(text, options);

    // 从数据库读取计费配置
    const apiConfig = getApiConfig('parse');
    const cost = apiConfig ? apiConfig.cost : 0.10; // 默认 0.10
    
    if (req.user) {
      updateUserStats(req.user.id, cost);
      logUsage(req.user.id, 'parse', cost, {
        charCount: text.length,
        entityCount: result.entities.length
      });
    }

    res.json({
      success: true,
      code: 200,
      message: 'Text parsed successfully',
      data: {
        entities: result.entities,
        relations: result.relations,
        metadata: {
          ...result.metadata,
          cost
        }
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: `Parse failed: ${error.message}`,
      requestId: req.id
    });
  }
});

module.exports = router;
