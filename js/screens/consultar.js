import { h, fechaHora, selectorColeccion, toast, confirmar } from '../core/ui.js';
import { listarColecciones, aniosDisponibles, listarCodigos, eliminarCodigo } from '../core/repo.js';
import { exportarCSV } from '../core/datos.js';
import { ir } from '../app.js';

export const titulo = 'Consultar';

export async function render(cont) {
  const colecciones = await listarColecciones();
  if (!colecciones.length) {
    cont.append(h('div', { class: 'vacio' }, h('p', { text: 'No hay colecciones todavía.' }),
      h('button', { class: 'btn primario', text: 'Crear colección', onclick: () => ir('colecciones', { nueva: 1 }) })));
    return;
  }
  const masReciente = [...colecciones].sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))[0];
  let coleccionId = masReciente.id;

  const buscar = h('input', { type: 'search', placeholder: 'Buscar código en esta colección…', autocapitalize: 'characters', 'aria-label': 'Buscar código' });
  const resumen = h('p', { class: 'resumen' });
  const lista = h('div', { class: 'lista-codigos' });

  async function pintar() {
    if (!coleccionId) { resumen.textContent = ''; lista.replaceChildren(); return; }
    const todos = await listarCodigos(coleccionId);
    const filtrados = buscar.value ? await listarCodigos(coleccionId, buscar.value) : todos;
    resumen.textContent = buscar.value
      ? `${filtrados.length} coincidencia(s) de ${todos.length} código(s)`
      : `${todos.length} código(s) registrados`;
    lista.replaceChildren(...filtrados.slice(0, 500).map((c) => h('div', { class: 'fila-codigo' },
      h('span', { class: 'mono', text: c.codigo }),
      h('span', { class: 'nota', text: `${fechaHora(c.fecha)} · ${c.metodo === 'camara' ? '📷' : '⌨️'}` }),
      h('button', { class: 'btn-borrar', 'aria-label': 'Eliminar ' + c.codigo, text: '🗑️', onclick: () => borrar(c) }))));
    if (filtrados.length > 500) lista.append(h('p', { class: 'nota', text: 'Se muestran los 500 más recientes. Usa el buscador o exporta a CSV.' }));
  }
  async function borrar(c) {
    const ok = await confirmar('Eliminar código',
      `¿Eliminar el código ${c.codigo} registrado el ${fechaHora(c.fecha)}? Esta acción no se puede deshacer.`,
      { aceptar: 'Eliminar', peligro: true });
    if (!ok) return;
    await eliminarCodigo(c.id);
    toast('Código eliminado');
    pintar();
  }
  buscar.addEventListener('input', pintar);

  cont.append(
    selectorColeccion({ colecciones, anios: await aniosDisponibles(), seleccionId: coleccionId,
      onCambio: (id) => { coleccionId = id; pintar(); } }),
    buscar, resumen,
    h('button', {
      class: 'btn secundario', text: '⬇️ Descargar CSV de esta colección',
      onclick: async () => {
        const col = colecciones.find((c) => c.id === coleccionId);
        if (!col) return;
        exportarCSV(col, await listarCodigos(coleccionId));
        toast('CSV generado');
      },
    }),
    lista);
}
