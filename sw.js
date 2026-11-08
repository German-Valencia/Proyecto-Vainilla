/**
 * Service Worker para MercadoYa
 * Proporciona soporte 100% Offline y almacenamiento en caché para iPhone y navegadores modernos.
 */

const CACHE_NAME = 'mercadoya-v6';

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
      // UsaraddAll con tolerancia para recursos externos
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

// Activación: Limpieza de cachés antiguas
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
  // Solo interceptar peticiones GET
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          // Si la respuesta es válida, clonar y actualizar caché
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
        .catch(() => {
          // Si la red falla y no está en caché, devolver fallback para navegación si aplica
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });

      // Devolver inmediatamente desde caché si existe, sino esperar a la red
      return cachedResponse || fetchPromise;
    })
  );
});
