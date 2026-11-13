// Acceso a IndexedDB con migraciones por versión.
// Para crecer: agrega una función en MIGRACIONES con el siguiente número
// y sube DB_VERSION en js/config.js. Nunca modifiques una migración ya publicada.

import { DB_NOMBRE, DB_VERSION } from '../config.js';

const MIGRACIONES = {
  1(db) {
    // Inventario: una fila por carta física distinta
    const c = db.createObjectStore('cartas', { keyPath: 'id', autoIncrement: true });
    // Llave del inventario: Card Number + Edición + Rareza (sin repetir)
    c.createIndex('llave', ['cardNumberKey', 'edicion', 'rareza'], { unique: true });
    c.createIndex('cardNumberKey', 'cardNumberKey');
    c.createIndex('passcode', 'passcode');

    // Catálogo descargado (una fila por carta del juego)
    const k = db.createObjectStore('catalogo', { keyPath: 'id' });
    k.createIndex('numeros', 'numeros', { multiEntry: true }); // todos sus Card Numbers normalizados
    k.createIndex('passcode', 'passcode');

    db.createObjectStore('ajustes', { keyPath: 'clave' });

    // ---- Fase 2 (ya creada, vacía): fotos de las cartas del inventario ----
    const f = db.createObjectStore('fotos', { keyPath: 'id', autoIncrement: true });
    f.createIndex('cartaId', 'cartaId');
  },
  // 2(db, tx) { ... Fase 3: detalles/descripcion en el catálogo ... }
};

let dbPromesa = null;

export function abrirDB() {
  if (dbPromesa) return dbPromesa;
  dbPromesa = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      for (let v = e.oldVersion + 1; v <= DB_VERSION; v++) {
        if (MIGRACIONES[v]) MIGRACIONES[v](db, req.transaction);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Cierra otras pestañas de la app y vuelve a intentar.'));
  });
  return dbPromesa;
}

function prom(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx(stores, modo, fn) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, modo);
    let resultado;
    Promise.resolve(fn(t)).then((r) => { resultado = r; }, (err) => { try { t.abort(); } catch (_) {} reject(err); });
    t.oncomplete = () => resolve(resultado);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Operación cancelada'));
  });
}

export const obtener = (store, clave) => tx(store, 'readonly', (t) => prom(t.objectStore(store).get(clave)));
export const todos = (store) => tx(store, 'readonly', (t) => prom(t.objectStore(store).getAll()));
export const porIndice = (store, indice, valor) =>
  tx(store, 'readonly', (t) => prom(t.objectStore(store).index(indice).getAll(valor)));
export const contarPorIndice = (store, indice, valor) =>
  tx(store, 'readonly', (t) => prom(t.objectStore(store).index(indice).count(valor)));
export const guardar = (store, obj) => tx(store, 'readwrite', (t) => prom(t.objectStore(store).put(obj)));
export const agregar = (store, obj) => tx(store, 'readwrite', (t) => prom(t.objectStore(store).add(obj)));
export const buscarIndice = (store, indice, valor) =>
  tx(store, 'readonly', (t) => prom(t.objectStore(store).index(indice).get(valor)));
export { prom };
