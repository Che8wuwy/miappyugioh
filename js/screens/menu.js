import { h, confirmar } from '../core/ui.js';
import { ir } from '../app.js';
import { APP_TITULO, FUNCIONES } from '../config.js';
import { contarCartas } from '../core/repo.js';
import { infoCatalogo } from '../core/catalogo.js';

export const titulo = APP_TITULO;

export async function render(cont) {
  const boton = (icono, texto, accion, clase = '') =>
    h('button', { class: 'btn-menu ' + clase, onclick: accion }, h('span', { class: 'icono', text: icono }), h('span', { text: texto }));
  const total = await contarCartas();
  const cat = await infoCatalogo();

  cont.append(
    h('p', { class: 'nota resumen-menu', text: `${total} carta(s) en tu inventario · ` + (cat ? `catálogo de ${cat.total.toLocaleString('es-MX')} cartas` : 'catálogo sin descargar') }),
    h('div', { class: 'menu' },
      boton('📷', 'Escanear carta', () => ir('escanear'), 'destacado'),
      boton('🗂️', 'Inventario', () => ir('inventario')),
      boton('📚', 'Catálogo', () => ir('catalogo')),
      FUNCIONES.detalles ? boton('🔎', 'Consultar cartas', () => ir('detalles')) : null, // Fase 3
      boton('⚙️', 'Configuración', () => ir('configuracion')),
      boton('🚪', 'Salir', salir, 'salir'),
    ));
}

async function salir() {
  const ok = await confirmar('Salir', 'Tus datos quedan guardados en el celular. ¿Cerrar la app?', { aceptar: 'Salir' });
  if (!ok) return;
  window.close();
  setTimeout(() => confirmar('Cerrar la app',
    'Android no permite que esta app se cierre sola. Ciérrala desde el botón de apps recientes; tus datos ya están guardados.',
    { cancelar: null, aceptar: 'Entendido' }), 400);
}
