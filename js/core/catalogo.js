// Catálogo de cartas: actualizar (descarga) y buscar (sin internet; con respaldo en línea).

import * as db from './db.js';
import { FUENTES } from '../config.js';
import { claveNumero, juegoDesdeNumero } from './repo.js';
import { ATRIBUTOS } from './atributos.js';

export const infoCatalogo = async () => (await db.obtener('ajustes', 'catalogoMeta'))?.valor || null;

/** Descarga y reemplaza el catálogo completo. onProgreso recibe { etapa, mb, avance }. */
export function actualizarCatalogo(onProgreso) {
  return new Promise((resolve, reject) => {
    const w = new Worker('./js/core/catalogo-worker.js', { type: 'module' });
    w.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'progreso') onProgreso?.(m);
      else if (m.tipo === 'listo') { w.terminate(); resolve(m.meta); }
      else if (m.tipo === 'error') { w.terminate(); reject(new Error(m.mensaje)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Error en la descarga')); };
    w.postMessage({ url: FUENTES.yamlYugi });
  });
}

/** Convierte un registro del catálogo a los campos del formulario. */
function aFormulario(r, cardNumber) {
  const k = claveNumero(cardNumber);
  const imp = r.impresiones.filter((i) => claveNumero(i.n) === k);
  return {
    nombreEn: r.en, nombreJa: r.ja, passcode: r.passcode, tipo: r.tipo, atributo: r.attr,
    atk: r.atk === '' ? '' : String(r.atk), def: r.def === '' ? '' : String(r.def),
    rarezas: [...new Set(imp.flatMap((i) => i.r))],
    setNombre: imp[0]?.s || '',
    origen: 'catalogo',
  };
}

export async function buscarPorNumero(cardNumber) {
  const k = claveNumero(cardNumber);
  if (k.length < 4) return null;
  // Exacto; si no, prueba quitando 1 o 2 caracteres del inicio (el lector a veces agrega basura del borde)
  for (const cand of [k, k.slice(1), k.slice(2)]) {
    if (cand.length < 4) break;
    const r = await db.buscarIndice('catalogo', 'numeros', cand);
    if (r) {
      const imp = r.impresiones.find((i) => claveNumero(i.n) === cand);
      return { ...aFormulario(r, imp?.n || cardNumber), cardNumber: imp?.n || cardNumber };
    }
  }
  return null;
}

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/**
 * Busca por passcode. Si además se leyó un Card Number (aunque con errores),
 * elige la impresión del catálogo más parecida y corrige el Card Number.
 */
export async function buscarPorPasscode(passcode, numeroLeido = '', preferencia = '') {
  const p = String(passcode || '').replace(/\D/g, '').padStart(8, '0');
  if (!/^\d{8}$/.test(p) || p === '00000000') return null;
  const r = await db.buscarIndice('catalogo', 'passcode', p);
  if (!r) return null;
  const k = claveNumero(numeroLeido);
  // Opciones de Card Number de esta carta, de la más parecida a lo leído a la menos
  const opciones = r.impresiones
    .map((i) => ({ n: i.n, s: i.s, r: i.r, d: k ? distancia(k, claveNumero(i.n)) : 0 }))
    .sort((a, b) => a.d - b.d);
  const vistas = new Set();
  let opcionesNumero = opciones.filter((o) => !vistas.has(o.n) && vistas.add(o.n));
  if (k && opciones.length && opciones[0].d <= 3) {
    return { ...aFormulario(r, opciones[0].n), cardNumber: opciones[0].n, opcionesNumero: opcionesNumero.slice(0, 20) };
  }
  // Pista de juego (ej. se leyó "1st Edition" → TCG): esas impresiones primero,
  // y si solo hay una, se elige automáticamente (el usuario puede cambiarla).
  if (preferencia) {
    const grupo = opcionesNumero.filter((o) => juegoDesdeNumero(o.n) === preferencia);
    opcionesNumero = [...grupo, ...opcionesNumero.filter((o) => !grupo.includes(o))];
    if (grupo.length === 1) {
      return { ...aFormulario(r, grupo[0].n), cardNumber: grupo[0].n, autoElegido: true, opcionesNumero: opcionesNumero.slice(0, 20) };
    }
  }
  return { ...aFormulario(r, ''), opcionesNumero: opcionesNumero.slice(0, 20) };
}

// ---------- Respaldo en línea (YGOPRODeck, solo TCG) ----------

const TIPO_YGO = (t = '') => (/Spell/i.test(t) ? 'Mágica' : /Trap/i.test(t) ? 'Trampa' : t ? 'Monstruo' : '');

async function pedirJSON(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(timer); }
}

function desdeYGO(c, rareza) {
  const tipo = TIPO_YGO(c.type);
  const attr = tipo === 'Mágica' ? 'SPELL' : tipo === 'Trampa' ? 'TRAP' : (ATRIBUTOS[c.attribute] ? c.attribute : '');
  return {
    nombreEn: String(c.name || ''), nombreJa: '', passcode: c.id ? String(c.id).padStart(8, '0') : '',
    tipo, atributo: attr, atk: c.atk ?? '', def: c.def ?? '',
    rarezas: rareza ? [rareza] : [], origen: 'en-linea',
  };
}

export async function buscarEnLinea({ cardNumber, passcode }) {
  if (!navigator.onLine) return null;
  if (cardNumber) {
    const s = await pedirJSON(FUENTES.ygoSetInfo + encodeURIComponent(String(cardNumber).trim().toUpperCase()));
    if (s && s.id) {
      const info = await pedirJSON(FUENTES.ygoCardInfo + encodeURIComponent(s.id));
      const c = info?.data?.[0];
      if (c) return desdeYGO(c, s.set_rarity);
      return { nombreEn: String(s.name || ''), nombreJa: '', passcode: String(s.id).padStart(8, '0'), rarezas: s.set_rarity ? [s.set_rarity] : [], origen: 'en-linea' };
    }
  }
  const p = String(passcode || '').replace(/\D/g, '');
  if (p.length >= 5) {
    const info = await pedirJSON(FUENTES.ygoCardInfo + encodeURIComponent(Number(p)));
    const c = info?.data?.[0];
    if (c) return desdeYGO(c, '');
  }
  return null;
}
