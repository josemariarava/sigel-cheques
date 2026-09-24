const http = require('http');
const data = JSON.stringify({
  beneficiario: "Juan Perez",
  fecha: "23/09/2026",
  monto: "1500.00",
  orden: "PAGUESE A LA ORDEN DE",
  fuente: "A",
  offsetX_mm: 0,
  offsetY_mm: 0,
  posiciones: {
    fecha: {x_mm: 90, y_mm: 12},
    monto: {x_mm: 85, y_mm: 38},
    orden: {x_mm: 18, y_mm: 27},
    beneficiario: {x_mm: 18, y_mm: 34}
  }
});
const req = http.request({
  hostname: 'localhost', port: 3000, path: '/api/imprimir-slip', method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': data.length}
}, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => { console.log('Status:', res.statusCode); console.log('Body:', body); });
});
req.on('error', (e) => { console.error('Error:', e.message); });
req.write(data); req.end();
