// Service worker de MiAppYuGiOh!: guarda la app completa en el celular para usarla sin internet.
// Al publicar una nueva versión, cambia CACHE_VERSION (y APP_VERSION en js/config.js)
// y agrega aquí cualquier archivo nuevo.

const CACHE_VERSION = 'miappyugioh-1.0.1';

const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/app.js',
  './js/config.js',
  './js/core/db.js',
  './js/core/repo.js',
  './js/core/ui.js',
  './js/core/tema.js',
  './js/core/datos.js',
  './js/core/atributos.js',
  './js/core/catalogo.js',
  './js/core/catalogo-worker.js',
  './js/core/formCarta.js',
  './js/ocr/escaner.js',
  './js/screens/menu.js',
  './js/screens/escanear.js',
  './js/screens/inventario.js',
  './js/screens/catalogo.js',
  './js/screens/configuracion.js',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  './vendor/tesseract/lang/eng.traineddata.gz',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Primero el caché (sin internet); solo archivos de la propia app
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
