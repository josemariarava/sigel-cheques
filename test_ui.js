const fs = require('fs');
const path = require('path');

const BASE = 'C:\\Users\\jmramirez\\Pictures\\prueba';
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!srcs.length) { console.log('NO SCRIPT SRC'); process.exit(1); }
const codigo = srcs.map(s => fs.readFileSync(path.join(BASE, s.replace(/^\//, '')), 'utf8')).join('\n;\n');

const errores = [];
process.on('uncaughtException', (e) => { errores.push('UNCAUGHT: ' + e.stack); });
process.on('unhandledRejection', (e) => { errores.push('REJECT: ' + (e && e.stack ? e.stack : e)); });

function crearCtx(canvas){
  const calls = { fillText: [], fillRect: [], strokeRect: [], drawImage: [] };
  return {
    canvas,
    fillStyle: '#000000', strokeStyle: '#000000', font: '10px sans-serif',
    textBaseline: 'alphabetic', lineWidth: 1,
    save(){}, restore(){},
    setLineDash(){},
    beginPath(){}, closePath(){}, moveTo(){}, lineTo(){}, stroke(){},
    rect(){}, clip(){},
    translate(){}, rotate(){}, scale(){},
    fillRect(...a){ calls.fillRect.push(a); },
    strokeRect(...a){ calls.strokeRect.push(a); },
    fillText(t, x, y){ calls.fillText.push({ t, x, y, font: this.font, fill: String(this.fillStyle) }); },
    measureText(t){ const fs2 = parseFloat(this.font) || 10; return { width: String(t || '').length * fs2 * 0.6 }; },
    drawImage(...a){ calls.drawImage.push(a.length); },
    getImageData(x, y, w, h){ const d = new Uint8ClampedArray(w * h * 4); d.fill(255); return { data: d, width: w, height: h }; },
    clearRect(){},
    _calls: calls
  };
}

const elementos = {};
let dyn = 0;
function El(id){
  let _value = '';
  let _width = 300, _height = 150;
  const el = {
    id: String(id),
    checked: String(id) === 'chkGuias', textContent: '', disabled: false, hidden: false,
    _html: '',
    style: {}, dataset: {},
    files: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
    setPointerCapture(){}, releasePointerCapture(){},
    appendChild(){}, insertAdjacentHTML(){}, remove(){},
    click(){},
    getContext(){ if (!el._ctx) el._ctx = crearCtx(el); return el._ctx; },
    toDataURL(){ return 'data:image/png;base64,iVBORw0KGgo='; },
    getBoundingClientRect(){
      const w = parseFloat(el.style && el.style.width) || 680;
      const h = parseFloat(el.style && el.style.height) || Math.max(80, w * 0.22);
      if (id === 'previewScroll') return { left: 0, top: 0, width: 680, height: 400, right: 680, bottom: 400 };
      return { left: 0, top: 0, width: w, height: h, right: w, bottom: h };
    },
    clientWidth: 680,
    clientHeight: 400,
    querySelector(sel){ return El(id + '_' + (++dyn)); },
    querySelectorAll(sel){
      if (sel === 'input') return [El(id + '_in1'), El(id + '_in2')];
      return [];
    },
    get firstElementChild(){ return El(id + '_first'); },
    get innerHTML(){ return el._html; },
    set innerHTML(v){ el._html = v; },
    get value(){ return _value; },
    set value(v){ _value = String(v); },
    get width(){ return _width; },
    set width(v){ if (id === 'preview') console.log('[set width]', v); _width = v; },
    get height(){ return _height; },
    set height(v){ if (id === 'preview') console.log('[set height]', v); _height = v; }
  };
  return el;
}

global.El = El;
global.document = {
  getElementById(id){ if (!elementos[id]) elementos[id] = El(id); return elementos[id]; },
  createElement(tag){ return El('dyn_' + tag + '_' + (++dyn)); },
  querySelectorAll(){ return []; },
  querySelector(){ return null; },
  body: El('body'),
  addEventListener(){}
};
global.window = {
  _h: {},
  addEventListener(t, fn){ (global.window._h[t] = global.window._h[t] || []).push(fn); },
  removeEventListener(){}
};
global.Image = class {
  constructor(){ this.width = 100; this.height = 40; }
  set src(v){ this._src = v; }
  get src(){ return this._src; }
  decode(){ return Promise.resolve(); }
};
global.URL = global.URL || {};
global.URL.createObjectURL = () => 'blob:x';
global.URL.revokeObjectURL = () => {};

const cfgCrudo = JSON.parse(fs.readFileSync(path.join(BASE, 'config.json'), 'utf8'));
let cfgServidor = JSON.parse(JSON.stringify(cfgCrudo));

function mergeDeep(base, extra){
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const k of Object.keys(extra)){
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])){
      out[k] = mergeDeep(out[k], v);
    } else if (v !== undefined) out[k] = v;
  }
  return out;
}

global.fetch = async (url, opts) => {
  const u = String(url);
  const metodo = (opts && opts.method) || 'GET';
  if (u.includes('/api/config') && metodo === 'POST'){
    cfgServidor = mergeDeep(cfgServidor, JSON.parse(opts.body));
    return { ok: true, status: 200, json: async () => ({ status: 'ok', config: cfgServidor }) };
  }
  if (u.includes('/api/config')){
    return { ok: true, status: 200, json: async () => cfgServidor };
  }
  if (u.includes('/api/impresora')){
    return { ok: true, json: async () => ({ ok: true, nombre: 'EPSON', puerto: 'ESDPRT001', trabajos: 0, spooler: 'Running' }) };
  }
  if (u.includes('/api/historial')){
    return { ok: true, json: async () => [] };
  }
  if (u.includes('/api/numeros')){
    return { ok: true, json: async () => ({ '45': '2026-09-01T10:00:00.000Z' }) };
  }
  if (u.includes('/api/imprimir')){
    return { ok: true, json: async () => ({ status: 'ok' }) };
  }
  return { ok: true, json: async () => ({}) };
};

global.requestAnimationFrame = (fn) => setTimeout(() => fn(performance.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
const _setInterval = global.setInterval;
global.setInterval = (fn, ms) => { const t = _setInterval(fn, ms); if (t.unref) t.unref(); return t; };

try {
  eval(codigo + '\n;global.__T = { state, setZoom, zoomFit, radioHitMm, buscarCampo, mostrarSel, guardarPosDebounced, fuentesSnapshot, restaurarFuentes };');
} catch(e){
  errores.push('EVAL: ' + e.stack);
}

setTimeout(() => {
  try {
    const T = global.__T;
    if (T && T.fuentesSnapshot && T.restaurarFuentes && T.state.cfg){
      console.log('===== FUENTES (snapshot/restaurar) =====');
      const st = T.state;
      const snap = T.fuentesSnapshot(st.cfg);
      const k0 = Object.keys(st.cfg.posiciones)[0];
      const origGlobal = st.cfg.fuente_mm;
      const origCampo = st.cfg.posiciones[k0].fuente_mm;
      st.cfg.fuente_mm = 7.4;
      st.cfg.posiciones[k0].fuente_mm = 6.6;
      const cambio = T.restaurarFuentes(snap);
      const ok = cambio === true && st.cfg.fuente_mm === snap.global && st.cfg.posiciones[k0].fuente_mm === snap.campos[k0];
      console.log('restaurar snapshot ->', ok ? 'OK' : 'FALLO');
      if (!ok) errores.push('fuentes: restauración incorrecta');
      const otraVez = T.restaurarFuentes(snap);
      console.log('segunda restauración (idéntica) ->', otraVez ? 'cambio (raro)' : 'sin cambio (esperado)');
      if (otraVez) errores.push('fuentes: segunda restauración debía ser sin cambio');
      const nula = T.restaurarFuentes(null);
      console.log('restaurar(null) ->', nula ? 'true (raro)' : 'false (esperado)');
      if (nula) errores.push('fuentes: restaurar(null) debía ser false');
      st.cfg.fuente_mm = origGlobal;
      st.cfg.posiciones[k0].fuente_mm = origCampo;
    } else {
      errores.push('fuentes: funciones no expuestas en __T');
    }
  } catch(e){
    errores.push('fuentes: ' + e.stack);
  }

  console.log('===== ERRORES =====');
  if (!errores.length) console.log('(ninguno)');
  errores.forEach(e => console.log(e));

  const pv = elementos['preview'];
  console.log('\n===== CANVAS PREVIEW =====');
  if (!pv){ console.log('canvas preview NO existe'); return; }
  console.log('dimensiones:', pv.width, 'x', pv.height);
  const ctx = pv._ctx;
  if (!ctx){ console.log('getContext NUNCA llamado -> refrescarPreview no corrió o falló antes'); return; }
  const c = ctx._calls;
  console.log('fillRect (fondo):', c.fillRect.length);
  console.log('strokeRect (guias):', c.strokeRect.length);
  console.log('fillText (campos):', c.fillText.length);
  console.log('--- textos dibujados ---');
  c.fillText.forEach(f => {
    console.log(`  [${f.fill}] x=${Math.round(f.x)} y=${Math.round(f.y)} font=${f.font} :: "${f.t}"`);
  });

  console.log('\n===== OTROS =====');
  const est = elementos['estado'];
  console.log('estado text:', est ? est.textContent || est._html : 'n/a');
  const sel = elementos['selInfo'];
  console.log('selInfo:', sel ? sel.textContent : 'n/a');

  try {
    console.log('\n===== ZOOM / TECLADO =====');
    const T = global.__T;
    if (!T){ console.log('__T NO disponible'); process.exit(1); }
    const state = T.state;
    console.log('zoom inicial:', state.zoom);
    T.setZoom(2);
    console.log('setZoom(2) ->', state.zoom, 'pct:', elementos['zoomPct'] && elementos['zoomPct'].textContent);
    T.setZoom(0.2);
    console.log('setZoom(0.2) límite ->', state.zoom, '(esperado >= 0.4)');
    T.zoomFit();
    console.log('zoomFit ->', state.zoom, '(esperado 1)');

    if (state.cfg && state.bounds && state.bounds.length){
      const key = state.bounds[0].key;
      state.sel = key;
      const antes = JSON.parse(JSON.stringify(state.cfg.posiciones[key]));
      const kd = (global.window._h.keydown || [])[0];
      if (kd){
        let prevent = false;
        kd({ key: 'ArrowRight', shiftKey: false, altKey: false, target: { tagName: 'BODY' }, preventDefault(){ prevent = true; } });
        const desp = state.cfg.posiciones[key];
        console.log('flecha derecha:', antes.x, '->', desp.x, '(esperado +1) prevent=', prevent);
        kd({ key: 'ArrowDown', shiftKey: true, altKey: false, target: { tagName: 'BODY' }, preventDefault(){} });
        console.log('shift+abajo Y:', antes.y, '->', state.cfg.posiciones[key].y, '(esperado +5)');
        kd({ key: 'ArrowLeft', shiftKey: false, altKey: true, target: { tagName: 'INPUT' }, preventDefault(){} });
        const enInput = state.cfg.posiciones[key].x;
        console.log('flecha en INPUT (no debe mover):', enInput, '(esperado igual que tras derecha)');
      } else {
        console.log('keyDown NO registrado');
      }
      const rad = T.radioHitMm();
      console.log('radioHitMm:', rad.toFixed(2), 'mm (esperado > 1.5)');
      const hit = T.buscarCampo({ x: state.bounds[0].x + 1, y: state.bounds[0].y + 1 });
      console.log('buscarCampo en centro campo:', hit ? hit.key : null, '(esperado', key + ')');
    }
  } catch(e){
    console.log('ERROR zoom/test:', e.stack);
  }

  process.exit(0);
}, 500);
