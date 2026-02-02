const axios = require('axios');

const BASE_URL = 'http://localhost:4000';
let apiKey = '';

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details) {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status} - ${name}`);
  if (details) console.log(`   ${details}`);
  
  results.tests.push({ name, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

async function test1_HealthCheck() {
  try {
    const res = await axios.get(`${BASE_URL}/health`);
    const passed = res.status === 200 && res.data.success === true;
    logTest('Health Check', passed, `Uptime: ${res.data.data.uptime.toFixed(2)}s`);
    return passed;
  } catch (error) {
    logTest('Health Check', false, error.message);
    return false;
  }
}

async function test2_UserRegistration() {
  try {
    const res = await axios.post(`${BASE_URL}/api/v1/auth/register`, {
      email: `test${Date.now()}@example.com`,
      password: 'password123',
      name: 'Test User'
    });
    
    const passed = res.status === 201 && res.data.success === true && res.data.data.apiKey;
    if (passed) {
      apiKey = res.data.data.apiKey;
      logTest('User Registration', true, `User ID: ${res.data.data.userId}`);
    } else {
      logTest('User Registration', false, 'No API key returned');
    }
    return passed;
  } catch (error) {
    logTest('User Registration', false, error.response?.data?.message || error.message);
    return false;
  }
}

async function test3_UserLogin() {
  try {
    // 使用已注册的用户登录
    const res = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });
    
    const passed = res.status === 200 && res.data.success === true;
    if (passed && !apiKey) {
      apiKey = res.data.data.apiKey;
    }
    logTest('User Login', passed, `Email: ${res.data.data.email}`);
    return passed;
  } catch (error) {
    logTest('User Login', false, error.response?.data?.message || error.message);
    return false;
  }
}

async function test4_GetUserProfile() {
  try {
    const res = await axios.get(`${BASE_URL}/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    
    const passed = res.status === 200 && res.data.success === true;
    logTest('Get User Profile', passed, `Plan: ${res.data.data.plan}, Calls: ${res.data.data.apiCalls}`);
    return passed;
  } catch (error) {
    logTest('Get User Profile', false, error.response?.data?.message || error.message);
    return false;
  }
}

async function test5_SVGRender() {
  try {
    const res = await axios.post(`${BASE_URL}/api/v1/render`, {
      entities: [
        { id: '1', label: '人工智能', labelEn: 'AI' },
        { id: '2', label: '机器学习', labelEn: 'ML' }
      ],
      relations: [
        { source: '1', target: '2', label: '包含' }
      ]
    }, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    
    const passed = res.status === 200 && res.data.success === true && res.data.data.svg;
    logTest('SVG Render', passed, `SVG length: ${res.data.data.svg?.length || 0} chars, Cost: ¥${res.data.data.metadata.cost}`);
    return passed;
  } catch (error) {
    logTest('SVG Render', false, error.response?.data?.message || error.message);
    return false;
  }
}

async function test6_UserStatistics() {
  try {
    const res = await axios.get(`${BASE_URL}/api/v1/stats`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    
    const passed = res.status === 200 && res.data.success === true;
    logTest('User Statistics', passed, `Total spent: ¥${res.data.data.user.totalSpent}`);
    return passed;
  } catch (error) {
    logTest('User Statistics', false, error.response?.data?.message || error.message);
    return false;
  }
}

async function test7_UsageHistory() {
  try {
    const res = await axios.get(`${BASE_URL}/api/v1/stats/usage?limit=10`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    
    const passed = res.status === 200 && res.data.success === true;
    logTest('Usage History', passed, `Records: ${res.data.data.count}`);
    return passed;
  } catch (error) {
    logTest('Usage History', false, error.response?.data?.message || error.message);
    return false;
  }
}

async function test8_InvalidToken() {
  try {
    await axios.get(`${BASE_URL}/api/v1/auth/profile`, {
      headers: { Authorization: 'Bearer invalid-token' }
    });
    logTest('Invalid Token Handling', false, 'Should have rejected invalid token');
    return false;
  } catch (error) {
    const passed = error.response?.status === 401;
    if (passed) {
      logTest('Invalid Token Handling', true, 'Correctly rejected invalid token');
    } else {
      logTest('Invalid Token Handling', false, `Expected 401, got ${error.response?.status}`);
    }
    return passed;
  }
}

async function test9_MissingAuth() {
  try {
    await axios.get(`${BASE_URL}/api/v1/auth/profile`);
    logTest('Missing Auth Handling', false, 'Should have required authentication');
    return false;
  } catch (error) {
    const passed = error.response?.status === 401;
    if (passed) {
      logTest('Missing Auth Handling', true, 'Correctly required authentication');
    } else {
      logTest('Missing Auth Handling', false, `Expected 401, got ${error.response?.status}`);
    }
    return passed;
  }
}

async function runAllTests() {
  console.log('========================================');
  console.log('  ViSurf API Gateway - Test Suite');
  console.log('========================================');
  
  await test1_HealthCheck();
  await test2_UserRegistration();
  await test3_UserLogin();
  await test4_GetUserProfile();
  await test5_SVGRender();
  await test6_UserStatistics();
  await test7_UsageHistory();
  await test8_InvalidToken();
  await test9_MissingAuth();
  
  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`);
  console.log('========================================\n');
  
  process.exit(results.failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
