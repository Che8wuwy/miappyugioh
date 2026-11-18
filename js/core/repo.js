// Reglas de negocio: colecciones, códigos y ajustes.
// Las pantallas solo llaman a estas funciones; nunca tocan IndexedDB directamente.

import * as db from './db.js';
import { CODIGO_REGEX, AJUSTES_DEFAULT } from '../config.js';

export function normalizarCodigo(texto) {
  return String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
export const codigoValido = (c) => CODIGO_REGEX.test(c);

const limpiarTexto = (v, max) => String(v ?? '').trim().slice(0, max);

// ---------- Colecciones ----------

export async function listarColecciones({ incluirArchivadas = false, anio = null } = {}) {
  let lista = await db.todos('colecciones');
  if (!incluirArchivadas) lista = lista.filter((c) => !c.archivada);
  if (anio) lista = lista.filter((c) => c.anio === Number(anio));
  // Más reciente primero: año de la promoción y luego fecha de creación
  return lista.sort((a, b) => b.anio - a.anio || b.fechaCreacion.localeCompare(a.fechaCreacion));
}

export async function aniosDisponibles() {
  const lista = await listarColecciones();
  return [...new Set(lista.map((c) => c.anio))].sort((a, b) => b - a);
}

export const obtenerColeccion = (id) => db.obtener('colecciones', Number(id));

export async function guardarColeccion(datos) {
  const nombre = limpiarTexto(datos.nombre, 80);
  const anio = Number(datos.anio);
  if (!nombre) throw new Error('El nombre es obligatorio.');
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) throw new Error('Año de la promoción no válido.');

  const existentes = await db.todos('colecciones');
  const repetida = existentes.find((c) => c.id !== datos.id && c.anio === anio &&
    c.nombre.toLowerCase() === nombre.toLowerCase());
  if (repetida) throw new Error(`Ya existe la colección "${nombre}" del ${anio}.`);

  const previa = datos.id ? existentes.find((c) => c.id === datos.id) : null;
  const registro = {
    ...(previa || {}),
    nombre,
    anio,
    promocion: limpiarTexto(datos.promocion, 300),
    vigenciaInicio: limpiarTexto(datos.vigenciaInicio, 10),
    vigenciaFin: limpiarTexto(datos.vigenciaFin, 10),
    notas: limpiarTexto(datos.notas, 500),
    fechaCreacion: previa?.fechaCreacion || new Date().toISOString(),
    archivada: previa?.archivada || false,
  };
  if (previa) registro.id = previa.id;
  return db.guardar('colecciones', registro);
}

export async function archivarColeccion(id, archivar = true) {
  const c = await obtenerColeccion(id);
  if (!c) return;
  c.archivada = archivar;
  c.fechaArchivado = archivar ? new Date().toISOString() : null;
  await db.guardar('colecciones', c);
}

export const contarCodigos = (coleccionId) => db.contarPorIndice('codigos', 'coleccionId', Number(coleccionId));

// ---------- Códigos ----------

/**
 * Verifica y, si es nuevo, guarda el código en la colección.
 * Devuelve { nuevo: true, registro } o { nuevo: false, registro: existente }.
 */
export async function registrarCodigo(coleccionId, textoCodigo, metodo = 'manual') {
  const codigo = normalizarCodigo(textoCodigo);
  if (!codigoValido(codigo)) throw new Error('Código no válido.');
  const cid = Number(coleccionId);

  return db.tx(['codigos', 'colecciones'], 'readwrite', async (t) => {
    const st = t.objectStore('codigos');
    const existente = await db.prom(st.index('coleccion_codigo').get([cid, codigo]));
    if (existente) return { nuevo: false, registro: existente };

    const registro = { coleccionId: cid, codigo, fecha: new Date().toISOString(), metodo };
    registro.id = await db.prom(st.add(registro));

    const cs = t.objectStore('colecciones');
    const col = await db.prom(cs.get(cid));
    if (col) { col.ultimoUso = registro.fecha; cs.put(col); }
    return { nuevo: true, registro };
  });
}

export async function eliminarCodigo(id) {
  await db.tx('codigos', 'readwrite', (t) => db.prom(t.objectStore('codigos').delete(Number(id))));
}

export async function listarCodigos(coleccionId, filtro = '') {
  const f = normalizarCodigo(filtro);
  const lista = await db.porIndice('codigos', 'coleccionId', Number(coleccionId));
  return lista.filter((c) => !f || c.codigo.includes(f)).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ---------- Ajustes ----------

export async function leerAjustes() {
  const filas = await db.todos('ajustes');
  const a = { ...AJUSTES_DEFAULT };
  for (const f of filas) if (f.clave in a) a[f.clave] = f.valor;
  return a;
}
export const guardarAjuste = (clave, valor) => db.guardar('ajustes', { clave, valor });

// ---------- Fase 2: figuras (preparado, sin interfaz todavía) ----------
// export async function listarFiguras(coleccionId) { return db.porIndice('figuras', 'coleccionId', coleccionId); }
// export async function guardarFigura({ coleccionId, nombre, numero, tengo }) { ... }
// export async function guardarImagen(figuraId, blob) { ... }   // store 'imagenes'
