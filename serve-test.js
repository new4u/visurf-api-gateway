const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/test.html') {
    fs.readFile(path.join(__dirname, 'test.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading test.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  测试页面服务器已启动`);
  console.log(`========================================`);
  console.log(`\n📱 在浏览器中打开: http://localhost:${PORT}`);
  console.log(`\n提示: 确保 API 服务器运行在 http://localhost:4000\n`);
});
