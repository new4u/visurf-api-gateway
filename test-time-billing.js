const axios = require('axios');

const API_BASE = 'http://localhost:4000/api/v1';

async function testTimeBilling() {
  console.log('========================================');
  console.log('  按时间计费测试');
  console.log('========================================\n');

  try {
    // 1. 注册用户
    console.log('1. 注册测试用户...');
    const registerRes = await axios.post(`${API_BASE}/auth/register`, {
      email: `test-time-${Date.now()}@example.com`,
      password: 'test123',
      name: 'Time Billing Test User'
    });
    
    const apiKey = registerRes.data.data.apiKey;
    const userId = registerRes.data.data.userId;
    console.log(`   ✓ 用户注册成功: ${userId}\n`);

    // 2. 调用 render API (创建更多节点以增加处理时间)
    console.log('2. 调用 render API...');
    
    // 创建更多节点和关系
    const entities = [];
    const relations = [];
    for (let i = 1; i <= 50; i++) {
      entities.push({ id: `${i}`, label: `Node ${i}`, labelEn: `Node ${i}` });
      if (i > 1) {
        relations.push({ source: `${i-1}`, target: `${i}`, label: 'connects' });
      }
    }
    
    const renderRes = await axios.post(`${API_BASE}/render`, {
      entities,
      relations
    }, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const cost = renderRes.data.data.metadata.cost;
    const durationMs = renderRes.data.data.metadata.processingTime;
    console.log(`   ✓ API 调用成功`);
    console.log(`   ✓ 执行时间: ${durationMs}ms`);
    console.log(`   ✓ 计费金额: ¥${cost.toFixed(4)}\n`);

    // 3. 检查用量历史
    console.log('3. 检查用量历史...');
    const usageRes = await axios.get(`${API_BASE}/stats/usage?limit=1`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const usage = usageRes.data.data.usage[0];
    console.log(`   ✓ 服务: ${usage.service}`);
    console.log(`   ✓ 费用: ¥${usage.cost.toFixed(4)}`);
    console.log(`   ✓ 开始时间: ${usage.start_time}`);
    console.log(`   ✓ 结束时间: ${usage.end_time}`);
    console.log(`   ✓ 执行时长: ${usage.duration_ms}ms\n`);

    // 4. 检查用户统计
    console.log('4. 检查用户统计...');
    const statsRes = await axios.get(`${API_BASE}/stats`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    const totalSpent = statsRes.data.data.user.totalSpent;
    console.log(`   ✓ 总消费: ¥${totalSpent.toFixed(4)}\n`);

    // 5. 验证结果
    console.log('========================================');
    console.log('  测试结果');
    console.log('========================================');
    
    const expectedCost = (durationMs / 1000) * 0.01; // 0.01元/秒
    const costMatch = Math.abs(cost - expectedCost) < 0.0001;
    
    if (costMatch && usage.duration_ms > 0) {
      console.log('✅ 按时间计费测试通过！');
      console.log(`   - 执行时间: ${durationMs}ms (${(durationMs/1000).toFixed(3)}秒)`);
      console.log(`   - 时间单价: ¥0.01/秒`);
      console.log(`   - 计算费用: ¥${expectedCost.toFixed(4)}`);
      console.log(`   - 实际费用: ¥${cost.toFixed(4)}`);
      console.log(`   - 记录时长: ${usage.duration_ms}ms`);
    } else {
      console.log('❌ 按时间计费测试失败！');
      console.log(`   - 预期费用: ¥${expectedCost.toFixed(4)}`);
      console.log(`   - 实际费用: ¥${cost.toFixed(4)}`);
    }
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

testTimeBilling();
