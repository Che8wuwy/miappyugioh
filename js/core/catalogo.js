// Catálogo de cartas: actualizar (descarga) y buscar (sin internet; con respaldo en línea).

import * as db from './db.js';
import { FUENTES } from '../config.js';
import { claveNumero } from './repo.js';
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
  if (!k) return null;
  const r = await db.buscarIndice('catalogo', 'numeros', k);
  return r ? aFormulario(r, cardNumber) : null;
}

export async function buscarPorPasscode(passcode) {
  const p = String(passcode || '').replace(/\D/g, '').padStart(8, '0');
  if (!/^\d{8}$/.test(p) || p === '00000000') return null;
  const r = await db.buscarIndice('catalogo', 'passcode', p);
  return r ? aFormulario(r, '') : null;
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
