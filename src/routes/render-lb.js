/**
 * 渲染路由（负载均衡版本）
 * 将请求转发到 Worker 节点
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { updateUserStats, logUsage, getApiConfig, updateWorkerConnections, updateWorkerStats } = require('../db/sqlite');
const { getLoadBalancer } = require('../services/loadBalancer');

const loadBalancer = getLoadBalancer('weighted-round-robin');

router.post('/', async (req, res) => {
  const startTime = new Date();
  const startTimeISO = startTime.toISOString();
  
  try {
    const { entities, relations, options = {} } = req.body;

    // 参数验证
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

    // 选择 Worker 节点
    const worker = loadBalancer.selectWorker('render');
    
    if (!worker) {
      return res.status(503).json({
        success: false,
        code: 503,
        message: 'No available worker nodes for render service',
        requestId: req.id
      });
    }

    console.log(`[负载均衡] 选择节点: ${worker.name} (${worker.host}:${worker.port})`);

    // 增加连接数
    updateWorkerConnections(worker.id, 1);

    let workerResponse;
    let workerSuccess = true;

    try {
      // 转发请求到 Worker
      workerResponse = await axios.post(
        `http://${worker.host}:${worker.port}/render`,
        { entities, relations, options },
        { timeout: 30000 }
      );

      // 记录成功
      loadBalancer.recordSuccess(worker.id);

    } catch (error) {
      console.error(`[负载均衡] Worker ${worker.name} 请求失败:`, error.message);
      workerSuccess = false;
      
      // 记录失败
      loadBalancer.recordFailure(worker.id);
      
      // 减少连接数
      updateWorkerConnections(worker.id, -1);

      return res.status(500).json({
        success: false,
        code: 500,
        message: 'Worker request failed',
        error: {
          type: 'WORKER_ERROR',
          details: error.message
        },
        requestId: req.id
      });
    }

    // 计算执行时间
    const endTime = new Date();
    const endTimeISO = endTime.toISOString();
    const durationMs = endTime - startTime;
    const durationSeconds = durationMs / 1000;

    // 更新 Worker 统计
    updateWorkerStats(worker.id, durationMs, workerSuccess);
    updateWorkerConnections(worker.id, -1);

    // 从数据库读取计费配置
    const apiConfig = getApiConfig('render');
    let cost = 0;
    
    if (apiConfig) {
      if (apiConfig.billing_mode === 'per_time') {
        cost = (apiConfig.time_unit_price || 0.01) * durationSeconds;
      } else {
        cost = apiConfig.cost || 0.05;
      }
    } else {
      cost = 0.05;
    }
    
    // 记录用量和计费
    if (req.user) {
      updateUserStats(req.user.id, cost);
      logUsage(req.user.id, 'render', cost, {
        nodeCount: entities.length,
        relationCount: relations.length,
        durationMs,
        durationSeconds: durationSeconds.toFixed(3),
        billingMode: apiConfig?.billing_mode || 'per_call',
        workerId: worker.id,
        workerName: worker.name
      }, startTimeISO, endTimeISO, durationMs);
    }

    // 返回结果
    res.json({
      success: true,
      code: 200,
      message: 'SVG rendered successfully',
      data: {
        ...workerResponse.data.data,
        metadata: {
          ...workerResponse.data.data.metadata,
          cost,
          workerName: worker.name
        }
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Render] 错误:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to render SVG',
      error: {
        type: 'RENDER_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

module.exports = router;
