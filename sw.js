const CACHE_NAME = 'minpao-v28'; // subir SIEMPRE que cambie voz.js u otro asset
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

let actualizacionHTMLEnCurso = null;

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

  if(url.hostname === 'script.google.com' || url.hostname === 'script.googleusercontent.com'){
    return;
  }
  if(url.hostname === 'generativelanguage.googleapis.com'){
    return; // No cachear llamadas a Gemini
  }

  if(e.request.method !== 'GET'){
    return;
  }

  const esHTML = e.request.mode === 'navigate' ||
                 (e.request.destination === 'document') ||
                 e.request.url.endsWith('/') ||
                 e.request.url.endsWith('.html');

  if(esHTML){
    e.respondWith(
      fetchHTMLConLimite(e.request, 5000).then(resp => {
        if(resp) return resp;
        return caches.match(e.request).then(cached => cached || caches.match('./index.html'));
      })
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(resp => {
        if(resp && resp.status === 200 && resp.type !== 'opaque'){
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copia));
        }
        return resp;
      }).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
