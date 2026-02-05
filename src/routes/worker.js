/**
 * 工作节点管理路由
 * 处理节点注册、心跳、状态查询等
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const {
  registerWorker,
  updateWorkerHeartbeat,
  getAllWorkers,
  getWorkerById,
  markWorkerOffline,
  removeWorker,
  getWorkerStats
} = require('../db/sqlite');

/**
 * POST /api/v1/worker/register
 * 工作节点注册
 */
router.post('/register', (req, res) => {
  try {
    const { name, host, port, serviceType, weight } = req.body;

    // 验证必需参数
    if (!name || !host || !port || !serviceType) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Missing required fields: name, host, port, serviceType',
        requestId: req.id
      });
    }

    // 验证服务类型
    const validTypes = ['render', 'parse', 'combo'];
    if (!validTypes.includes(serviceType)) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: `Invalid serviceType. Must be one of: ${validTypes.join(', ')}`,
        requestId: req.id
      });
    }

    // 生成节点ID
    const workerId = uuidv4();

    // 注册节点
    const worker = registerWorker({
      id: workerId,
      name,
      host,
      port,
      serviceType,
      weight: weight || 1
    });

    console.log(`[Worker] 节点注册成功: ${name} (${serviceType}) at ${host}:${port}`);

    res.json({
      success: true,
      code: 200,
      message: 'Worker registered successfully',
      data: {
        workerId,
        heartbeatInterval: 30000, // 30秒心跳间隔
        worker
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Worker] 注册失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to register worker',
      error: {
        type: 'REGISTRATION_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * POST /api/v1/worker/heartbeat
 * 工作节点心跳
 */
router.post('/heartbeat', (req, res) => {
  try {
    const { workerId, status, currentConnections, cpuUsage, memoryUsage } = req.body;

    if (!workerId) {
      return res.status(400).json({
        success: false,
        code: 400,
        message: 'Missing required field: workerId',
        requestId: req.id
      });
    }

    // 更新心跳
    updateWorkerHeartbeat(workerId, {
      status: status || 'online',
      currentConnections,
      cpuUsage,
      memoryUsage
    });

    res.json({
      success: true,
      code: 200,
      message: 'Heartbeat received',
      data: {
        nextHeartbeat: 30000 // 下次心跳时间
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Worker] 心跳失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to process heartbeat',
      error: {
        type: 'HEARTBEAT_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * GET /api/v1/worker/list
 * 获取所有工作节点
 */
router.get('/list', (req, res) => {
  try {
    const workers = getAllWorkers();

    res.json({
      success: true,
      code: 200,
      message: 'Workers retrieved successfully',
      data: {
        count: workers.length,
        workers
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Worker] 获取节点列表失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve workers',
      error: {
        type: 'QUERY_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * GET /api/v1/worker/:id
 * 获取单个工作节点信息
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const worker = getWorkerById(id);

    if (!worker) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'Worker not found',
        requestId: req.id
      });
    }

    res.json({
      success: true,
      code: 200,
      message: 'Worker retrieved successfully',
      data: { worker },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Worker] 获取节点信息失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve worker',
      error: {
        type: 'QUERY_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * GET /api/v1/worker/:id/stats
 * 获取节点统计信息
 */
router.get('/:id/stats', (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;

    const worker = getWorkerById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'Worker not found',
        requestId: req.id
      });
    }

    const stats = getWorkerStats(id, parseInt(limit));

    res.json({
      success: true,
      code: 200,
      message: 'Worker stats retrieved successfully',
      data: {
        worker,
        stats,
        count: stats.length
      },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Worker] 获取节点统计失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to retrieve worker stats',
      error: {
        type: 'QUERY_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * POST /api/v1/worker/:id/offline
 * 将节点标记为离线
 */
router.post('/:id/offline', (req, res) => {
  try {
    const { id } = req.params;

    const worker = getWorkerById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'Worker not found',
        requestId: req.id
      });
    }

    markWorkerOffline(id);

    console.log(`[Worker] 节点已离线: ${worker.name}`);

    res.json({
      success: true,
      code: 200,
      message: 'Worker marked as offline',
      data: { workerId: id },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Worker] 标记离线失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to mark worker offline',
      error: {
        type: 'UPDATE_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

/**
 * DELETE /api/v1/worker/:id
 * 删除工作节点
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const worker = getWorkerById(id);
    if (!worker) {
      return res.status(404).json({
        success: false,
        code: 404,
        message: 'Worker not found',
        requestId: req.id
      });
    }

    removeWorker(id);

    console.log(`[Worker] 节点已删除: ${worker.name}`);

    res.json({
      success: true,
      code: 200,
      message: 'Worker removed successfully',
      data: { workerId: id },
      requestId: req.id
    });

  } catch (error) {
    console.error('[Worker] 删除节点失败:', error);
    res.status(500).json({
      success: false,
      code: 500,
      message: 'Failed to remove worker',
      error: {
        type: 'DELETE_ERROR',
        details: error.message
      },
      requestId: req.id
    });
  }
});

module.exports = router;
