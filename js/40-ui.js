function datosFormulario(){
  const cfg = state.cfg || { cuenta:{}, simboloMoneda:'S/', moneda:'SOLES', imprimirCuenta:false, posiciones:{}, cheque:{largo_mm:700,ancho_mm:70} };
  const monto = parseFloat($('fMonto').value) || 0;
  const letra = state.letraManual ? $('fLetra').value.trim() : numeroALetras(monto);
  return {
    fechaText: fechaLarga($('fFecha').value, cfg.cuenta.ciudad, cfg.fechaFormato),
    numeroText: 'N° ' + $('fNumero').value.trim(),
    beneficiario: $('fBenef').value.trim(),
    montoText: (cfg.simboloMoneda || 'S/') + ' ' + fmtMonto(monto),
    letraText: letra,
    concepto: $('fConcepto').value.trim(),
    cuentaText: (cfg.imprimirCuenta && cfg.cuenta.numero) ? 'CTA. ' + cfg.cuenta.numero : '',
    firma: padFirma.hayTinta() ? padFirma.canvas.toDataURL() : null
  };
}

async function refrescarPreview(){
  if (!state.cfg) return;
  try {
    const cfg = state.cfg;
    const k = Math.max(0.4, Math.min(4, 30000 / Math.max(1, cfg.cheque.largo_mm)));
    const pv = $('preview');
    const data = datosFormulario();
    data.firmaImg = data.firma ? await cargarImg(data.firma) : null;
    const comoImprime = !!( $('chkComoImprime') && $('chkComoImprime').checked );
    state.comoImprime = comoImprime;
    let bounds;
    if (!comoImprime){
      state.destL = cfg.cheque.largo_mm;
      state.destA = cfg.cheque.ancho_mm;
      pv.width = Math.round(cfg.cheque.largo_mm * k);
      pv.height = Math.round(cfg.cheque.ancho_mm * k);
      aplicarZoom();
      const ctx = pv.getContext('2d');
      bounds = await renderContenido(ctx, cfg, data, k);
      state.bounds = bounds;
      if ($('chkGuias').checked) renderGuias(ctx, cfg, bounds, k);
    } else {
      const d = dimsDestino(cfg);
      state.destL = d.destL;
      state.destA = d.destA;
      const nat = document.createElement('canvas');
      nat.width = Math.round(cfg.cheque.largo_mm * k);
      nat.height = Math.round(cfg.cheque.ancho_mm * k);
      const nctx = nat.getContext('2d');
      bounds = await renderContenido(nctx, cfg, data, k);
      state.bounds = bounds;
      if ($('chkGuias').checked) renderGuias(nctx, cfg, bounds, k);
      let fin = rotarCanvas(nat, cfg.orient);
      fin = aplicarOffset(fin, cfg, k);
      pv.width = fin.width;
      pv.height = fin.height;
      aplicarZoom();
      const ctx = pv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, pv.width, pv.height);
      ctx.drawImage(fin, 0, 0);
    }
    pintarPosGrid();
    const fechaChip = $('fFechaLarga').firstElementChild;
    fechaChip.textContent = data.fechaText || 'línea de fecha';
    const info = $('pvInfo');
    if (info){
      const reg = regionImprimibleNatural(cfg);
      const L = cfg.cheque.largo_mm;
  const margenFin = isFinite(cfg.margenDerecha_mm) ? cfg.margenDerecha_mm : 0;
      const cortados = bounds.filter(b => b.recortado).map(b => NOMBRES_CAMPO[b.key] || b.key);
      let extra = '';
      if (reg.recortado) extra = ' · ⚠ recorta en ' + reg.maxW + ' mm (destino ' + Math.round(reg.destW) + ' mm)';
      if (cortados.length) extra += ' · ⚠ texto cortado en el final: ' + cortados.join(', ');
      info.textContent = 'Cheque ' + cfg.cheque.largo_mm + ' × ' + cfg.cheque.ancho_mm +
        ' mm · fuente ' + cfg.fuente_mm + ' mm · orientación ' + cfg.orient + '° · campos: ' + bounds.length +
        (comoImprime ? ' · vista COMO IMPRIME' : '') +
        (margenFin > 0 ? ' · fin texto ' + (L - margenFin) + ' mm' : '') + extra;
    }
  } catch(e){
    console.error('refrescarPreview', e);
    toast('Error en la vista previa: ' + e.message, true);
    const pv = $('preview');
    if (pv){
      if (pv.width < 400) pv.width = 640;
      if (pv.height < 80) pv.height = 200;
      const ctx = pv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pv.width, pv.height);
      ctx.fillStyle = '#c62828';
      ctx.font = '14px sans-serif';
      ctx.fillText('Error de vista previa: ' + e.message, 10, 30);
    }
  }
}

function crearPad(canvas, btnImg, btnClr, inputFile, btnUndo){
  const ctx = canvas.getContext('2d');
  const pad = { canvas, tinta:false, hayTinta: () => pad.tinta, limpiar, toDataURL: () => canvas.toDataURL() };
  const pasos = [];
  function fondo(){
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    pad.tinta = false;
  }
  function snap(){
    try { pasos.push({ d: canvas.toDataURL(), t: pad.tinta }); } catch (e) {}
    if (pasos.length > 40) pasos.shift();
    refrescarUndo();
  }
  function refrescarUndo(){
    if (btnUndo) btnUndo.disabled = pasos.length < 2;
  }
  function deshacer(){
    if (pasos.length < 2) return;
    pasos.pop();
    const paso = pasos[pasos.length - 1];
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      pad.tinta = !!paso.t;
      refrescarPreview();
      refrescarUndo();
    };
    img.src = paso.d;
  }
  function limpiar(){ fondo(); snap(); }
  fondo();
  snap();
  let dib = false;
  function pos(e){
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  }
  canvas.addEventListener('pointerdown', (e) => {
    dib = true;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.strokeStyle = '#101418';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dib) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    pad.tinta = true;
  });
  canvas.addEventListener('pointerup', () => { if (dib){ dib = false; snap(); refrescarPreview(); } });
  btnClr.addEventListener('click', () => { limpiar(); refrescarPreview(); });
  btnImg.addEventListener('click', () => inputFile.click());
  if (btnUndo) btnUndo.addEventListener('click', deshacer);
  inputFile.addEventListener('change', () => {
    const f = inputFile.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      limpiar();
      const padM = 12;
      const esc = Math.min((canvas.width - padM*2)/img.width, (canvas.height - padM*2)/img.height);
      ctx.drawImage(img, padM, padM, img.width*esc, img.height*esc);
      pad.tinta = true;
      URL.revokeObjectURL(url);
      inputFile.value = '';
      snap();
      refrescarPreview();
    };
    img.src = url;
  });
  return pad;
}
let colaGuardar = Promise.resolve();
async function guardarConfig(parcial){
  const body = { ...parcial };
  if (!body.posiciones && state.cfg && state.cfg.posiciones) body.posiciones = state.cfg.posiciones;
  if (!body.camposVisibles && state.cfg && state.cfg.camposVisibles) body.camposVisibles = state.cfg.camposVisibles;
  const tarea = colaGuardar.then(async () => {
    try {
      const resp = await fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      const j = await resp.json();
      if (!resp.ok || j.status === 'error') throw new Error(j.message || 'HTTP ' + resp.status);
      if (j.config){
        if (body.posiciones) j.config.posiciones = body.posiciones;
        if (body.camposVisibles) j.config.camposVisibles = body.camposVisibles;
        state.cfg = j.config;
      }
      return j;
    } catch (e) {
      toast('No se pudo guardar: ' + e.message, true);
      throw e;
    }
  });
  colaGuardar = tarea.catch(() => {});
  return tarea;
}

function marcarSiguienteUsado(num){
  const n = parseInt(num, 10);
  if (!isNaN(n) && n >= state.cfg.siguiente_numero){
    state.cfg.siguiente_numero = n + 1;
    guardarConfig({ siguiente_numero: state.cfg.siguiente_numero });
    $('fNumero').value = String(state.cfg.siguiente_numero);
    $('lPrimero').value = String(state.cfg.siguiente_numero);
    $('ajSiguiente').value = String(state.cfg.siguiente_numero);
  }
}

function normNum(n){
  return String(n == null ? '' : n).replace(/^N°\s*/i, '').trim();
}

function numeroUsado(n){
  const k = normNum(n);
  return !!(k && state.numerosUsados[k]);
}

function fuentesSnapshot(cfg){
  const campos = {};
  const pos = (cfg && cfg.posiciones) || {};
  for (const k of Object.keys(pos)){
    const f = pos[k] && pos[k].fuente_mm;
    campos[k] = isFinite(f) ? f : 0;
  }
  return { global: (cfg && isFinite(cfg.fuente_mm) && cfg.fuente_mm > 0) ? cfg.fuente_mm : 4, campos };
}

function restaurarFuentes(fuentes){
  if (!fuentes || typeof fuentes !== 'object' || !state.cfg) return false;
  const cfg = state.cfg;
  let cambio = false;
  if (isFinite(fuentes.global) && fuentes.global > 0 && fuentes.global !== cfg.fuente_mm){
    cfg.fuente_mm = fuentes.global;
    cambio = true;
  }
  if (fuentes.campos && typeof fuentes.campos === 'object'){
    cfg.posiciones = cfg.posiciones || {};
    for (const k of Object.keys(fuentes.campos)){
      if (!cfg.posiciones[k]) continue;
      const v = fuentes.campos[k];
      const val = (isFinite(v) && v >= 0) ? v : 0;
      if (cfg.posiciones[k].fuente_mm !== val){
        cfg.posiciones[k].fuente_mm = val;
        cambio = true;
      }
    }
  }
  return cambio;
}

async function aplicarFuentesCheque(h, conToast){
  if (!h || !h.fuentes || typeof h.fuentes !== 'object') return false;
  const cambio = restaurarFuentes(h.fuentes);
  if (cambio){
    await guardarConfig({ fuente_mm: state.cfg.fuente_mm, posiciones: state.cfg.posiciones });
    if ($('calFuente')) $('calFuente').value = state.cfg.fuente_mm;
    if (typeof pintarPosGrid === 'function') pintarPosGrid();
    if (typeof mostrarSel === 'function') mostrarSel();
  }
  refrescarPreview();
  if (conToast !== false) toast('Letras del momento de imprimir restauradas ✓');
  return true;
}

function pedirConfirmacion(texto){
  return new Promise((resolve) => {
    const m = $('modalConfirma');
    $('cfTexto').textContent = texto;
    m.classList.remove('oculto');
    function fin(ok){
      m.classList.add('oculto');
      $('cfAceptar').onclick = null;
      $('cfCancelar').onclick = null;
      resolve(ok);
    }
    $('cfAceptar').onclick = () => fin(true);
    $('cfCancelar').onclick = () => fin(false);
  });
}

const CLAVE_BORRADOR = 'cheque_borrador';
function datosBorrador(){
  return {
    numero: $('fNumero').value, fecha: $('fFecha').value,
    benef: $('fBenef').value, monto: $('fMonto').value,
    letra: $('fLetra').value, concepto: $('fConcepto').value
  };
}
function guardarBorrador(inmediato){
  clearTimeout(state.borradorTimer);
  const guardar = () => {
    try {
      const d = datosBorrador();
      const vacio = !(d.benef || '').trim() && !d.monto && !(d.letra || '').trim() && !(d.concepto || '').trim();
      if (vacio) localStorage.removeItem(CLAVE_BORRADOR);
      else localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ ...d, ts: Date.now() }));
    } catch (e) {}
  };
  if (inmediato) guardar();
  else state.borradorTimer = setTimeout(guardar, 400);
}
function restaurarBorrador(){
  try {
    const b = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null');
    if (!b) return false;
    const hay = (b.benef || '').trim() || b.monto || (b.letra || '').trim() || (b.concepto || '').trim();
    if (!hay) return false;
    if (b.numero) $('fNumero').value = b.numero;
    if (b.fecha) $('fFecha').value = b.fecha;
    $('fBenef').value = b.benef || '';
    $('fMonto').value = b.monto || '';
    $('fLetra').value = b.letra || '';
    $('fConcepto').value = b.concepto || '';
    if (b.letra) state.letraManual = true;
    return true;
  } catch (e) { return false; }
}

async function cargarBeneficiarios(){
  try {
    const r = await fetch('/api/beneficiarios');
    const lista = await r.json();
    if (!Array.isArray(lista)) return;
    state.beneficiarios = lista;
    const dl = $('dlBenef');
    if (dl) dl.innerHTML = lista.map(b =>
      '<option value="' + escHtml(b.nombre) + '">' + b.veces + '× · ' + escHtml(String(b.ultima || '').slice(0, 10)) + '</option>'
    ).join('');
  } catch (e) {}
}

function pintarConceptosChips(){
  const cont = $('conceptosChips');
  if (!cont) return;
  const cuenta = new Map();
  for (const h of (state.historial || [])){
    if (estadoDe(h) === 'anulado') continue;
    const c = String(h.concepto || '').trim();
    if (!c) continue;
    cuenta.set(c, (cuenta.get(c) || 0) + 1);
  }
  const top = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!top.length){ cont.innerHTML = ''; cont.style.display = 'none'; return; }
  cont.style.display = '';
  cont.innerHTML = '<span class="ayuda m-0 self-center">Frecuentes:</span>' +
    top.map(([c]) => '<button type="button" class="chip" data-conc="' + escHtml(c) + '">' + escHtml(c) + '</button>').join('');
  cont.querySelectorAll('[data-conc]').forEach(b => {
    b.addEventListener('click', () => {
      $('fConcepto').value = b.dataset.conc || '';
      refrescarPreview();
      guardarBorrador(true);
    });
  });
}

function limpiarFormularioCheque(){
  $('fBenef').value = '';
  $('fMonto').value = '';
  $('fLetra').value = '';
  $('fConcepto').value = '';
  state.letraManual = false;
  if (padFirma) padFirma.limpiar();
  guardarBorrador(true);
}

$('btnImprimir').addEventListener('click', async () => {
  const data = datosFormulario();
  if (!data.beneficiario){ toast('Escribe el beneficiario', true); return; }
  const monto = parseFloat($('fMonto').value) || 0;
  if (monto <= 0){ toast('Escribe un monto mayor a cero', true); return; }
  const num = $('fNumero').value.trim();
  if (num && numeroUsado(num)){
    const f = new Date(state.numerosUsados[normNum(num)]);
    const fechaTxt = isNaN(f) ? '' : f.toLocaleDateString('es-PE') + ' ' + f.toLocaleTimeString('es-PE', {hour:'2-digit',minute:'2-digit'});
    toast('El N° ' + normNum(num) + ' ya fue impreso' + (fechaTxt ? ' el ' + fechaTxt : '') + '. Usa otro número.', true);
    return;
  }
  const dup = (state.historial || []).find(h => {
    if (estadoDe(h) === 'anulado' || h.tipo === 'reimpresion') return false;
    if (String(h.beneficiario || '').trim().toLowerCase() !== data.beneficiario.trim().toLowerCase()) return false;
    if (Math.abs(montoNum(h.monto) - monto) > 0.01) return false;
    const t = new Date(h.fecha_impre || h.fecha || 0).getTime();
    return isFinite(t) && t <= Date.now() && (Date.now() - t) <= 7 * 86400000;
  });
  let msg = (num ? 'N° ' + normNum(num) + ' — ' : '') + '¿Imprimir ' + data.montoText + ' a ' + data.beneficiario + '?';
  if (dup){
    const fd = new Date(dup.fecha_impre || dup.fecha);
    const fdTxt = isNaN(fd) ? '' : ' el ' + fd.toLocaleDateString('es-PE');
    msg += '\n⚠ Aviso: ya se imprimió el mismo monto a este beneficiario' + fdTxt +
      (dup.numero ? ' (N° ' + normNum(dup.numero) + ')' : '') + '. ¿Continuar de todos modos?';
  }
  const ok = await pedirConfirmacion(msg);
  if (!ok) return;
  $('btnImprimir').disabled = true;
  try {
    await imprimirCheque(data, {
      numero: num,
      fechaCheque: $('fFecha').value,
      beneficiario: data.beneficiario,
      monto: data.montoText,
      letra: data.letraText,
      concepto: data.concepto,
      firma: data.firma || null,
      fuentes: fuentesSnapshot(state.cfg)
    });
    if (num) state.numerosUsados[normNum(num)] = new Date().toISOString();
    toast('Cheque enviado a la impresora ✓');
    marcarSiguienteUsado(num);
    limpiarFormularioCheque();
    refrescarPreview();
    refrescarEstado();
    cargarHistorial();
  } catch(e){
    toast(e.message, true);
  } finally {
    $('btnImprimir').disabled = false;
  }
});

$('btnGrilla').addEventListener('click', async () => {
  $('btnGrilla').disabled = true;
  try {
    const cfg = state.cfg;
    const k = cfg.dpi / 25.4;
    const nat = document.createElement('canvas');
    nat.width = Math.round(cfg.cheque.largo_mm * k);
    nat.height = Math.round(cfg.cheque.ancho_mm * k);
    dibujarGrilla(nat.getContext('2d'), cfg, k);
    const rot = rotarCanvas(nat, cfg.orient);
    const fin = aplicarOffset(rot, cfg, k);
    await enviarImpresion(empaquetar(fin), null);
    toast('Grilla enviada ✓ — compara con la regla');
  } catch(e){ toast(e.message, true); }
  finally { $('btnGrilla').disabled = false; }
});

$('btnAvance').addEventListener('click', async () => {
  $('btnAvance').disabled = true;
  try {
    const cfg = state.cfg;
    const k = cfg.dpi / 25.4;
    const L = cfg.cheque.largo_mm, A = cfg.cheque.ancho_mm;
    const nat = document.createElement('canvas');
    nat.width = Math.round(L * k);
    nat.height = Math.round(A * k);
    dibujarTestAvance(nat.getContext('2d'), cfg, k);
    const rot = rotarCanvas(nat, cfg.orient);
    const fin = aplicarOffset(rot, cfg, k);
    await enviarImpresion(empaquetar(fin), null);
    toast('Test de avance enviado ✓ — FIN debe caer en el borde del papel');
  } catch(e){ toast(e.message, true); }
  finally { $('btnAvance').disabled = false; }
});
function actualizarLabelsAvance(){
  const o = state.cfg && state.cfg.orient;
  const feedEsLargo = ejesSegunOrient(o).feedEsLargo;
  const elL = $('lblLargo'), elA = $('lblAncho'), ay = $('ayudaAvance');
  if (!elL) return;
  if (feedEsLargo){
    elL.textContent = 'Largo (mm) — EJE DE AVANCE (hacia donde jala el cheque)';
    elA.textContent = 'Ancho (mm) — ancho de la cabeza (~80 mm máx.)';
  } else {
    elL.textContent = 'Largo (mm) — ancho de la cabeza (~80 mm máx.)';
    elA.textContent = 'Ancho (mm) — EJE DE AVANCE (hacia donde jala el cheque)';
  }
  const cfg = state.cfg;
  if (ay && cfg){
    const d = dimsDestino(cfg);
    ay.textContent = 'Con orientación ' + cfg.orient + '°: el papel se imprime ' +
      d.destL + ' × ' + d.destA + ' mm (ancho × avance). ' +
      'Si sobra hueco al FINAL del cheque al salir, aumenta el eje de avance (' +
      (feedEsLargo ? 'Largo' : 'Ancho') + ') hasta igualar la longitud real del papel.';
  }
}
$('btnPrueba').addEventListener('click', async () => {
  $('btnPrueba').disabled = true;
  try {
    const cfg = state.cfg;
    const data = {
      fechaText: fechaLarga(new Date().toISOString().slice(0,10), cfg.cuenta.ciudad, cfg.fechaFormato),
      numeroText: 'N° ' + cfg.siguiente_numero,
      beneficiario: 'CHEQUE DE PRUEBA',
      montoText: (cfg.simboloMoneda || 'S/') + ' 1,500.00',
      letraText: 'MIL QUINIENTOS CON 00/100 ' + (cfg.moneda || 'SOLES'),
      concepto: 'CALIBRACION',
      cuentaText: cfg.imprimirCuenta && cfg.cuenta.numero ? 'CTA. ' + cfg.cuenta.numero : '',
      firma: null
    };
    await imprimirCheque(data, null);
    toast('Cheque de prueba enviado ✓');
  } catch(e){ toast(e.message, true); }
  finally { $('btnPrueba').disabled = false; }
});

function posToMm(e){
  const pv = $('preview');
  const r = pv.getBoundingClientRect();
  const cfg = state.cfg;
  const destL = state.destL || cfg.cheque.largo_mm;
  const destA = state.destA || cfg.cheque.ancho_mm;
  const dx = (e.clientX - r.left) / r.width * destL;
  const dy = (e.clientY - r.top) / r.height * destA;
  if (state.comoImprime) return destANatural(cfg, dx, dy);
  return { x: dx, y: dy };
}

function radioHitMm(){
  const r = $('preview').getBoundingClientRect();
  const cfg = state.cfg;
  if (!cfg || !r.width) return 3;
  const destL = state.destL || cfg.cheque.largo_mm;
  const pxPorMm = r.width / Math.max(1, destL);
  return Math.max(1.5, 7 / Math.max(0.01, pxPorMm));
}

function buscarCampo(p){
  const rad = radioHitMm();
  return [...state.bounds].reverse().find(b =>
    p.x >= b.x - rad && p.x <= b.x + b.w + rad &&
    p.y >= b.y - rad && p.y <= b.y + b.h + rad) || null;
}

function aplicarZoom(){
  const pv = $('preview');
  const sc = $('previewScroll');
  if (!pv || !sc) return;
  if (!state.fitW) fijarFit();
  const z = state.zoom;
  const w = Math.max(80, Math.round(state.fitW * z));
  pv.style.width = w + 'px';
  pv.style.height = 'auto';
  const pct = $('zoomPct');
  if (pct) pct.textContent = Math.round(z * 100) + '%';
}

function fijarFit(){
  const sc = $('previewScroll');
  if (!sc) return;
  state.fitW = Math.max(120, sc.clientWidth);
}

function setZoom(z, puntoCanvas){
  const sc = $('previewScroll');
  const pv = $('preview');
  if (!sc || !pv) return;
  if (!state.fitW) fijarFit();
  const z0 = state.zoom;
  const z1 = Math.min(4, Math.max(0.4, Math.round(z * 100) / 100));
  if (z1 === z0) return;
  const r = pv.getBoundingClientRect();
  const cr = sc.getBoundingClientRect();
  const ox = r.left - cr.left;
  const oy = r.top - cr.top;
  const cx = puntoCanvas ? puntoCanvas.x : (ox + r.width / 2);
  const cy = puntoCanvas ? puntoCanvas.y : (oy + r.height / 2);
  const fracX = r.width ? (cx + sc.scrollLeft - ox) / r.width : 0.5;
  const fracY = r.height ? (cy + sc.scrollTop - oy) / r.height : 0.5;
  state.zoom = z1;
  aplicarZoom();
  const r2 = pv.getBoundingClientRect();
  sc.scrollLeft = Math.max(0, ox2(r2, cr) + fracX * r2.width - cx);
  sc.scrollTop = Math.max(0, oy2(r2, cr) + fracY * r2.height - cy);
}
function ox2(r, cr){ return r.left - cr.left; }
function oy2(r, cr){ return r.top - cr.top; }

function zoomFit(){
  state.zoom = 1;
  fijarFit();
  aplicarZoom();
  const sc = $('previewScroll');
  if (sc){ sc.scrollLeft = 0; sc.scrollTop = 0; }
}

function guardarPosDebounced(){
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    if (!state.cfg) return;
    await guardarConfig({ posiciones: state.cfg.posiciones });
    toast('Posición guardada');
  }, 350);
}

$('preview').addEventListener('pointerdown', (e) => {
  const p = posToMm(e);
  const hit = buscarCampo(p);
  if (!hit){ state.sel = null; mostrarSel(); refrescarPreview(); return; }
  state.dragging = hit.key;
  const pos = state.cfg.posiciones[hit.key];
  state.grab = { x: p.x - pos.x, y: p.y - pos.y };
  $('preview').classList.add('arrastrando');
  $('preview').setPointerCapture(e.pointerId);
  state.sel = hit.key;
  mostrarSel();
  refrescarPreview();
});
$('preview').addEventListener('pointermove', (e) => {
  if (!state.dragging) return;
  const p = posToMm(e);
  const cfg = state.cfg;
  const pos = cfg.posiciones[state.dragging];
  pos.x = Math.round(Math.min(cfg.cheque.largo_mm, Math.max(0, p.x - state.grab.x)) * 2) / 2;
  pos.y = Math.round(Math.min(cfg.cheque.ancho_mm - 5, Math.max(0, p.y - state.grab.y)) * 2) / 2;
  refrescarPreview();
  mostrarSel();
});
$('preview').addEventListener('pointerup', async () => {
  if (!state.dragging) return;
  state.dragging = null;
  $('preview').classList.remove('arrastrando');
  await guardarConfig({ posiciones: state.cfg.posiciones });
  toast('Posición guardada');
});
$('preview').addEventListener('dblclick', (e) => {
  const p = posToMm(e);
  const hit = buscarCampo(p);
  if (!hit) return;
  state.sel = hit.key;
  mostrarSel();
  const sc = $('previewScroll');
  const r = $('preview').getBoundingClientRect();
  const cr = sc.getBoundingClientRect();
  const px = (r.left - cr.left) + (p.x / state.cfg.cheque.largo_mm) * r.width;
  const py = (r.top - cr.top) + (p.y / state.cfg.cheque.ancho_mm) * r.height;
  setZoom(Math.min(4, (state.zoom || 1) * 1.8), { x: px - (r.left - cr.left), y: py - (r.top - cr.top) });
  const r2 = $('preview').getBoundingClientRect();
  sc.scrollLeft = Math.max(0, (r2.left - cr.left) + (p.x / state.cfg.cheque.largo_mm) * r2.width - sc.clientWidth / 2);
  sc.scrollTop = Math.max(0, (r2.top - cr.top) + (p.y / state.cfg.cheque.ancho_mm) * r2.height - sc.clientHeight / 2);
  refrescarPreview();
});
$('preview').addEventListener('wheel', (e) => {
  e.preventDefault();
  const dir = e.deltaY > 0 ? 1/1.15 : 1.15;
  const r = e.currentTarget.getBoundingClientRect();
  setZoom((state.zoom || 1) * dir, { x: e.clientX - r.left, y: e.clientY - r.top });
}, { passive: false });
$('btnZoomIn').addEventListener('click', () => setZoom((state.zoom || 1) * 1.25));
$('btnZoomOut').addEventListener('click', () => setZoom((state.zoom || 1) / 1.25));
$('btnZoomFit').addEventListener('click', zoomFit);
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey){
    const k = (e.key || '').toLowerCase();
    if (k === 'p'){ e.preventDefault(); activarTab('nuevo'); $('btnImprimir').click(); return; }
    if (k === 'f'){ e.preventDefault(); activarTab('hist'); setTimeout(() => $('histBuscar').focus(), 60); return; }
  }
  if (!state.sel || !state.cfg) return;
  const tag = (e.target && e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  const paso = e.shiftKey ? 5 : (e.altKey ? 0.5 : 1);
  const pos = state.cfg.posiciones[state.sel];
  if (!pos) return;
  let movio = false;
  if (e.key === 'ArrowLeft'){ pos.x = Math.max(0, pos.x - paso); movio = true; }
  else if (e.key === 'ArrowRight'){ pos.x = Math.min(state.cfg.cheque.largo_mm, pos.x + paso); movio = true; }
  else if (e.key === 'ArrowUp'){ pos.y = Math.max(0, pos.y - paso); movio = true; }
  else if (e.key === 'ArrowDown'){ pos.y = Math.min(state.cfg.cheque.ancho_mm - 5, pos.y + paso); movio = true; }
  else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_'){
    if (state.sel === 'firma') return;
    const base = fuenteCampoMM(state.cfg, pos);
    const pasoF = e.shiftKey ? 0.5 : 0.1;
    const dir = (e.key === '-' || e.key === '_') ? -1 : 1;
    const nf = Math.min(8, Math.max(1, Math.round((base + dir * pasoF) * 10) / 10));
    pos.fuente_mm = nf;
    e.preventDefault();
    refrescarPreview();
    mostrarSel();
    pintarPosGrid();
    guardarPosDebounced();
    return;
  }
  if (movio){
    e.preventDefault();
    refrescarPreview();
    mostrarSel();
    guardarPosDebounced();
  }
});
window.addEventListener('resize', () => {
  fijarFit();
  aplicarZoom();
});
function mostrarSel(){
  if (!state.sel){ $('selInfo').textContent = ''; return; }
  const p = state.cfg.posiciones[state.sel];
  const f = fuenteCampoMM(state.cfg, p);
  const personal = (p.fuente_mm >= 1 && p.fuente_mm <= 8) ? String(p.fuente_mm) : 'global ' + state.cfg.fuente_mm;
  $('selInfo').textContent = NOMBRES_CAMPO[state.sel] + ': X=' + p.x + ' mm, Y=' + p.y + ' mm · letra ' + f + ' mm (' + personal + ')';
}
$('chkGuias').addEventListener('change', refrescarPreview);
if ($('chkComoImprime')) $('chkComoImprime').addEventListener('change', refrescarPreview);

function pintarPosGrid(){
  const cont = $('posGrid');
  cont.innerHTML = '';
  const vis = (state.cfg.camposVisibles || {});
  for (const key of CAMPOS){
    const pos = state.cfg.posiciones[key];
    if (!pos) continue;
    if (key === 'firma') continue;
    const oculto = vis[key] === false;
    const fVal = (pos.fuente_mm >= 1 && pos.fuente_mm <= 8) ? pos.fuente_mm : '';
    const div = document.createElement('div');
    div.className = 'text-xs border border-[#e5e5e5] rounded-md p-[6px_8px] ' + (oculto ? 'bg-[#f0f0f0] opacity-55' : 'bg-[#f9f9f9]');
    div.innerHTML = '<b class="text-[#0067c0]">' + NOMBRES_CAMPO[key] + '</b> <label class="float-right font-normal cursor-pointer"><input type="checkbox" class="pgVis w-auto"' + (oculto ? '' : ' checked') + '> ver</label><br>' +
      'X <input type="number" class="pgX w-[52px]" step="0.5" value="' + pos.x + '"> Y <input type="number" class="pgY w-[52px]" step="0.5" value="' + pos.y + '"><br>' +
      'Letra <input type="number" class="pgF w-[52px]" step="0.1" min="1" max="8" value="' + fVal + '" placeholder="global"> mm';
    const ix = div.querySelector('.pgX');
    const iy = div.querySelector('.pgY');
    const iF = div.querySelector('.pgF');
    const chk = div.querySelector('.pgVis');
    ix.addEventListener('change', () => { state.sel = key; pos.x = parseFloat(ix.value) || 0; guardarConfig({posiciones: state.cfg.posiciones}); refrescarPreview(); mostrarSel(); });
    iy.addEventListener('change', () => { state.sel = key; pos.y = parseFloat(iy.value) || 0; guardarConfig({posiciones: state.cfg.posiciones}); refrescarPreview(); mostrarSel(); });
    if (iF){
      iF.addEventListener('change', () => {
        state.sel = key;
        const v = parseFloat(iF.value);
        if (isFinite(v) && v >= 1 && v <= 8) pos.fuente_mm = Math.round(v * 10) / 10;
        else pos.fuente_mm = 0;
        guardarConfig({posiciones: state.cfg.posiciones});
        refrescarPreview();
        mostrarSel();
      });
    }
    chk.addEventListener('change', async () => {
      state.cfg.camposVisibles = state.cfg.camposVisibles || {};
      state.cfg.camposVisibles[key] = chk.checked;
      await guardarConfig({ camposVisibles: state.cfg.camposVisibles });
      refrescarPreview();
      pintarCamposVisibles();
      pintarPosGrid();
    });
    cont.appendChild(div);
  }
}

async function ajustarCampo1Linea(){
  if (!state.cfg){ return; }
  if (!state.sel || state.sel === 'firma'){
    toast('Selecciona un campo de texto primero (fecha, monto, etc.)', true);
    return;
  }
  const key = state.sel;
  const cfg = state.cfg;
  const pos = cfg.posiciones[key];
  if (!pos){ return; }
  const data = datosFormulario();
  const campo = camposDe(cfg, data).find(c => c.key === key);
  if (!campo || !campo.txt){
    toast('El campo "' + (NOMBRES_CAMPO[key] || key) + '" está vacío u oculto', true);
    return;
  }
  const anchoMM = anchoDispoMM(cfg, pos, key);
  if (anchoMM <= 0.5){
    toast('No hay ancho disponible para ese campo', true);
    return;
  }
  const k = cfg.dpi / 25.4;
  const fuenteTipo = (cfg.fuenteTipo && String(cfg.fuenteTipo).trim()) ? String(cfg.fuenteTipo).trim() : 'Courier New';
  const bold = campo.bold ? 'bold ' : '';
  const mc = document.createElement('canvas').getContext('2d');
  let mejor = 0;
  for (let t = 80; t >= 10; t--){
    const fm = t / 10;
    mc.font = bold + (fm * k) + 'px "' + fuenteTipo + '", monospace';
    if (mc.measureText(campo.txt).width <= anchoMM * k){
      mejor = fm;
      break;
    }
  }
  if (!mejor){
    pos.fuente_mm = 1;
    toast('No cabe en 1 línea ni a 1 mm — se puso 1 mm (se cortará)', true);
  } else {
    pos.fuente_mm = mejor;
    toast(NOMBRES_CAMPO[key] + ' ajustado a ' + mejor + ' mm en 1 línea ✓');
  }
  await guardarConfig({ posiciones: cfg.posiciones });
  refrescarPreview();
  mostrarSel();
  pintarPosGrid();
}

$('btnAjustarLinea').addEventListener('click', ajustarCampo1Linea);

function pintarLote(){
  const grid = $('loteGrid');
  grid.innerHTML = '';
  for (let i = 0; i < 3; i++){
    const div = document.createElement('div');
    div.className = 'loteCard';
    div.innerHTML =
      '<h4>Cheque ' + (i+1) + '</h4>' +
      '<label>N°</label><input type="text" data-l="numero" data-i="' + i + '" class="numAuto">' +
      '<label>Beneficiario</label><input type="text" data-l="benef" data-i="' + i + '" placeholder="Beneficiario">' +
      '<label>Monto</label><input type="number" data-l="monto" data-i="' + i + '" step="0.01" min="0">' +
      '<label>Concepto</label><input type="text" data-l="concepto" data-i="' + i + '" placeholder="Concepto">' +
      '<div class="letraAuto text-[11.5px] text-[#68788c] mt-1.5 min-h-[28px]" data-letra="' + i + '"></div>';
    grid.appendChild(div);
  }
  const primero = state.cfg.siguiente_numero;
  $('lPrimero').value = primero;
  grid.querySelectorAll('[data-l=numero]').forEach((el, i) => { el.value = primero + i; });
  grid.querySelectorAll('[data-l=monto]').forEach(el => {
    el.addEventListener('input', () => {
      const i = el.dataset.i;
      const m = parseFloat(el.value) || 0;
      grid.querySelector('[data-letra="' + i + '"]').textContent = m > 0 ? numeroALetras(m) : '';
    });
  });
}

function datosLote(i){
  const cfg = state.cfg;
  const grid = $('loteGrid');
  const get = (l) => grid.querySelector('[data-l="' + l + '"][data-i="' + i + '"]').value;
  const monto = parseFloat(get('monto')) || 0;
  const fecha = $('lFecha').value;
  return {
    fechaText: fechaLarga(fecha, cfg.cuenta.ciudad, cfg.fechaFormato),
    numeroText: 'N° ' + get('numero').trim(),
    beneficiario: get('benef').trim(),
    montoText: (cfg.simboloMoneda || 'S/') + ' ' + fmtMonto(monto),
    letraText: numeroALetras(monto),
    concepto: get('concepto').trim(),
    cuentaText: (cfg.imprimirCuenta && cfg.cuenta.numero) ? 'CTA. ' + cfg.cuenta.numero : '',
    firma: padLote.hayTinta() ? padLote.canvas.toDataURL() : null,
    _monto: monto,
    _numero: get('numero').trim(),
    _concepto: get('concepto').trim()
  };
}

function esperarSgte(total, actual){
  return new Promise((resolve) => {
    const m = $('modalLote');
    m.classList.remove('oculto');
    $('mdTitulo').textContent = 'Cheque ' + actual + ' de ' + total + ' impreso ✓';
    $('mdTexto').textContent = 'Retira el cheque de la ranura y coloca el siguiente. Se imprimirá automáticamente.';
    const barra = $('mdBarra');
    const dur = state.cfg.loteDelayMs || 8000;
    const t0 = performance.now();
    let raf;
    let resuelto = false;
    function fin(ok){
      if (resuelto) return;
      resuelto = true;
      cancelAnimationFrame(raf);
      clearTimeout(temp);
      m.classList.add('oculto');
      resolve(ok);
    }
    function tick(){
      const p = Math.min(1, (performance.now() - t0) / dur);
      barra.style.width = (p * 100) + '%';
      if (p >= 1){ fin(true); return; }
      raf = requestAnimationFrame(tick);
    }
    const temp = setTimeout(() => fin(true), dur);
    $('mdSeguir').onclick = () => fin(true);
    $('mdCancelar').onclick = () => fin(false);
    raf = requestAnimationFrame(tick);
  });
}

$('btnLote').addEventListener('click', async () => {
  const cheques = [datosLote(0), datosLote(1), datosLote(2)];
  const numerosVistos = {};
  for (let i = 0; i < 3; i++){
    const c = cheques[i];
    if (!c.beneficiario){ toast('Falta el beneficiario del cheque ' + (i+1), true); return; }
    if (c._monto <= 0){ toast('Falta el monto del cheque ' + (i+1), true); return; }
    const n = normNum(c._numero);
    if (n){
      if (numeroUsado(n)){ toast('El N° ' + n + ' ya fue impreso antes', true); return; }
      if (numerosVistos[n]){ toast('N° ' + n + ' repetido en el lote', true); return; }
      numerosVistos[n] = true;
    }
  }
  $('btnLote').disabled = true;
  try {
    const fechaCheque = $('lFecha').value;
    for (let i = 0; i < 3; i++){
      const c = cheques[i];
      await imprimirCheque(c, { numero: c._numero, fechaCheque, beneficiario: c.beneficiario, monto: c.montoText, letra: c.letraText, concepto: c._concepto, firma: c.firma || null, fuentes: fuentesSnapshot(state.cfg) });
      if (normNum(c._numero)) state.numerosUsados[normNum(c._numero)] = new Date().toISOString();
      marcarSiguienteUsado(c._numero);
      if (i < 2){
        const seguir = await esperarSgte(3, i + 1);
        if (!seguir){ toast('Lote cancelado'); break; }
      }
    }
    toast('Lote finalizado ✓');
    pintarLote();
    cargarHistorial();
  } catch(e){
    toast(e.message, true);
  } finally {
    $('btnLote').disabled = false;
    $('modalLote').classList.add('oculto');
  }
});

async function refrescarEstado(){
  try {
    const r = await fetch('/api/impresora');
    const e = await r.json();
    const ok = e.ok;
    $('estado').innerHTML = '<span class="punto ' + (ok ? 'ok' : 'mal') + '"></span>' +
      (e.nombre || '') + (e.puerto ? ' · ' + e.puerto : '') + (e.trabajos ? ' · cola: ' + e.trabajos : '') +
      (ok ? '' : ' · ' + (e.error || 'revisar'));
    const grid = $('estGrid');
    grid.innerHTML =
      cajaEstado('Estado', ok ? 'Lista ✓' : 'Con problemas', ok) +
      cajaEstado('Cola (spooler)', e.spooler || '?', e.spooler === 'Running') +
      cajaEstado('Puerto', e.puerto || '?', e.puerto && e.puerto !== 'COM2:' && e.puerto !== 'COM3:') +
      cajaEstado('Trabajos en cola', String(e.trabajos ?? '?'), (e.trabajos ?? 0) === 0);
  } catch(e){
    $('estado').innerHTML = '<span class="punto mal"></span>servidor caído';
  }
}
function cajaEstado(titulo, valor, bien){
  return '<div class="estCaja"><b>' + titulo + '</b><span class="punto ' + (bien ? 'ok' : 'mal') + '"></span>' + valor + '</div>';
}

function escHtml(s){
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function montoNum(s){
  const t = String(s == null ? '' : s).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const v = parseFloat(t);
  return isNaN(v) ? 0 : v;
}

function estadoDe(h){
  return h.estado === 'anulado' ? 'anulado' : 'impreso';
}

function fmtMontoNum(v){
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rangoFechasActivo(){
  return ($('histDesde').value || '') !== '' || ($('histHasta').value || '') !== '';
}

function exportarCsv(){
  const filas = state.histVisibles || [];
  if (!filas.length){ toast('No hay cheques para exportar con el filtro actual', true); return; }
  const cols = ['Fecha impresión', 'Fecha cheque', 'N°', 'Beneficiario', 'Monto', 'Letra', 'Concepto', 'Estado', 'Tipo'];
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const lineas = [cols.map(esc).join(';')];
  for (const h of filas){
    lineas.push([
      h.fecha_impre || h.fecha || '', h.fecha_cheque || '', h.numero || '', h.beneficiario || '',
      h.monto || '', h.letra || '', h.concepto || '', estadoDe(h), h.tipo || 'normal'
    ].map(esc).join(';'));
  }
  const blob = new Blob(['\uFEFF' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sigel_historial_' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('CSV exportado ✓ (' + filas.length + ' filas)');
}

function renderHistorial(){
  if (!state.historial) state.historial = [];
  const hist = state.historial;
  const filtro = (($('histBuscar').value || '')).trim().toLowerCase();
  const desde = $('histDesde').value || '';
  const hasta = $('histHasta').value || '';
  const visibles = hist.filter(h => {
    const fi = String(h.fecha_impre || h.fecha || '').slice(0, 10);
    if (desde && fi < desde) return false;
    if (hasta && fi > hasta) return false;
    if (!filtro) return true;
    const campos = [h.numero, h.beneficiario, h.monto, h.concepto, h.fecha_cheque, h.letra];
    const f = new Date(h.fecha_cheque || h.fecha);
    if (!isNaN(f)) campos.push(f.toLocaleDateString('es-PE'));
    return campos.some(v => String(v == null ? '' : v).toLowerCase().includes(filtro));
  });
  state.histVisibles = visibles;

  let imp = 0, anu = 0, rei = 0, total = 0;
  for (const h of visibles){
    if (estadoDe(h) === 'anulado') anu++;
    else if (h.tipo === 'reimpresion') rei++;
    else { imp++; total += montoNum(h.monto); }
  }
  const sim = (state.cfg && state.cfg.simboloMoneda) || 'S/';
  $('histStats').innerHTML =
    '<div class="estCaja"><b>Impresos</b>' + imp + '</div>' +
    '<div class="estCaja"><b>Anulados</b>' + anu + '</div>' +
    '<div class="estCaja"><b>Reimpresos</b>' + rei + '</div>' +
    '<div class="estCaja"><b>Monto total</b>' + sim + ' ' + fmtMontoNum(total) + '</div>';

  const body = $('histBody');
  body.innerHTML = '';
  $('histVacio').style.display = visibles.length ? 'none' : 'block';
  if (!visibles.length){
    $('histVacio').innerHTML = hist.length
      ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20"/></svg> No hay cheques que coincidan con el filtro activo.'
      : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16H7z"/><path d="M10 9h4M10 13h4"/></svg> Sin cheques impresos todavía.';
  }
  for (const h of visibles){
    const anulado = estadoDe(h) === 'anulado';
    const esReimp = h.tipo === 'reimpresion';
    const badge = esReimp && !anulado ? 'reimpreso' : estadoDe(h);
    const tr = document.createElement('tr');
    if (anulado) tr.className = 'filaAnulada';
    const fc = new Date(h.fecha_cheque || h.fecha);
    const fch = isNaN(fc) ? '' : fc.toLocaleDateString('es-PE');
    const fi = new Date(h.fecha_impre || h.fecha);
    const hora = isNaN(fi) ? '' : fi.toLocaleTimeString('es-PE', {hour:'2-digit',minute:'2-digit'});
    tr.innerHTML =
      '<td>' + escHtml(fch) +
        (hora ? '<div class="text-[11px] text-[#8a97a8] font-normal">' + hora + '</div>' : '') +
      '</td>' +
      '<td>' + escHtml(h.numero) +
        '<div><span class="badgeEstado ' + badge + '">' + badge + '</span></div>' +
      '</td>' +
      '<td>' + escHtml(h.beneficiario) + '</td>' +
      '<td>' + escHtml(h.monto) + '</td>' +
      '<td>' + escHtml(h.concepto) + '</td>' +
      '<td class="whitespace-nowrap">' +
        '<button class="btn sec btnPeq" data-acc="cargar"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v7M9 7l3 3 3-3M5 12v7h14v-7"/></svg>Cargar</button> ' +
        (anulado ? '' : '<button class="btn btnPeq" data-acc="reimprimir"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3"/><path d="M17.5 3.2v3.6h-3.6M6.5 20.8v-3.6h3.6"/></svg>Reimprimir</button> ') +
        (anulado || esReimp ? '' : '<button class="btn peligro btnPeq" data-acc="anular"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9.5 9.5l5 5M14.5 9.5l-5 5"/></svg>Anular</button>') +
      '</td>';
    tr.querySelector('[data-acc=cargar]').addEventListener('click', async () => {
      $('fNumero').value = h.numero ? normNum(h.numero) : state.cfg.siguiente_numero;
      $('fBenef').value = h.beneficiario || '';
      $('fMonto').value = montoNum(h.monto) ? String(montoNum(h.monto)) : '';
      state.letraManual = false;
      $('fLetra').value = h.letra || '';
      $('fConcepto').value = h.concepto || '';
      if (h.fecha_cheque) $('fFecha').value = String(h.fecha_cheque).slice(0, 10);
      guardarBorrador(true);
      activarTab('nuevo');
      const aplico = await aplicarFuentesCheque(h);
      if (!aplico) refrescarPreview();
    });
    const btnRei = tr.querySelector('[data-acc=reimprimir]');
    if (btnRei) btnRei.addEventListener('click', () => reimprimirCheque(h));
    const btnAnu = tr.querySelector('[data-acc=anular]');
    if (btnAnu) btnAnu.addEventListener('click', () => anularCheque(h));
    body.appendChild(tr);
  }
}

async function reimprimirCheque(h){
  const n = normNum(h.numero) || '(sin número)';
  const ok = await pedirConfirmacion('¿Reimprimir el cheque N° ' + n + ' de ' + (h.beneficiario || '—') + '? Se usará el mismo número (no se consume uno nuevo).');
  if (!ok) return;
  try {
    await aplicarFuentesCheque(h, false);
    let firmaData = null;
    if (h.firma){
      try {
        const rf = await fetch('/api/firma/' + encodeURIComponent(String(h.firma).split('/').pop()));
        const rj = await rf.json();
        if (rf.ok && rj.dataUrl) firmaData = rj.dataUrl;
      } catch (e) { firmaData = null; }
    }
    const cfg = state.cfg;
    const data = {
      fechaText: fechaLarga(String(h.fecha_cheque || '').slice(0, 10), (cfg.cuenta && cfg.cuenta.ciudad) || '', cfg.fechaFormato),
      numeroText: normNum(h.numero) ? 'N° ' + normNum(h.numero) : '',
      beneficiario: h.beneficiario || '',
      montoText: h.monto || '',
      letraText: h.letra || '',
      concepto: h.concepto || '',
      cuentaText: (cfg.imprimirCuenta && cfg.cuenta.numero) ? 'CTA. ' + cfg.cuenta.numero : '',
      firma: firmaData
    };
    await imprimirCheque(data, {
      numero: h.numero || '',
      fechaCheque: String(h.fecha_cheque || '').slice(0, 10),
      beneficiario: h.beneficiario || '',
      monto: h.monto || '',
      letra: h.letra || '',
      concepto: h.concepto || '',
      reimpresion: true,
      firmaArchivo: h.firma || ''
    });
    toast('Reimpresión enviada a la impresora ✓');
    refrescarEstado();
    await cargarHistorial();
  } catch(e){
    toast(e.message, true);
  }
}

async function anularCheque(h){
  const n = normNum(h.numero) || '(sin número)';
  const ok = await pedirConfirmacion('¿Anular el cheque N° ' + n + ' de ' + (h.beneficiario || '—') + '? El número quedará libre para volver a imprimir.');
  if (!ok) return;
  try {
    const r = await fetch('/api/historial/anular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha: h.fecha_impre || h.fecha, numero: h.numero || '' })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'No se pudo anular');
    if (j.libre && j.numero) delete state.numerosUsados[j.numero];
    toast(j.libre && j.numero
      ? 'Cheque N° ' + j.numero + ' anulado — el número quedó libre ✓'
      : 'Cheque anulado ✓');
    await cargarHistorial();
  } catch(e){
    toast(e.message, true);
  }
}

async function cargarHistorial(){
  try {
    const r = await fetch('/api/historial');
    state.historial = await r.json();
  } catch(e){
    toast('No se pudo cargar el historial', true);
    return;
  }
  renderHistorial();
  pintarConceptosChips();
  cargarBeneficiarios();
}

$('histBuscar').addEventListener('input', renderHistorial);
$('histDesde').addEventListener('input', renderHistorial);
$('histHasta').addEventListener('input', renderHistorial);
$('btnHistLimpiar').addEventListener('click', () => {
  $('histBuscar').value = '';
  $('histDesde').value = '';
  $('histHasta').value = '';
  renderHistorial();
});
$('btnCsv').addEventListener('click', exportarCsv);

async function cargarRespaldos(){
  try {
    const r = await fetch('/api/respaldos');
    const lista = await r.json();
    const cont = $('listaRespaldos');
    if (!Array.isArray(lista) || !lista.length){
      cont.innerHTML = '<div class="ayuda">Sin respaldos todavía. El primero se crea al imprimir un cheque.</div>';
      return;
    }
    cont.innerHTML = lista.map(b =>
      '<div class="filaBackup">' +
        '<span class="filaBackupNom">' + (b.tipo === 'manual'
            ? '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18.5a4 4 0 0 1 .4-8 5.5 5.5 0 0 1 10.45-1.1A3.9 3.9 0 0 1 17.35 18.5z"/></svg>'
            : '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3M19.5 12a7.5 7.5 0 0 1-12.8 5.3"/><path d="M17.5 3.2v3.6h-3.6M6.5 20.8v-3.6h3.6"/></svg>')
          + ' ' + escHtml(b.nombre) + '</span>' +
        '<span class="filaBackupTam">' + Math.max(1, Math.round(b.tamano / 1024)) + ' KB</span>' +
        '<a class="btn sec btnPeq" href="/api/respaldos/descargar?nombre=' + encodeURIComponent(b.nombre) + '" download>Descargar</a> ' +
        '<button class="btn peligro btnPeq" data-resp="' + escHtml(b.nombre) + '">Restaurar</button>' +
      '</div>').join('');
    cont.querySelectorAll('[data-resp]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const nombre = btn.dataset.resp;
        const ok = await pedirConfirmacion('¿Restaurar el respaldo ' + nombre + '? Se reemplazarán historial, configuración, números y firmas. La página se recargará.');
        if (!ok) return;
        btn.disabled = true;
        try {
          const r2 = await fetch('/api/respaldos/restaurar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre })
          });
          const j = await r2.json().catch(() => ({}));
          if (!r2.ok) throw new Error(j.message || 'No se pudo restaurar');
          toast('Respaldo restaurado ✓ Recargando…');
          setTimeout(() => location.reload(), 900);
        } catch(e){
          toast(e.message, true);
          btn.disabled = false;
        }
      });
    });
  } catch(e){
    $('listaRespaldos').innerHTML = '<div class="ayuda">No se pudo cargar la lista de respaldos.</div>';
  }
}

$('btnBackupAhora').addEventListener('click', async () => {
  const btn = $('btnBackupAhora');
  btn.disabled = true;
  try {
    const r = await fetch('/api/respaldos', { method: 'POST' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'No se pudo crear el respaldo');
    toast('Respaldo creado: ' + j.nombre + ' ✓');
    cargarRespaldos();
  } catch(e){
    toast(e.message, true);
  } finally {
    btn.disabled = false;
  }
});

async function cargarAuditoria(){
  try {
    const r = await fetch('/api/auditoria?n=30');
    const ev = await r.json();
    const cont = $('listaAuditoria');
    if (!cont) return;
    if (!Array.isArray(ev) || !ev.length){
      cont.innerHTML = '<div class="ayuda">Sin eventos todavía.</div>';
      return;
    }
    cont.innerHTML = ev.map(e => {
      const f = new Date(e.ts);
      const fecha = isNaN(f) ? String(e.ts || '') :
        f.toLocaleDateString('es-PE') + ' ' + f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      let det = '';
      if (e.accion === 'imprimir') det = 'N° ' + (e.numero || '—') + ' · ' + (e.beneficiario || '—') + ' · ' + (e.monto || '') + (e.reimpresion ? ' · reimpresión' : '');
      else if (e.accion === 'anular') det = 'N° ' + (e.numero || '—') + (e.libre ? ' · número liberado' : '');
      else det = e.nombre || '';
      return '<div class="filaBackup">' +
        '<span class="filaBackupNom"><b>' + escHtml(String(e.accion || '')) + '</b> · ' + escHtml(det) + '</span>' +
        '<span class="filaBackupTam">' + escHtml(fecha) + '</span>' +
        '</div>';
    }).join('');
  } catch (e) {}
}

$('btnImportarResp').addEventListener('click', () => $('fileResp').click());

$('fileResp').addEventListener('change', async () => {
  const f = $('fileResp').files && $('fileResp').files[0];
  if (!f) return;
  try {
    const txt = await f.text();
    let obj;
    try { obj = JSON.parse(txt); } catch (e) { throw new Error('El archivo no es JSON válido'); }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.historial))
      throw new Error('El archivo no tiene estructura de respaldo (falta historial[])');
    const ok = await pedirConfirmacion(
      '¿Importar "' + f.name + '"? Se guardará como respaldo manual con ' + obj.historial.length +
      ' cheques, sin alterar los datos actuales. Podrás restaurarlo desde la lista.'
    );
    if (!ok) return;
    const r = await fetch('/api/respaldos/importar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contenido: obj })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'No se pudo importar el respaldo');
    toast('Respaldo importado ✓ ' + j.nombre);
    cargarRespaldos();
  } catch (e) {
    toast(e.message, true);
  } finally {
    $('fileResp').value = '';
  }
});

function pintarCamposVisibles(){
  const cont = $('camposVisibles');
  if (!cont || !state.cfg) return;
  const vis = state.cfg.camposVisibles || {};
  cont.innerHTML = '';
  for (const key of CAMPOS){
    const on = vis[key] !== false;
    const div = document.createElement('div');
    div.className = 'text-[13px] bg-[#f9f9f9] border border-[#e5e5e5] rounded-md p-[7px_9px] flex items-center gap-[7px]';
    const id = 'cv_' + key;
    div.innerHTML = '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><label for="' + id + '" class="m-0 cursor-pointer">' + NOMBRES_CAMPO[key] + '</label>';
    const chk = div.querySelector('input');
    chk.addEventListener('change', async () => {
      state.cfg.camposVisibles = state.cfg.camposVisibles || {};
      state.cfg.camposVisibles[key] = chk.checked;
      await guardarConfig({ camposVisibles: state.cfg.camposVisibles });
      refrescarPreview();
      toast(NOMBRES_CAMPO[key] + (chk.checked ? ' visible ✓' : ' oculto ✓'));
    });
    cont.appendChild(div);
  }
}

function cargarAjustes(){
  const c = state.cfg;
  $('ajTitular').value = c.cuenta.titular || '';
  $('ajBanco').value = c.cuenta.banco || '';
  $('ajCuenta').value = c.cuenta.numero || '';
  $('ajCiudad').value = c.cuenta.ciudad || '';
  $('ajChkNum').checked = !!c.imprimirNumero;
  $('ajChkCta').checked = !!c.imprimirCuenta;
  $('ajMoneda').value = c.moneda || '';
  $('ajSimbolo').value = c.simboloMoneda || '';
  $('lblMoneda').textContent = c.simboloMoneda || 'S/';
  $('ajTextoOrden').value = c.textoOrden || '';
  $('ajDelay').value = Math.round((c.loteDelayMs || 8000) / 1000);
  $('ajSiguiente').value = c.siguiente_numero;
  $('ajFechaFmt').value = c.fechaFormato === 'larga' ? 'larga' : 'numeros';
  pintarCamposVisibles();
  $('calOrient').value = String(c.orient);
  $('calOffX').value = c.offsetX_mm;
  $('calOffY').value = c.offsetY_mm;
  $('calLargo').value = c.cheque.largo_mm;
  $('calAncho').value = c.cheque.ancho_mm;
  $('calFuente').value = c.fuente_mm;
  $('calFuenteTipo').value = c.fuenteTipo || 'Courier New';
    $('calMargen').value = isFinite(c.margenDerecha_mm) ? c.margenDerecha_mm : 0;
  $('calAnchoImp').value = isFinite(c.anchoImpresion_mm) ? c.anchoImpresion_mm : 80;
  $('calMontoAlinea').value = c.montoAlineacion === 'centro' ? 'centro' : (c.montoAlineacion === 'der' ? 'der' : 'izq');
  $('calFirmaW').value = c.firma_ancho_mm;
  $('calFirmaH').value = c.firma_alto_mm;
  $('calImpresora').value = c.impresora;
}

$('btnGuardaAjustes').addEventListener('click', async () => {
  await guardarConfig({
    cuenta: {
      titular: $('ajTitular').value.trim(),
      banco: $('ajBanco').value.trim(),
      numero: $('ajCuenta').value.trim(),
      ciudad: $('ajCiudad').value.trim()
    },
    imprimirNumero: $('ajChkNum').checked,
    imprimirCuenta: $('ajChkCta').checked,
    moneda: $('ajMoneda').value.trim() || 'SOLES',
    simboloMoneda: $('ajSimbolo').value.trim() || 'S/',
    textoOrden: $('ajTextoOrden').value.trim(),
    fechaFormato: $('ajFechaFmt').value === 'larga' ? 'larga' : 'numeros',
    loteDelayMs: Math.max(2, parseInt($('ajDelay').value, 10) || 8) * 1000,
    siguiente_numero: parseInt($('ajSiguiente').value, 10) || 1
  });
  toast('Ajustes guardados ✓');
  refrescarPreview();
  pintarLote();
});

async function guardarCalibracion(){
  const largo = parseFloat($('calLargo').value);
  const ancho = parseFloat($('calAncho').value);
  if (!isFinite(largo) || largo <= 0){
    toast('El largo debe ser un número mayor a cero.', true);
    cargarAjustes();
    return;
  }
  if (!isFinite(ancho) || ancho <= 0){
    toast('El ancho debe ser un número mayor a cero.', true);
    cargarAjustes();
    return;
  }
  await guardarConfig({
    orient: parseInt($('calOrient').value, 10) || 0,
    offsetX_mm: parseFloat($('calOffX').value) || 0,
    offsetY_mm: parseFloat($('calOffY').value) || 0,
    cheque: {
      largo_mm: largo,
      ancho_mm: ancho
    },
    fuente_mm: parseFloat($('calFuente').value) || 4,
    fuenteTipo: $('calFuenteTipo').value || 'Courier New',
    margenDerecha_mm: (() => { const v = parseFloat($('calMargen').value); return isFinite(v) ? Math.max(0, Math.min(10, v)) : 0; })(),
    anchoImpresion_mm: (() => { const v = parseFloat($('calAnchoImp').value); return isFinite(v) ? Math.max(40, Math.min(120, v)) : 80; })(),
    montoAlineacion: ['izq','centro','der'].includes($('calMontoAlinea').value) ? $('calMontoAlinea').value : 'izq',
    firma_ancho_mm: parseFloat($('calFirmaW').value) || 36,
    firma_alto_mm: parseFloat($('calFirmaH').value) || 14,
    impresora: $('calImpresora').value.trim() || 'EPSON TM-H6000VI Slip'
  });
  cargarAjustes();
  actualizarLabelsAvance();
  refrescarPreview();
}

$('ajFechaFmt').addEventListener('change', async () => {
  await guardarConfig({ fechaFormato: $('ajFechaFmt').value === 'larga' ? 'larga' : 'numeros' });
  refrescarPreview();
  toast('Formato de fecha actualizado ✓');
});
$('calOrient').addEventListener('change', () => {
  actualizarLabelsAvance();
  refrescarPreview();
});
['calOrient','calOffX','calOffY','calLargo','calAncho','calFuente','calFuenteTipo','calFirmaW','calFirmaH','calImpresora','calMargen','calAnchoImp','calMontoAlinea'].forEach(id => {
  $(id).addEventListener('change', guardarCalibracion);
});
document.querySelectorAll('[data-off]').forEach(btn => {
  btn.addEventListener('click', () => {
    const esX = btn.dataset.off === 'X';
    const inp = esX ? $('calOffX') : $('calOffY');
    inp.value = Math.round(((parseFloat(inp.value) || 0) + parseFloat(btn.dataset.d)) * 2) / 2;
    guardarCalibracion();
  });
});

const TAB_SLUFS = { nuevo: 'nuevo-cheque', lote: 'lote', calib: 'calibracion', hist: 'historial', ajustes: 'ajustes' };
const SLUF_TABS = {};
for (const [k, v] of Object.entries(TAB_SLUFS)) SLUF_TABS[v] = k;
const SUB_SLUFS = { respaldos: 'respaldos', auditoria: 'auditoria' };

function rutaDe(tab, sub){
  const base = '/' + (TAB_SLUFS[tab] || TAB_SLUFS.nuevo);
  if (tab === 'ajustes' && sub && SUB_SLUFS[sub]) return base + '/' + SUB_SLUFS[sub];
  return base;
}

function parseRuta(pathname){
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  const seg = p.split('/').filter(Boolean);
  if (!seg.length) return null;
  const tab = SLUF_TABS[seg[0]];
  if (!tab) return { tab: 'nuevo', sub: null, invalida: true };
  if (tab === 'ajustes' && seg[1]){
    if (seg[1] === 'config') return { tab, sub: 'config' };
    const sub = Object.keys(SUB_SLUFS).find(k => SUB_SLUFS[k] === seg[1]);
    if (sub) return { tab, sub };
    return { tab, sub: 'config', invalida: true };
  }
  return { tab, sub: null };
}

function sincronizarRuta(restaurando){
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const ruta = rutaDe(state.tabActual, state.subtabActual);
  if (location.pathname === ruta) return;
  if (restaurando) history.replaceState(null, '', ruta);
  else history.pushState(null, '', ruta);
}

function rutaDesdeNavegador(){
  const r = (typeof location !== 'undefined') ? parseRuta(location.pathname) : null;
  if (r) return r;
  let guardado = 'nuevo';
  try { guardado = localStorage.getItem('cheque_tab') || 'nuevo'; } catch (e) {}
  if (!$('tab-' + guardado)) guardado = 'nuevo';
  return { tab: guardado, sub: null };
}

function activarSubTab(nombre, restaurando){
  if (!$('subtab-' + nombre)) nombre = 'config';
  state.subtabActual = nombre;
  document.querySelectorAll('#ajSubNav button').forEach(b => b.classList.toggle('activo', b.dataset.subtab === nombre));
  document.querySelectorAll('.subtab').forEach(t => t.classList.toggle('activo', t.id === 'subtab-' + nombre));
  if (!restaurando){
    try { localStorage.setItem('cheque_subtab', nombre); } catch (e) {}
  }
  if (nombre === 'respaldos') cargarRespaldos();
  if (nombre === 'auditoria') cargarAuditoria();
  const subNav = $('ajSubNav');
  if (!restaurando && subNav && subNav.scrollIntoView) subNav.scrollIntoView({ block: 'start' });
  sincronizarRuta(restaurando);
}

function activarTab(nombre, restaurando){
  if ($('tab-' + nombre)) {
    state.tabActual = nombre;
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('activo', b.dataset.tab === nombre));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('activo', t.id === 'tab-' + nombre));
  }
  if (!restaurando){
    try { localStorage.setItem('cheque_tab', nombre); } catch (e) {}
  }
  if (nombre === 'hist') cargarHistorial();
  if (nombre === 'ajustes') activarSubTab('config', restaurando);
  if (nombre === 'nuevo') refrescarPreview();
  sincronizarRuta(restaurando);
}
document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => activarTab(b.dataset.tab)));
document.querySelectorAll('#ajSubNav button').forEach(b => b.addEventListener('click', () => activarSubTab(b.dataset.subtab)));
window.addEventListener('popstate', () => {
  const r = (typeof location !== 'undefined') ? parseRuta(location.pathname) : null;
  if (!r) return;
  if (!$('tab-' + r.tab)) return;
  activarTab(r.tab, true);
  if (r.tab === 'ajustes') activarSubTab(r.sub || 'config', true);
  sincronizarRuta(true);
});

$('fMonto').addEventListener('input', () => {
  state.letraManual = false;
  $('fLetra').value = numeroALetras(parseFloat($('fMonto').value) || 0);
  refrescarPreview();
  guardarBorrador();
});
$('fLetra').addEventListener('input', () => { state.letraManual = true; refrescarPreview(); guardarBorrador(); });
['fNumero','fFecha','fBenef','fConcepto'].forEach(id => $(id).addEventListener('input', () => { refrescarPreview(); guardarBorrador(); }));
