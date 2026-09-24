const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

const PUERTO = 3000;
const CFG_PATH = path.join(__dirname, 'config.json');
const HIST_PATH = path.join(__dirname, 'historial.json');
const TMP_DIR = path.join(__dirname, 'tmp');
const PS_PATH = path.join(__dirname, 'raw_print.ps1');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

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

app.get('/api/impresora', async (req, res) => {
  res.json(await estadoImpresora());
});

app.post('/api/imprimir', (req, res) => {
  const { raster, cheque } = req.body || {};
  if (!raster || !raster.data || !raster.w || !raster.h || !raster.bytesPerRow) {
    res.status(400).json({ status: 'error', message: 'Faltan datos del raster' });
    return;
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
      if (cheque && cheque.beneficiario !== undefined) {
        appendHistorial({
          fecha: new Date().toISOString(),
          numero: cheque.numero ?? '',
          beneficiario: cheque.beneficiario ?? '',
          monto: cheque.monto ?? '',
          letra: cheque.letra ?? '',
          concepto: cheque.concepto ?? ''
        });
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

app.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Servidor de cheques listo en http://localhost:${PUERTO}`);
  estadoImpresora().then((e) => {
    console.log('Impresora:', JSON.stringify(e));
  });
});
