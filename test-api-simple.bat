@echo off
chcp 65001 >nul
echo ========================================
echo Testing ViSurf API Gateway
echo ========================================
echo.

echo [1/7] Testing Health Check...
curl -s http://localhost:4000/health
echo.
echo ----------------------------------------
echo.

echo [2/7] Testing User Registration...
curl -s -X POST http://localhost:4000/api/v1/auth/register -H "Content-Type: application/json" -d "{\"email\":\"testuser@example.com\",\"password\":\"password123\",\"name\":\"Test User\"}"
echo.
echo ----------------------------------------
echo.

echo [3/7] Testing User Login (save API key manually)...
curl -s -X POST http://localhost:4000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"testuser@example.com\",\"password\":\"password123\"}"
echo.
echo ----------------------------------------
echo.

echo Please copy the apiKey from above and paste it here:
set /p API_KEY="Enter API Key: "
echo.

echo [4/7] Testing Get User Profile...
curl -s http://localhost:4000/api/v1/auth/profile -H "Authorization: Bearer %API_KEY%"
echo.
echo ----------------------------------------
echo.

echo [5/7] Testing SVG Render...
curl -s -X POST http://localhost:4000/api/v1/render -H "Content-Type: application/json" -H "Authorization: Bearer %API_KEY%" -d "{\"entities\":[{\"id\":\"1\",\"label\":\"人工智能\",\"labelEn\":\"AI\"},{\"id\":\"2\",\"label\":\"机器学习\",\"labelEn\":\"ML\"}],\"relations\":[{\"source\":\"1\",\"target\":\"2\",\"label\":\"包含\"}]}"
echo.
echo ----------------------------------------
echo.

echo [6/7] Testing User Statistics...
curl -s http://localhost:4000/api/v1/stats -H "Authorization: Bearer %API_KEY%"
echo.
echo ----------------------------------------
echo.

echo [7/7] Testing Usage History...
curl -s http://localhost:4000/api/v1/stats/usage?limit=10 -H "Authorization: Bearer %API_KEY%"
echo.
echo ----------------------------------------
echo.

echo ========================================
echo All Tests Completed!
echo ========================================
pause
