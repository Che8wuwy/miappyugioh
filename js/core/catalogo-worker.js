// Trabajador en segundo plano: descarga el catálogo completo, lo compacta
// y lo guarda en IndexedDB sin congelar la pantalla.

import { abrirDB, prom } from './db.js';

const post = (tipo, datos) => self.postMessage({ tipo, ...datos });

function limpiarJa(s) {
  // Quita las lecturas furigana (<rt>…</rt>) y cualquier etiqueta
  return String(s || '').replace(/<rt>.*?<\/rt>/g, '').replace(/<[^>]+>/g, '').trim();
}
const claveNumero = (n) => String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TIPO = { Monster: 'Monstruo', Spell: 'Mágica', Trap: 'Trampa' };
const REGIONES = ['en', 'ja', 'ae']; // TCG inglés, OCG japonés, OCG inglés asiático

function compactar(c) {
  const passcode = c.password != null ? String(c.password).padStart(8, '0') : '';
  const id = passcode || (c.konami_id != null ? 'kdb' + c.konami_id : null);
  if (!id) return null;
  const tipo = TIPO[c.card_type] || '';
  const attr = tipo === 'Mágica' ? 'SPELL' : tipo === 'Trampa' ? 'TRAP' : (c.attribute || '');
  const impresiones = [];
  const sets = c.sets && typeof c.sets === 'object' ? c.sets : {};
  for (const reg of REGIONES) {
    for (const p of Array.isArray(sets[reg]) ? sets[reg] : []) {
      if (!p || (!p.set_number && !p.set_name)) continue;
      // Las impresiones antiguas sin Card Number se guardan con n vacío (se identifican por el set)
      impresiones.push({ n: String(p.set_number || ''), s: String(p.set_name || ''), r: Array.isArray(p.rarities) ? p.rarities.map(String) : [], l: reg });
    }
  }
  return {
    id,
    passcode,
    en: String(c.name?.en || ''),
    ja: limpiarJa(c.name?.ja),
    tipo,
    attr: String(attr),
    atk: c.atk ?? '',
    def: c.def ?? '',
    impresiones,
    numeros: [...new Set(impresiones.map((i) => claveNumero(i.n)).filter(Boolean))],
  };
}

async function guardarLotes(registros, extra = {}) {
  const db = await abrirDB();
  await new Promise((res, rej) => {
    const t = db.transaction('catalogo', 'readwrite');
    t.objectStore('catalogo').clear();
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
  const LOTE = 1000;
  for (let i = 0; i < registros.length; i += LOTE) {
    await new Promise((res, rej) => {
      const t = db.transaction('catalogo', 'readwrite');
      const st = t.objectStore('catalogo');
      for (const r of registros.slice(i, i + LOTE)) st.put(r);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    post('progreso', { etapa: 'Guardando', avance: Math.min(1, (i + LOTE) / registros.length) });
  }
  const meta = { fecha: new Date().toISOString(), total: registros.length, fuente: 'YAML Yugi', formato: 2, ...extra };
  await new Promise((res, rej) => {
    const t = db.transaction('ajustes', 'readwrite');
    t.objectStore('ajustes').put({ clave: 'catalogoMeta', valor: meta });
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
  return meta;
}

async function descargar(url) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error('El servidor respondió ' + r.status);
  const total = Number(r.headers.get('content-length')) || 0;
  const lector = r.body.getReader();
  const partes = [];
  let recibidos = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value); recibidos += value.length;
    post('progreso', { etapa: 'Descargando', mb: recibidos / 1048576, avance: total ? recibidos / total : null });
  }
  post('progreso', { etapa: 'Procesando' });
  const texto = await new Blob(partes).text();
  partes.length = 0;
  return JSON.parse(texto);
}

self.onmessage = async (e) => {
  try {
    const datos = await descargar(e.data.url);
    if (!Array.isArray(datos)) throw new Error('Formato inesperado: no es una lista de cartas.');
    const registros = [];
    let omitidas = 0;
    for (const c of datos) { const r = compactar(c); if (r) registros.push(r); else omitidas++; }
    if (!registros.length) {
      throw new Error('Formato inesperado. Campos de la primera carta: ' + Object.keys(datos[0] || {}).slice(0, 15).join(', '));
    }
    const conJa = registros.filter((r) => r.ja).length;
    const conNum = registros.filter((r) => r.numeros.length).length;
    const sinNum = registros.filter((r) => r.impresiones.some((i) => !i.n)).length;
    const meta = await guardarLotes(registros, { omitidas, conJa, conNum, sinNum });
    post('listo', { meta });
  } catch (err) {
    post('error', { mensaje: err.message || String(err) });
  }
};
