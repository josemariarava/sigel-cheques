const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = __dirname;
const PUERTO = 3100;
const B = 'http://127.0.0.1:' + PUERTO;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sigel_test_'));

const ENTRADA = {
  fecha_impre: '2026-09-24T10:00:00.000Z',
  fecha_cheque: '2026-09-24',
  estado: 'impreso',
  numero: '777',
  beneficiario: 'Beneficiario Test',
  monto: 'S/ 150.00',
  letra: 'ciento cincuenta y 00/100 soles',
  concepto: 'Test API'
};

let total = 0, errores = 0;
function ok(cond, nombre, extra){
  total++;
  if (cond) console.log('  ok  - ' + nombre);
  else { errores++; console.log('FALLO - ' + nombre + (extra ? '   [' + extra + ']' : '')); }
}

async function get(u, opts){
  const r = await fetch(B + u, opts);
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}
async function post(u, body, opts){
  const r = await fetch(B + u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(opts || {})
  });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j };
}

async function main(){
  fs.writeFileSync(path.join(DIR, 'historial.json'), JSON.stringify([ENTRADA], null, 2));
  fs.writeFileSync(path.join(DIR, 'numeros_usados.json'), JSON.stringify({
    '777': ENTRADA.fecha_impre,
    '888': '2026-09-20T09:00:00.000Z'
  }));
  fs.mkdirSync(path.join(DIR, 'backups'), { recursive: true });

  const child = spawn(process.execPath, [path.join(BASE, 'server.js')], {
    cwd: BASE,
    env: { ...process.env, PUERTO: String(PUERTO), SIGEL_DATA_DIR: DIR },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });

  try {
    let arranco = false;
    for (let i = 0; i < 60; i++){
      try {
        const r = await fetch(B + '/api/config');
        if (r.ok){ arranco = true; break; }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 200));
    }
    if (!arranco){
      console.log('No arrancó el servidor de prueba. Log:\n' + log);
      process.exitCode = 1;
      return;
    }

    console.log('-- config / origen --');
    let x = await get('/api/config');
    ok(x.s === 200 && x.j && x.j.impresora, 'GET /api/config -> 200 con impresora');
    x = await get('/api/config', { headers: { Origin: 'http://evil.example' } });
    ok(x.s === 403, 'Origin desconocido -> 403');

    console.log('-- historial / beneficiarios / numeros --');
    x = await get('/api/historial');
    ok(x.s === 200 && Array.isArray(x.j) && x.j.length === 1, 'GET /api/historial -> 1 entrada', 'n=' + (x.j && x.j.length));
    x = await get('/api/beneficiarios');
    ok(x.s === 200 && Array.isArray(x.j) && x.j.length === 1 && x.j[0].nombre === 'Beneficiario Test',
      'GET /api/beneficiarios deriva del historial', JSON.stringify(x.j));
    x = await get('/api/numeros');
    ok(x.s === 200 && x.j && x.j['777'], 'GET /api/numeros contiene 777');

    console.log('-- impresion --');
    x = await post('/api/imprimir', {});
    ok(x.s === 400, 'imprimir sin raster -> 400');
    x = await post('/api/imprimir', {
      raster: { data: 'AAAA', w: 10, h: 10, bytesPerRow: 4 },
      cheque: { numero: '777', beneficiario: 'Repetido', monto: 'S/ 1.00' }
    });
    ok(x.s === 409, 'numero ya usado -> 409 (sin tocar la impresora)', 'fue ' + x.s + ' ' + JSON.stringify(x.j));

    console.log('-- anular --');
    x = await post('/api/historial/anular', {});
    ok(x.s === 400, 'anular sin fecha -> 400');
    x = await post('/api/historial/anular', { fecha: '1999-01-01', numero: '999' });
    ok(x.s === 404, 'anular inexistente -> 404');
    x = await post('/api/historial/anular', { fecha: ENTRADA.fecha_impre, numero: '777' });
    ok(x.s === 200 && x.j && x.j.libre === true, 'anular con exito libera el numero', JSON.stringify(x.j));
    let h = await get('/api/historial');
    ok(h.s === 200 && h.j[0] && h.j[0].estado === 'anulado', 'historial refleja anulado');

    console.log('-- respaldos --');
    x = await post('/api/respaldos', {});
    ok(x.s === 200 && x.j && x.j.nombre, 'crear respaldo manual', JSON.stringify(x.j));
    const nomResp = x.j.nombre;
    const l = await get('/api/respaldos');
    ok(l.s === 200 && Array.isArray(l.j) && l.j.some(b => b.nombre === nomResp), 'listar incluye el manual');
    let d = await fetch(B + '/api/respaldos/descargar?nombre=' + encodeURIComponent(nomResp));
    ok(d.status === 200 && (d.headers.get('content-disposition') || '').includes(nomResp), 'descargar -> 200 + attachment');
    const cuerpo = await d.text();
    let jsonOk = false;
    try { jsonOk = !!JSON.parse(cuerpo).historial; } catch (e) {}
    ok(jsonOk, 'la descarga es JSON con historial');
    d = await fetch(B + '/api/respaldos/descargar?nombre=..%2F..%2Fconfig.json');
    ok(d.status === 400, 'descargar con path injection -> 400', 'fue ' + d.status);

    console.log('-- restaurar --');
    x = await post('/api/respaldos/restaurar', { nombre: 'no_valido.json' });
    ok(x.s === 400, 'restaurar nombre invalido -> 400');
    x = await post('/api/respaldos/restaurar', { nombre: 'manual_2099-01-01_000000.json' });
    ok(x.s === 404, 'restaurar inexistente -> 404');
    fs.writeFileSync(path.join(DIR, 'backups', 'manual_2000-01-01_000000.json'),
      JSON.stringify({ historial: [ENTRADA], numeros: {} }, null, 2));
    x = await post('/api/respaldos/restaurar', { nombre: 'manual_2000-01-01_000000.json' });
    ok(x.s === 200, 'restaurar con exito -> 200', JSON.stringify(x.j));
    h = await get('/api/historial');
    ok(h.j && h.j.length === 1 && h.j[0].estado === 'impreso', 'restaurar reemplaza el historial');

    console.log('-- importar --');
    x = await post('/api/respaldos/importar', { contenido: {} });
    ok(x.s === 400, 'importar estructura invalida -> 400');
    x = await post('/api/respaldos/importar', { contenido: { historial: [ENTRADA, ENTRADA] } });
    ok(x.s === 200 && x.j && /^manual_import_/.test(x.j.nombre), 'importar valido -> 200', JSON.stringify(x.j));
    const nomImp = x.j.nombre;
    const l2 = await get('/api/respaldos');
    ok(l2.j && l2.j.some(b => b.nombre === nomImp), 'el importado aparece en la lista');

    console.log('-- auditoria --');
    x = await get('/api/auditoria?n=50');
    ok(x.s === 200 && Array.isArray(x.j) && x.j.length >= 3, 'GET /api/auditoria tiene eventos', 'n=' + (x.j && x.j.length));
    const accs = (x.j || []).map(e => e.accion);
    ok(accs.includes('anular') && accs.includes('restaurar') && accs.includes('importar'),
      'auditoria registra anular + restaurar + importar', accs.join(','));

    console.log('-- impresora / config --');
    x = await get('/api/impresora');
    ok(x.s === 200 && x.j && typeof x.j.ok === 'boolean', 'GET /api/impresora responde');
    x = await post('/api/config', { fuente_mm: 5 });
    ok(x.s === 200 && x.j && x.j.config && x.j.config.fuente_mm === 5, 'POST /api/config actualiza');
  } finally {
    child.kill();
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n===== test_api: ' + (total - errores) + '/' + total + ' OK =====');
  if (errores) { console.log('FALLARON ' + errores); process.exitCode = 1; }
}

main().catch(e => { console.error('ERROR FATAL:', e); try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (_) {} process.exit(1); });
