async function iniciar(){
  let r;
  try {
    r = await fetch('/api/config');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    state.cfg = await r.json();
    try {
      localStorage.setItem('cheque_cfg_backup', JSON.stringify({
        posiciones: state.cfg.posiciones,
        camposVisibles: state.cfg.camposVisibles,
        fechaFormato: state.cfg.fechaFormato
      }));
    } catch (e) {}
  } catch(e){
    try {
      const b = JSON.parse(localStorage.getItem('cheque_cfg_backup') || 'null');
      if (b && b.posiciones){
        state.cfg = Object.assign({
          cheque:{largo_mm:700,ancho_mm:70}, posiciones:{}, camposVisibles:{}, cuenta:{},
          simboloMoneda:'S/', moneda:'SOLES', imprimirCuenta:false, imprimirNumero:true,
          margenDerecha_mm:0, montoAlineacion:'izq', anchoImpresion_mm:80,
          siguiente_numero:1, orient:90, fuente_mm:4, offset:{x:0}, offsetX_mm:0, offsetY_mm:0,
          firma_ancho_mm:36, firma_alto_mm:14, textoOrden:'', fechaFormato:'numeros',
          impresora:'', dpi:160, loteDelayMs:8000
        }, b);
        toast('Servidor no responde — usando respaldo local de posiciones', true);
      } else throw e;
    } catch (e2){
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="background:#c62828;color:#fff;padding:16px 22px;font-size:15px;text-align:center;line-height:1.6">' +
        '⛔ No se pudo conectar con el servidor local.<br>' +
        'Cierra esta página y ejecuta <b>start.bat</b>, luego abre <b>http://localhost:3000</b> en el navegador. ' +
        '(No abras index.html con doble clic.)</div>');
      document.querySelectorAll('input,button,select,textarea').forEach(el => { el.disabled = true; });
      return;
    }
  }
  padFirma = crearPad($('padFirma'), $('btnFirmaImg'), $('btnFirmaLimpiar'), $('firmaFile'));
  padLote = crearPad($('padLote'), $('btnLoteImg'), $('btnLoteLimpiar'), $('loteFile'));
  $('fNumero').value = String(state.cfg.siguiente_numero);
  $('fFecha').value = new Date().toISOString().slice(0,10);
  $('lFecha').value = new Date().toISOString().slice(0,10);
  cargarAjustes();
  actualizarLabelsAvance();
  pintarLote();
  refrescarPreview();
  refrescarEstado();
  setInterval(refrescarEstado, 15000);
}

window.addEventListener('unhandledrejection', (e) => {
  const m = (e.reason && e.reason.message) ? e.reason.message : String(e.reason);
  toast('Error: ' + m, true);
});
window.addEventListener('error', (e) => {
  toast('Error: ' + e.message, true);
});

iniciar();
