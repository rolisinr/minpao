/* ══════════════════════════════════════════════════════════════
   MINPAO · MODO VOZ (voz.js)
   ══════════════════════════════════════════════════════════════ */

/* ── Verificación de compatibilidad: si el navegador no soporta
   SpeechRecognition (ej. Safari iOS en algunos contextos), el módulo
   se carga sin errores pero las funciones de voz no hacen nada. ── */
const VOZ_SOPORTADA = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
const TTS_SOPORTADO = !!window.speechSynthesis;

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
const SEGUNDOS_SILENCIO = 20;     // espera paciente antes de UN recordatorio (semáforo largo)

let wakeWordActivo = false;
let wakeWordRecognition = null;
let palabraActivacion = localStorage.getItem('minpao_palabra_voz') || 'azul';

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

/* ── minpaoHablando: true mientras suena la voz. loQueDijoMinpao guarda
   las palabras que está diciendo, para poder filtrar el eco (que el
   micrófono no confunda la voz de minpao con la del inspector). ── */
let minpaoHablando = false;
let loQueDijoMinpao = '';

function hablar(texto, alTerminar) {
  actualizarIndicadorVoz('🔵 ' + texto);
  loQueDijoMinpao = normalizarVoz(texto);
  // Pausar el micrófono mientras habla para evitar que capte su propia voz (loops)
  try { if (reconocimiento) reconocimiento.stop(); } catch(e) {}
  try {
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = IDIOMA_VOZ;
    u.rate = Math.min(velocidadVoz * 1.15, 1.6);
    u.volume = 0.85;
    minpaoHablando = true;
    u.onend = () => {
      minpaoHablando = false;
      setTimeout(() => { loQueDijoMinpao = ''; }, 400);
      // Reactivar el micrófono después de hablar
      if (vozActivaAhora) setTimeout(() => reiniciarReconocimiento(0), 300);
      if (alTerminar) alTerminar();
    };
    u.onerror = () => {
      minpaoHablando = false;
      if (vozActivaAhora) setTimeout(() => reiniciarReconocimiento(0), 300);
      if (alTerminar) alTerminar();
    };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch (e) {
    console.error('Error de síntesis de voz:', e);
    minpaoHablando = false;
    if (vozActivaAhora) reiniciarReconocimiento(0);
    if (alTerminar) alTerminar();
  }
}

/* ── Corta la voz de minpao al instante (para el barge-in / interrupción) ── */
function callarMinpao() {
  try { speechSynthesis.cancel(); } catch (e) {}
  minpaoHablando = false;
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

  // 1) Rutas especiales por palabra (expreso / semiexpreso)
  if (/\b(semi\s*expreso|semiexpreso|expreso|exp)\b/.test(t)) {
    // Buscar la ruta que contenga "EXP" en el array real (puede ser SEMIEXP, SEMIEXPRESO, etc.)
    const rutaExp = rutas.find(r => normalizarVoz(r).includes('exp'));
    if (rutaExp) return rutaExp;
  }

  // 2) Coincidencia directa del número tal cual ("336")
  for (const r of rutas) {
    if (normalizarVoz(r).includes('exp')) continue; // ya manejado arriba
    if (new RegExp('\\b' + normalizarVoz(r) + '\\b').test(t)) return r;
  }

  // 3) Número dicho dígito por dígito: "tres tres seis" → "336"
  const soloDigitos = t.replace(/[^0-9\s]/g, ' ').replace(/\s+/g, '');
  for (const r of rutas) {
    if (normalizarVoz(r).includes('exp')) continue;
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
  if (pregunta === null) { guardarRegistro(); bipGuardado(); hablar("Guardado."); volverAReposo(); }
  else { hablar('Placa ' + placaFinal + ' anotada. ' + pregunta); }
}

/* ── Devuelve la próxima pregunta pendiente, o null si ya está todo completo.
   Frases de una sola palabra, cortas y directas. ── */
function siguientePreguntaPendiente() {
  if (!estado.ruta) return 'Ruta';
  if (!estado.ocupacion) return 'Capacidad';

  const padronVal = document.getElementById('f-padron').value.trim();
  if (!padronVal) return 'Padrón';

  const placaInp = document.getElementById('f-placa');
  if (placaInp.classList.contains('placa-nueva') && !placaInp.value.trim()) {
    // La placa NO se dicta por voz (poco fiable): se pide escribir a mano
    return 'Bus nuevo. Escribe la placa y di "listo".';
  }

  if (!modoParadero) {
    return null; // Modo Tranquera: completo con ruta+ocupación+padrón(+placa)
  }

  if (!document.getElementById('f-bajan').value.trim()) return 'Bajan';
  if (!document.getElementById('f-suben').value.trim()) return 'Suben';
  if (!document.getElementById('f-tespera').value.trim()) return 'Espera';
  if (!document.getElementById('f-paxespera').value.trim()) return 'Pax';

  return null;
}

/* ── Arma el texto del resumen corto: "301, sentados 100%, padrón 21"
   Sin la palabra "ruta" delante del número y sin leer la placa. ── */
function textoResumenCorto() {
  const padron = document.getElementById('f-padron').value.trim();
  const partes = [
    estado.ruta,              // solo el número/nombre, sin "ruta"
    estado.ocupacion,         // ej. "Sentados (100%)"
    'padrón ' + padron,
  ];
  if (modoParadero) {
    const bajan = document.getElementById('f-bajan').value.trim();
    const suben = document.getElementById('f-suben').value.trim();
    const tespera = document.getElementById('f-tespera').value.trim();
    const paxespera = document.getElementById('f-paxespera').value.trim();
    partes.push('bajan ' + bajan, 'suben ' + suben);
    if (tespera) partes.push('espera ' + tespera);
    if (paxespera) partes.push('pax ' + paxespera);
  }
  return partes.join(', ');
}

let tempAutoGuardar = null;

/* ── Resumen 1: lo lee y pregunta "¿guardar o corregir?".
   Si en 5 segundos no respondes, dispara el auto-guardado (Resumen 2). ── */
function resumenFinal() {
  esperando = 'confirmacion';
  cancelarAutoGuardar();
  hablar(textoResumenCorto() + '. ¿Guardar o corregir?', () => {
    // Al terminar de hablar, arranca la cuenta de 5s para auto-guardar
    tempAutoGuardar = setTimeout(() => {

    }, 5000);
  });
}

/* ── Resumen 2: repite el resumen y guarda solo ── */
function autoGuardarConResumen() {
  cancelarAutoGuardar();
  guardarRegistro(); bipGuardado();
  hablar(textoResumenCorto() + '. Guardado.');
  volverAReposo();
}
function cancelarAutoGuardar() {
  if (tempAutoGuardar) { clearTimeout(tempAutoGuardar); tempAutoGuardar = null; }
}

/* ── Interpreta la respuesta a "¿Guardar o corregir?" (o "¿Guardar o eliminar?") ── */
function procesarConfirmacion(textoOriginal) {
  const t = normalizarVoz(textoOriginal);
  cancelarAutoGuardar(); // el inspector respondió: cancelar el auto-guardado

  if (/\b(eliminar|borrar)\b/.test(t)) { cancelarRegistroEnCurso(); return; }

  if (/\b(guardar|guarda|si|confirmar|dale|correcto|ya|listo)\b/.test(t)) {
    guardarRegistro(); bipGuardado();
    hablar('Guardado.');
    volverAReposo();
    return;
  }

  if (/\brepetir\b/.test(t)) { guardarRegistro(); bipGuardado(); hablar("Guardado."); volverAReposo(); return; }

  const m = t.match(/corregir\s+([a-z]+)/);
  const campo = m ? CAMPOS_CORREGIBLES[m[1]] : null;

  if (campo) { iniciarCorreccion(campo); return; }

  // No entendió: vuelve a leer el resumen (que re-arma la cuenta de 5s)
  guardarRegistro(); bipGuardado(); hablar("Guardado."); volverAReposo();
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

  guardarRegistro(); bipGuardado(); hablar("Guardado."); volverAReposo();
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
    // Guardar directo, sin resumen ni confirmación
    guardarRegistro(); bipGuardado();
    hablar('Guardado.');
    volverAReposo();
  } else if (aplicoAlgo) {
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
  // 1.4: Mostrar/ocultar campos manuales de bajan/suben/tespera/pax
  const wrap = document.getElementById('campos-paradero-wrap');
  const sep = document.querySelector('.campos-paradero');
  if (wrap) wrap.style.display = modoParadero ? 'block' : 'none';
  if (sep) sep.style.display = modoParadero ? 'block' : 'none';

  if (vozActivaAhora) {
    hablar(modoParadero
      ? 'Modo paradero.'
      : 'Modo tranquera.');
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
    if (!textoNorm) return;

    // ── FILTRO DE ECO: si minpao está hablando y lo que se captó es
    // casi idéntico a lo que minpao dice, es su propio eco → ignorar.
    // Si el inspector dijo algo más (ej. "ruta 301" vs eco "ruta"),
    // NO es eco: se procesa y se le corta la voz a minpao (barge-in). ──
    if (minpaoHablando && loQueDijoMinpao) {
      const soloEco = (textoNorm === loQueDijoMinpao) ||
                      (loQueDijoMinpao.includes(textoNorm) && textoNorm.length >= 4);
      // Detectar si el inspector aportó datos reales (números, ruta, código, comandos)
      const tieneDatoUtil = /\d/.test(textoNorm) ||
                            /\b(guardar|corregir|cancelar|nuevo|expreso|listo|codigo|eliminar|borrar|continuar|reanudar)\b/.test(textoNorm);
      if (soloEco && !tieneDatoUtil) return; // es eco puro: ignorar
      callarMinpao(); // el inspector habló con contenido: interrumpir a minpao
    }

    // Cada vez que llega audio útil, se reinicia la cuenta de silencio
    cancelarRecordatorio();
    cancelarAutoGuardar();

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
      // Limpia todo y vuelve al reposo silencioso (igual que cancelar):
      // espera tranquilo la próxima ruta, sin repetir seguido.
      estado.ruta = ''; estado.ocupacion = '';
      document.querySelectorAll('.btn-ruta, .btn-occ').forEach(b => b.classList.remove('activo'));
      ['f-padron','f-placa','f-bajan','f-suben','f-tespera','f-paxespera'].forEach(id => {
        const el = document.getElementById(id); if (el) { el.value = ''; el.className = ''; }
      });
      hablar('Nuevo registro. Ruta.');
      volverAReposo();
      return;
    }
    if (/cuantos (llevo|registros|van|tengo)|conteo/.test(textoNorm)) { responderContadorRegistros(); return; }
    if (/que hora es|hora actual|dime la hora/.test(textoNorm)) { responderHora(); return; }
    if (/que dia es|dia de hoy|que fecha/.test(textoNorm)) { responderDia(); return; }
    if (/bateria|pila|carga/.test(textoNorm)) { responderBateria(); return; }
    if (/cuanto (tiempo|falta)|tiempo restante|cuanto queda/.test(textoNorm)) { responderTiempoRestante(); return; }
    if (/ultimo (padron|registro|bus)|cual fue el ultimo/.test(textoNorm)) { responderUltimoPadron(); return; }
    if (/editar (ultimo|el ultimo|anterior)|ultimo registro|editar registro/.test(textoNorm)) { corregirUltimoRegistro(); return; }
    if (/iniciar temporizador|iniciar timer|iniciar reloj|iniciar hora/.test(textoNorm)) { iniciarTemporizador(); hablar('Temporizador iniciado.'); return; }
    if (esperando !== 'reanudar' && /\bpausar\b|pausa registro|pausa temporizador/.test(textoNorm)) { pausarConMotivo('Pausa por voz'); hablar('Pausado.'); return; }
    if (esperando !== 'reanudar' && /\breanudar\b|reanudar registro|reanudar temporizador|continuar registro/.test(textoNorm)) { reanudarTemporizador(); hablar('Reanudado.'); return; }
    if (/finalizar (temporizador|timer|hora)|terminar hora/.test(textoNorm)) { finalizarTemporizador(); return; }

    // ── Comando global "guardar": si el formulario está completo,
    // funciona en cualquier momento (incluso recién activada la voz) ──
    if (/\bguardar\b/.test(textoNorm) && esperando !== 'confirmacion' && estadoFormulario() === 'completo') {
      cancelarAutoGuardar();
      guardarRegistro(); bipGuardado();
      hablar('Guardado.');
      volverAReposo();
      return;
    }

    // ── Decisión de reanudar: "¿Continuar o eliminar?" tras reactivar la voz ──
    if (esperando === 'reanudar') {
      if (/\b(eliminar|borrar|cancelar)\b/.test(textoNorm)) { cancelarRegistroEnCurso(); return; }
      if (/\b(continuar|reanudar|seguir|sigue)\b/.test(textoNorm)) {
        esperando = null;
        const pregunta = siguientePreguntaPendiente();
        if (pregunta === null) { guardarRegistro(); bipGuardado(); hablar("Guardado."); volverAReposo(); } else { hablar(pregunta); programarRecordatorio(); }
        return;
      }
      // Si en vez de responder dice directamente un dato (ej. "código 3"),
      // se toma como "continuar" y se procesa de una vez
      esperando = null;
      procesarFrase(texto);
      programarRecordatorio();
      return;
    }

    // ── En REPOSO: reacciona a rutas válidas. Si no es ruta ni comando,
    // y tiene clave de Gemini, consulta a la IA como fallback ──
    if (enReposo) {
      const rutaDetectada = extraerRuta(palabrasANumeros(textoNorm));
      if (rutaDetectada) {
        enReposo = false;
        procesarFrase(texto);
        programarRecordatorio();
        return;
      }
      // No es ruta ni comando conocido → consultar Gemini si está configurado
      if (obtenerGeminiKey() && textoNorm.length > 3) {
        consultarGemini(texto);
      }
      return;
    }

    // ── Registro en curso ──
    if (esperando === 'corregir_ultimo') {
      procesarCorreccionUltimo(texto);
    } else if (esperando === 'confirmacion') {
      procesarFrase(texto);
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

/* ── Doble tono al guardar registro: dos bips cortos ascendentes ── */
function bipGuardado() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Primer tono (bajo)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1); gain1.connect(ctx.destination);
    osc1.frequency.value = 660;
    gain1.gain.setValueAtTime(0.25, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.12);
    // Segundo tono (alto, confirmación)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2); gain2.connect(ctx.destination);
    osc2.frequency.value = 1100;
    gain2.gain.setValueAtTime(0.3, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    osc2.start(ctx.currentTime + 0.15); osc2.stop(ctx.currentTime + 0.32);
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

/* ── 5.1: Consultas básicas de asistente ── */
function responderHora() {
  const d = new Date();
  const h = d.getHours(), m = d.getMinutes();
  const suf = h >= 12 ? 'de la tarde' : 'de la mañana';
  const h12 = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  hablar('Son las ' + h12 + ' y ' + (m < 10 ? '0' : '') + m + ' ' + suf + '.');
}

function responderDia() {
  const dias = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const d = new Date();
  hablar('Hoy es ' + dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()] + '.');
}

function responderBateria() {
  if (!navigator.getBattery) { hablar('No puedo ver la batería en este navegador.'); return; }
  navigator.getBattery().then(bat => {
    const pct = Math.round(bat.level * 100);
    const cargando = bat.charging ? ', cargando' : '';
    hablar('Batería al ' + pct + ' por ciento' + cargando + '.');
  }).catch(() => hablar('No pude consultar la batería.'));
}

function responderTiempoRestante() {
  try {
    const d = cargarDatosTemporizador();
    if (!d || !d.estado || d.estado === 'finalizado') { hablar('El temporizador no está activo.'); return; }
    if (d.estado === 'pausado') { hablar('Pausado. Quedan ' + Math.floor(d.segundosRestantes / 60) + ' minutos.'); return; }
    const ahora = Date.now();
    const rest = Math.max(0, d.segundosRestantes - Math.floor((ahora - d.tsUltimoTick) / 1000));
    hablar('Quedan ' + Math.floor(rest / 60) + ' minutos.');
  } catch(e) { hablar('No pude consultar el temporizador.'); }
}

function responderUltimoPadron() {
  try {
    const regHoy = dbDelUsuario().filter(r => r.fecha === hoy());
    if (!regHoy.length) { hablar('No hay registros hoy.'); return; }
    const ult = regHoy[regHoy.length - 1];
    hablar('Último: ruta ' + (ult.ruta||'') + ', padrón ' + (ult.padron||'') + '.');
  } catch(e) { hablar('No pude consultar.'); }
}

/* ── Enciende / apaga el modo voz — usado por el botón manual y por el wake word ── */
/* ── Evalúa qué tan lleno está el formulario al momento de activar la voz:
   'vacio'    → nada marcado, arranca normal esperando ruta
   'parcial'  → hay algo a medias (ej. solo ruta, o ruta+padrón sin capacidad)
   'completo' → están todos los campos que exige el modo actual ── */
function estadoFormulario() {
  const padron = document.getElementById('f-padron').value.trim();
  const tieneAlgo = estado.ruta || estado.ocupacion || padron;
  if (!tieneAlgo) return 'vacio';

  // ¿Está completo según el modo actual? (misma lógica que las preguntas)
  if (!estado.ruta || !estado.ocupacion || !padron) return 'parcial';
  const placaInp = document.getElementById('f-placa');
  if (placaInp.classList.contains('placa-nueva') && !placaInp.value.trim()) return 'parcial';
  if (modoParadero) {
    const faltan = ['f-bajan','f-suben','f-tespera','f-paxespera']
      .some(id => !document.getElementById(id).value.trim());
    if (faltan) return 'parcial';
  }
  return 'completo';
}

/* ── Describe brevemente lo que ya está lleno, para el aviso de reanudar ── */
function descripcionParcial() {
  const partes = [];
  if (estado.ruta) partes.push(estado.ruta);
  if (estado.ocupacion) partes.push(estado.ocupacion);
  const padron = document.getElementById('f-padron').value.trim();
  if (padron) partes.push('padrón ' + padron);
  return partes.join(', ');
}

function activarConversacionPorVoz(desdeWakeWord) {
  const btn = document.getElementById('btn-modo-voz');
  reconocimiento = reconocimiento || crearReconocimiento();
  if (!reconocimiento) return;

  vozActivaAhora = true;
  esperando = null;
  btn.classList.add('escuchando');
  btn.textContent = '🎤 Escuchando…';

  iniciarLatidoMicrofono(); // red de seguridad para que el micro no se muera
  if (desdeWakeWord) bipActivacion();

  // ── Revisar si quedó un registro a medias o completo de antes ──
  const estadoForm = estadoFormulario();

  if (estadoForm === 'completo') {
    // Todo lleno: ofrecer guardarlo o eliminarlo directamente
    enReposo = false;
    esperando = 'confirmacion';
    hablar('Registro pendiente: ' + textoResumenCorto() + '. ¿Guardar o eliminar?', () => {
      reiniciarReconocimiento(0);
    });
    return;
  }

  if (estadoForm === 'parcial') {
    // A medias: ofrecer continuar donde quedó o eliminarlo
    enReposo = false;
    esperando = 'reanudar';
    hablar('Registro a medias: ' + descripcionParcial() + '. ¿Continuar o eliminar?', () => {
      reiniciarReconocimiento(0);
    });
    return;
  }

  // Formulario vacío: arranque normal
  enReposo = true;
  hablar(desdeWakeWord ? 'Ruta.' : 'Modo voz activado. Ruta.', () => {
    reiniciarReconocimiento(0);
  });
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
  if (!VOZ_SOPORTADA) { toast('❌ El modo voz no está disponible en este navegador', 'rojo'); return; }
  if (!vozActivaAhora) activarConversacionPorVoz();
  else desactivarModoVoz();
}

/* ══════════════════════════════════════════════════════════════
   GEMINI — Asistente inteligente con IA
   La API key se recibe del servidor al iniciar sesión (si el admin
   la configuró y el usuario tiene IAActiva=SI). Se guarda en
   localStorage automáticamente, el usuario nunca la toca.
   ══════════════════════════════════════════════════════════════ */
const GEMINI_KEY_STORAGE = 'minpao_gemini_key';
const GEMINI_MODEL = 'gemini-2.5-flash';

function obtenerGeminiKey() {
  return localStorage.getItem(GEMINI_KEY_STORAGE) || '';
}

async function consultarGemini(pregunta) {
  const key = obtenerGeminiKey();
  if (!key) { return; } // sin clave, no hace nada (silencioso)

  let contexto = 'Eres el asistente de voz de minpao, una app de registro de buses en Lima, Perú. ';
  contexto += 'Responde en español peruano, corto y directo (máximo 2 frases). ';
  try {
    const regHoy = dbDelUsuario().filter(r => r.fecha === hoy());
    contexto += 'Hoy el inspector lleva ' + regHoy.length + ' registros. ';
    const td = cargarDatosTemporizador();
    if (td && td.estado === 'corriendo') {
      const rest = Math.max(0, td.segundosRestantes - Math.floor((Date.now() - td.tsUltimoTick) / 1000));
      contexto += 'Quedan ' + Math.floor(rest / 60) + ' minutos del temporizador. ';
    }
    if (regHoy.length > 0) {
      const rutasCount = {};
      regHoy.forEach(r => { rutasCount[r.ruta] = (rutasCount[r.ruta] || 0) + 1; });
      contexto += 'Registros por ruta: ' + Object.entries(rutasCount).map(([r, c]) => r + ':' + c).join(', ') + '. ';
    }
  } catch (e) {}

  actualizarIndicadorVoz('🤖 Pensando...');

  try {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + key,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: contexto + '\n\nEl inspector pregunta: ' + pregunta }] }],
          generationConfig: { maxOutputTokens: 150 }
        })
      }
    );
    const data = await resp.json();
    const respuesta = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (respuesta) {
      hablar(respuesta);
    } else {
      hablar('No pude obtener una respuesta.');
    }
  } catch (e) {
    console.error('[gemini]', e);
    hablar('Error al consultar la IA.');
  }
}

/* ══════════════════════════════════════════════════════════════
   "CORREGIR ÚLTIMO" — edita el último registro guardado hoy
   ══════════════════════════════════════════════════════════════ */
let ultimoRegistroEditando = null;

function corregirUltimoRegistro() {
  const regHoy = dbDelUsuario().filter(r => r.fecha === hoy());
  if (!regHoy.length) { hablar('No hay registros hoy.'); return; }
  ultimoRegistroEditando = regHoy[regHoy.length - 1];
  const resumen = [
    ultimoRegistroEditando.ruta || '',
    ultimoRegistroEditando.ocupacion || '',
    'padrón ' + (ultimoRegistroEditando.padron || ''),
  ].join(', ');
  esperando = 'corregir_ultimo';
  hablar('Último: ' + resumen + '. ¿Qué corrijo?');
}

function procesarCorreccionUltimo(textoOriginal) {
  const texto = palabrasANumeros(normalizarVoz(textoOriginal));
  if (/\b(cancelar|nada|dejalo|dejar)\b/.test(texto)) {
    esperando = null; ultimoRegistroEditando = null;
    hablar('Corrección cancelada.'); return;
  }
  const campoMap = {
    ruta:'ruta', ocupacion:'ocupacion', capacidad:'ocupacion',
    padron:'padron', bajan:'bajan', suben:'suben', espera:'tespera', pax:'paxespera',
  };
  let campo = null, valor = null;
  const codM = texto.match(/codigo\s+(\d)/);
  if (codM) {
    const codMap = {'1':'Vacío (0%)','2':'Casi vacío (50%)','3':'Sentados (75%)',
      '4':'Sentados (100%)','5':'Sentados 100% + De pie 50%','6':'Lleno full (100%)'};
    campo = 'ocupacion'; valor = codMap[codM[1]] || null;
  }
  if (!campo) {
    for (const [pal, c] of Object.entries(campoMap)) {
      const m = texto.match(new RegExp(pal + '\\s+(\\S+)'));
      if (m) { campo = c; valor = m[1]; break; }
    }
  }
  if (!campo) { const n = texto.match(/\b(\d{1,4})\b/); if (n) { campo='padron'; valor=n[1]; } }
  if (!campo || !valor) { hablar('No entendí. Di el campo y el valor.'); return; }

  if (campo === 'ruta') ultimoRegistroEditando.ruta = valor;
  else if (campo === 'ocupacion') ultimoRegistroEditando.ocupacion = valor;
  else if (campo === 'padron') ultimoRegistroEditando.padron = valor;
  else ultimoRegistroEditando[campo] = valor;
  try { localStorage.setItem('atu_db', JSON.stringify(db)); } catch (e) {}
  bipGuardado();
  hablar('Corregido.');
  ultimoRegistroEditando = null; esperando = null;
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
