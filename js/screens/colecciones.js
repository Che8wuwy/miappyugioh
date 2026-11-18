import { h, toast, confirmar, fechaCorta } from '../core/ui.js';
import { listarColecciones, guardarColeccion, archivarColeccion, contarCodigos, obtenerColeccion } from '../core/repo.js';
import { ajustes } from '../core/tema.js';

export const titulo = 'Colecciones';

export async function render(cont, params = {}) {
  let verArchivadas = false;
  const lista = h('div', { class: 'lista' });
  const zonaForm = h('div');

  const chkArch = h('input', { type: 'checkbox', onchange: (e) => { verArchivadas = e.target.checked; pintar(); } });
  cont.append(
    h('button', { class: 'btn primario grande', text: '➕ Agregar nueva colección', onclick: () => formulario() }),
    zonaForm,
    h('label', { class: 'check' }, chkArch, 'Mostrar archivadas'),
    lista);

  async function pintar() {
    const cols = await listarColecciones({ incluirArchivadas: verArchivadas });
    const items = [];
    for (const c of cols) {
      const total = await contarCodigos(c.id);
      items.push(h('div', { class: 'tarjeta' + (c.archivada ? ' archivada' : '') },
        h('div', { class: 'tarjeta-titulo' }, h('strong', { text: c.nombre }), h('span', { class: 'etiqueta', text: String(c.anio) }),
          c.archivada ? h('span', { class: 'etiqueta gris', text: 'Archivada' }) : null),
        c.promocion ? h('p', { text: c.promocion }) : null,
        h('p', { class: 'nota', text: `${total} código(s) · creada ${fechaCorta(c.fechaCreacion)}` +
          (c.vigenciaInicio || c.vigenciaFin ? ` · vigencia ${c.vigenciaInicio || '?'} a ${c.vigenciaFin || '?'}` : '') }),
        h('div', { class: 'fila-botones' },
          h('button', { class: 'btn secundario', text: '✏️ Editar', onclick: () => formulario(c.id) }),
          c.archivada
            ? h('button', { class: 'btn secundario', text: '↩️ Restaurar', onclick: () => archivar(c, false) })
            : h('button', {
              class: 'btn peligro', text: '🗄️ Archivar', disabled: !ajustes.permitirArchivar,
              title: ajustes.permitirArchivar ? '' : 'Habilítalo en Configuración', onclick: () => archivar(c, true),
            }))));
    }
    if (!items.length) items.push(h('p', { class: 'vacio', text: 'No hay colecciones todavía.' }));
    if (!ajustes.permitirArchivar && cols.some((c) => !c.archivada)) {
      items.unshift(h('p', { class: 'nota', text: 'Archivar está deshabilitado. Se activa en Configuración.' }));
    }
    lista.replaceChildren(...items);
  }

  async function archivar(c, si) {
    if (si && !(await confirmar('Archivar colección',
      `"${c.nombre}" se ocultará de Capturar y Consultar. Sus códigos NO se borran y puedes restaurarla después.`,
      { aceptar: 'Archivar', peligro: true }))) return;
    await archivarColeccion(c.id, si);
    toast(si ? 'Colección archivada' : 'Colección restaurada');
    pintar();
  }

  async function formulario(id) {
    const c = id ? await obtenerColeccion(id) : null;
    const campo = (etq, input) => h('label', { class: 'campo' }, h('span', { text: etq }), input);
    const nombre = h('input', { type: 'text', maxlength: '80', required: true, value: c?.nombre || '' });
    const anio = h('input', { type: 'number', min: '2000', max: '2100', inputmode: 'numeric', value: String(c?.anio || new Date().getFullYear()) });
    const promocion = h('textarea', { maxlength: '300', rows: 2 }); promocion.value = c?.promocion || '';
    const ini = h('input', { type: 'date', value: c?.vigenciaInicio || '' });
    const fin = h('input', { type: 'date', value: c?.vigenciaFin || '' });
    const notas = h('textarea', { maxlength: '500', rows: 2 }); notas.value = c?.notas || '';

    const cerrar = () => zonaForm.replaceChildren();
    zonaForm.replaceChildren(h('form', {
      class: 'panel formulario',
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await guardarColeccion({ id: c?.id, nombre: nombre.value, anio: anio.value, promocion: promocion.value,
            vigenciaInicio: ini.value, vigenciaFin: fin.value, notas: notas.value });
          toast(c ? 'Colección actualizada' : 'Colección creada');
          cerrar(); pintar();
        } catch (err) { toast(err.message); }
      },
    },
    h('h2', { text: c ? 'Editar colección' : 'Nueva colección' }),
    campo('Nombre *', nombre),
    campo('Año de la promoción *', anio),
    campo('Promoción (de qué trata, premios, etc.)', promocion),
    h('div', { class: 'fila' }, campo('Vigencia desde', ini), campo('hasta', fin)),
    campo('Notas', notas),
    c ? h('p', { class: 'nota', text: 'Creada el ' + fechaCorta(c.fechaCreacion) }) : null,
    h('div', { class: 'fila-botones' },
      h('button', { type: 'button', class: 'btn secundario', text: 'Cancelar', onclick: cerrar }),
      h('button', { type: 'submit', class: 'btn primario', text: 'Guardar' }))));
    nombre.focus();
    zonaForm.scrollIntoView({ behavior: 'smooth' });
  }

  await pintar();
  if (params.nueva) formulario();
}
