// Exportar CSV, respaldo e importación de respaldo.

import * as db from './db.js';
import { normalizarCodigo, codigoValido } from './repo.js';
import { APP_NOMBRE, APP_VERSION, DB_VERSION } from '../config.js';
import { fechaHora } from './ui.js';

function descargar(nombreArchivo, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const hoy = () => new Date().toISOString().slice(0, 10);
const nombreSeguro = (s) => String(s).replace(/[^\w\-]+/g, '_').slice(0, 40);

// Evita "inyección de fórmulas" al abrir el CSV en Excel
function celdaCSV(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** CSV con separador ";" (Excel en español) y BOM para acentos. */
export function exportarCSV(coleccion, codigos) {
  const filas = [['Colección', 'Año', 'Código', 'Fecha de registro', 'Método']];
  for (const c of codigos) filas.push([coleccion.nombre, coleccion.anio, c.codigo, fechaHora(c.fecha), c.metodo]);
  const csv = '﻿' + filas.map((f) => f.map(celdaCSV).join(';')).join('\r\n');
  descargar(`${APP_NOMBRE}_${nombreSeguro(coleccion.nombre)}_${coleccion.anio}_${hoy()}.csv`, csv, 'text/csv;charset=utf-8');
}

export async function exportarRespaldo() {
  const respaldo = {
    app: APP_NOMBRE, version: APP_VERSION, esquema: DB_VERSION, exportado: new Date().toISOString(),
    colecciones: await db.todos('colecciones'),
    codigos: await db.todos('codigos'),
    // Fase 2: figuras e imágenes se agregarán aquí
  };
  descargar(`${APP_NOMBRE}_respaldo_${hoy()}.json`, JSON.stringify(respaldo, null, 1), 'application/json');
}

/**
 * Importa un respaldo SUMANDO a lo existente (no borra nada).
 * Valida todo el contenido: un archivo alterado no puede meter datos raros.
 */
export async function importarRespaldo(archivo) {
  if (archivo.size > 20 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
  let datos;
  try { datos = JSON.parse(await archivo.text()); } catch { throw new Error('El archivo no es un respaldo válido.'); }
  if (!datos || datos.app !== APP_NOMBRE || !Array.isArray(datos.colecciones) || !Array.isArray(datos.codigos)) {
    throw new Error('El archivo no es un respaldo de ' + APP_NOMBRE + '.');
  }
  const texto = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const fechaOk = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : new Date().toISOString());

  let nuevasCol = 0, nuevosCod = 0, repetidos = 0;
  await db.tx(['colecciones', 'codigos'], 'readwrite', async (t) => {
    const cs = t.objectStore('colecciones');
    const ks = t.objectStore('codigos');
    const actuales = await db.prom(cs.getAll());
    const mapa = new Map(); // id del respaldo -> id local

    for (const c of datos.colecciones) {
      const nombre = texto(c.nombre, 80).trim();
      const anio = Number(c.anio);
      if (!nombre || !Number.isInteger(anio)) continue;
      let local = actuales.find((x) => x.anio === anio && x.nombre.toLowerCase() === nombre.toLowerCase());
      if (!local) {
        local = {
          nombre, anio, promocion: texto(c.promocion, 300), vigenciaInicio: texto(c.vigenciaInicio, 10),
          vigenciaFin: texto(c.vigenciaFin, 10), notas: texto(c.notas, 500),
          fechaCreacion: fechaOk(c.fechaCreacion), archivada: c.archivada === true,
        };
        local.id = await db.prom(cs.add(local));
        actuales.push(local); nuevasCol++;
      }
      mapa.set(c.id, local.id);
    }
    for (const k of datos.codigos) {
      const cid = mapa.get(k.coleccionId);
      const codigo = normalizarCodigo(k.codigo);
      if (!cid || !codigoValido(codigo)) continue;
      const existe = await db.prom(ks.index('coleccion_codigo').get([cid, codigo]));
      if (existe) { repetidos++; continue; }
      await db.prom(ks.add({ coleccionId: cid, codigo, fecha: fechaOk(k.fecha), metodo: k.metodo === 'camara' ? 'camara' : 'manual' }));
      nuevosCod++;
    }
  });
  return { nuevasCol, nuevosCod, repetidos };
}
