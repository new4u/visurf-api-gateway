@echo off
chcp 65001 >nul
echo ========================================
echo Testing ViSurf API Gateway
echo ========================================
echo.

echo [1/6] Testing Health Check...
curl -s http://localhost:4000/health
echo.
echo.

echo [2/6] Testing User Registration...
curl -s -X POST http://localhost:4000/api/v1/auth/register -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"password\":\"password123\",\"name\":\"Test User\"}" > register.json
type register.json
echo.
echo.

echo [3/6] Testing User Login...
curl -s -X POST http://localhost:4000/api/v1/auth/login -H "Content-Type: application/json" -d "{\"email\":\"test@example.com\",\"password\":\"password123\"}" > login.json
type login.json
echo.
echo.

echo Extracting API Key...
for /f "tokens=2 delims=:," %%a in ('findstr /C:"apiKey" login.json') do set API_KEY=%%a
set API_KEY=%API_KEY:"=%
set API_KEY=%API_KEY: =%
echo API Key: %API_KEY%
echo.

echo [4/6] Testing Get User Profile...
curl -s http://localhost:4000/api/v1/auth/profile -H "Authorization: Bearer %API_KEY%"
echo.
echo.

echo [5/6] Testing SVG Render...
curl -s -X POST http://localhost:4000/api/v1/render -H "Content-Type: application/json" -H "Authorization: Bearer %API_KEY%" -d "{\"entities\":[{\"id\":\"1\",\"label\":\"AI\",\"labelEn\":\"Artificial Intelligence\"},{\"id\":\"2\",\"label\":\"ML\",\"labelEn\":\"Machine Learning\"}],\"relations\":[{\"source\":\"1\",\"target\":\"2\",\"label\":\"includes\"}]}"
echo.
echo.

echo [6/6] Testing User Statistics...
curl -s http://localhost:4000/api/v1/stats -H "Authorization: Bearer %API_KEY%"
echo.
echo.

echo ========================================
echo All Tests Completed!
echo ========================================

del register.json login.json 2>nul
