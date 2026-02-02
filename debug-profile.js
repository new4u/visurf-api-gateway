const axios = require('axios');

const BASE_URL = 'http://localhost:4000';

async function debugProfile() {
  try {
    // 1. Login to get API key
    console.log('Step 1: Login...');
    const loginRes = await axios.post(`${BASE_URL}/api/v1/auth/login`, {
      email: 'test@example.com',
      password: 'password123'
    });
    
    const apiKey = loginRes.data.data.apiKey;
    console.log('✅ Login successful');
    console.log('API Key:', apiKey.substring(0, 30) + '...\n');
    
    // 2. Try to get profile
    console.log('Step 2: Get Profile...');
    console.log('Request URL:', `${BASE_URL}/api/v1/auth/profile`);
    console.log('Authorization Header:', `Bearer ${apiKey.substring(0, 30)}...`);
    
    try {
      const profileRes = await axios.get(`${BASE_URL}/api/v1/auth/profile`, {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Profile retrieved successfully!');
      console.log('Response:', JSON.stringify(profileRes.data, null, 2));
      
    } catch (error) {
      console.log('❌ Profile request failed');
      console.log('Status:', error.response?.status);
      console.log('Error:', JSON.stringify(error.response?.data, null, 2));
      
      // Try to get more details from server logs
      if (error.response?.status === 500) {
        console.log('\n⚠️ Server returned 500 error. Check server logs for details.');
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

debugProfile();
