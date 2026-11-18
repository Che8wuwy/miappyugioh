import { h, confirmar } from '../core/ui.js';
import { ir } from '../app.js';
import { FUNCIONES } from '../config.js';

export const titulo = 'MiAppVuala';

export function render(cont) {
  const boton = (icono, texto, accion, clase = '') =>
    h('button', { class: 'btn-menu ' + clase, onclick: accion }, h('span', { class: 'icono', text: icono }), h('span', { text: texto }));

  cont.append(h('div', { class: 'menu' },
    boton('📷', 'Capturar código', () => ir('capturar'), 'destacado'),
    boton('📚', 'Colecciones', () => ir('colecciones')),
    boton('🔎', 'Consultar', () => ir('consultar')),
    FUNCIONES.figuras ? boton('🧸', 'Figuras', () => ir('figuras')) : null, // Fase 2
    boton('⚙️', 'Configuración', () => ir('configuracion')),
    boton('🚪', 'Salir', salir, 'salir'),
  ));
}

async function salir() {
  const ok = await confirmar('Salir', 'Tus datos quedan guardados en el celular. ¿Cerrar la app?', { aceptar: 'Salir' });
  if (!ok) return;
  window.close();
  // Si el sistema no permite cerrar la ventana, se avisa cómo hacerlo
  setTimeout(() => confirmar('Cerrar la app',
    'Android no permite que esta app se cierre sola. Ciérrala desde el botón de apps recientes; tus datos ya están guardados.',
    { cancelar: null, aceptar: 'Entendido' }), 400);
}
