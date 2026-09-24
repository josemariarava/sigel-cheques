const http = require('http');
const data = JSON.stringify({offsetX_mm: 0, offsetY_mm: 0});
const req = http.request({
  hostname: 'localhost', port: 3000, path: '/api/test-grid', method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': data.length}
}, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => { console.log('Status:', res.statusCode); console.log('Body:', body); });
});
req.on('error', (e) => { console.error('Error:', e.message); });
req.write(data); req.end();
