/* ══════════════════════════════════════════════════════════════
   MINPAO · MODO VOZ (voz.js)
   ------------------------------------------------------------
   Versión 3 — Paso 5 del plan:
   Suma el RESUMEN FINAL leído en voz, la CONFIRMACIÓN
   ("guardar"/"sí"/"dale") y la CORRECCIÓN por voz
   ("corregir ruta", "corregir padrón", "repetir", etc.)

   Idioma/región: es-PE en reconocimiento y síntesis en todo
   el módulo, pensado para acento y vocabulario peruano
   (números, "dale"/"ya"/"listo" como formas de confirmar).
   ══════════════════════════════════════════════════════════════ */

const IDIOMA_VOZ = 'es-PE';

/* ── Sinónimos aceptados por cada nivel de ocupación ── */
const SINONIMOS_OCUPACION = {
  FULL:     ['no entra nadie', 'repleto', 'full', 'lleno'],
  PARADO:   ['hay parados', 'de pie', 'parados', 'parado'],
  COMPLETO: ['asientos llenos', 'todos sentados', 'completo'],
  SENTADO:  ['asientos ocupados', 'sentados', 'sentado'],
  MEDIO:    ['medio vacío', 'medio vacio', 'casi vacío', 'casi vacio', 'mitad', 'medio'],
  VACIO:    ['sin gente', 'vacío', 'vacio', 'nadie'],
};
const PARES_OCUPACION = Object.entries(SINONIMOS_OCUPACION)
  .flatMap(([cat, frases]) => frases.map(f => [cat, f]))
  .sort((a, b) => b[1].length - a[1].length);

/* ── Palabras clave para cada campo numérico.
   pax-espera SIEMPRE antes que t-espera para que "espera" no
   se cruce entre los dos campos. ── */
const PATRONES_CAMPO = {
  padron: [/padron(?:es)?\s+(\d+)/],
  bajan: [/bajan\s+(\d+)/, /(\d+)\s+bajan/],
  suben: [/suben\s+(\d+)/, /(\d+)\s+suben/],
  paxespera: [
    /pax\s+(?:en\s+)?espera\s+(\d+)/,
    /personas?\s+(?:en\s+)?esperando\s+(\d+)/,
    /personas?\s+en\s+espera\s+(\d+)/,
  ],
  tespera: [
    /tiempo\s+de\s+espera\s+(\d+)/,
    /espera\s+(\d+)\s+minutos?/,
    /(\d+)\s+minutos?\s+de\s+espera/,
  ],
};

/* ── Letras y números dictados de a uno (para la placa) ── */
const NOMBRES_LETRA = {
  a:'A', be:'B', b:'B', ce:'C', c:'C', de:'D', d:'D', e:'E',
  efe:'F', f:'F', ge:'G', g:'G', hache:'H', h:'H', i:'I',
  jota:'J', j:'J', ka:'K', k:'K', ele:'L', l:'L', eme:'M', m:'M',
  ene:'N', n:'N', o:'O', pe:'P', p:'P', cu:'Q', q:'Q',
  ere:'R', erre:'R', r:'R', ese:'S', s:'S', te:'T', t:'T', u:'U',
  uve:'V', ve:'V', v:'V', doblev:'W', w:'W', equis:'X', x:'X',
  igriega:'Y', ygriega:'Y', y:'Y', zeta:'Z', z:'Z',
};
const NUMERO_PALABRAS = {
  cero:'0', uno:'1', dos:'2', tres:'3', cuatro:'4',
  cinco:'5', seis:'6', siete:'7', ocho:'8', nueve:'9',
};

/* ── Campos que se pueden corregir por voz, con su forma de re-preguntar ── */
const CAMPOS_CORREGIBLES = {
  ruta: 'ruta', ocupacion: 'ocupacion', ocupación: 'ocupacion',
  padron: 'padron', padrón: 'padron', placa: 'placa',
  bajan: 'bajan', suben: 'suben',
  espera: 'espera', tiempo: 'espera',
  pax: 'pax',
};

/* ── Estado del módulo ──
   esperando puede ser: null | 'placa' | 'confirmacion' | 'campo:<nombre>' */
let vozActivaAhora = false;
let reconocimiento = null;
let esperando = null;

/* ── Utilidades ── */
function normalizarVoz(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function hablar(texto, alTerminar) {
  try {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = IDIOMA_VOZ;
    u.rate = 1.0;
    if (alTerminar) u.onend = alTerminar;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {
    console.error('Error de síntesis de voz:', e);
    if (alTerminar) alTerminar();
  }
}

/* ── Extractores de ruta / ocupación ── */
function extraerRuta(textoNorm) {
  for (const r of rutas) {
    const patron = new RegExp('\\b' + normalizarVoz(r) + '\\b');
    if (patron.test(textoNorm)) return r;
  }
  return null;
}
function extraerOcupacion(textoNorm) {
  for (const [categoria, frase] of PARES_OCUPACION) {
    if (textoNorm.includes(normalizarVoz(frase))) return categoria;
  }
  return null;
}
function extraerCampo(textoNorm, nombreCampo) {
  for (const patron of PATRONES_CAMPO[nombreCampo]) {
    const m = textoNorm.match(patron);
    if (m) return m[1];
  }
  return null;
}

/* ── Aplicar lo reconocido a los inputs / botones reales ── */
function aplicarRuta(valorRuta) {
  const btn = Array.from(document.querySelectorAll('.btn-ruta'))
    .find(b => b.textContent.trim() === valorRuta);
  if (btn) { btn.click(); return true; }
  return false;
}
function aplicarOcupacion(categoria) {
  const btn = document.querySelector(`.btn-occ[data-voz="${categoria}"]`);
  if (btn) { btn.click(); return true; }
  return false;
}
function aplicarCampoSimple(idInput, valor) {
  const inp = document.getElementById(idInput);
  if (!inp) return false;
  inp.value = valor;
  return true;
}
function aplicarPadron(numero) {
  const inp = document.getElementById('f-padron');
  if (!inp) return { ok: false, esNuevo: false };
  inp.value = numero;
  onPadronInput(inp); // reusa la función existente (biblioteca / bus nuevo)
  const placaInp = document.getElementById('f-placa');
  const esNuevo = placaInp.classList.contains('placa-nueva');
  return { ok: true, esNuevo };
}

/* ── Interpreta la placa dictada letra por letra, número por número ── */
function procesarPlacaDeletreada(textoOriginal) {
  const limpio = normalizarVoz(textoOriginal).replace(/[^a-z0-9\s]/g, '');
  const tokens = limpio.split(/\s+/).filter(Boolean);
  let resultado = '';

  tokens.forEach(tok => {
    if (/^\d$/.test(tok)) resultado += tok;
    else if (NUMERO_PALABRAS[tok]) resultado += NUMERO_PALABRAS[tok];
    else if (NOMBRES_LETRA[tok]) resultado += NOMBRES_LETRA[tok];
    else if (/^[a-z]$/.test(tok)) resultado += tok.toUpperCase();
  });

  if (resultado.length < 6) {
    hablar('No entendí bien la placa. Decila de nuevo, letra por letra y número por número.');
    return;
  }

  const placaFinal = resultado.slice(0, 3) + '-' + resultado.slice(3, 6);
  const inp = document.getElementById('f-placa');
  inp.value = placaFinal;
  fmtPlaca(inp);
  onPlacaManual();

  esperando = null;
  const pregunta = siguientePreguntaPendiente();
  if (pregunta === null) { resumenFinal(); }
  else { hablar('Placa ' + placaFinal + ' anotada. ' + pregunta); }
}

/* ── Devuelve la próxima pregunta pendiente, o null si ya está todo completo ── */
function siguientePreguntaPendiente() {
  if (!estado.ruta) return '¿Qué ruta?';
  if (!estado.ocupacion) return '¿Cómo va la ocupación?';

  const padronVal = document.getElementById('f-padron').value.trim();
  if (!padronVal) return '¿Cuál es el padrón?';

  const placaInp = document.getElementById('f-placa');
  if (placaInp.classList.contains('placa-nueva') && !placaInp.value.trim()) {
    esperando = 'placa';
    return 'Bus nuevo. Decime la placa, letra por letra y número por número.';
  }

  if (!document.getElementById('f-bajan').value.trim()) return '¿Cuántos bajan?';
  if (!document.getElementById('f-suben').value.trim()) return '¿Cuántos suben?';
  if (!document.getElementById('f-tespera').value.trim()) return '¿Tiempo de espera?';
  if (!document.getElementById('f-paxespera').value.trim()) return '¿Pax en espera?';

  return null; // todo completo → resumenFinal() se encarga desde acá en adelante
}

/* ── Arma y lee el resumen final, y pasa a modo confirmación ── */
function resumenFinal() {
  const padron = document.getElementById('f-padron').value.trim();
  const placa = document.getElementById('f-placa').value.trim();
  const bajan = document.getElementById('f-bajan').value.trim();
  const suben = document.getElementById('f-suben').value.trim();
  const tespera = document.getElementById('f-tespera').value.trim();
  const paxespera = document.getElementById('f-paxespera').value.trim();

  const partes = [
    'ruta ' + estado.ruta,
    'ocupación ' + estado.ocupacion,
    'padrón ' + padron,
  ];
  if (placa) partes.push('placa ' + placa);
  partes.push('bajan ' + bajan, 'suben ' + suben);
  if (tespera) partes.push('espera ' + tespera + ' minutos');
  if (paxespera) partes.push('pax en espera ' + paxespera);

  esperando = 'confirmacion';
  hablar(partes.join(', ') + '. ¿Guardo?');
}

/* ── Interpreta la respuesta a "¿Guardo?" ── */
function procesarConfirmacion(textoOriginal) {
  const t = normalizarVoz(textoOriginal);

  if (/\b(guardar|si|confirmar|dale|correcto|ya|listo)\b/.test(t)) {
    esperando = null;
    guardarRegistro(); // misma función de siempre
    hablar('Registro guardado. Siguiente bus, decime los datos.');
    return;
  }

  if (/\brepetir\b/.test(t)) { resumenFinal(); return; }

  const m = t.match(/corregir\s+([a-z]+)/);
  const campo = m ? CAMPOS_CORREGIBLES[m[1]] : null;

  if (campo) { iniciarCorreccion(campo); return; }

  hablar('No entendí. Decí "guardar" para confirmar, o "corregir" y el campo que quieras cambiar.');
}

/* ── Prepara el re-ingreso de un campo puntual ── */
function iniciarCorreccion(campo) {
  if (campo === 'ruta') {
    estado.ruta = '';
    document.querySelectorAll('.btn-ruta').forEach(b => b.classList.remove('activo'));
    esperando = 'campo:ruta';
    hablar('Decime la nueva ruta.');
  } else if (campo === 'ocupacion') {
    estado.ocupacion = '';
    document.querySelectorAll('.btn-occ').forEach(b => b.classList.remove('activo'));
    esperando = 'campo:ocupacion';
    hablar('Decime la nueva ocupación.');
  } else if (campo === 'padron') {
    document.getElementById('f-padron').value = '';
    document.getElementById('f-placa').value = '';
    esperando = 'campo:padron';
    hablar('Decime el nuevo padrón.');
  } else if (campo === 'placa') {
    document.getElementById('f-placa').value = '';
    esperando = 'placa';
    hablar('Decime la nueva placa, letra por letra y número por número.');
  } else {
    const idMap = { bajan: 'f-bajan', suben: 'f-suben', espera: 'f-tespera', pax: 'f-paxespera' };
    document.getElementById(idMap[campo]).value = '';
    esperando = 'campo:' + campo;
    hablar('Decime el nuevo valor de ' + campo + '.');
  }
}

/* ── Procesa la respuesta cuando se está corrigiendo un campo puntual ── */
function procesarCorreccionCampo(campo, textoOriginal) {
  const texto = normalizarVoz(textoOriginal);
  let ok = false;

  if (campo === 'ruta') {
    const r = extraerRuta(texto);
    if (r) ok = aplicarRuta(r);
  } else if (campo === 'ocupacion') {
    const c = extraerOcupacion(texto);
    if (c) ok = aplicarOcupacion(c);
  } else if (campo === 'padron') {
    const p = texto.match(/\d+/);
    if (p) { aplicarPadron(p[0]); ok = true; }
  } else {
    const idMap = { bajan: 'f-bajan', suben: 'f-suben', espera: 'f-tespera', pax: 'f-paxespera' };
    const p = texto.match(/\d+/);
    if (p) ok = aplicarCampoSimple(idMap[campo], p[0]);
  }

  if (!ok) {
    hablar('No entendí. Repetí el valor de ' + campo + '.');
    return;
  }

  esperando = null;

  // Si se corrigió el padrón y resultó ser un bus nuevo, pide la placa antes de resumir
  if (campo === 'padron') {
    const placaInp = document.getElementById('f-placa');
    if (placaInp.classList.contains('placa-nueva') && !placaInp.value.trim()) {
      esperando = 'placa';
      hablar('Bus nuevo. Decime la placa, letra por letra y número por número.');
      return;
    }
  }

  resumenFinal();
}

/* ── Procesa una frase libre en modo "todo junto" ── */
function procesarFrase(textoOriginal) {
  const texto = normalizarVoz(textoOriginal);
  console.log('[voz] escuché:', textoOriginal);

  let aplicoAlgo = false;

  const rutaEncontrada = extraerRuta(texto);
  if (rutaEncontrada && aplicarRuta(rutaEncontrada)) aplicoAlgo = true;

  const ocupacionEncontrada = extraerOcupacion(texto);
  if (ocupacionEncontrada && aplicarOcupacion(ocupacionEncontrada)) aplicoAlgo = true;

  const padronEncontrado = extraerCampo(texto, 'padron');
  if (padronEncontrado) { const r = aplicarPadron(padronEncontrado); if (r.ok) aplicoAlgo = true; }

  const bajanEncontrado = extraerCampo(texto, 'bajan');
  if (bajanEncontrado && aplicarCampoSimple('f-bajan', bajanEncontrado)) aplicoAlgo = true;

  const subenEncontrado = extraerCampo(texto, 'suben');
  if (subenEncontrado && aplicarCampoSimple('f-suben', subenEncontrado)) aplicoAlgo = true;

  const paxEsperaEncontrado = extraerCampo(texto, 'paxespera');
  if (paxEsperaEncontrado && aplicarCampoSimple('f-paxespera', paxEsperaEncontrado)) aplicoAlgo = true;

  const tEsperaEncontrado = extraerCampo(texto, 'tespera');
  if (tEsperaEncontrado && aplicarCampoSimple('f-tespera', tEsperaEncontrado)) aplicoAlgo = true;

  const pregunta = siguientePreguntaPendiente();

  if (pregunta === null) {
    resumenFinal();
  } else {
    hablar((aplicoAlgo ? '' : 'No te entendí. ') + pregunta);
  }
}

/* ── Reconocimiento de voz del navegador ── */
function crearReconocimiento() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('❌ Este navegador no soporta reconocimiento de voz', 'rojo');
    return null;
  }
  const r = new SR();
  r.lang = IDIOMA_VOZ;
  r.continuous = false;
  r.interimResults = false;

  r.onresult = (evento) => {
    const texto = evento.results[0][0].transcript;

    if (esperando === 'placa') {
      procesarPlacaDeletreada(texto);
    } else if (esperando === 'confirmacion') {
      procesarConfirmacion(texto);
    } else if (esperando && esperando.startsWith('campo:')) {
      procesarCorreccionCampo(esperando.split(':')[1], texto);
    } else {
      procesarFrase(texto);
    }
  };

  r.onerror = (evento) => {
    console.error('[voz] error de reconocimiento:', evento.error);
    if (evento.error === 'no-speech') hablar('No escuché nada. Volvé a intentar.');
  };

  r.onend = () => {
    if (vozActivaAhora) {
      setTimeout(() => { try { reconocimiento.start(); } catch (e) {} }, 400);
    }
  };

  return r;
}

/* ── Botón "🎤 Modo voz" ── */
function toggleModoVoz() {
  const btn = document.getElementById('btn-modo-voz');

  if (!vozActivaAhora) {
    reconocimiento = reconocimiento || crearReconocimiento();
    if (!reconocimiento) return;

    vozActivaAhora = true;
    esperando = null;
    btn.classList.add('escuchando');
    btn.textContent = '🎤 Escuchando…';
    hablar('Modo voz activado. Decime la ruta y la ocupación.', () => {
      try { reconocimiento.start(); } catch (e) {}
    });
  } else {
    vozActivaAhora = false;
    esperando = null;
    btn.classList.remove('escuchando');
    btn.textContent = '🎤 Modo voz';
    try { reconocimiento.stop(); } catch (e) {}
    speechSynthesis.cancel();
    toast('Modo voz desactivado');
  }
}

/* ══════════════════════════════════════════════════════════════
   WAKE LOCK — mantiene la pantalla encendida mientras se hacen
   registros. Es INDEPENDIENTE del modo voz: se activa y desactiva
   a mano con su propio botón, para no gastar batería todo el día.
   ══════════════════════════════════════════════════════════════ */
let wakeLockRef = null;
let wakeLockActivo = false;

async function activarWakeLock() {
  try {
    wakeLockRef = await navigator.wakeLock.request('screen');
    wakeLockRef.addEventListener('release', () => {
      console.log('[wakelock] se liberó (posiblemente por cambio de pestaña)');
    });
  } catch (e) {
    console.error('[wakelock] no se pudo activar:', e);
    toast('❌ No se pudo mantener la pantalla activa', 'rojo');
  }
}

async function toggleWakeLock() {
  const btn = document.getElementById('btn-wakelock');

  if (!('wakeLock' in navigator)) {
    toast('❌ Este navegador no soporta mantener la pantalla activa', 'rojo');
    return;
  }

  if (!wakeLockActivo) {
    await activarWakeLock();
    wakeLockActivo = true;
    btn.classList.add('escuchando'); // reusa el mismo estilo rojo pulsante
    btn.textContent = '🔒 Pantalla activa';
  } else {
    wakeLockActivo = false;
    if (wakeLockRef) { try { await wakeLockRef.release(); } catch (e) {} wakeLockRef = null; }
    btn.classList.remove('escuchando');
    btn.textContent = '🔒 Mantener pantalla';
  }
}

// El sistema libera el Wake Lock solo al cambiar de pestaña/minimizar.
// Si seguía activado por el usuario, lo recupera apenas vuelve a la app.
document.addEventListener('visibilitychange', async () => {
  if (wakeLockActivo && document.visibilityState === 'visible' && !wakeLockRef) {
    await activarWakeLock();
  }
});
