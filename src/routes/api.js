const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * 文本解析API代理
 */
router.post('/parse', async (req, res) => {
  try {
    const { text, options = {} } = req.body;
    const requestId = req.id;
    
    // 验证请求参数
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid text parameter',
        error: {
          type: 'VALIDATION_ERROR',
          details: 'Text parameter is required and must be a string'
        },
        requestId
      });
    }
    
    // 记录请求
    console.log(`[${requestId}] 解析请求: ${text.substring(0, 100)}...`);
    
    // 转发到解析服务
    const response = await axios.post(`${process.env.PARSER_API_URL}/api/parse`, {
      text,
      options,
      metadata: {
        userId: req.user.id,
        requestId,
        timestamp: new Date().toISOString()
      }
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-User-ID': req.user.id
      }
    });
    
    // 记录响应
    console.log(`[${requestId}] 解析成功: ${response.data.entities?.length || 0}个实体, ${response.data.relations?.length || 0}个关系`);
    
    // 计费处理
    const charCount = text.length;
    const entityCount = response.data.entities?.length || 0;
    const cost = calculateCost('parser', { charCount, entityCount });
    
    // 异步记录计费信息
    recordUsage(req.user.id, 'parser', cost, {
      charCount,
      entityCount,
      requestId
    });
    
    // 返回结果
    res.json({
      success: true,
      code: 200,
      message: 'Text parsed successfully',
      data: {
        entities: response.data.entities || [],
        relations: response.data.relations || [],
        metadata: {
          charCount,
          entityCount,
          relationCount: response.data.relations?.length || 0,
          processingTime: response.data.processingTime,
          cost
        }
      },
      requestId
    });
    
  } catch (error) {
    console.error('解析API错误:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        code: 504,
        message: 'Parser service timeout',
        error: {
          type: 'SERVICE_TIMEOUT',
          details: 'The parser service took too long to respond'
        },
        requestId: req.id
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        code: error.response.status,
        message: error.response.data?.message || 'Parser service error',
        error: {
          type: 'SERVICE_ERROR',
          details: error.response.data?.error?.details || 'Unknown parser error'
        },
        requestId: req.id
      });
    }
    
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Internal server error',
      error: {
        type: 'INTERNAL_ERROR',
        details: 'An error occurred while processing the parse request'
      },
      requestId: req.id
    });
  }
});

/**
 * 布局计算API代理
 */
router.post('/layout', async (req, res) => {
  try {
    const { entities, relations, layoutMode = 'FORCE', width = 800, height = 600 } = req.body;
    const requestId = req.id;
    
    // 验证请求参数
    if (!entities || !Array.isArray(entities)) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid entities parameter',
        error: {
          type: 'VALIDATION_ERROR',
          details: 'Entities parameter is required and must be an array'
        },
        requestId
      });
    }
    
    if (!relations || !Array.isArray(relations)) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid relations parameter',
        error: {
          type: 'VALIDATION_ERROR',
          details: 'Relations parameter is required and must be an array'
        },
        requestId
      });
    }
    
    // 记录请求
    console.log(`[${requestId}] 布局请求: ${entities.length}个实体, ${relations.length}个关系, 模式: ${layoutMode}`);
    
    // 转发到布局服务
    const response = await axios.post(`${process.env.LAYOUT_API_URL}/api/layout`, {
      entities,
      relations,
      layoutMode,
      width,
      height,
      metadata: {
        userId: req.user.id,
        requestId,
        timestamp: new Date().toISOString()
      }
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-User-ID': req.user.id
      }
    });
    
    // 记录响应
    console.log(`[${requestId}] 布局成功: 模式 ${layoutMode}, 用时 ${response.data.processingTime}ms`);
    
    // 计费处理
    const nodeCount = entities.length;
    const cost = calculateCost('layout', { nodeCount, layoutMode });
    
    // 异步记录计费信息
    recordUsage(req.user.id, 'layout', cost, {
      nodeCount,
      layoutMode,
      requestId
    });
    
    // 返回结果
    res.json({
      success: true,
      code: 200,
      message: 'Layout calculated successfully',
      data: {
        nodes: response.data.nodes || [],
        links: response.data.links || [],
        metadata: {
          nodeCount,
          linkCount: relations.length,
          layoutMode,
          width,
          height,
          processingTime: response.data.processingTime,
          cost
        }
      },
      requestId
    });
    
  } catch (error) {
    console.error('布局API错误:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        code: 504,
        message: 'Layout service timeout',
        error: {
          type: 'SERVICE_TIMEOUT',
          details: 'The layout service took too long to respond'
        },
        requestId: req.id
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        code: error.response.status,
        message: error.response.data?.message || 'Layout service error',
        error: {
          type: 'SERVICE_ERROR',
          details: error.response.data?.error?.details || 'Unknown layout error'
        },
        requestId: req.id
      });
    }
    
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Internal server error',
      error: {
        type: 'INTERNAL_ERROR',
        details: 'An error occurred while processing the layout request'
      },
      requestId: req.id
    });
  }
});

/**
 * 渲染生成API代理
 */
router.post('/render', async (req, res) => {
  try {
    const { entities, relations, theme = 'COSMIC', displayLanguage = 'both', width = 800, height = 600 } = req.body;
    const requestId = req.id;
    
    // 验证请求参数
    if (!entities || !Array.isArray(entities)) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid entities parameter',
        error: {
          type: 'VALIDATION_ERROR',
          details: 'Entities parameter is required and must be an array'
        },
        requestId
      });
    }
    
    if (!relations || !Array.isArray(relations)) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid relations parameter',
        error: {
          type: 'VALIDATION_ERROR',
          details: 'Relations parameter is required and must be an array'
        },
        requestId
      });
    }
    
    // 记录请求
    console.log(`[${requestId}] 渲染请求: ${entities.length}个实体, ${relations.length}个关系, 主题: ${theme}`);
    
    // 转发到渲染服务
    const response = await axios.post(`${process.env.RENDERER_API_URL}/api/render`, {
      entities,
      relations,
      theme,
      displayLanguage,
      width,
      height,
      metadata: {
        userId: req.user.id,
        requestId,
        timestamp: new Date().toISOString()
      }
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-User-ID': req.user.id
      }
    });
    
    // 记录响应
    console.log(`[${requestId}] 渲染成功: 主题 ${theme}, SVG大小 ${response.data.svg?.length || 0}字符`);
    
    // 计费处理
    const nodeCount = entities.length;
    const cost = calculateCost('renderer', { nodeCount, theme });
    
    // 异步记录计费信息
    recordUsage(req.user.id, 'renderer', cost, {
      nodeCount,
      theme,
      svgSize: response.data.svg?.length || 0,
      requestId
    });
    
    // 返回结果
    res.json({
      success: true,
      code: 200,
      message: 'Graph rendered successfully',
      data: {
        svg: response.data.svg,
        metadata: {
          nodeCount,
          linkCount: relations.length,
          theme,
          displayLanguage,
          width,
          height,
          svgSize: response.data.svg?.length || 0,
          processingTime: response.data.processingTime,
          cost
        }
      },
      requestId
    });
    
  } catch (error) {
    console.error('渲染API错误:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        code: 504,
        message: 'Renderer service timeout',
        error: {
          type: 'SERVICE_TIMEOUT',
          details: 'The renderer service took too long to respond'
        },
        requestId: req.id
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        code: error.response.status,
        message: error.response.data?.message || 'Renderer service error',
        error: {
          type: 'SERVICE_ERROR',
          details: error.response.data?.error?.details || 'Unknown renderer error'
        },
        requestId: req.id
      });
    }
    
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Internal server error',
      error: {
        type: 'INTERNAL_ERROR',
        details: 'An error occurred while processing the render request'
      },
      requestId: req.id
    });
  }
});

/**
 * 组合服务API代理
 */
router.post('/combo', async (req, res) => {
  try {
    const { text, theme = 'COSMIC', layoutMode = 'FORCE', width = 800, height = 600, displayLanguage = 'both' } = req.body;
    const requestId = req.id;
    
    // 验证请求参数
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Invalid text parameter',
        error: {
          type: 'VALIDATION_ERROR',
          details: 'Text parameter is required and must be a string'
        },
        requestId
      });
    }
    
    // 记录请求
    console.log(`[${requestId}] 组合服务请求: ${text.substring(0, 100)}..., 主题: ${theme}, 布局: ${layoutMode}`);
    
    // 转发到组合服务
    const response = await axios.post(`${process.env.COMBO_API_URL}/api/combo`, {
      text,
      theme,
      layoutMode,
      width,
      height,
      displayLanguage,
      metadata: {
        userId: req.user.id,
        requestId,
        timestamp: new Date().toISOString()
      }
    }, {
      timeout: 60000, // 组合服务可能需要更长时间
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
        'X-User-ID': req.user.id
      }
    });
    
    // 记录响应
    console.log(`[${requestId}] 组合服务成功: 主题 ${theme}, 布局 ${layoutMode}, SVG大小 ${response.data.svg?.length || 0}字符`);
    
    // 计费处理（组合服务有优惠）
    const charCount = text.length;
    const nodeCount = response.data.entities?.length || 0;
    const cost = calculateCost('combo', { charCount, nodeCount, theme, layoutMode });
    
    // 异步记录计费信息
    recordUsage(req.user.id, 'combo', cost, {
      charCount,
      nodeCount,
      theme,
      layoutMode,
      svgSize: response.data.svg?.length || 0,
      requestId
    });
    
    // 返回结果
    res.json({
      success: true,
      code: 200,
      message: 'Complete service processed successfully',
      data: {
        svg: response.data.svg,
        entities: response.data.entities || [],
        relations: response.data.relations || [],
        metadata: {
          charCount,
          entityCount: nodeCount,
          relationCount: response.data.relations?.length || 0,
          theme,
          layoutMode,
          width,
          height,
          displayLanguage,
          svgSize: response.data.svg?.length || 0,
          processingTime: response.data.processingTime,
          cost
        }
      },
      requestId
    });
    
  } catch (error) {
    console.error('组合服务API错误:', error.message);
    
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        code: 504,
        message: 'Combo service timeout',
        error: {
          type: 'SERVICE_TIMEOUT',
          details: 'The combo service took too long to respond'
        },
        requestId: req.id
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        code: error.response.status,
        message: error.response.data?.message || 'Combo service error',
        error: {
          type: 'SERVICE_ERROR',
          details: error.response.data?.error?.details || 'Unknown combo error'
        },
        requestId: req.id
      });
    }
    
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Internal server error',
      error: {
        type: 'INTERNAL_ERROR',
        details: 'An error occurred while processing the combo request'
      },
      requestId: req.id
    });
  }
});

/**
 * 计费计算函数
 */
function calculateCost(service, params) {
  const pricing = {
    parser: { base: 0.001, unit: 'character', min: 0.1 },
    layout: { base: 0.01, unit: 'node', min: 0.5 },
    renderer: { base: 0.05, unit: 'node', min: 1.0 },
    combo: { base: 0.08, unit: 'node', min: 0.8 }
  };
  
  const price = pricing[service];
  let cost = 0;
  
  switch (service) {
    case 'parser':
      cost = Math.max(params.charCount * price.base, price.min);
      break;
    case 'layout':
      cost = Math.max(params.nodeCount * price.base, price.min);
      break;
    case 'renderer':
      cost = Math.max(params.nodeCount * price.base, price.min);
      break;
    case 'combo':
      cost = Math.max(params.nodeCount * price.base, price.min);
      break;
  }
  
  return parseFloat(cost.toFixed(3));
}

/**
 * 异步记录使用情况
 */
async function recordUsage(userId, service, cost, metadata) {
  try {
    // 这里可以添加数据库记录逻辑
    console.log(`[计费] 用户 ${userId} 使用 ${service} 服务, 费用: ¥${cost}`, metadata);
    
    // 可以发送到消息队列或数据库
    // await sendToQueue('usage-records', { userId, service, cost, metadata, timestamp: new Date().toISOString() });
    
  } catch (error) {
    console.error('记录使用情况失败:', error);
  }
}

module.exports = router;