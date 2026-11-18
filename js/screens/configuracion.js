import { h, toast, confirmar, cargando } from '../core/ui.js';
import { ajustes, cambiarAjuste } from '../core/tema.js';
import { exportarRespaldo, importarRespaldo } from '../core/datos.js';
import { APP_NOMBRE, APP_VERSION, COLORES, CODIGO_MIN, CODIGO_MAX } from '../config.js';

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
      if (!(await confirmar('Importar respaldo', 'Se SUMARÁN las colecciones y códigos del archivo a los que ya tienes. No se borra nada.', { aceptar: 'Importar' }))) return;
      const c = cargando('Importando…');
      try {
        const r = await importarRespaldo(f);
        toast(`Importado: ${r.nuevasCol} colección(es), ${r.nuevosCod} código(s). Repetidos omitidos: ${r.repetidos}.`, 4000);
      } catch (err) { toast(err.message, 4000); } finally { c.cerrar(); }
    } });

  const almacenamiento = h('p', { class: 'nota', text: 'Revisando almacenamiento…' });
  const offline = h('p', { class: 'nota', text: 'Revisando modo sin internet…' });
  (async () => {
    try {
      const r = await caches.match('./__estado-offline.json');
      if (!r) { offline.textContent = '⚠️ Modo sin internet: aún no está listo. Abre la app con internet, espera unos segundos y vuelve a revisar.'; return; }
      const e = await r.json();
      offline.textContent = e.faltan.length
        ? `⚠️ Modo sin internet incompleto: faltan ${e.faltan.length} de ${e.total} archivos (${e.faltan.join(', ')}). Revisa que estén subidos a GitHub.`
        : `✅ Modo sin internet listo (${e.guardados} archivos guardados).`;
    } catch { offline.textContent = '⚠️ No se pudo revisar el modo sin internet.'; }
  })();
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
      interruptor('Permitir archivar colecciones', 'permitirArchivar', 'Deshabilitado por seguridad. Archivar oculta la colección pero no borra sus códigos.'),
      interruptor('Vibrar al verificar un código', 'vibrar')),
    h('section', { class: 'panel' }, h('h2', { text: 'Respaldo de datos' }),
      h('p', { class: 'nota', text: 'Tus datos viven solo en este celular. Si borras los datos de Chrome o cambias de teléfono, se pierden. Haz un respaldo de vez en cuando y guárdalo en Drive o en tu PC.' }),
      h('div', { class: 'fila-botones' },
        h('button', { class: 'btn primario', text: '⬇️ Exportar respaldo', onclick: async () => { await exportarRespaldo(); toast('Respaldo generado'); } }),
        h('button', { class: 'btn secundario', text: '⬆️ Importar respaldo', onclick: () => archivo.click() })),
      archivo, almacenamiento, offline),
    h('section', { class: 'panel' }, h('h2', { text: 'Acerca de' }),
      h('p', {}, h('strong', { text: APP_NOMBRE }), ` · versión ${APP_VERSION}`),
      h('p', { class: 'nota', text: 'Registra los códigos de lote de las bolsas Vuala por colección y avisa si un código ya se registró.' }),
      h('p', { class: 'nota', text: `Códigos aceptados: de ${CODIGO_MIN} a ${CODIGO_MAX} letras y números.` }),
      h('p', { class: 'nota', text: 'Funciona sin internet. No envía datos a ningún servidor. Lector de texto: Tesseract.js (licencia Apache 2.0).' })),
  );
}
