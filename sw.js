// Service worker: guarda la app completa en el celular para usarla sin internet.
// Al publicar una nueva versión, cambia CACHE_VERSION (y APP_VERSION en js/config.js)
// y agrega aquí cualquier archivo nuevo.

const CACHE_VERSION = 'miappvuala-1.0.3';

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
  './js/ocr/escaner.js',
  './js/screens/menu.js',
  './js/screens/capturar.js',
  './js/screens/colecciones.js',
  './js/screens/consultar.js',
  './js/screens/configuracion.js',
  './vendor/tesseract/tesseract.min.js',
  './vendor/tesseract/worker.min.js',
  './vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js',
  './vendor/tesseract/core/tesseract-core-lstm.wasm.js',
  './vendor/tesseract/lang/eng.traineddata.gz',
];

// Guarda archivo por archivo (si uno falla, los demás sí quedan) y sin respuestas "redirigidas",
// que Chrome rechaza al abrir la app sin internet (error ERR_FAILED).
async function guardarTodo() {
  const cache = await caches.open(CACHE_VERSION);
  const faltan = [];
  await Promise.all(ARCHIVOS.map(async (ruta) => {
    try {
      const r = await fetch(ruta, { cache: 'reload' });
      if (!r.ok) throw new Error(r.status);
      const limpia = r.redirected ? new Response(await r.blob(), { status: r.status, statusText: r.statusText, headers: r.headers }) : r;
      await cache.put(ruta, limpia);
    } catch (_) { faltan.push(ruta); }
  }));
  const estado = { version: CACHE_VERSION, total: ARCHIVOS.length, guardados: ARCHIVOS.length - faltan.length, faltan, fecha: new Date().toISOString() };
  await cache.put('./__estado-offline.json', new Response(JSON.stringify(estado), { headers: { 'content-type': 'application/json' } }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(guardarTodo().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Primero el caché (sin internet); solo archivos de la propia app.
// Al abrir la app (navegación) sin internet, siempre se responde con index.html guardado.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    if (req.mode === 'navigate') {
      const pagina = (await cache.match('./index.html')) || (await cache.match('./'));
      if (pagina) return pagina;
      return fetch(req);
    }
    const r = await cache.match(req, { ignoreSearch: true });
    return r || fetch(req);
  })());
});
