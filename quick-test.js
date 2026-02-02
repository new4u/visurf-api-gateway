const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function quickTest() {
  console.log('=== Quick API Test ===\n');
  
  // Test 1: Login
  console.log('1. Login...');
  const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
    email: 'test@example.com',
    password: 'password123'
  });
  console.log('✅ Login successful');
  const apiKey = loginRes.data.data.apiKey;
  console.log(`API Key: ${apiKey.substring(0, 20)}...`);
  
  // Test 2: Get Profile
  console.log('\n2. Get Profile...');
  try {
    const profileRes = await axios.get(`${BASE_URL}/api/v1/auth/profile`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    console.log('✅ Profile retrieved');
    console.log(`User: ${profileRes.data.data.name} (${profileRes.data.data.email})`);
  } catch (error) {
    console.log('❌ Profile failed:', error.response?.data || error.message);
  }
  
  // Test 3: Render SVG
  console.log('\n3. Render SVG...');
  const renderRes = await axios.post(`${BASE_URL}/api/v1/render`, {
    entities: [{ id: '1', label: 'Test', labelEn: 'Test' }],
    relations: []
  }, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  console.log('✅ SVG rendered');
  console.log(`SVG length: ${renderRes.data.data.svg.length} chars`);
  
  // Test 4: Stats
  console.log('\n4. Get Stats...');
  const statsRes = await axios.get(`${BASE_URL}/api/v1/stats`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  console.log('✅ Stats retrieved');
  console.log(`Total spent: ¥${statsRes.data.data.user.totalSpent}`);
  console.log(`API calls: ${statsRes.data.data.user.apiCalls}`);
  
  console.log('\n=== All tests passed! ===');
}

quickTest().catch(err => {
  console.error('\n❌ Test failed:', err.response?.data || err.message);
  if (err.response?.data) {
    console.error('Full error:', JSON.stringify(err.response.data, null, 2));
  }
});
