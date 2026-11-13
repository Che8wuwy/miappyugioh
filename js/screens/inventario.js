import { h, toast, confirmar, fechaCorta } from '../core/ui.js';
import { listarCartas, obtenerCarta, editarCarta, eliminarCarta } from '../core/repo.js';
import { ATRIBUTOS, iconoAtributo } from '../core/atributos.js';
import { formularioCarta } from '../core/formCarta.js';
import { exportarCSV } from '../core/datos.js';
import { TIPOS_CARTA } from '../config.js';
import { ir } from '../app.js';

export const titulo = 'Inventario';

export async function render(cont, params = {}) {
  if (params.id) return detalle(cont, Number(params.id));

  const buscar = h('input', { type: 'search', placeholder: 'Buscar por nombre, Card Number o passcode', 'aria-label': 'Buscar' });
  const selJuego = h('select', { 'aria-label': 'Juego' }, h('option', { value: '', text: 'TCG y OCG' }), h('option', { value: 'TCG', text: 'TCG' }), h('option', { value: 'OCG', text: 'OCG' }));
  const selTipo = h('select', { 'aria-label': 'Tipo' }, h('option', { value: '', text: 'Todos los tipos' }), TIPOS_CARTA.map((t) => h('option', { value: t, text: t })));
  const selAttr = h('select', { 'aria-label': 'Atributo' }, h('option', { value: '', text: 'Todos los atributos' }),
    Object.entries(ATRIBUTOS).map(([k, a]) => h('option', { value: k, text: a.nombre })));
  const resumen = h('p', { class: 'resumen' });
  const lista = h('div', { class: 'lista-cartas' });
  let actuales = [];

  async function pintar() {
    actuales = await listarCartas({ texto: buscar.value, juego: selJuego.value, tipo: selTipo.value, atributo: selAttr.value });
    resumen.textContent = `${actuales.length} carta(s)`;
    lista.replaceChildren(...actuales.slice(0, 400).map((c) => h('button', { class: 'fila-carta', onclick: () => ir('inventario', { id: c.id }) },
      iconoAtributo(c.atributo, 34),
      h('div', { class: 'fila-carta-texto' },
        h('strong', { text: c.nombreEn || c.nombreJa || '(sin nombre)' }),
        c.nombreJa && c.nombreEn ? h('span', { class: 'nota', lang: 'ja', text: c.nombreJa }) : null,
        h('span', { class: 'nota mono', text: `${c.cardNumber} · ${c.rareza} · ${c.edicion}` }),
        c.tipo === 'Monstruo' ? h('span', { class: 'nota', text: `ATK ${c.atk || '—'} / DEF ${c.def || '—'}` }) : null),
      h('span', { class: 'etiqueta' + (c.juego === 'OCG' ? ' ocg' : ''), text: c.juego || '?' }))));
    if (actuales.length > 400) lista.append(h('p', { class: 'nota', text: 'Se muestran 400. Usa el buscador o exporta a CSV.' }));
    if (!actuales.length) lista.append(h('p', { class: 'vacio', text: 'No hay cartas con esos filtros.' }));
  }
  [buscar].forEach((x) => x.addEventListener('input', pintar));
  [selJuego, selTipo, selAttr].forEach((x) => x.addEventListener('change', pintar));

  cont.append(buscar, h('div', { class: 'filtros' }, selJuego, selTipo, selAttr), resumen,
    h('button', { class: 'btn secundario', text: '⬇️ Descargar CSV (lo filtrado)', onclick: () => { exportarCSV(actuales); toast('CSV generado'); } }),
    lista);
  await pintar();
}

async function detalle(cont, id) {
  const c = await obtenerCarta(id);
  if (!c) { cont.append(h('p', { class: 'error', text: 'La carta ya no existe.' })); return; }
  const form = formularioCarta(c, {
    botones: [
      h('button', { type: 'button', class: 'btn peligro', text: '🗑️ Eliminar', onclick: borrar }),
      h('button', { type: 'button', class: 'btn primario', text: 'Guardar cambios', onclick: guardar }),
    ],
  });
  form.setEstado(`Registrada el ${fechaCorta(c.fechaAlta)}` + (c.fechaEdicion ? ` · editada el ${fechaCorta(c.fechaEdicion)}` : ''));
  cont.append(h('div', { class: 'panel' }, form.el));

  async function guardar() {
    try { await editarCarta(id, { ...form.leer(), origen: c.origen }); toast('Cambios guardados'); history.back(); }
    catch (e) { toast(e.message, 3500); }
  }
  async function borrar() {
    if (!(await confirmar('Eliminar carta', `¿Eliminar ${c.cardNumber} (${c.rareza}, ${c.edicion}) del inventario? No se puede deshacer.`, { aceptar: 'Eliminar', peligro: true }))) return;
    await eliminarCarta(id); toast('Carta eliminada'); history.back();
  }
}
