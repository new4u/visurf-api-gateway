/**
 * Worker 服务器
 * 独立的工作节点，处理具体的业务逻辑
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

// 从命令行参数获取配置
const args = process.argv.slice(2);
const config = {
  serviceType: getArg('--type') || 'render',
  port: parseInt(getArg('--port')) || 5001,
  name: getArg('--name') || `worker-${Date.now()}`,
  masterUrl: getArg('--master') || 'http://localhost:4000',
  weight: parseInt(getArg('--weight')) || 1
};

function getArg(name) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

const app = express();
app.use(express.json());

let workerId = null;
let currentConnections = 0;

// 导入服务模块
const { render } = require('./src/services/renderService');
const { extractKnowledgeGraph } = require('./src/services/parseService');

/**
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    workerId,
    serviceType: config.serviceType,
    status: 'healthy',
    connections: currentConnections,
    uptime: process.uptime()
  });
});

/**
 * Render 服务
 */
app.post('/render', async (req, res) => {
  if (config.serviceType !== 'render') {
    return res.status(400).json({
      success: false,
      message: 'This worker does not support render service'
    });
  }

  currentConnections++;
  const startTime = Date.now();

  try {
    const { entities, relations, options = {} } = req.body;
    const result = render(entities, relations, options);
    
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        svg: result.svg,
        metadata: {
          ...result.metadata,
          workerId,
          processingTime: duration
        }
      }
    });

  } catch (error) {
    console.error('[Worker] Render error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    currentConnections--;
  }
});

/**
 * Parse 服务
 */
app.post('/parse', async (req, res) => {
  if (config.serviceType !== 'parse') {
    return res.status(400).json({
      success: false,
      message: 'This worker does not support parse service'
    });
  }

  currentConnections++;
  const startTime = Date.now();

  try {
    const { text, options = {} } = req.body;
    const result = await extractKnowledgeGraph(text, options);
    
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        entities: result.entities,
        relations: result.relations,
        metadata: {
          workerId,
          processingTime: duration
        }
      }
    });

  } catch (error) {
    console.error('[Worker] Parse error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    currentConnections--;
  }
});

/**
 * Combo 服务
 */
app.post('/combo', async (req, res) => {
  if (config.serviceType !== 'combo') {
    return res.status(400).json({
      success: false,
      message: 'This worker does not support combo service'
    });
  }

  currentConnections++;
  const startTime = Date.now();

  try {
    const { text, options = {} } = req.body;
    
    // Step 1: Parse
    const parseResult = await extractKnowledgeGraph(text, options);
    
    // Step 2: Render
    const renderResult = render(parseResult.entities, parseResult.relations, options);
    
    const duration = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        svg: renderResult.svg,
        entities: parseResult.entities,
        relations: parseResult.relations,
        metadata: {
          workerId,
          processingTime: duration
        }
      }
    });

  } catch (error) {
    console.error('[Worker] Combo error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    currentConnections--;
  }
});

/**
 * 向 Master 注册
 */
async function registerToMaster() {
  try {
    const response = await axios.post(`${config.masterUrl}/api/v1/worker/register`, {
      name: config.name,
      host: getLocalIP(),
      port: config.port,
      serviceType: config.serviceType,
      weight: config.weight
    });

    if (response.data.success) {
      workerId = response.data.data.workerId;
      console.log(`✅ 已注册到 Master: ${workerId}`);
      
      // 开始发送心跳
      startHeartbeat(response.data.data.heartbeatInterval);
    }
  } catch (error) {
    console.error('❌ 注册失败:', error.message);
    // 30秒后重试
    setTimeout(registerToMaster, 30000);
  }
}

/**
 * 发送心跳
 */
async function sendHeartbeat() {
  if (!workerId) return;

  try {
    await axios.post(`${config.masterUrl}/api/v1/worker/heartbeat`, {
      workerId,
      status: 'online',
      currentConnections,
      cpuUsage: getCPUUsage(),
      memoryUsage: getMemoryUsage()
    });
  } catch (error) {
    console.error('❌ 心跳失败:', error.message);
  }
}

/**
 * 开始心跳循环
 */
function startHeartbeat(interval = 30000) {
  setInterval(sendHeartbeat, interval);
}

/**
 * 获取本地IP
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

/**
 * 获取CPU使用率（简化版）
 */
function getCPUUsage() {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;

  cpus.forEach(cpu => {
    for (const type in cpu.times) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  });

  return ((1 - totalIdle / totalTick) * 100).toFixed(2);
}

/**
 * 获取内存使用率
 */
function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return (((total - free) / total) * 100).toFixed(2);
}

/**
 * 优雅关闭
 */
process.on('SIGINT', async () => {
  console.log('\n正在关闭 Worker...');
  
  if (workerId) {
    try {
      await axios.post(`${config.masterUrl}/api/v1/worker/${workerId}/offline`);
      console.log('✅ 已通知 Master 下线');
    } catch (error) {
      console.error('❌ 通知下线失败:', error.message);
    }
  }
  
  process.exit(0);
});

// 启动服务器
app.listen(config.port, () => {
  console.log('========================================');
  console.log(`  Worker 服务器已启动`);
  console.log('========================================');
  console.log(`服务类型: ${config.serviceType}`);
  console.log(`端口: ${config.port}`);
  console.log(`名称: ${config.name}`);
  console.log(`权重: ${config.weight}`);
  console.log(`Master: ${config.masterUrl}`);
  console.log('========================================\n');

  // 延迟2秒后注册到 Master
  setTimeout(registerToMaster, 2000);
});
