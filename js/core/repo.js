// Reglas de negocio del inventario de cartas y ajustes.
// Las pantallas solo llaman a estas funciones; nunca tocan IndexedDB directamente.

import * as db from './db.js';
import { AJUSTES_DEFAULT, EDICIONES, TIPOS_CARTA } from '../config.js';
import { ATRIBUTOS } from './atributos.js';

const texto = (v, max) => String(v ?? '').trim().slice(0, max);

/** Clave de búsqueda del Card Number: mayúsculas, solo letras y números (el texto original se conserva aparte). */
export function claveNumero(cardNumber) {
  return String(cardNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Juego según el código de región del Card Number. */
export function juegoDesdeNumero(cardNumber) {
  const m = String(cardNumber || '').toUpperCase().match(/-([A-Z]{1,2})\d/);
  if (!m) return '';
  if (m[1] === 'JP' || m[1] === 'JA') return 'OCG';
  if (['AE', 'KR', 'TC', 'SC'].includes(m[1])) return 'OCG';
  return 'TCG';
}

/** ATK/DEF: número, "?" o vacío. */
function valorAtaque(v) {
  const s = String(v ?? '').trim();
  if (s === '' || s === '?') return s;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0 || n > 99999) throw new Error('ATK/DEF debe ser un número, "?" o quedar vacío.');
  return String(n);
}

/** Limpia y valida una carta antes de guardarla. */
export function prepararCarta(d) {
  const cardNumber = texto(d.cardNumber, 30);
  if (!cardNumber) throw new Error('El Card Number es obligatorio.');
  const edicion = texto(d.edicion, 40) || EDICIONES[1];
  const rareza = texto(d.rareza, 60);
  if (!rareza) throw new Error('La rareza es obligatoria (forma parte de la llave).');
  const passcode = texto(d.passcode, 10).replace(/\D/g, '');
  const atributo = ATRIBUTOS[d.atributo] ? d.atributo : '';
  const tipo = TIPOS_CARTA.includes(d.tipo) ? d.tipo : '';
  return {
    cardNumber,
    cardNumberKey: claveNumero(cardNumber),
    edicion,
    rareza,
    nombreEn: texto(d.nombreEn, 120),
    nombreJa: texto(d.nombreJa, 120),
    passcode,
    tipo,
    atributo,
    atk: tipo === 'Monstruo' ? valorAtaque(d.atk) : '',
    def: tipo === 'Monstruo' ? valorAtaque(d.def) : '',
    // Juego: el que dio el catálogo para la impresión; si no, por el código de región del Card Number
    juego: (['TCG', 'OCG'].includes(d.juego) ? d.juego : '') || juegoDesdeNumero(cardNumber) || (d.numeroPropio === true ? 'OCG' : ''),
    // true = Card Number escrito por el usuario porque la carta no lo trae (cartas OCG antiguas)
    numeroPropio: d.numeroPropio === true,
    origen: ['camara', 'catalogo', 'manual', 'en-linea'].includes(d.origen) ? d.origen : 'manual',
  };
}

/**
 * Agrega la carta si su llave (Card Number + Edición + Rareza) no existe.
 * Devuelve { nueva: true, registro } o { nueva: false, registro: existente }.
 */
export async function agregarCarta(datos) {
  const c = prepararCarta(datos);
  return db.tx('cartas', 'readwrite', async (t) => {
    const st = t.objectStore('cartas');
    const existente = await db.prom(st.index('llave').get([c.cardNumberKey, c.edicion, c.rareza]));
    if (existente) return { nueva: false, registro: existente };
    c.fechaAlta = new Date().toISOString();
    c.id = await db.prom(st.add(c));
    // ¿Ya tenía este mismo monstruo/carta (mismo passcode) en otra versión?
    const mismas = c.passcode ? await db.prom(st.index('passcode').getAll(c.passcode)) : [];
    const otrasVersiones = mismas.filter((x) => x.id !== c.id && x.cardNumberKey !== c.cardNumberKey);
    return { nueva: true, registro: c, otrasVersiones };
  });
}

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Card Numbers propios que ya usaste para este passcode (sin repetir). */
export async function numerosPropiosDe(passcode) {
  const p = String(passcode || '').replace(/\D/g, '');
  if (!p) return [];
  const lista = await db.porIndice('cartas', 'passcode', p);
  const vistos = new Map();
  for (const c of lista) if (c.numeroPropio && !vistos.has(c.cardNumberKey)) vistos.set(c.cardNumberKey, c);
  return [...vistos.values()];
}

/**
 * Revisión antes de guardar una carta con Card Number propio.
 * - distintos: la misma carta (passcode) ya tiene OTRO número propio (con marca si parece error de escritura)
 * - enOtraCarta: ese mismo número propio ya lo usaste para una carta distinta (otro passcode)
 */
export async function revisarNumeroPropio(datos) {
  const c = prepararCarta(datos);
  if (!c.numeroPropio) return { distintos: [], enOtraCarta: [] };
  const distintos = (await numerosPropiosDe(c.passcode))
    .filter((x) => x.cardNumberKey !== c.cardNumberKey)
    .map((x) => ({ carta: x, parecido: distancia(x.cardNumberKey, c.cardNumberKey) <= 2 }));
  const mismos = await db.porIndice('cartas', 'cardNumberKey', c.cardNumberKey);
  const enOtraCarta = mismos.filter((x) => x.passcode && c.passcode && x.passcode !== c.passcode);
  return { distintos, enOtraCarta };
}

/** Edita una carta existente (respetando que la llave no choque con otra). */
export async function editarCarta(id, datos) {
  const c = prepararCarta(datos);
  return db.tx('cartas', 'readwrite', async (t) => {
    const st = t.objectStore('cartas');
    const previa = await db.prom(st.get(Number(id)));
    if (!previa) throw new Error('La carta ya no existe.');
    const choque = await db.prom(st.index('llave').get([c.cardNumberKey, c.edicion, c.rareza]));
    if (choque && choque.id !== previa.id) throw new Error('Ya tienes otra carta con ese Card Number, edición y rareza.');
    const nueva = { ...previa, ...c, id: previa.id, fechaEdicion: new Date().toISOString() };
    st.put(nueva);
    return nueva;
  });
}

export const obtenerCarta = (id) => db.obtener('cartas', Number(id));

export async function eliminarCarta(id) {
  await db.tx(['cartas', 'fotos'], 'readwrite', async (t) => {
    t.objectStore('cartas').delete(Number(id));
    const fotos = await db.prom(t.objectStore('fotos').index('cartaId').getAllKeys(Number(id)));
    fotos.forEach((k) => t.objectStore('fotos').delete(k));
  });
}

/** Lista con filtros: texto (nombre, Card Number o passcode), juego, tipo y atributo. */
export async function listarCartas({ texto: q = '', juego = '', tipo = '', atributo = '' } = {}) {
  const f = String(q).trim().toLowerCase();
  const fk = claveNumero(q);
  let lista = await db.todos('cartas');
  lista = lista.filter((c) =>
    (!juego || c.juego === juego) && (!tipo || c.tipo === tipo) && (!atributo || c.atributo === atributo) &&
    (!f || c.nombreEn.toLowerCase().includes(f) || c.nombreJa.includes(q.trim()) ||
      (fk && c.cardNumberKey.includes(fk)) || (c.passcode && c.passcode.includes(f))));
  return lista.sort((a, b) => (b.fechaAlta || '').localeCompare(a.fechaAlta || ''));
}

export const contarCartas = () => db.tx('cartas', 'readonly', (t) => db.prom(t.objectStore('cartas').count()));

// ---------- Ajustes ----------

export async function leerAjustes() {
  const filas = await db.todos('ajustes');
  const a = { ...AJUSTES_DEFAULT };
  for (const f of filas) if (f.clave in a) a[f.clave] = f.valor;
  return a;
}
export const guardarAjuste = (clave, valor) => db.guardar('ajustes', { clave, valor });
export const leerDato = async (clave) => (await db.obtener('ajustes', clave))?.valor;
export const guardarDato = (clave, valor) => db.guardar('ajustes', { clave, valor });

// ---------- Fase 2: fotos (preparado, sin interfaz todavía) ----------
// export async function guardarFoto(cartaId, blob) { return db.agregar('fotos', { cartaId, blob, fecha: new Date().toISOString() }); }
// export async function fotosDeCarta(cartaId) { return db.porIndice('fotos', 'cartaId', cartaId); }
