/**
 * Service Worker para MercadoYa
 * Proporciona soporte 100% Offline y almacenamiento en caché para iPhone y navegadores modernos.
 */

const CACHE_NAME = 'mercadoya-v12';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './db.js',
  './receipt-scanner.js',
  './manifest.json',
  './manual.html',
  './privacy.html',
  './terms.html',
  './disclaimer.html',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './og-image.png',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Instalación: Precaché de activos esenciales
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`No se pudo cachear el recurso: ${url}`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpieza de cachés antiguas y toma de control inmediata
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de solicitudes de red con estrategia Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const path = url.pathname.toLowerCase();

  // Enrutamiento especial para navegación HTML (evita redirecciones erróneas en Vercel)
  if (event.request.mode === 'navigate') {
    let targetAsset = './index.html';
    if (path.includes('manual')) targetAsset = './manual.html';
    else if (path.includes('privacy')) targetAsset = './privacy.html';
    else if (path.includes('terms')) targetAsset = './terms.html';
    else if (path.includes('disclaimer')) targetAsset = './disclaimer.html';

    event.respondWith(
      caches.match(targetAsset).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(targetAsset, responseClone));
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
    return;
  }

  // Recursos estáticos generales (CSS, JS, iconos, fuentes)
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            (networkResponse.status === 200 || networkResponse.type === 'opaque' || networkResponse.type === 'cors' || networkResponse.type === 'basic')
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
