/**
 * 组合路由 — POST /api/v1/combo
 * 一站式服务: 文本 → parse → render → SVG + JSON
 */
const express = require('express');
const router = express.Router();
const { extractKnowledgeGraph } = require('../services/parseService');
const { render } = require('../services/renderService');
const { updateUserStats, logUsage, getApiConfig } = require('../db/sqlite');

router.post('/', async (req, res) => {
  const startTime = new Date();
  const startTimeISO = startTime.toISOString();
  
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

    if (text.length > 50000) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'text must be less than 50000 characters',
        requestId: req.id
      });
    }

    // Step 1: 文本 → entities + relations (Claude API)
    const parseResult = await extractKnowledgeGraph(text, {
      language: options.language,
      model: options.model
    });

    // Step 2: entities + relations → SVG
    const renderResult = render(parseResult.entities, parseResult.relations, {
      width: options.width,
      height: options.height,
      theme: options.theme,
      layoutMode: options.layoutMode,
      displayLanguage: options.displayLanguage
    });

    // 计算执行时间
    const endTime = new Date();
    const endTimeISO = endTime.toISOString();
    const durationMs = endTime - startTime;
    const durationSeconds = durationMs / 1000;

    // 从数据库读取计费配置
    const apiConfig = getApiConfig('combo');
    let cost = 0;
    
    if (apiConfig) {
      if (apiConfig.billing_mode === 'per_time') {
        // 按时间计费：单价(元/秒) * 执行时间(秒)
        cost = (apiConfig.time_unit_price || 0.03) * durationSeconds;
      } else {
        // 按次计费
        cost = apiConfig.cost || 0.12;
      }
    } else {
      cost = 0.12; // 默认值
    }
    
    if (req.user) {
      updateUserStats(req.user.id, cost);
      logUsage(req.user.id, 'combo', cost, {
        charCount: text.length,
        entityCount: parseResult.entities.length,
        relationCount: parseResult.relations.length,
        durationMs,
        durationSeconds: durationSeconds.toFixed(3),
        billingMode: apiConfig?.billing_mode || 'per_call'
      }, startTimeISO, endTimeISO, durationMs);
    }

    res.json({
      success: true,
      code: 200,
      message: 'Combo service processed successfully',
      data: {
        svg: renderResult.svg,
        entities: parseResult.entities,
        relations: parseResult.relations,
        metadata: {
          charCount: text.length,
          entityCount: parseResult.entities.length,
          relationCount: parseResult.relations.length,
          parseTime: parseResult.metadata.processingTime,
          renderTime: renderResult.metadata.processingTime,
          totalTime: parseResult.metadata.processingTime + renderResult.metadata.processingTime,
          theme: renderResult.metadata.theme,
          layoutMode: renderResult.metadata.layoutMode,
          cost
        }
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('Combo error:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: `Combo failed: ${error.message}`,
      requestId: req.id
    });
  }
});

module.exports = router;
