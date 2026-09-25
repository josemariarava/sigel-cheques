const $ = (id) => document.getElementById(id);
const state = { cfg: null, sel: null, dragging: null, grab: {x:0,y:0}, bounds: [], letraManual: false, imgCache: {}, zoom: 1, fitW: null, saveTimer: null, comoImprime: false, destL: null, destA: null, numerosUsados: {}, historial: [], borradorTimer: null, histVisibles: [] };

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SETIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const CAMPOS = ['fecha','numero','orden','beneficiario','monto','letra','concepto','cuenta','firma'];
const NOMBRES_CAMPO = {fecha:'Fecha',numero:'N°',orden:'Orden',beneficiario:'Beneficiario',monto:'Monto',letra:'En letras',concepto:'Concepto',cuenta:'Cuenta',firma:'Firma'};

function toast(msg, esError){
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', !!esError);
  t.classList.add('visible');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('visible'), esError ? 6000 : 3200);
}
let padFirma, padLote;
