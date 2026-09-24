const fs = require('fs');
const http = require('http');

const cfg = JSON.parse(fs.readFileSync(__dirname + '/config.json', 'utf8'));
const k = cfg.dpi / 25.4;
const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
const W = Math.round(L * k), H = Math.round(A * k);
const bpr = Math.ceil(W / 8);
const nat = new Uint8Array(bpr * H);

function px(x, y){
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  nat[y * bpr + (x >> 3)] |= (0x80 >> (x & 7));
}
function rect(x1, y1, x2, y2){
  for (let x = x1; x <= x2; x++){ px(x, y1); px(x, y2); }
  for (let y = y1; y <= y2; y++){ px(x1, y); px(x2, y); }
}
function fill(x1, y1, x2, y2){
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++) px(x, y);
}
function mm(v){ return Math.round(v * k); }

rect(mm(1), mm(1), mm(L-1), mm(A-1));
fill(0, 0, W - 1, mm(0.6));
fill(mm(3), mm(3), mm(8), mm(8));

for (let x = 10; x < L; x += 10){
  for (let y = 10; y < A; y += 10){
    const X = mm(x), Y = mm(y), t = mm(1.4);
    for (let d = -t; d <= t; d++){ px(X + d, Y); px(X, Y + d); }
  }
}
for (let x = 10; x < L; x += 20){ fill(mm(x) - mm(0.3), 0, mm(x) + mm(0.3), mm(2.5)); }
for (let y = 10; y < A; y += 20){ fill(0, mm(y) - mm(0.3), mm(2.5), mm(y) + mm(0.3)); }

function rotar(src, w, h, g){
  g = ((g % 360) + 360) % 360;
  if (g === 0) return { data: src, w, h };
  const sw = (g === 90 || g === 270) ? h : w;
  const sh = (g === 90 || g === 270) ? w : h;
  const sbpr = Math.ceil(w / 8);
  const dbpr = Math.ceil(sw / 8);
  const dst = new Uint8Array(dbpr * sh);
  function get(sx, sy){
    return (src[sy * sbpr + (sx >> 3)] >> (7 - (sx & 7))) & 1;
  }
  for (let y = 0; y < sh; y++){
    for (let x = 0; x < sw; x++){
      let sx, sy;
      if (g === 90){ sx = y; sy = h - 1 - x; }
      else if (g === 180){ sx = w - 1 - x; sy = h - 1 - y; }
      else { sx = w - 1 - y; sy = x; }
      if (get(sx, sy)) dst[y * dbpr + (x >> 3)] |= (0x80 >> (x & 7));
    }
  }
  return { data: dst, w: sw, h: sh };
}

const offX = Math.round(cfg.offsetX_mm * k);
const offY = Math.round(cfg.offsetY_mm * k);
const rot = rotar(nat, W, H, cfg.orient);
const FW = rot.w + Math.max(0, offX);
const FH = rot.h + Math.max(0, offY);
const final = new Uint8Array(Math.ceil(FW / 8) * FH);
final.fill(0xFF);
const fbpr = Math.ceil(FW / 8);
for (let y = 0; y < rot.h; y++){
  const dy = y + offY;
  if (dy < 0 || dy >= FH) continue;
  for (let x = 0; x < rot.w; x++){
    const dx = x + offX;
    if (dx < 0 || dx >= FW) continue;
    if ((rot.data[y * Math.ceil(rot.w / 8) + (x >> 3)] >> (7 - (x & 7))) & 1){
      final[dy * fbpr + (dx >> 3)] &= ~(0x80 >> (dx & 7));
    } else {
      final[dy * fbpr + (dx >> 3)] |= (0x80 >> (dx & 7));
    }
  }
}

const body = JSON.stringify({
  raster: {
    w: FW,
    h: FH,
    bytesPerRow: fbpr,
    data: Buffer.from(final).toString('base64')
  },
  cheque: null
});

function enviar(){
  const req = http.request({
    hostname: '127.0.0.1', port: 3000, path: '/api/imprimir',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  }, (res) => {
    let out = '';
    res.on('data', c => out += c);
    res.on('end', () => { console.log('Status:', res.statusCode); console.log(out); });
  });
  req.on('error', e => console.error('Error:', e.message));
  req.write(body);
  req.end();
}

enviar();
