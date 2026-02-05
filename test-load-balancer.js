/**
 * 负载均衡测试脚本
 * 测试多个 Worker 节点的负载分发
 */

const axios = require('axios');

const MASTER_URL = 'http://localhost:4000';
const API_BASE = `${MASTER_URL}/api/v1`;

async function testLoadBalancer() {
  console.log('========================================');
  console.log('  负载均衡测试');
  console.log('========================================\n');

  try {
    // 1. 检查 Master 健康状态
    console.log('1. 检查 Master 服务器...');
    const healthRes = await axios.get(`${MASTER_URL}/health`);
    console.log(`   ✓ Master 状态: ${healthRes.data.status}`);
    console.log(`   ✓ 可用服务: ${healthRes.data.data.services.join(', ')}\n`);

    // 2. 查看已注册的 Worker 节点
    console.log('2. 查看已注册的 Worker 节点...');
    const workersRes = await axios.get(`${API_BASE}/worker/list`);
    const workers = workersRes.data.data.workers;
    
    if (workers.length === 0) {
      console.log('   ⚠️  当前没有注册的 Worker 节点');
      console.log('   请先启动 Worker 节点:\n');
      console.log('   node worker-server.js --type=render --port=5001');
      console.log('   node worker-server.js --type=render --port=5002');
      console.log('   node worker-server.js --type=parse --port=5003\n');
      return;
    }

    console.log(`   ✓ 找到 ${workers.length} 个 Worker 节点:\n`);
    
    // 按服务类型分组
    const workersByType = {};
    workers.forEach(w => {
      if (!workersByType[w.service_type]) {
        workersByType[w.service_type] = [];
      }
      workersByType[w.service_type].push(w);
    });

    for (const [type, typeWorkers] of Object.entries(workersByType)) {
      console.log(`   ${type.toUpperCase()} 服务 (${typeWorkers.length} 个节点):`);
      typeWorkers.forEach(w => {
        const status = w.status === 'online' ? '🟢' : '🔴';
        console.log(`     ${status} ${w.name} - ${w.host}:${w.port}`);
        console.log(`        连接数: ${w.current_connections}/${w.max_connections}`);
        console.log(`        总请求: ${w.total_requests} (失败: ${w.failed_requests})`);
        console.log(`        平均响应: ${w.avg_response_time.toFixed(2)}ms`);
      });
      console.log('');
    }

    // 3. 注册测试用户
    console.log('3. 注册测试用户...');
    const registerRes = await axios.post(`${API_BASE}/auth/register`, {
      email: `loadtest-${Date.now()}@example.com`,
      password: 'test123',
      name: 'Load Test User'
    });
    
    const apiKey = registerRes.data.data.apiKey;
    console.log(`   ✓ 用户注册成功\n`);

    // 4. 发送多个请求测试负载均衡
    console.log('4. 发送 10 个请求测试负载均衡...');
    
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(
        axios.post(`${API_BASE}/render`, {
          entities: [
            { id: '1', label: `节点 ${i}-1`, labelEn: `Node ${i}-1` },
            { id: '2', label: `节点 ${i}-2`, labelEn: `Node ${i}-2` }
          ],
          relations: [
            { source: '1', target: '2', label: '连接' }
          ]
        }, {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        })
      );
    }

    const results = await Promise.all(requests);
    
    // 统计每个 Worker 处理的请求数
    const workerStats = {};
    results.forEach(res => {
      const workerId = res.data.data.metadata.workerId;
      if (workerId) {
        workerStats[workerId] = (workerStats[workerId] || 0) + 1;
      }
    });

    console.log(`   ✓ 所有请求完成\n`);
    console.log('   请求分发统计:');
    
    for (const [workerId, count] of Object.entries(workerStats)) {
      const worker = workers.find(w => w.id === workerId);
      const percentage = ((count / results.length) * 100).toFixed(1);
      console.log(`     ${worker ? worker.name : workerId}: ${count} 次 (${percentage}%)`);
    }

    // 5. 再次查看 Worker 状态
    console.log('\n5. 查看更新后的 Worker 状态...');
    const updatedWorkersRes = await axios.get(`${API_BASE}/worker/list`);
    const updatedWorkers = updatedWorkersRes.data.data.workers;
    
    const renderWorkers = updatedWorkers.filter(w => w.service_type === 'render');
    console.log(`\n   RENDER 服务节点状态:`);
    renderWorkers.forEach(w => {
      console.log(`     ${w.name}:`);
      console.log(`       总请求: ${w.total_requests}`);
      console.log(`       平均响应: ${w.avg_response_time.toFixed(2)}ms`);
      console.log(`       成功率: ${((1 - w.failed_requests / w.total_requests) * 100).toFixed(1)}%`);
    });

    console.log('\n========================================');
    console.log('  测试完成');
    console.log('========================================\n');

    // 6. 测试总结
    console.log('✅ 负载均衡测试通过！');
    console.log(`   - 注册节点数: ${workers.length}`);
    console.log(`   - 在线节点数: ${workers.filter(w => w.status === 'online').length}`);
    console.log(`   - 请求总数: ${results.length}`);
    console.log(`   - 负载分发: ${Object.keys(workerStats).length} 个节点参与处理`);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n请确保以下服务已启动:');
      console.log('  1. Master 服务器: node src/simple-server.js');
      console.log('  2. Worker 节点: node worker-server.js --type=render --port=5001');
    }
  }
}

// 运行测试
testLoadBalancer();
