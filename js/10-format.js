function numeroALetras(num){
  const un = ['','UN','DOS','TRES','CUATRO','CINCO','SEIS','SIETE','OCHO','NUEVE'];
  const diez = ['DIEZ','ONCE','DOCE','TRECE','CATORCE','QUINCE','DIECISEIS','DIECISIETE','DIECIOCHO','DIECINUEVE'];
  const veinte = ['','VEINTE','TREINTA','CUARENTA','CINCUENTA','SESENTA','SETENTA','OCHENTA','NOVENTA'];
  const cien = ['','CIENTO','DOSCIENTOS','TRESCIENTOS','CUATROCIENTOS','QUINIENTOS','SEISCIENTOS','SETECIENTOS','OCHOCIENTOS','NOVECIENTOS'];
  function entero(n){
    if (n === 0) return '';
    if (n === 100) return 'CIEN';
    let r = '';
    const c = Math.floor(n/100), d = Math.floor((n%100)/10), u = n%10;
    if (c) r += cien[c] + ' ';
    if (d === 1) r += u ? diez[u] : 'DIEZ';
    else if (d === 2 && u) r += 'VEINTI' + (u === 1 ? 'UN' : un[u]);
    else if (d) { r += veinte[d - 1]; if (u) r += ' Y ' + un[u]; }
    else if (u) r += un[u];
    return r.trim();
  }
  function miles(n){
    if (n < 1000) return entero(n);
    const m = Math.floor(n/1000), rest = n%1000;
    let r = (m === 1 ? 'MIL' : entero(m) + ' MIL');
    if (rest) r += ' ' + entero(rest);
    return r;
  }
  function millones(n){
    if (n < 1000000) return miles(n);
    const m = Math.floor(n/1000000), rest = n%1000000;
    let r = (m === 1 ? 'UN MILLON' : entero(m) + ' MILLONES');
    if (rest) r += ' ' + miles(rest);
    return r;
  }
  const v = Math.round((Number(num) || 0) * 100);
  const ent = Math.floor(v/100), dec = v % 100;
  const mon = (state.cfg && state.cfg.moneda) ? state.cfg.moneda : 'SOLES';
  const parte = millones(ent);
  return (parte || 'CERO') + ' CON ' + String(dec).padStart(2,'0') + '/100 ' + mon;
}

function fechaLarga(iso, ciudad, formato){
  if (!iso) return '';
  const p = iso.split('-');
  if (p.length !== 3) return '';
  const c = (ciudad || '').trim().toUpperCase();
  if (formato === 'larga'){
    return (c ? c + ', ' : '') + Number(p[2]) + ' DE ' + MESES[Number(p[1]) - 1] + ' DE ' + p[0];
  }
  const dd = String(Number(p[2])).padStart(2, '0');
  const mm = String(Number(p[1])).padStart(2, '0');
  const yy = p[0].slice(-2);
  return (c ? c + ' ' : '') + dd + ' ' + mm + ' ' + yy;
}

function campoVisible(cfg, key){
  const v = cfg && cfg.camposVisibles;
  if (!v || typeof v !== 'object') return true;
  if (!(key in v)) return true;
  return v[key] !== false;
}

function fuenteCampoMM(cfg, pos){
  const g = isFinite(cfg.fuente_mm) && cfg.fuente_mm > 0 ? cfg.fuente_mm : 4;
  const f = pos && isFinite(pos.fuente_mm) ? pos.fuente_mm : 0;
  return (f >= 1 && f <= 8) ? f : g;
}

function anchoDispoMM(cfg, pos, key){
  const L = cfg.cheque.largo_mm;
  const margen = isFinite(cfg.margenDerecha_mm) ? cfg.margenDerecha_mm : 0;
  const alin = (key === 'monto' && cfg.montoAlineacion) ? cfg.montoAlineacion : 'izq';
  if (alin === 'der') return Math.max(0, pos.x - margen);
  if (alin === 'centro') return Math.max(0, Math.min(pos.x, L - pos.x) * 2 - margen);
  return Math.max(0, L - pos.x - margen);
}

function fmtMonto(n){
  return (Number(n) || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}

async function cargarImg(url){
  if (!url) return null;
  if (state.imgCache[url]) return state.imgCache[url];
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch(e) { return null; }
  state.imgCache[url] = img;
  return img;
}
