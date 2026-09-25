const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const app = express();

const PUERTO = parseInt(process.env.PUERTO || '3000', 10);
const DATA_DIR = process.env.SIGEL_DATA_DIR || __dirname;
const ORIGENES_OK = ['http://127.0.0.1:' + PUERTO, 'http://localhost:' + PUERTO];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ORIGENES_OK.includes(origin)) {
    res.status(403).json({ status: 'error', message: 'Origen no permitido' });
    return;
  }
  next();
});
app.use(express.json({ limit: '25mb' }));

const CFG_PATH = path.join(DATA_DIR, 'config.json');
const HIST_PATH = path.join(DATA_DIR, 'historial.json');
const NUM_PATH = path.join(DATA_DIR, 'numeros_usados.json');
const TMP_DIR = path.join(DATA_DIR, 'tmp');
const PS_PATH = path.join(__dirname, 'raw_print.ps1');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const FIRMAS_DIR = path.join(DATA_DIR, 'firmas');
const AUDIT_PATH = path.join(DATA_DIR, 'auditoria.jsonl');
const MAX_BACKUPS_AUTO = 60;

function auditar(accion, detalle) {
  try {
    fs.appendFileSync(AUDIT_PATH, JSON.stringify({ ts: new Date().toISOString(), accion, ...detalle }) + '\n', 'utf8');
  } catch (e) {}
}

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(FIRMAS_DIR)) fs.mkdirSync(FIRMAS_DIR, { recursive: true });

const DEFAULTS = {
  impresora: 'EPSON TM-H6000VI Slip',
  dpi: 160,
  cheque: { largo_mm: 700, ancho_mm: 70 },
  orient: 90,
  offsetX_mm: 0,
  offsetY_mm: 0,
  fuente_mm: 4,
  fuenteTipo: 'Courier New',
  firma_ancho_mm: 36,
  firma_alto_mm: 14,
  moneda: 'SOLES',
  simboloMoneda: 'S/',
  loteDelayMs: 8000,
  siguiente_numero: 1,
  imprimirNumero: true,
  imprimirCuenta: true,
  cuenta: { titular: '', banco: '', numero: '', ciudad: '' },
  textoOrden: 'PAGUESE A LA ORDEN DE:',
  fechaFormato: 'numeros',
  camposVisibles: {},
  margenDerecha_mm: 0,
  montoAlineacion: 'izq',
  anchoImpresion_mm: 80,
  posiciones: {}
};

function mergeDeep(base, extra) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!extra || typeof extra !== 'object') return out;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = mergeDeep(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

function sanear(cfg, previo){
  const c = mergeDeep({}, cfg);
  const prev = previo || {};
  const prevCh = prev.cheque || {};
  const rango = (v, def, min, max, pv) => {
    v = parseFloat(v);
    if (isFinite(v) && v >= min && v <= max) return v;
    v = parseFloat(pv);
    if (isFinite(v) && v >= min && v <= max) return v;
    return def;
  };
  c.cheque = c.cheque || {};
  const libre = (v, def, pv) => {
    v = parseFloat(v);
    if (isFinite(v) && v > 0) return v;
    v = parseFloat(pv);
    if (isFinite(v) && v > 0) return v;
    return def;
  };
  c.cheque = c.cheque || {};
  c.cheque.largo_mm = libre(c.cheque.largo_mm, 700, prevCh.largo_mm);
  c.cheque.ancho_mm = libre(c.cheque.ancho_mm, 70, prevCh.ancho_mm);
  c.dpi = Math.round(rango(c.dpi, 160, 96, 180, prev.dpi));
  c.fuente_mm = rango(c.fuente_mm, 4, 2, 8, prev.fuente_mm);
  const FUENTES_OK = ['Courier New','Consolas','Lucida Console','Courier','Times New Roman','Arial','Georgia','Verdana','Tahoma','Calibri','Segoe UI','Comic Sans MS'];
  {
    const raw = String(c.fuenteTipo || '').trim();
    c.fuenteTipo = FUENTES_OK.includes(raw) ? raw
      : (FUENTES_OK.includes(String(prev.fuenteTipo)) ? String(prev.fuenteTipo) : 'Courier New');
  }
  c.offsetX_mm = rango(c.offsetX_mm, 0, -50, 50, prev.offsetX_mm);
  c.offsetY_mm = rango(c.offsetY_mm, 0, -50, 50, prev.offsetY_mm);
  c.firma_ancho_mm = rango(c.firma_ancho_mm, 36, 10, 90, prev.firma_ancho_mm);
  c.firma_alto_mm = rango(c.firma_alto_mm, 14, 5, 40, prev.firma_alto_mm);
  c.orient = [0, 90, 180, 270].includes(Number(c.orient))
    ? Number(c.orient)
    : ([0, 90, 180, 270].includes(Number(prev.orient)) ? Number(prev.orient) : 90);
  c.siguiente_numero = Math.round(rango(c.siguiente_numero, 1, 1, 999999, prev.siguiente_numero));
  c.loteDelayMs = rango(c.loteDelayMs, 8000, 2000, 600000, prev.loteDelayMs);
  c.moneda = String(c.moneda || 'SOLES').slice(0, 20);
  c.simboloMoneda = String(c.simboloMoneda || 'S/').slice(0, 6);
  c.textoOrden = String(c.textoOrden || '').slice(0, 60);
  c.impresora = String(c.impresora || 'EPSON TM-H6000VI Slip').slice(0, 120);
  c.imprimirNumero = typeof c.imprimirNumero === 'boolean' ? c.imprimirNumero : !!prev.imprimirNumero;
  c.imprimirCuenta = typeof c.imprimirCuenta === 'boolean' ? c.imprimirCuenta : !!prev.imprimirCuenta;
  c.fechaFormato = c.fechaFormato === 'larga' ? 'larga' : 'numeros';
  c.margenDerecha_mm = rango(c.margenDerecha_mm, 0, 0, 10, prev.margenDerecha_mm);
  c.anchoImpresion_mm = rango(c.anchoImpresion_mm, 80, 40, 120, prev.anchoImpresion_mm);
  c.montoAlineacion = ['izq', 'centro', 'der'].includes(c.montoAlineacion) ? c.montoAlineacion : (['izq', 'centro', 'der'].includes(prev.montoAlineacion) ? prev.montoAlineacion : 'izq');
  c.cuenta = c.cuenta || {};
  ['titular', 'banco', 'numero', 'ciudad'].forEach(k => {
    c.cuenta[k] = String(c.cuenta[k] || '').slice(0, 80);
  });
  c.posiciones = c.posiciones || {};
  const claves = ['fecha', 'numero', 'orden', 'beneficiario', 'monto', 'letra', 'concepto', 'cuenta', 'firma'];
  const posDefault = {
    fecha: {x:95,y:8}, numero:{x:135,y:8}, orden:{x:12,y:24}, beneficiario:{x:12,y:32},
    monto:{x:110,y:40}, letra:{x:12,y:44}, concepto:{x:12,y:52}, cuenta:{x:12,y:57}, firma:{x:118,y:46}
  };
  const prevPos = prev.posiciones || {};
  const envVis = (c.camposVisibles && typeof c.camposVisibles === 'object') ? c.camposVisibles : {};
  const prevVis = (prev.camposVisibles && typeof prev.camposVisibles === 'object') ? prev.camposVisibles : {};
  c.camposVisibles = {};
  for (const k of claves){
    const p = c.posiciones[k] || posDefault[k];
    const pp = prevPos[k] || posDefault[k];
    const bx = (v, def, pv) => {
      v = parseFloat(v);
      if (isFinite(v) && v >= 0) return v;
      v = parseFloat(pv);
      if (isFinite(v) && v >= 0) return v;
      return def;
    };
    const fmRaw = p.fuente_mm;
    const fmPrev = pp.fuente_mm;
    let fm = parseFloat(fmRaw);
    if (!(isFinite(fm) && fm >= 0 && fm <= 8)){
      fm = parseFloat(fmPrev);
      if (!(isFinite(fm) && fm >= 0 && fm <= 8)) fm = 0;
    }
    c.posiciones[k] = {
      x: bx(p.x, posDefault[k].x, pp.x),
      y: bx(p.y, posDefault[k].y, pp.y),
      fuente_mm: fm
    };
    if (typeof envVis[k] === 'boolean') c.camposVisibles[k] = envVis[k];
    else if (typeof prevVis[k] === 'boolean') c.camposVisibles[k] = prevVis[k];
    else c.camposVisibles[k] = true;
  }
  return c;
}

function loadConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
    const base = mergeDeep({}, DEFAULTS);
    const merged = mergeDeep(base, raw);
    return sanear(merged, merged);
  } catch (e) {
    return sanear(mergeDeep({}, DEFAULTS), DEFAULTS);
  }
}

function saveConfig(cfg) {
  const limpio = sanear(cfg, loadConfig());
  const tmp = CFG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(limpio, null, 2), 'utf8');
  try {
    if (fs.existsSync(CFG_PATH)) fs.copyFileSync(CFG_PATH, CFG_PATH + '.bak');
  } catch (e) {}
  fs.renameSync(tmp, CFG_PATH);
  return limpio;
}

function loadHistorial() {
  try {
    return JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function appendHistorial(item) {
  const hist = loadHistorial();
  hist.unshift(item);
  if (hist.length > 500) hist.length = 500;
  fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 2), 'utf8');
}

function normNum(n) {
  return String(n == null ? '' : n).replace(/^N°\s*/i, '').trim();
}

function loadNumeros() {
  try {
    const raw = JSON.parse(fs.readFileSync(NUM_PATH, 'utf8'));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  } catch (e) {}
  const semilla = {};
  for (const h of loadHistorial()) {
    const n = normNum(h.numero);
    if (n) semilla[n] = h.fecha || '';
  }
  try { fs.writeFileSync(NUM_PATH, JSON.stringify(semilla, null, 2), 'utf8'); } catch (e) {}
  return semilla;
}

function registrarNumero(n, fechaISO) {
  const nums = loadNumeros();
  nums[n] = fechaISO;
  fs.writeFileSync(NUM_PATH, JSON.stringify(nums, null, 2), 'utf8');
}

function guardarFirma(dataUrl) {
  const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return '';
  const ext = m[1] === 'png' ? 'png' : 'jpg';
  const nombre = `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
  fs.writeFileSync(path.join(FIRMAS_DIR, nombre), Buffer.from(m[2], 'base64'));
  return nombre;
}

function leerFirma(nombre) {
  const base = path.basename(String(nombre || ''));
  if (!/^f_\d+_[a-z0-9]+\.(png|jpg)$/.test(base)) return null;
  const p = path.join(FIRMAS_DIR, base);
  if (!fs.existsSync(p)) return null;
  const mime = base.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
}

function timestampBackup() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function hacerBackup(tipo) {
  try {
    let config = null;
    try { config = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')); } catch (e) {}
    const historial = loadHistorial();
    const numeros = loadNumeros();
    const firmas = {};
    for (const h of historial) {
      if (h.firma && !firmas[h.firma]) {
        const d = leerFirma(h.firma);
        if (d) firmas[path.basename(h.firma)] = d;
      }
    }
    const contenido = { version: 1, fecha: new Date().toISOString(), tipo, config, historial, numeros, firmas };
    const nombre = `${tipo === 'manual' ? 'manual' : 'auto'}_${timestampBackup()}.json`;
    fs.writeFileSync(path.join(BACKUP_DIR, nombre), JSON.stringify(contenido), 'utf8');
    if (tipo !== 'manual') rotarBackups();
    return nombre;
  } catch (e) {
    console.error('Backup falló:', e.message);
    return null;
  }
}

function rotarBackups() {
  try {
    const autos = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('auto_') && f.endsWith('.json'))
      .sort();
    while (autos.length > MAX_BACKUPS_AUTO) {
      fs.unlinkSync(path.join(BACKUP_DIR, autos.shift()));
    }
  } catch (e) {}
}

function listarBackups() {
  try {
    return fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        const st = fs.statSync(path.join(BACKUP_DIR, f));
        return { nombre: f, fecha: st.mtime.toISOString(), tamano: st.size, tipo: f.startsWith('manual_') ? 'manual' : 'auto' };
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  } catch (e) {
    return [];
  }
}

function rawPrint(filePath, printerName) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', PS_PATH,
        '-PrinterName', printerName,
        '-FilePath', filePath
      ],
      { timeout: 60000, windowsHide: true },
      (err, stdout, stderr) => {
        const out = (stdout || '').trim();
        if (err) {
          reject(new Error(out || stderr || err.message));
        } else {
          resolve(out);
        }
      }
    );
  });
}

let colaImpresion = Promise.resolve();
function encolar(fn) {
  const p = colaImpresion.then(() => fn());
  colaImpresion = p.catch(() => {});
  return p;
}

function estadoImpresora() {
  return new Promise((resolve) => {
    const cfg = loadConfig();
    const nombre = String(cfg.impresora || '').replace(/'/g, "''");
    const ps =
      `$ErrorActionPreference='SilentlyContinue'; ` +
      `$r=@{}; ` +
      `$sp=(Get-Service Spooler).Status.ToString(); $r.spooler=$sp; ` +
      `$p=Get-Printer -Name '${nombre}'; ` +
      `if($p){ $r.existe=$true; $r.puerto=$p.PortName; $r.driver=$p.DriverName; ` +
      `$j=@(Get-PrintJob -PrinterName '${nombre}'); $r.trabajos=$j.Count } ` +
      `else { $r.existe=$false }; ` +
      `ConvertTo-Json $r -Compress`;
    execFile(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { timeout: 15000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, error: 'No se pudo consultar la impresora', spooler: '?' });
          return;
        }
        try {
          const j = JSON.parse(stdout || '{}');
          resolve({
            ok: !!j.existe && j.spooler === 'Running',
            nombre: cfg.impresora,
            puerto: j.puerto || '?',
            driver: j.driver || '',
            trabajos: j.trabajos || 0,
            spooler: j.spooler || '?',
            existe: !!j.existe
          });
        } catch (e) {
          resolve({ ok: false, error: 'Respuesta ilegible', spooler: '?' });
        }
      }
    );
  });
}

function enviarIndex(req, res){
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'index.html'));
}

app.get('/', enviarIndex);
app.get('/index.html', enviarIndex);

const staticOpts = { setHeaders: (res) => res.set('Cache-Control', 'no-store') };
app.use('/css', express.static(path.join(__dirname, 'css'), staticOpts));
app.use('/js', express.static(path.join(__dirname, 'js'), staticOpts));
app.use('/fonts', express.static(path.join(__dirname, 'fonts'), staticOpts));

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(loadConfig());
});

let colaConfig = Promise.resolve();
function encolarConfig(fn) {
  const p = colaConfig.then(() => fn());
  colaConfig = p.catch(() => {});
  return p;
}

app.post('/api/config', (req, res) => {
  encolarConfig(() => {
    try {
      const actual = loadConfig();
      const cfg = sanear(mergeDeep(actual, req.body || {}), actual);
      const guardado = saveConfig(cfg);
      res.json({ status: 'ok', config: guardado });
    } catch (e) {
      res.status(500).json({ status: 'error', message: e.message });
    }
  });
});

app.get('/api/historial', (req, res) => {
  res.json(loadHistorial());
});

app.get('/api/beneficiarios', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const hist = loadHistorial();
  const mapa = new Map();
  for (const h of hist) {
    if ((h.estado || 'impreso') === 'anulado') continue;
    const nom = String(h.beneficiario || '').trim();
    if (!nom) continue;
    const k = nom.toLowerCase();
    const e = mapa.get(k) || { nombre: nom, veces: 0, ultima: '' };
    e.veces++;
    const f = String(h.fecha_impre || h.fecha || '');
    if (f > e.ultima) { e.ultima = f; e.nombre = nom; }
    mapa.set(k, e);
  }
  res.json([...mapa.values()].sort((a, b) => b.veces - a.veces).slice(0, 40));
});

app.post('/api/historial/anular', (req, res) => {
  const { fecha, numero } = req.body || {};
  if (!fecha) {
    res.status(400).json({ status: 'error', message: 'Falta fecha del cheque' });
    return;
  }
  const hist = loadHistorial();
  const n = normNum(numero);
  const idx = hist.findIndex(h => String(h.fecha_impre || h.fecha) === String(fecha) && normNum(h.numero) === n);
  if (idx < 0) {
    res.status(404).json({ status: 'error', message: 'Cheque no encontrado en el historial' });
    return;
  }
  if (hist[idx].estado === 'anulado') {
    res.json({ status: 'ok', yaAnulado: true, libre: false, numero: n });
    return;
  }
  hist[idx].estado = 'anulado';
  hist[idx].fecha_anula = new Date().toISOString();
  fs.writeFileSync(HIST_PATH, JSON.stringify(hist, null, 2), 'utf8');
  let libre = false;
  if (n) {
    const usadoEnOtro = hist.some((h, i) => i !== idx && normNum(h.numero) === n && (h.estado || 'impreso') !== 'anulado');
    if (!usadoEnOtro) {
      const nums = loadNumeros();
      if (nums[n] !== undefined) {
        delete nums[n];
        fs.writeFileSync(NUM_PATH, JSON.stringify(nums, null, 2), 'utf8');
        libre = true;
      }
    }
  }
  res.json({ status: 'ok', libre, numero: n });
  auditar('anular', { fecha, numero: n, libre });
  setTimeout(() => hacerBackup('auto'), 0);
});

app.get('/api/numeros', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(loadNumeros());
});

app.get('/api/firma/:archivo', (req, res) => {
  const d = leerFirma(req.params.archivo);
  if (!d) {
    res.status(404).json({ status: 'error', message: 'Firma no encontrada' });
    return;
  }
  res.json({ dataUrl: d });
});

app.get('/api/respaldos', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(listarBackups());
});

app.post('/api/respaldos', (req, res) => {
  const nombre = hacerBackup('manual');
  if (!nombre) {
    res.status(500).json({ status: 'error', message: 'No se pudo crear el respaldo' });
    return;
  }
  res.json({ status: 'ok', nombre });
});

app.get('/api/respaldos/descargar', (req, res) => {
  const nombre = path.basename(String(req.query.nombre || ''));
  if (!/^((auto|manual)(?:_import)?_\d{4}-\d{2}-\d{2}_\d{6})\.json$/.test(nombre)) {
    res.status(400).json({ status: 'error', message: 'Nombre de respaldo inválido' });
    return;
  }
  const p = path.join(BACKUP_DIR, nombre);
  if (!fs.existsSync(p)) {
    res.status(404).json({ status: 'error', message: 'Respaldo no encontrado' });
    return;
  }
  res.download(p, nombre);
});

app.post('/api/respaldos/importar', (req, res) => {
  const contenido = req.body && req.body.contenido;
  if (!contenido || typeof contenido !== 'object' || !Array.isArray(contenido.historial)) {
    res.status(400).json({ status: 'error', message: 'El archivo no tiene estructura de respaldo (falta historial[])' });
    return;
  }
  if (contenido.historial.length > 50000) {
    res.status(400).json({ status: 'error', message: 'Historial demasiado grande' });
    return;
  }
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const marca = ts.getFullYear() + '-' + pad(ts.getMonth() + 1) + '-' + pad(ts.getDate()) + '_' +
    pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds());
  const nombre = 'manual_import_' + marca + '.json';
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.writeFileSync(path.join(BACKUP_DIR, nombre), JSON.stringify(contenido, null, 2), 'utf8');
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'No se pudo guardar el respaldo importado: ' + e.message });
    return;
  }
  res.json({ status: 'ok', nombre, cheques: contenido.historial.length });
  auditar('importar', { nombre, cheques: contenido.historial.length });
});

app.get('/api/auditoria', (req, res) => {
  res.set('Cache-Control', 'no-store');
  let n = parseInt(String(req.query.n || '30'), 10);
  if (!isFinite(n) || n < 1) n = 30;
  if (n > 200) n = 200;
  let eventos = [];
  try {
    eventos = fs.readFileSync(AUDIT_PATH, 'utf8')
      .split('\n').filter(Boolean).slice(-n).reverse()
      .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(Boolean);
  } catch (e) {}
  res.json(eventos);
});

app.post('/api/respaldos/restaurar', (req, res) => {
  const nombre = path.basename(String((req.body && req.body.nombre) || ''));
  if (!/^((auto|manual)(?:_import)?_\d{4}-\d{2}-\d{2}_\d{6})\.json$/.test(nombre)) {
    res.status(400).json({ status: 'error', message: 'Nombre de respaldo inválido' });
    return;
  }
  const p = path.join(BACKUP_DIR, nombre);
  if (!fs.existsSync(p)) {
    res.status(404).json({ status: 'error', message: 'Respaldo no encontrado' });
    return;
  }
  let contenido;
  try {
    contenido = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Respaldo ilegible' });
    return;
  }
  if (!contenido || !Array.isArray(contenido.historial)) {
    res.status(400).json({ status: 'error', message: 'Respaldo con estructura inválida' });
    return;
  }
  try {
    fs.writeFileSync(HIST_PATH, JSON.stringify(contenido.historial, null, 2), 'utf8');
    if (contenido.config) fs.writeFileSync(CFG_PATH, JSON.stringify(contenido.config, null, 2), 'utf8');
    if (contenido.numeros) fs.writeFileSync(NUM_PATH, JSON.stringify(contenido.numeros, null, 2), 'utf8');
    if (contenido.firmas && typeof contenido.firmas === 'object') {
      for (const [nom, dataUrl] of Object.entries(contenido.firmas)) {
        const base = path.basename(nom);
        if (!/^f_\d+_[a-z0-9]+\.(png|jpg)$/.test(base)) continue;
        const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
        if (m) fs.writeFileSync(path.join(FIRMAS_DIR, base), Buffer.from(m[2], 'base64'));
      }
    }
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Error al restaurar: ' + e.message });
    return;
  }
  res.json({ status: 'ok', message: `Respaldo ${nombre} restaurado` });
  auditar('restaurar', { nombre });
});

app.get('/api/impresora', async (req, res) => {
  res.json(await estadoImpresora());
});

app.post('/api/imprimir', (req, res) => {
  const { raster, cheque } = req.body || {};
  if (!raster || !raster.data || !raster.w || !raster.h || !raster.bytesPerRow) {
    res.status(400).json({ status: 'error', message: 'Faltan datos del raster' });
    return;
  }

  const numNorm = cheque ? normNum(cheque.numero) : '';
  const esReimpresion = !!(cheque && cheque.reimpresion);
  if (numNorm && !esReimpresion) {
    const usado = loadNumeros()[numNorm];
    if (usado) {
      const f = usado ? new Date(usado) : null;
      const fechaTxt = f && !isNaN(f)
        ? f.toLocaleDateString('es-PE') + ' ' + f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
        : 'fecha desconocida';
      res.status(409).json({
        status: 'error',
        message: `El N° ${numNorm} ya fue impreso el ${fechaTxt}. Usa otro número.`
      });
      return;
    }
  }

  const cfg = loadConfig();
  const data = Buffer.from(raster.data, 'base64');

  const cabecera = Buffer.from([
    0x1B, 0x40,
    0x1B, 0x63, 0x30, 0x04,
    0x1D, 0x50, cfg.dpi & 0xFF, cfg.dpi & 0xFF,
    0x1D, 0x76, 0x30, 0x00,
    raster.bytesPerRow & 0xFF, (raster.bytesPerRow >> 8) & 0xFF,
    raster.h & 0xFF, (raster.h >> 8) & 0xFF
  ]);
  const fin = Buffer.from([0x0C]);
  const job = Buffer.concat([cabecera, data, fin]);

  const archivo = path.join(TMP_DIR, `job_${Date.now()}.bin`);
  fs.writeFileSync(archivo, job);

  encolar(() => rawPrint(archivo, cfg.impresora))
    .then((out) => {
      try { fs.unlinkSync(archivo); } catch (e) {}
      if (cheque && cheque.beneficiario) {
        const ahora = new Date().toISOString();
        const fechaCheque = cheque.fechaCheque
          ? String(cheque.fechaCheque).slice(0, 10)
          : ahora.slice(0, 10);
        if (numNorm && !esReimpresion) registrarNumero(numNorm, ahora);
        let firmaRuta = '';
        if (cheque.firmaArchivo) firmaRuta = path.basename(String(cheque.firmaArchivo));
        else if (typeof cheque.firma === 'string' && cheque.firma.startsWith('data:image/')) firmaRuta = guardarFirma(cheque.firma);
        const entrada = {
          fecha_impre: ahora,
          fecha_cheque: fechaCheque,
          estado: 'impreso',
          numero: cheque.numero ?? '',
          beneficiario: cheque.beneficiario ?? '',
          monto: cheque.monto ?? '',
          letra: cheque.letra ?? '',
          concepto: cheque.concepto ?? ''
        };
        if (esReimpresion) entrada.tipo = 'reimpresion';
        if (firmaRuta) entrada.firma = 'firmas/' + firmaRuta;
        if (cheque.fuentes && typeof cheque.fuentes === 'object' && cheque.fuentes.campos) {
          entrada.fuentes = cheque.fuentes;
        }
        appendHistorial(entrada);
        auditar('imprimir', {
          numero: entrada.numero,
          beneficiario: entrada.beneficiario,
          monto: entrada.monto,
          reimpresion: !!esReimpresion
        });
        setTimeout(() => hacerBackup('auto'), 0);
      }
      res.json({ status: 'ok', message: `Enviado a ${cfg.impresora}`, detalle: out });
    })
    .catch((err) => {
      let ayuda = err.message;
      if (/OPEN_FAIL/.test(ayuda)) ayuda = `No se pudo abrir "${cfg.impresora}". Verifica que exista y no esté en cola con error.`;
      else if (/STARTDOC_FAIL/.test(ayuda)) ayuda = 'Error al iniciar el documento (spooler). Revisa la cola de impresión.';
      else if (/WRITE_FAIL/.test(ayuda)) ayuda = 'Error al enviar datos al puerto de la impresora.';
      res.status(500).json({ status: 'error', message: ayuda });
    });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    enviarIndex(req, res);
    return;
  }
  next();
});

app.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Servidor de cheques listo en http://localhost:${PUERTO}`);
  estadoImpresora().then((e) => {
    console.log('Impresora:', JSON.stringify(e));
  });
});
