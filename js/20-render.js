function envolver(ctx, texto, anchoPx, maxLineas){
  texto = String(texto || '');
  if (!texto) return [];
  if (maxLineas <= 1) return [texto];
  const palabras = texto.split(/\s+/);
  const lineas = [];
  let act = '';
  for (const p of palabras){
    const cand = act ? act + ' ' + p : p;
    if (ctx.measureText(cand).width <= anchoPx) act = cand;
    else { if (act) lineas.push(act); act = p; }
  }
  if (act) lineas.push(act);
  if (lineas.length > maxLineas){
    const kept = lineas.slice(0, maxLineas - 1);
    kept.push(lineas.slice(maxLineas - 1).join(' '));
    return kept;
  }
  return lineas;
}

function naturalADest(cfg, x, y){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  const o = ((Number(cfg.orient) % 360) + 360) % 360;
  let dx = x, dy = y;
  if (o === 90){ dx = A - y; dy = x; }
  else if (o === 180){ dx = L - x; dy = A - y; }
  else if (o === 270){ dx = y; dy = L - x; }
  dx += cfg.offsetX_mm || 0;
  dy += cfg.offsetY_mm || 0;
  return { x: dx, y: dy };
}

function destANatural(cfg, x, y){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  const o = ((Number(cfg.orient) % 360) + 360) % 360;
  let dx = x - (cfg.offsetX_mm || 0);
  let dy = y - (cfg.offsetY_mm || 0);
  if (o === 90) return { x: dy, y: A - dx };
  if (o === 180) return { x: L - dx, y: A - dy };
  if (o === 270) return { x: L - dy, y: dx };
  return { x: dx, y: dy };
}

function dimsDestino(cfg){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  const o = ((Number(cfg.orient) % 360) + 360) % 360;
  const baseW = (o === 0 || o === 180) ? L : A;
  const baseH = (o === 0 || o === 180) ? A : L;
  return {
    destL: baseW + Math.max(0, cfg.offsetX_mm || 0),
    destA: baseH + Math.max(0, cfg.offsetY_mm || 0)
  };
}

function camposDe(cfg, data){
  const todos = [
    {key:'fecha', txt: data.fechaText, lineas: 2},
    {key:'numero', txt: (cfg.imprimirNumero && data.numeroText) ? data.numeroText : null},
    {key:'orden', txt: cfg.textoOrden || ''},
    {key:'beneficiario', txt: data.beneficiario, lineas: 2},
    {key:'monto', txt: data.montoText, bold: true},
    {key:'letra', txt: data.letraText, lineas: 2},
    {key:'concepto', txt: data.concepto, lineas: 1},
    {key:'cuenta', txt: data.cuentaText, lineas: 1},
    {key:'firma', img: data.firmaImg}
  ];
  return todos.filter(c => campoVisible(cfg, c.key));
}

async function renderContenido(ctx, cfg, data, k){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, Math.round(L*k), Math.round(A*k));
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const bounds = [];
  const fMM = cfg.fuente_mm;
  const lh = fMM * 1.4;
  const fuenteTipo = (cfg.fuenteTipo && String(cfg.fuenteTipo).trim()) ? String(cfg.fuenteTipo).trim() : 'Courier New';
  const margen = (isFinite(cfg.margenDerecha_mm) ? cfg.margenDerecha_mm : 0);
  for (const campo of camposDe(cfg, data)){
    const pos = cfg.posiciones[campo.key];
    if (!pos) continue;
    const x = pos.x * k, y = pos.y * k;
    if (campo.key === 'firma'){
      const wMM = cfg.firma_ancho_mm || 36, hMM = cfg.firma_alto_mm || 14;
      if (campo.img){
        ctx.drawImage(campo.img, x, y, wMM*k, hMM*k);
      }
      bounds.push({key:'firma', x:pos.x, y:pos.y, w:wMM, h:hMM});
      continue;
    }
    if (!campo.txt) continue;
    const alin = (campo.key === 'monto' && cfg.montoAlineacion) ? cfg.montoAlineacion : 'izq';
    const anchoMM = anchoDispoMM(cfg, pos, campo.key);
    const fCampo = fuenteCampoMM(cfg, pos);
    const lhCampo = fCampo * 1.4;
    ctx.font = (campo.bold ? 'bold ' : '') + (fCampo*k) + 'px "' + fuenteTipo + '", monospace';
    const lineas = envolver(ctx, campo.txt, anchoMM*k, campo.lineas || 1);
    let anchoMax = 0;
    ctx.textAlign = alin === 'der' ? 'right' : (alin === 'centro' ? 'center' : 'left');
    const clipX = alin === 'der' ? (pos.x - anchoMM)*k : (alin === 'centro' ? (pos.x - anchoMM/2)*k : x);
    const clipH = Math.max(fCampo*1.2, lineas.length * lhCampo) * k;
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, y - 0.2*k, anchoMM*k, clipH + 0.4*k);
    ctx.clip();
    lineas.forEach((ln, i) => {
      ctx.fillText(ln, x, y + i*lhCampo*k);
      anchoMax = Math.max(anchoMax, ctx.measureText(ln).width);
    });
    ctx.restore();
    ctx.textAlign = 'left';
    const wMM = Math.min(anchoMax / k, anchoMM);
    const bx = alin === 'der' ? pos.x - wMM : (alin === 'centro' ? pos.x - wMM/2 : pos.x);
    const hMM = Math.max(fCampo*1.2, lineas.length * lhCampo);
    const anchoReal = anchoMax / k;
    const recortado = anchoReal > anchoMM + 0.05 || bx < -0.05;
    bounds.push({key:campo.key, x:bx, y:pos.y, w:wMM, h:hMM, recortado});
  }
  return bounds;
}

function regionImprimibleNatural(cfg){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  const maxW = cfg.anchoImpresion_mm || 80;
  const o = ((Number(cfg.orient) % 360) + 360) % 360;
  const offX = cfg.offsetX_mm || 0;
  const offY = cfg.offsetY_mm || 0;
  let destW = (o === 0 || o === 180 ? L : A) + Math.max(0, offX);
  let destH = (o === 0 || o === 180 ? A : L) + Math.max(0, offY);
  const pw = Math.min(destW, maxW);
  const ph = destH;
  const pts = [[0,0],[pw,0],[pw,ph],[0,ph]].map(([x, y]) => destANatural(cfg, x, y));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    recortado: destW > maxW + 0.01,
    destW, maxW
  };
}

function renderGuias(ctx, cfg, bounds, k){
  const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
  ctx.save();
  const reg = regionImprimibleNatural(cfg);
  if (reg.recortado){
    ctx.strokeStyle = '#e65100';
    ctx.lineWidth = Math.max(1.2, 0.3*k);
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(reg.x*k, reg.y*k, reg.w*k, reg.h*k);
    ctx.setLineDash([]);
    ctx.fillStyle = '#e65100';
    ctx.font = 'bold ' + (2.4*k) + 'px Segoe UI, Arial';
    ctx.fillText('ÁREA IMPRIMIBLE ' + reg.maxW + ' mm — fuera se recorta', (reg.x + 2)*k, (reg.y + 1.5)*k);
  }
  ctx.strokeStyle = '#0b5cad';
  ctx.lineWidth = Math.max(1, 0.2*k);
  ctx.setLineDash([4, 3]);
  ctx.font = (2.2*k) + 'px Segoe UI, Arial';
  ctx.fillStyle = '#0b5cad';
  ctx.textBaseline = 'top';
  for (const b of bounds){
    const activo = state.sel === b.key;
    if (activo){
      ctx.setLineDash([]);
      ctx.strokeStyle = '#e65100';
      ctx.lineWidth = Math.max(1.2, 0.35*k);
      ctx.strokeRect(b.x*k - 3, b.y*k - 3, b.w*k + 6, b.h*k + 6);
      ctx.fillStyle = 'rgba(230,81,0,.12)';
      ctx.fillRect(b.x*k - 3, b.y*k - 3, b.w*k + 6, b.h*k + 6);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#0b5cad';
      ctx.lineWidth = Math.max(1, 0.2*k);
    } else {
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#0b5cad';
      ctx.lineWidth = Math.max(1, 0.2*k);
    }
    ctx.strokeRect(b.x*k - 2, b.y*k - 2, b.w*k + 4, b.h*k + 4);
    ctx.fillText((activo ? '▸ ' : '') + (NOMBRES_CAMPO[b.key] || b.key), b.x*k, (b.y - 3.4)*k);
  }
      const margenFin = isFinite(cfg.margenDerecha_mm) ? cfg.margenDerecha_mm : 0;
  if (margenFin > 0){
    const xf = (L - margenFin) * k;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#e65100';
    ctx.lineWidth = Math.max(1.1, 0.25*k);
    ctx.beginPath();
    ctx.moveTo(xf, 0);
    ctx.lineTo(xf, A*k);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e65100';
    ctx.font = 'bold ' + (2*k) + 'px Segoe UI, Arial';
    ctx.save();
    ctx.translate(xf - 1.2*k, 2*k);
    ctx.rotate(Math.PI / 2);
    ctx.fillText('FIN TEXTO ' + (L - margenFin) + ' mm', 0, 0);
    ctx.restore();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = '#c62828';
  ctx.strokeRect(1*k, (A - 9)*k, (L - 2)*k, 7.5*k);
  ctx.fillStyle = '#c62828';
  ctx.font = (2.2*k) + 'px Segoe UI, Arial';
  ctx.fillText('ZONA MICR — no imprimir', 3*k, (A - 8.4)*k);
  ctx.strokeStyle = '#94a3b5';
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(0.5*k, 0.5*k, (L - 1)*k, (A - 1)*k);
  ctx.setLineDash([]);
  ctx.fillStyle = '#94a3b5';
  ctx.font = (2*k) + 'px Segoe UI, Arial';
  ctx.fillText('borde del cheque ' + L + '×' + A + ' mm', 3*k, 1*k);
  ctx.restore();
}
