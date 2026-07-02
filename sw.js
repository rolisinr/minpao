const CACHE_NAME = 'minpao-v9'; // subir SIEMPRE que cambie voz.js u otro asset
const ASSETS = [
  './',
  './index.html',
  './voz.js',
  './manifest.json',
  './icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Usamos addAll con un fallback individual para evitar que un único asset
      // que falle (ej. CDN no disponible al instalar) rompa toda la instalación
      return Promise.all(
        ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] No se pudo cachear:', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

// Permitir que el cliente pida activación inmediata cuando detecta versión nueva
self.addEventListener('message', (e) => {
  if(e.data && e.data.type === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Evita que aperturas repetidas de la app, mientras ya hay una descarga
// del HTML en curso, disparen cada una su propia petición de red.
// Todas comparten la misma descarga en lugar de duplicarla.
let actualizacionHTMLEnCurso = null;

// Espera la red hasta `ms` milisegundos. Si no responde a tiempo, resuelve
// con null (señal de "usa el caché"), pero deja que la red siga su curso
// en segundo plano para actualizar el caché de todas formas si llega a responder.
function fetchHTMLConLimite(request, ms){
  return new Promise((resolve) => {
    let resuelto = false;
    const timer = setTimeout(() => {
      if(!resuelto){ resuelto = true; resolve(null); }
    }, ms);

    if(!actualizacionHTMLEnCurso){
      actualizacionHTMLEnCurso = fetch(request)
        .then(resp => {
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, copia));
          return resp;
        })
        .catch(() => null)
        .finally(() => { actualizacionHTMLEnCurso = null; });
    }

    actualizacionHTMLEnCurso.then(resp => {
      if(!resuelto){ resuelto = true; clearTimeout(timer); resolve(resp); }
    });
  });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // NUNCA cachear ni interceptar llamadas a la API de Apps Script.
  // Esto evita que respuestas viejas de "ping" o "validarUsuario" se sirvan desde cache.
  if(url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com'){
    return;
  }

  // Solo manejar GET (POST y otros métodos pasan directo a la red)
  if(e.request.method !== 'GET'){
    return;
  }

  // Estrategia: network-first para el HTML principal (queremos que el usuario
  // siempre reciba el HTML más reciente cuando hay conexión), cache-first para todo lo demás.
  const esHTML = e.request.mode === 'navigate' ||
                 (e.request.destination === 'document') ||
                 e.request.url.endsWith('/') ||
                 e.request.url.endsWith('.html');

  if(esHTML){
    e.respondWith(
      fetchHTMLConLimite(e.request, 5000).then(resp => {
        if(resp) return resp;
        // Red lenta (no respondió a tiempo) o caída: usar la versión guardada.
        return caches.match(e.request).then(cached => cached || caches.match('./index.html'));
      })
    );
    return;
  }

  // Resto de recursos: cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(resp => {
        // Cachear automáticamente cualquier asset GET exitoso del mismo origen
        if(resp && resp.status === 200 && resp.type !== 'opaque'){
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copia));
        }
        return resp;
      }).catch(() => {
        // Si es navegación principal y falla, devolver index cacheado
        return caches.match('./index.html');
      });
    })
  );
});
