function rotarCanvas(src, grados){
  const g = ((grados % 360) + 360) % 360;
  if (g === 0) return src;
  const w = src.width, h = src.height;
  const dst = document.createElement('canvas');
  dst.width = (g === 90 || g === 270) ? h : w;
  dst.height = (g === 90 || g === 270) ? w : h;
  const ctx = dst.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, dst.width, dst.height);
  ctx.save();
  if (g === 90){ ctx.translate(h, 0); ctx.rotate(Math.PI/2); }
  else if (g === 180){ ctx.translate(w, h); ctx.rotate(Math.PI); }
  else if (g === 270){ ctx.translate(0, w); ctx.rotate(-Math.PI/2); }
  ctx.drawImage(src, 0, 0);
  ctx.restore();
  return dst;
}

function aplicarOffset(src, cfg, k){
  const offX = Math.round(cfg.offsetX_mm * k);
  const offY = Math.round(cfg.offsetY_mm * k);
  const W = src.width + Math.max(0, offX);
  const H = src.height + Math.max(0, offY);
  const c = document.createElement('canvas');
  c.width = Math.max(1, W);
  c.height = Math.max(1, H);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, offX, offY);
  return c;
}

function empaquetar(canvas){
  const w = canvas.width, h = canvas.height;
  const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const bpr = Math.ceil(w / 8);
  const out = new Uint8Array(bpr * h);
  for (let y = 0; y < h; y++){
    const fila = y * bpr;
    for (let x = 0; x < w; x++){
      const i = (y * w + x) * 4;
      if (d[i+3] > 40 && (d[i] + d[i+1] + d[i+2]) / 3 < 170){
        out[fila + (x >> 3)] |= (0x80 >> (x & 7));
      }
    }
  }
  let s = '';
  const TAM = 0x8000;
  for (let i = 0; i < out.length; i += TAM){
    s += String.fromCharCode.apply(null, out.subarray(i, Math.min(i + TAM, out.length)));
  }
  return { w, h, bytesPerRow: bpr, data: btoa(s) };
}

async function construirLienzoImpresion(cfg, data){
  const k = cfg.dpi / 25.4;
  const nat = document.createElement('canvas');
  nat.width = Math.round(cfg.cheque.largo_mm * k);
  nat.height = Math.round(cfg.cheque.ancho_mm * k);
  data.firmaImg = data.firma ? await cargarImg(data.firma) : null;
  await renderContenido(nat.getContext('2d'), cfg, data, k);
  const rot = rotarCanvas(nat, cfg.orient);
  return aplicarOffset(rot, cfg, k);
}
async function enviarImpresion(raster, cheque){
  const resp = await fetch('/api/imprimir', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ raster, cheque })
  });
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(j.message || 'Error de impresión');
  return j;
}

async function imprimirCheque(data, meta){
  const lienzo = await construirLienzoImpresion(state.cfg, data);
  const raster = empaquetar(lienzo);
  return enviarImpresion(raster, meta);
}
function dibujarTestAvance(ctx, cfg, k){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  const feedEsLargo = ejesSegunOrient(cfg.orient).feedEsLargo;
  const feed = feedEsLargo ? L : A;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, L*k, A*k);
  ctx.fillStyle = '#000';
  const banda = Math.min(6, feed * 0.08) * k;
  if (feedEsLargo){
    ctx.fillRect(0, 0, L*k, banda);
    ctx.fillRect(0, A*k - banda, L*k, banda);
    ctx.fillRect(0, A*k - banda * 2.2, L*k, banda * 0.35);
    ctx.font = 'bold ' + Math.min(5, A * 0.07) * k + 'px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ENTRADA', L*k/2, banda + 1.5*k);
    ctx.fillText('FIN ' + L + 'mm', L*k/2, A*k - banda - 1.2*k);
    ctx.textAlign = 'left';
    for (let x = 10; x < L; x += 10){
      ctx.fillRect(x*k, 0, Math.max(1, 0.4*k), banda * 0.7);
      ctx.font = (2.2*k) + 'px "Courier New", monospace';
      ctx.fillText(String(x), x*k + 0.8*k, banda + 0.5*k);
    }
  } else {
    ctx.fillRect(0, 0, banda, A*k);
    ctx.fillRect(L*k - banda, 0, banda, A*k);
    ctx.fillRect(L*k - banda * 2.2, 0, banda * 0.35, A*k);
    ctx.save();
    ctx.translate(banda + 1.5*k, A*k/2);
    ctx.rotate(-Math.PI/2);
    ctx.font = 'bold ' + Math.min(5, L * 0.07) * k + 'px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ENTRADA', 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(L*k - banda - 1.2*k, A*k/2);
    ctx.rotate(-Math.PI/2);
    ctx.font = 'bold ' + Math.min(5, L * 0.07) * k + 'px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIN ' + A + 'mm', 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.font = (2.2*k) + 'px "Courier New", monospace';
    for (let y = 10; y < A; y += 10){
      ctx.fillRect(0, y*k, banda * 0.7, Math.max(1, 0.4*k));
      ctx.fillText(String(y), banda + 0.5*k, y*k + 2.5*k);
    }
  }
}

function ejesSegunOrient(o){
  const g = ((Number(o) % 360) + 360) % 360;
  return { feedEsLargo: g === 90 || g === 270 };
}
function dibujarGrilla(ctx, cfg, k){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, L*k, A*k);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineWidth = Math.max(1, 0.25*k);
  ctx.strokeRect(1*k, 1*k, (L-2)*k, (A-2)*k);
  ctx.lineWidth = Math.max(1, 0.6*k);
  ctx.beginPath();
  ctx.moveTo(0, 0.6*k);
  ctx.lineTo(L*k, 0.6*k);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 0.25*k);
  ctx.font = 'bold ' + (2.6*k) + 'px "Courier New", monospace';
  ctx.textBaseline = 'top';
  ctx.fillRect(3*k, 3*k, 5*k, 5*k);
  for (let x = 10; x < L; x += 10){
    for (let y = 10; y < A; y += 10){
      const X = x*k, Y = y*k;
      const t = 1.4*k;
      ctx.beginPath();
      ctx.moveTo(X - t, Y); ctx.lineTo(X + t, Y);
      ctx.moveTo(X, Y - t); ctx.lineTo(X, Y + t);
      ctx.stroke();
    }
  }
  for (let x = 10; x < L; x += 10){
    ctx.fillText(String(x), x*k + 1*k, 2*k);
    ctx.fillText(String(x), x*k + 1*k, (A - 5)*k);
  }
  for (let y = 10; y < A; y += 10){
    ctx.fillText(String(y), 9*k, y*k - 1.5*k);
    ctx.fillText(String(y), (L - 12)*k, y*k - 1.5*k);
  }
  const marcas = [2, 5, 10];
  const esquinas = [
    { ox: 0, oy: 0, sx: 1, sy: 1 },
    { ox: L, oy: 0, sx: -1, sy: 1 },
    { ox: 0, oy: A, sx: 1, sy: -1 },
    { ox: L, oy: A, sx: -1, sy: -1 }
  ];
  ctx.strokeStyle = '#c62828';
  ctx.fillStyle = '#c62828';
  ctx.lineWidth = Math.max(1, 0.35*k);
  ctx.font = 'bold ' + (2.2*k) + 'px "Courier New", monospace';
  for (const e of esquinas){
    for (const m of marcas){
      if (m > L || m > A) continue;
      const x = e.ox + e.sx * m;
      const y = e.oy + e.sy * m;
      ctx.beginPath();
      ctx.moveTo(e.ox + e.sx * 0.5, y);
      ctx.lineTo(x, y);
      ctx.moveTo(x, e.oy + e.sy * 0.5);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillText(String(m), x + e.sx * 1.2, y + e.sy * 0.6);
    }
  }
  const reg = regionImprimibleNatural(cfg);
  if (reg.recortado){
    ctx.strokeStyle = '#e65100';
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = Math.max(1, 0.4*k);
    ctx.strokeRect(reg.x*k, reg.y*k, reg.w*k, reg.h*k);
    ctx.setLineDash([]);
    ctx.fillStyle = '#e65100';
    ctx.fillText('IMPRESION ' + reg.maxW + 'mm', (reg.x + 2)*k, (reg.y + 2)*k);
  }
}
