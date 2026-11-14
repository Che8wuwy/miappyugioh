// Exportar CSV, respaldo e importación de respaldo del inventario.

import * as db from './db.js';
import { prepararCarta } from './repo.js';
import { APP_NOMBRE, APP_VERSION, DB_VERSION } from '../config.js';
import { fechaHora } from './ui.js';
import { ATRIBUTOS } from './atributos.js';

function descargar(nombreArchivo, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const hoy = () => new Date().toISOString().slice(0, 10);

// Evita "inyección de fórmulas" al abrir el CSV en Excel
function celdaCSV(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/** CSV con separador ";" (Excel en español) y BOM para acentos y japonés. */
export function exportarCSV(cartas) {
  const filas = [['Card Number', 'Número propio', 'Edición', 'Rareza', 'Nombre (inglés)', 'Nombre (japonés)', 'Passcode', 'Tipo', 'Atributo', 'ATK', 'DEF', 'Juego', 'Fecha de alta']];
  for (const c of cartas) {
    filas.push([c.cardNumber, c.numeroPropio ? 'Sí' : 'No', c.edicion, c.rareza, c.nombreEn, c.nombreJa, c.passcode, c.tipo,
      ATRIBUTOS[c.atributo]?.nombre || '', c.atk, c.def, c.juego, fechaHora(c.fechaAlta)]);
  }
  const csv = '﻿' + filas.map((f) => f.map(celdaCSV).join(';')).join('\r\n');
  descargar(`${APP_NOMBRE}_inventario_${hoy()}.csv`, csv, 'text/csv;charset=utf-8');
}

export async function exportarRespaldo() {
  const respaldo = {
    app: APP_NOMBRE, version: APP_VERSION, esquema: DB_VERSION, exportado: new Date().toISOString(),
    cartas: await db.todos('cartas'),
    // Fase 2: fotos se agregarán aquí. El catálogo no se respalda (se vuelve a descargar).
  };
  descargar(`${APP_NOMBRE}_respaldo_${hoy()}.json`, JSON.stringify(respaldo, null, 1), 'application/json');
}

/** Importa un respaldo SUMANDO al inventario (no borra; omite llaves repetidas). */
export async function importarRespaldo(archivo) {
  if (archivo.size > 30 * 1024 * 1024) throw new Error('El archivo es demasiado grande.');
  let datos;
  try { datos = JSON.parse(await archivo.text()); } catch { throw new Error('El archivo no es un respaldo válido.'); }
  if (!datos || datos.app !== APP_NOMBRE || !Array.isArray(datos.cartas)) throw new Error('El archivo no es un respaldo de ' + APP_NOMBRE + '.');
  const fechaOk = (v) => (typeof v === 'string' && !isNaN(Date.parse(v)) ? v : new Date().toISOString());

  let nuevas = 0, repetidas = 0, invalidas = 0;
  await db.tx('cartas', 'readwrite', async (t) => {
    const st = t.objectStore('cartas');
    for (const x of datos.cartas) {
      let c;
      try { c = prepararCarta(x || {}); } catch { invalidas++; continue; }
      const existe = await db.prom(st.index('llave').get([c.cardNumberKey, c.edicion, c.rareza]));
      if (existe) { repetidas++; continue; }
      c.fechaAlta = fechaOk(x.fechaAlta);
      await db.prom(st.add(c));
      nuevas++;
    }
  });
  return { nuevas, repetidas, invalidas };
}
