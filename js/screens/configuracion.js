import { h, toast, confirmar, cargando } from '../core/ui.js';
import { ajustes, cambiarAjuste } from '../core/tema.js';
import { exportarRespaldo, importarRespaldo } from '../core/datos.js';
import { APP_TITULO, APP_VERSION, COLORES } from '../config.js';

export const titulo = 'Configuración';

export async function render(cont) {
  const interruptor = (texto, clave, ayuda) => h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked: !!ajustes[clave], onchange: (e) => cambiarAjuste(clave, e.target.checked) }),
    h('span', {}, texto, ayuda ? h('small', { class: 'nota bloque', text: ayuda }) : null));

  const colores = h('div', { class: 'colores' }, COLORES.map((c) => {
    const b = h('button', { class: 'color' + (ajustes.colorPrincipal === c ? ' activo' : ''), 'aria-label': 'Color ' + c,
      onclick: () => { cambiarAjuste('colorPrincipal', c); colores.querySelectorAll('.color').forEach((x) => x.classList.toggle('activo', x === b)); } });
    b.style.background = c;
    return b;
  }));

  const valorLetra = h('span', { text: ajustes.tamanoLetra + '%' });
  const letra = h('input', { type: 'range', min: '85', max: '140', step: '5', value: String(ajustes.tamanoLetra),
    oninput: (e) => { valorLetra.textContent = e.target.value + '%'; cambiarAjuste('tamanoLetra', Number(e.target.value)); } });

  const archivo = h('input', { type: 'file', accept: 'application/json,.json', class: 'oculto',
    onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (!(await confirmar('Importar respaldo', 'Se SUMARÁN las cartas del archivo a tu inventario. Las repetidas se omiten. No se borra nada.', { aceptar: 'Importar' }))) return;
      const c = cargando('Importando…');
      try {
        const r = await importarRespaldo(f);
        toast(`Importado: ${r.nuevas} carta(s). Repetidas: ${r.repetidas}. Inválidas: ${r.invalidas}.`, 4000);
      } catch (err) { toast(err.message, 4000); } finally { c.cerrar(); }
    } });

  const almacenamiento = h('p', { class: 'nota', text: 'Revisando almacenamiento…' });
  (async () => {
    try {
      const persistente = await navigator.storage?.persisted?.();
      const est = await navigator.storage?.estimate?.();
      const mb = est ? (est.usage / 1048576).toFixed(1) : '?';
      almacenamiento.textContent = `Espacio usado: ${mb} MB · Protección contra borrado automático: ${persistente ? 'activa' : 'no concedida'}`;
    } catch { almacenamiento.textContent = ''; }
  })();

  cont.append(
    h('section', { class: 'panel' }, h('h2', { text: 'Apariencia' }),
      interruptor('Modo oscuro', 'modoOscuro'),
      h('p', { text: 'Color principal' }), colores,
      h('label', { class: 'campo' }, h('span', {}, 'Tamaño de letra: ', valorLetra), letra)),
    h('section', { class: 'panel' }, h('h2', { text: 'Opciones' }),
      interruptor('Buscar en línea si no está en el catálogo', 'buscarEnLinea', 'Usa YGOPRODeck (solo TCG) cuando hay internet. Solo se envía el Card Number o el passcode.'),
      interruptor('Vibrar al guardar una carta', 'vibrar')),
    h('section', { class: 'panel' }, h('h2', { text: 'Respaldo de datos' }),
      h('p', { class: 'nota', text: 'Tu inventario vive solo en este celular. Si borras los datos de Chrome o cambias de teléfono, se pierde. Haz un respaldo de vez en cuando y guárdalo en Drive o en tu PC.' }),
      h('div', { class: 'fila-botones' },
        h('button', { class: 'btn primario', text: '⬇️ Exportar respaldo', onclick: async () => { await exportarRespaldo(); toast('Respaldo generado'); } }),
        h('button', { class: 'btn secundario', text: '⬆️ Importar respaldo', onclick: () => archivo.click() })),
      archivo, almacenamiento),
    h('section', { class: 'panel' }, h('h2', { text: 'Acerca de' }),
      h('p', {}, h('strong', { text: APP_TITULO }), ` · versión ${APP_VERSION}`),
      h('p', { class: 'nota', text: 'Inventario personal de cartas Yu-Gi-Oh! (TCG y OCG). Llave: Card Number + Edición + Rareza.' }),
      h('p', { class: 'nota', text: 'Tu inventario vive solo en este celular. Internet se usa únicamente para descargar el catálogo y, si lo permites, para buscar una carta en línea.' }),
      h('p', { class: 'nota', text: 'Datos de cartas: YAML Yugi y YGOPRODeck (proyectos comunitarios). Lector de texto: Tesseract.js (Apache 2.0). App no oficial, sin relación con Konami.' })),
  );
}
