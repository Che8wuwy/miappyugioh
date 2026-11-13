// Arranque y navegación (rutas con #, así funciona el botón "atrás" de Android).
// Para agregar una pantalla: crea js/screens/<nombre>.js con `titulo` y `render(cont, params)`
// y regístrala en PANTALLAS.

import { h } from './core/ui.js';
import { abrirDB } from './core/db.js';
import { cargarAjustes } from './core/tema.js';

const PANTALLAS = {
  menu: () => import('./screens/menu.js'),
  escanear: () => import('./screens/escanear.js'),
  inventario: () => import('./screens/inventario.js'),
  catalogo: () => import('./screens/catalogo.js'),
  configuracion: () => import('./screens/configuracion.js'),
  // detalles: () => import('./screens/detalles.js'),   // Fase 3
};

let limpiarActual = null;

export function ir(nombre, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = '#/' + nombre + (q ? '?' + q : '');
}

async function mostrar() {
  const [ruta, q] = location.hash.replace(/^#\/?/, '').split('?');
  const nombre = PANTALLAS[ruta] ? ruta : 'menu';
  const params = Object.fromEntries(new URLSearchParams(q || ''));

  if (limpiarActual) { try { limpiarActual(); } catch (_) {} limpiarActual = null; }
  const mod = await PANTALLAS[nombre]();
  const cont = document.getElementById('contenido');
  cont.replaceChildren();
  document.getElementById('titulo').textContent = mod.titulo;
  document.getElementById('btn-atras').hidden = nombre === 'menu';
  try {
    const r = await mod.render(cont, params);
    if (typeof r === 'function') limpiarActual = r;
  } catch (e) {
    cont.append(h('p', { class: 'error', text: 'Ocurrió un error: ' + e.message }));
  }
  window.scrollTo(0, 0);
}

async function iniciar() {
  try {
    await abrirDB();
    await cargarAjustes();
  } catch (e) {
    document.getElementById('contenido').replaceChildren(h('p', { class: 'error', text: 'No se pudo abrir la base de datos: ' + e.message }));
    return;
  }
  document.getElementById('btn-atras').addEventListener('click', () => {
    if (history.length > 1) history.back(); else ir('menu');
  });
  window.addEventListener('hashchange', mostrar);
  // Si el usuario sale de la app, apagar la cámara
  document.addEventListener('visibilitychange', () => {
    if (!location.hash.startsWith('#/escanear')) return;
    if (document.hidden) { if (limpiarActual) { limpiarActual(); limpiarActual = null; } }
    else mostrar();
  });
  mostrar();

  // Pide al navegador no borrar los datos automáticamente
  try { await navigator.storage?.persist?.(); } catch (_) {}

  // Modo sin internet
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    const habiaVersion = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaVersion || recargado) return; // recarga solo al actualizar versión
      recargado = true; location.reload();
    });
  }
}

iniciar();
