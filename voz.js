/* ══════════════════════════════════════════════════════════════
   MINPAO · MODO VOZ (voz.js) — Versión 4, completa
   ------------------------------------------------------------
   Suma sobre la versión anterior:
   - Activación por palabra clave "Azulito" (además del botón)
   - Palabra de activación configurable
   - Comando "cancelar" en cualquier momento
   - Límite de 3 intentos fallidos → pasa a modo manual solo
   - Indicador visual en pantalla de qué está pasando
   - Velocidad de habla configurable (lento/normal/rápido)

   NOTA: el "tiempo de silencio" antes de considerar que el
   inspector terminó de hablar NO es configurable — no existe
   ninguna API web estándar para tocar ese valor, lo maneja
   internamente el motor de reconocimiento del navegador.
   ══════════════════════════════════════════════════════════════ */

const IDIOMA_VOZ = 'es-PE';

/* ── Sinónimos aceptados por cada nivel de ocupación ── */
/* ── Ocupación SOLO por "código 1" a "código 6".
   Se quitaron los sinónimos de palabras (lleno, completo, etc.)
   a pedido del uso en campo: solo los códigos numéricos. ── */
const SINONIMOS_OCUPACION = {
  VACIO:    ['codigo 1'],
  MEDIO:    ['codigo 2'],
  SENTADO:  ['codigo 3'],
  COMPLETO: ['codigo 4'],
  PARADO:   ['codigo 5'],
  FULL:     ['codigo 6'],
};
const PARES_OCUPACION = Object.entries(SINONIMOS_OCUPACION)
  .flatMap(([cat, frases]) => frases.map(f => [cat, f]))
  .sort((a, b) => b[1].length - a[1].length);

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

/* ── Conversor de números dichos en palabras a dígitos (0 a 99) ──
   El reconocedor a veces transcribe números chicos en palabras
   ("bajan tres" en vez de "bajan 3"); esta conversión se aplica a
   toda la frase antes de extraer campos, para no perder esos datos. ── */
const UNIDADES_NUM = {
  cero:0, un:1, uno:1, una:1, dos:2, tres:3, cuatro:4, cinco:5,
  seis:6, siete:7, ocho:8, nueve:9, diez:10, once:11, doce:12,
  trece:13, catorce:14, quince:15, dieciseis:16, diecisiete:17,
  dieciocho:18, diecinueve:19, veinte:20, veintiun:21, veintiuno:21,
  veintidos:22, veintitres:23, veinticuatro:24, veinticinco:25,
  veintiseis:26, veintisiete:27, veintiocho:28, veintinueve:29,
};
const DECENAS_NUM = {
  treinta:30, cuarenta:40, cincuenta:50, sesenta:60,
  setenta:70, ochenta:80, noventa:90,
};
const CENTENAS_NUM = {
  cien:100, ciento:100, doscientos:200, trescientos:300,
  cuatrocientos:400, quinientos:500, seiscientos:600,
  setecientos:700, ochocientos:800, novecientos:900,
};

function palabrasANumeros(textoNorm) {
  let t = textoNorm;

  // Centenas compuestas: "trescientos treinta y seis" → 336, "trescientos cinco" → 305
  t = t.replace(
    /\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
    (m, cen, dec, uni) => String(CENTENAS_NUM[cen] + DECENAS_NUM[dec] + UNIDADES_NUM[uni])
  );
  // Centena + unidad: "trescientos cinco" → 305
  t = t.replace(
    /\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(un|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
    (m, cen, uni) => String(CENTENAS_NUM[cen] + UNIDADES_NUM[uni])
  );
  // Centena + decena: "trescientos treinta" → 330
  t = t.replace(
    /\b(cien|ciento|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\s+(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\b/g,
    (m, cen, dec) => String(CENTENAS_NUM[cen] + DECENAS_NUM[dec])
  );
  // Centena sola: "trescientos" → 300
  t = t.replace(
    /\b(doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos)\b/g,
    m => String(CENTENAS_NUM[m])
  );

  // Decena + unidad: "treinta y cinco" → 35
  t = t.replace(
    /\b(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\s+y\s+(un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b/g,
    (m, dec, uni) => String(DECENAS_NUM[dec] + UNIDADES_NUM[uni])
  );
  t = t.replace(
    /\b(treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa)\b/g,
    m => String(DECENAS_NUM[m])
  );
  t = t.replace(
    /\b(cero|un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|diecisiete|dieciocho|diecinueve|veinte|veintiun|veintiuno|veintidos|veintitres|veinticuatro|veinticinco|veintiseis|veintisiete|veintiocho|veintinueve)\b/g,
    m => String(UNIDADES_NUM[m])
  );
  return t;
}

const CAMPOS_CORREGIBLES = {
  ruta: 'ruta', ocupacion: 'ocupacion', ocupación: 'ocupacion',
  padron: 'padron', padrón: 'padron', placa: 'placa',
  bajan: 'bajan', suben: 'suben',
  espera: 'espera', tiempo: 'espera',
  pax: 'pax',
};

/* ── Estado del módulo ──
   esperando: null | 'placa' | 'confirmacion' | 'campo:<nombre>'
   enReposo: true = esperando una ruta para iniciar un registro nuevo
             false = registro en curso, pidiendo los campos que faltan */
let vozActivaAhora = false;
let reconocimiento = null;
let esperando = null;
let modoParadero = false;
let velocidadVoz = 1.0;
let enReposo = true;              // arranca esperando la primera ruta
let temporizadorSilencio = null;  // recordatorio único tras varios segundos de silencio
const SEGUNDOS_SILENCIO = 12;     // espera paciente antes de UN recordatorio

let wakeWordActivo = false;
let wakeWordRecognition = null;
let palabraActivacion = localStorage.getItem('minpao_palabra_voz') || 'minpao';

/* ── Utilidades ── */
function normalizarVoz(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function actualizarIndicadorVoz(texto) {
  const el = document.getElementById('voz-indicador');
  if (el) el.textContent = texto || '';
}

function hablar(texto, alTerminar) {
  actualizarIndicadorVoz('🔵 ' + texto);
  try {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = IDIOMA_VOZ;
    u.rate = velocidadVoz;
    if (alTerminar) u.onend = alTerminar;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {
    console.error('Error de síntesis de voz:', e);
    if (alTerminar) alTerminar();
  }
}

/* ── Velocidad de habla configurable ── */
function cambiarVelocidadVoz(valor) {
  velocidadVoz = parseFloat(valor) || 1.0;
}

/* ── Temporizador de silencio: tras varios segundos sin respuesta útil,
   repite UNA sola vez la pregunta pendiente y sigue esperando en silencio.
   Nunca apaga el modo voz. ── */
function programarRecordatorio() {
  cancelarRecordatorio();
  if (enReposo) return; // en reposo espera callado la próxima ruta, no molesta
  temporizadorSilencio = setTimeout(() => {
    const pregunta = siguientePreguntaPendiente();
    if (pregunta && vozActivaAhora && !enReposo) {
      hablar(pregunta); // un solo recordatorio; luego vuelve a esperar en silencio
    }
  }, SEGUNDOS_SILENCIO * 1000);
}
function cancelarRecordatorio() {
  if (temporizadorSilencio) { clearTimeout(temporizadorSilencio); temporizadorSilencio = null; }
}

/* ── Vuelve al estado de reposo: registro terminado o cancelado.
   Queda escuchando en silencio hasta la próxima ruta. ── */
function volverAReposo() {
  esperando = null;
  enReposo = true;
  cancelarRecordatorio();
  actualizarIndicadorVoz('👂 Esperando ruta…');
}

/* ── Comando "cancelar registro": el bus se fue sin verlo bien ── */
function cancelarRegistroEnCurso() {
  estado.ruta = '';
  estado.ocupacion = '';
  document.querySelectorAll('.btn-ruta, .btn-occ').forEach(b => b.classList.remove('activo'));
  ['f-padron', 'f-placa', 'f-bajan', 'f-suben', 'f-tespera', 'f-paxespera'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.className = ''; }
  });
  hablar('Registro cancelado. Dime la ruta del siguiente bus.');
  volverAReposo();
}

/* ── Extractores de ruta / ocupación ──
   La ruta puede llegar de varias formas según cómo la transcriba
   el reconocedor: "336", "tres tres seis", "trescientos treinta
   y seis", o "ruta expreso" / "semiexpreso". Se cubren todas. ── */
function extraerRuta(textoNorm) {
  const t = ' ' + textoNorm + ' ';

  // 1) Rutas especiales por palabra (expreso / semiexpreso → SEMIEXP)
  if (/\b(semi\s*expreso|semiexpreso|expreso|exp)\b/.test(t)) {
    if (rutas.includes('SEMIEXP')) return 'SEMIEXP';
  }

  // 2) Coincidencia directa del número tal cual ("336")
  for (const r of rutas) {
    if (r === 'SEMIEXP') continue;
    if (new RegExp('\\b' + normalizarVoz(r) + '\\b').test(t)) return r;
  }

  // 3) Número dicho dígito por dígito: "tres tres seis" → "336"
  const soloDigitos = t.replace(/[^0-9\s]/g, ' ').replace(/\s+/g, '');
  for (const r of rutas) {
    if (r === 'SEMIEXP') continue;
    if (soloDigitos.includes(r)) return r;
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
  onPadronInput(inp);
  const placaInp = document.getElementById('f-placa');
  const esNuevo = placaInp.classList.contains('placa-nueva');
  return { ok: true, esNuevo };
}

/* ── Placa dictada letra por letra, número por número ── */
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
    hablar('No entendí bien la placa. Dila de nuevo, letra por letra y número por número.');
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
    // La placa NO se dicta por voz (poco fiable): se pide escribir a mano
    return 'Bus nuevo. Escribe la placa a mano en la pantalla, y luego di "listo".';
  }

  if (!modoParadero) {
    return null; // Modo Tranquera: completo con ruta+ocupación+padrón(+placa)
  }

  if (!document.getElementById('f-bajan').value.trim()) return '¿Cuántos bajan?';
  if (!document.getElementById('f-suben').value.trim()) return '¿Cuántos suben?';
  if (!document.getElementById('f-tespera').value.trim()) return '¿Tiempo de espera?';
  if (!document.getElementById('f-paxespera').value.trim()) return '¿Pax en espera?';

  return null;
}

/* ── Arma y lee el resumen final, y pasa a modo confirmación ── */
function resumenFinal() {
  const padron = document.getElementById('f-padron').value.trim();
  const placa = document.getElementById('f-placa').value.trim();

  const partes = [
    'ruta ' + estado.ruta,
    'ocupación ' + estado.ocupacion,
    'padrón ' + padron,
  ];
  if (placa) partes.push('placa ' + placa);

  if (modoParadero) {
    const bajan = document.getElementById('f-bajan').value.trim();
    const suben = document.getElementById('f-suben').value.trim();
    const tespera = document.getElementById('f-tespera').value.trim();
    const paxespera = document.getElementById('f-paxespera').value.trim();
    partes.push('bajan ' + bajan, 'suben ' + suben);
    if (tespera) partes.push('espera ' + tespera + ' minutos');
    if (paxespera) partes.push('pax en espera ' + paxespera);
  }

  esperando = 'confirmacion';
  hablar(partes.join(', ') + '. ¿Guardo?');
}

/* ── Interpreta la respuesta a "¿Guardo?" ── */
function procesarConfirmacion(textoOriginal) {
  const t = normalizarVoz(textoOriginal);

  if (/\b(guardar|si|confirmar|dale|correcto|ya|listo)\b/.test(t)) {
    guardarRegistro();
    hablar('Registro guardado. Dime la ruta del siguiente bus.');
    volverAReposo();
    return;
  }

  if (/\brepetir\b/.test(t)) { resumenFinal(); return; }

  const m = t.match(/corregir\s+([a-z]+)/);
  const campo = m ? CAMPOS_CORREGIBLES[m[1]] : null;

  if (campo) { iniciarCorreccion(campo); return; }

  hablar('No entendí. Di "guardar" para confirmar, o "corregir" y el campo que quieras cambiar.');
}

/* ── Prepara el re-ingreso de un campo puntual ── */
function iniciarCorreccion(campo) {
  if (campo === 'ruta') {
    estado.ruta = '';
    document.querySelectorAll('.btn-ruta').forEach(b => b.classList.remove('activo'));
    esperando = 'campo:ruta';
    hablar('Dime la nueva ruta.');
  } else if (campo === 'ocupacion') {
    estado.ocupacion = '';
    document.querySelectorAll('.btn-occ').forEach(b => b.classList.remove('activo'));
    esperando = 'campo:ocupacion';
    hablar('Dime la nueva ocupación.');
  } else if (campo === 'padron') {
    document.getElementById('f-padron').value = '';
    document.getElementById('f-placa').value = '';
    esperando = 'campo:padron';
    hablar('Dime el nuevo padrón.');
  } else if (campo === 'placa') {
    document.getElementById('f-placa').value = '';
    esperando = 'placa';
    hablar('Dime la nueva placa, letra por letra y número por número.');
  } else {
    const idMap = { bajan: 'f-bajan', suben: 'f-suben', espera: 'f-tespera', pax: 'f-paxespera' };
    document.getElementById(idMap[campo]).value = '';
    esperando = 'campo:' + campo;
    hablar('Dime el nuevo valor de ' + campo + '.');
  }
}

/* ── Procesa la respuesta cuando se está corrigiendo un campo puntual ── */
function procesarCorreccionCampo(campo, textoOriginal) {
  const texto = normalizarVoz(textoOriginal);
  let ok = false;

  if (campo === 'ruta') {
    const r = extraerRuta(palabrasANumeros(texto));
    if (r) ok = aplicarRuta(r);
  } else if (campo === 'ocupacion') {
    const c = extraerOcupacion(texto);
    if (c) ok = aplicarOcupacion(c);
  } else if (campo === 'padron') {
    const p = palabrasANumeros(texto).match(/\d+/);
    if (p) { aplicarPadron(p[0]); ok = true; }
  } else {
    const idMap = { bajan: 'f-bajan', suben: 'f-suben', espera: 'f-tespera', pax: 'f-paxespera' };
    const p = palabrasANumeros(texto).match(/\d+/);
    if (p) ok = aplicarCampoSimple(idMap[campo], p[0]);
  }

  if (!ok) {
    hablar('No entendí. Repite el valor de ' + campo + '.');
    return;
  }

  esperando = null;

  if (campo === 'padron') {
    const placaInp = document.getElementById('f-placa');
    if (placaInp.classList.contains('placa-nueva') && !placaInp.value.trim()) {
      hablar('Bus nuevo. Escribe la placa a mano en la pantalla, y luego di "listo".');
      return;
    }
  }

  resumenFinal();
}

/* ── Procesa una frase libre en modo "todo junto" ── */
function procesarFrase(textoOriginal) {
  // Convierte números en palabras a dígitos ANTES de extraer
  // ("bajan tres" → "bajan 3", "codigo seis" → "codigo 6")
  const texto = palabrasANumeros(normalizarVoz(textoOriginal));
  console.log('[voz] escuché:', textoOriginal, '→', texto);

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

  // ── Padrón sin palabra clave: si ruta y ocupación ya están,
  // el padrón sigue vacío, y quedó un número suelto en la frase
  // (que no fue consumido por otro campo), se toma como padrón. ──
  if (!padronEncontrado &&
      estado.ruta && estado.ocupacion &&
      !document.getElementById('f-padron').value.trim()) {
    let restante = texto;
    // Quitar el "codigo N" para que ese número NO se tome como padrón
    restante = restante.replace(/codigo\s+\d+/g, ' ');
    // Quitar el número de la ruta (ej. "336", "trescientos treinta y seis" ya convertido)
    if (rutaEncontrada) restante = restante.replace(normalizarVoz(rutaEncontrada), ' ');
    restante = restante.replace(/\b(301|303|305|336|372)\b/g, ' ');
    Object.values(PATRONES_CAMPO).flat().forEach(p => { restante = restante.replace(p, ' '); });
    const suelto = restante.match(/\b(\d{1,4})\b/);
    if (suelto) {
      const r = aplicarPadron(suelto[1]);
      if (r.ok) aplicoAlgo = true;
    }
  }

  // ── Si se estaba esperando la placa escrita a mano y el usuario
  // dice "listo"/"ya"/"continua", re-evaluar (la placa ya debería estar escrita) ──
  const placaInp0 = document.getElementById('f-placa');
  const esperabaPlacaManual = placaInp0.classList.contains('placa-nueva') &&
                              !aplicoAlgo && /\b(listo|ya|continua|sigue|siguiente)\b/.test(texto);
  if (esperabaPlacaManual && placaInp0.value.trim()) {
    aplicoAlgo = true; // la placa fue escrita: avanzar
  }

  const pregunta = siguientePreguntaPendiente();

  if (pregunta === null) {
    resumenFinal();
  } else if (aplicoAlgo) {
    // Solo pregunta lo que falta cuando reconoció algo; si no, calla y sigue esperando
    hablar(pregunta);
  }
}

/* ── Botón "🚦 Modo: Tranquera / 🚏 Modo: Paradero" ── */
function toggleModoParadero() {
  modoParadero = !modoParadero;
  const btn = document.getElementById('btn-modo-paradero');
  if (modoParadero) {
    btn.textContent = '🚏 Modo: Paradero';
    btn.style.background = '#0d47a1';
  } else {
    btn.textContent = '🚦 Modo: Tranquera';
    btn.style.background = '#6d4c41';
  }
  if (vozActivaAhora) {
    hablar(modoParadero
      ? 'Modo paradero. Ahora también voy a pedir bajan, suben, espera y pax.'
      : 'Modo tranquera. Solo ruta, ocupación y padrón.');
  }
}

/* ── Reconocimiento de voz de la CONVERSACIÓN (no confundir con el del wake word) ── */
function crearReconocimiento() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('❌ Este navegador no soporta reconocimiento de voz', 'rojo');
    return null;
  }
  const r = new SR();
  r.lang = IDIOMA_VOZ;
  r.continuous = true;       // escucha sostenida durante todo el turno
  r.interimResults = false;

  r.onstart = () => {
    marcaReconocimientoVivo = Date.now();
    actualizarIndicadorVoz(enReposo ? '👂 Esperando ruta…' : '🎤 Escuchando…');
  };

  r.onresult = (evento) => {
    marcaReconocimientoVivo = Date.now();
    // Toma solo el último resultado final (el más reciente que dijo el inspector)
    const ultimo = evento.results[evento.results.length - 1];
    if (!ultimo || !ultimo.isFinal) return;
    const texto = ultimo[0].transcript;
    const textoNorm = normalizarVoz(texto);

    // Cada vez que llega audio útil, se reinicia la cuenta de silencio
    cancelarRecordatorio();

    // ── Comando global para APAGAR por voz: "minpao finaliza/termina/para" ──
    const pa = normalizarVoz(palabraActivacion);
    const reFinaliza = new RegExp(pa + '\\s+(finaliza|termina|para|apaga|detente|chau)');
    if (reFinaliza.test(textoNorm) || /\bfinalizar voz|terminar voz|apagar voz\b/.test(textoNorm)) {
      hablar('Modo voz apagado.');
      setTimeout(() => desactivarModoVoz(), 900);
      return;
    }

    // ── Comandos globales (funcionan en cualquier momento) ──
    if (/cancelar registro|cancelar/.test(textoNorm)) { cancelarRegistroEnCurso(); return; }
    if (/nuevo registro|nuevo bus|empezar de nuevo/.test(textoNorm)) {
      // Arranca uno nuevo aunque esté a mitad de otro
      estado.ruta = ''; estado.ocupacion = '';
      document.querySelectorAll('.btn-ruta, .btn-occ').forEach(b => b.classList.remove('activo'));
      ['f-padron','f-placa','f-bajan','f-suben','f-tespera','f-paxespera'].forEach(id => {
        const el = document.getElementById(id); if (el) { el.value = ''; el.className = ''; }
      });
      enReposo = false;
      hablar('Nuevo registro. Dime la ruta.');
      programarRecordatorio();
      return;
    }
    if (/cuantos (llevo|registros|van)/.test(textoNorm)) { responderContadorRegistros(); return; }

    // ── En REPOSO: solo reacciona si oye una ruta válida; todo lo demás lo ignora ──
    if (enReposo) {
      const rutaDetectada = extraerRuta(palabrasANumeros(textoNorm));
      if (!rutaDetectada) return; // conversación/ruido: ni contesta
      enReposo = false;
      procesarFrase(texto); // procesa la ruta (y lo demás que venga en la misma frase)
      programarRecordatorio();
      return;
    }

    // ── Registro en curso ──
    if (esperando === 'confirmacion') {
      procesarConfirmacion(texto);
    } else if (esperando && esperando.startsWith('campo:')) {
      procesarCorreccionCampo(esperando.split(':')[1], texto);
    } else {
      procesarFrase(texto);
    }
    programarRecordatorio();
  };

  r.onerror = (evento) => {
    // 'no-speech' y 'aborted' son normales en escucha continua: no molestar al usuario
    if (evento.error !== 'no-speech' && evento.error !== 'aborted') {
      console.error('[voz] error de reconocimiento:', evento.error);
    }
    // Si el error dejó el micro caído, se reintenta desde onend (se dispara igual).
    // Para errores de permiso sí avisamos, porque no se puede recuperar solo.
    if (evento.error === 'not-allowed' || evento.error === 'service-not-allowed') {
      toast('❌ El micrófono está bloqueado. Permítelo en los ajustes de la app.', 'rojo');
      vozActivaAhora = false;
    }
  };

  r.onend = () => {
    // Reinicio para mantener la escucha viva todo el turno.
    // Se reintenta con varios intentos por si el primer start() falla
    // (pasa cuando el motor todavía no terminó de liberarse).
    if (!vozActivaAhora) return;
    reiniciarReconocimiento(0);
  };

  return r;
}

/* ── Reinicio robusto del reconocimiento: si start() falla porque el
   motor aún no se liberó, reintenta unas cuantas veces con más espera.
   Esto evita que el micrófono se quede apagado a mitad del turno. ── */
function reiniciarReconocimiento(intento) {
  if (!vozActivaAhora) return;
  try {
    reconocimiento.start();
  } catch (e) {
    // 'InvalidStateError' = ya está corriendo → todo bien, no hacer nada
    if (e && e.name === 'InvalidStateError') return;
    // Cualquier otro fallo: reintentar hasta 5 veces con espera creciente
    if (intento < 5) {
      setTimeout(() => reiniciarReconocimiento(intento + 1), 300 + intento * 200);
    }
  }
}

/* ── Bip corto de confirmación (al activarse por palabra clave) ── */
function bipActivacion() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  } catch (e) {}
}

/* ── Contador hablado: "¿cuántos llevo?" responde los registros del día ── */
function responderContadorRegistros() {
  let cantidad = 0;
  try {
    cantidad = dbDelUsuario().filter(r => r.fecha === hoy()).length;
  } catch (e) {}
  if (cantidad === 0) hablar('Todavía no tienes registros hoy.');
  else if (cantidad === 1) hablar('Llevas 1 registro hoy.');
  else hablar('Llevas ' + cantidad + ' registros hoy.');
}

/* ── Enciende / apaga el modo voz — usado por el botón manual y por el wake word ── */
function activarConversacionPorVoz(desdeWakeWord) {
  const btn = document.getElementById('btn-modo-voz');
  reconocimiento = reconocimiento || crearReconocimiento();
  if (!reconocimiento) return;

  vozActivaAhora = true;
  esperando = null;
  enReposo = true; // arranca esperando la primera ruta
  btn.classList.add('escuchando');
  btn.textContent = '🎤 Escuchando…';

  iniciarLatidoMicrofono(); // red de seguridad para que el micro no se muera

  if (desdeWakeWord) {
    bipActivacion();
    hablar('Dime la ruta.', () => {
      reiniciarReconocimiento(0);
    });
  } else {
    hablar('Modo voz activado. Dime la ruta para empezar.', () => {
      reiniciarReconocimiento(0);
    });
  }
}

/* ── Latido: cada 4 segundos revisa que el micrófono siga vivo.
   marcaReconocimientoVivo se actualiza en cada onstart/onresult;
   si pasa demasiado tiempo sin señales, se fuerza un reinicio.
   Es la garantía de que el micro no quede apagado en silencio. ── */
let latidoMic = null;
let marcaReconocimientoVivo = 0;

function iniciarLatidoMicrofono() {
  detenerLatidoMicrofono();
  marcaReconocimientoVivo = Date.now();
  latidoMic = setInterval(() => {
    if (!vozActivaAhora) { detenerLatidoMicrofono(); return; }
    const inactivo = Date.now() - marcaReconocimientoVivo;
    // Si lleva más de 6s sin ninguna señal de vida del motor, reiniciar
    if (inactivo > 6000) {
      marcaReconocimientoVivo = Date.now();
      reiniciarReconocimiento(0);
    }
  }, 4000);
}
function detenerLatidoMicrofono() {
  if (latidoMic) { clearInterval(latidoMic); latidoMic = null; }
}

function desactivarModoVoz() {
  const btn = document.getElementById('btn-modo-voz');
  vozActivaAhora = false;
  esperando = null;
  enReposo = true;
  cancelarRecordatorio();
  detenerLatidoMicrofono();
  btn.classList.remove('escuchando');
  btn.textContent = '🎤 Modo voz';
  try { reconocimiento.stop(); } catch (e) {}
  speechSynthesis.cancel();
  actualizarIndicadorVoz('');
  toast('Modo voz desactivado');

  // Si la activación por palabra clave seguía encendida, retoma la escucha de fondo
  if (wakeWordActivo) {
    setTimeout(() => iniciarEscuchaWakeWord(), 800);
  }
}

function toggleModoVoz() {
  if (!vozActivaAhora) activarConversacionPorVoz();
  else desactivarModoVoz();
}

/* ══════════════════════════════════════════════════════════════
   ACTIVACIÓN POR PALABRA CLAVE ("Azulito")
   ------------------------------------------------------------
   Escucha de fondo, en un reconocimiento continuo aparte del de
   la conversación (el micrófono solo puede usar uno a la vez).
   Al detectar la palabra clave, apaga esta escucha y arranca la
   conversación normal, como si hubieras tocado el botón.
   ══════════════════════════════════════════════════════════════ */
function iniciarEscuchaWakeWord() {
  if (vozActivaAhora) return; // no correr los dos reconocimientos a la vez

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    toast('❌ Este navegador no soporta reconocimiento de voz', 'rojo');
    wakeWordActivo = false;
    return;
  }

  wakeWordRecognition = new SR();
  wakeWordRecognition.lang = IDIOMA_VOZ;
  wakeWordRecognition.continuous = true;
  wakeWordRecognition.interimResults = true;

  wakeWordRecognition.onstart = () => actualizarIndicadorVoz('👂 Esperando "' + palabraActivacion + '"…');

  wakeWordRecognition.onresult = (evento) => {
    for (let i = evento.resultIndex; i < evento.results.length; i++) {
      const texto = normalizarVoz(evento.results[i][0].transcript);
      const pa = normalizarVoz(palabraActivacion);
      // Acepta la palabra clave sola, o con "inicia/activa/empieza/comienza"
      if (texto.includes(pa)) {
        try { wakeWordRecognition.stop(); } catch (e) {}
        activarConversacionPorVoz(true);
        return;
      }
    }
  };

  wakeWordRecognition.onerror = (evento) => {
    console.error('[wakeword] error:', evento.error);
  };

  wakeWordRecognition.onend = () => {
    // Si sigue activado y no se pasó a la conversación, reinicia la escucha de fondo
    if (wakeWordActivo && !vozActivaAhora) {
      setTimeout(() => { try { wakeWordRecognition.start(); } catch (e) {} }, 500);
    }
  };

  try { wakeWordRecognition.start(); } catch (e) {}
}

function detenerEscuchaWakeWord() {
  wakeWordActivo = false;
  if (wakeWordRecognition) { try { wakeWordRecognition.stop(); } catch (e) {} }
  actualizarIndicadorVoz('');
}

function toggleWakeWord() {
  const btn = document.getElementById('btn-wakeword');
  if (!wakeWordActivo) {
    wakeWordActivo = true;
    btn.classList.add('escuchando');
    btn.textContent = '🗣️ Esperando "' + palabraActivacion + '"…';
    iniciarEscuchaWakeWord();
  } else {
    detenerEscuchaWakeWord();
    btn.classList.remove('escuchando');
    btn.textContent = '🗣️ Activación por voz';
  }
}

/* ── Palabra de activación configurable ── */
function configurarPalabraActivacion() {
  const nueva = prompt('Palabra de activación (sin tildes, en minúscula funciona igual):', palabraActivacion);
  if (!nueva || !nueva.trim()) return;

  palabraActivacion = normalizarVoz(nueva.trim());
  localStorage.setItem('minpao_palabra_voz', palabraActivacion);
  toast('Palabra de activación actualizada a "' + palabraActivacion + '"');

  const btn = document.getElementById('btn-wakeword');
  if (wakeWordActivo) {
    detenerEscuchaWakeWord();
    wakeWordActivo = true;
    setTimeout(() => iniciarEscuchaWakeWord(), 500);
    if (btn) btn.textContent = '🗣️ Esperando "' + palabraActivacion + '"…';
  } else if (btn) {
    btn.textContent = '🗣️ Activación por voz';
  }
}

/* ══════════════════════════════════════════════════════════════
   WAKE LOCK + bloqueo táctil de la pantalla
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

function aplicarBloqueoTactil(activar) {
  const overlay = document.getElementById('overlay-bloqueo');
  if (!overlay) return;
  overlay.style.display = activar ? 'block' : 'none';
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
    btn.classList.add('bloqueada');
    btn.textContent = '🔒 Pantalla activa';
    aplicarBloqueoTactil(true);
    toast('🔒 Pantalla bloqueada. Toca el botón de nuevo para desbloquear.');
  } else {
    wakeLockActivo = false;
    if (wakeLockRef) { try { await wakeLockRef.release(); } catch (e) {} wakeLockRef = null; }
    btn.classList.remove('bloqueada');
    btn.textContent = '🔒 Mantener pantalla';
    aplicarBloqueoTactil(false);
  }
}

document.addEventListener('visibilitychange', async () => {
  if (wakeLockActivo && document.visibilityState === 'visible' && !wakeLockRef) {
    await activarWakeLock();
  }
});
