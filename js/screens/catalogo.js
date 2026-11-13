import { h, toast, confirmar, fechaHora } from '../core/ui.js';
import { infoCatalogo, actualizarCatalogo, buscarPorNumero, buscarPorPasscode } from '../core/catalogo.js';
import { iconoAtributo } from '../core/atributos.js';

export const titulo = 'Catálogo';

export async function render(cont) {
  const estado = h('div', { class: 'panel' });
  const progreso = h('progress', { max: '1', class: 'oculto' });
  const textoProg = h('p', { class: 'nota' });
  const btn = h('button', { class: 'btn primario grande', text: '⬇️ Descargar / actualizar catálogo', onclick: actualizar });

  async function pintarEstado() {
    const m = await infoCatalogo();
    estado.replaceChildren(h('h2', { text: 'Estado' }), m
      ? h('div', {},
        h('p', {}, h('strong', { text: m.total.toLocaleString('es-MX') }), ' cartas · actualizado el ', fechaHora(m.fecha)),
        m.conJa != null ? h('p', { class: 'nota', text: `${m.conJa.toLocaleString('es-MX')} con nombre japonés · ${m.conNum.toLocaleString('es-MX')} con Card Number` }) : null,
        h('p', { class: 'nota', text: 'Fuente: ' + m.fuente }))
      : h('p', { text: 'Todavía no hay catálogo descargado.' }));
  }

  async function actualizar() {
    if (!navigator.onLine) return toast('Necesitas internet para descargar el catálogo.');
    if (!(await confirmar('Descargar catálogo', 'Se descargan todas las cartas OCG y TCG (archivo grande: usa Wi-Fi). Puede tardar unos minutos. Tu inventario no se toca.', { aceptar: 'Descargar' }))) return;
    btn.disabled = true; progreso.classList.remove('oculto'); progreso.removeAttribute('value');
    try {
      const meta = await actualizarCatalogo((m) => {
        if (m.avance != null) progreso.value = m.avance; else progreso.removeAttribute('value');
        textoProg.textContent = m.etapa + (m.mb ? ` · ${m.mb.toFixed(1)} MB` : '') + (m.avance != null ? ` · ${Math.round(m.avance * 100)}%` : '');
      });
      toast(`Catálogo listo: ${meta.total.toLocaleString('es-MX')} cartas`, 3500);
      textoProg.textContent = '';
    } catch (e) {
      textoProg.textContent = 'No se pudo actualizar: ' + e.message;
    } finally {
      btn.disabled = false; progreso.classList.add('oculto'); pintarEstado();
    }
  }

  // Prueba rápida de búsqueda
  const q = h('input', { type: 'search', placeholder: 'Card Number o passcode', autocapitalize: 'characters' });
  const res = h('div');
  const probar = async () => {
    const v = q.value.trim();
    if (!v) return;
    const r = /^\d{5,8}$/.test(v) ? await buscarPorPasscode(v) : await buscarPorNumero(v);
    res.replaceChildren(r
      ? h('div', { class: 'tarjeta' }, h('div', { class: 'tarjeta-titulo' }, iconoAtributo(r.atributo, 30), h('strong', { text: r.nombreEn })),
        r.nombreJa ? h('p', { lang: 'ja', text: r.nombreJa }) : null,
        h('p', { class: 'nota', text: `Passcode ${r.passcode || '—'} · ${r.tipo}${r.tipo === 'Monstruo' ? ` · ATK ${r.atk} / DEF ${r.def}` : ''}` }),
        r.rarezas.length ? h('p', { class: 'nota', text: 'Rarezas: ' + r.rarezas.join(', ') }) : null)
      : h('p', { class: 'nota', text: 'No está en el catálogo.' }));
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') probar(); });

  cont.append(estado, btn, progreso, textoProg,
    h('section', { class: 'panel' }, h('h2', { text: 'Probar búsqueda' }), q,
      h('button', { class: 'btn secundario', text: 'Buscar', onclick: probar }), res),
    h('p', { class: 'nota', text: 'El catálogo vive en tu celular y funciona sin internet. Actualízalo cuando salgan sets nuevos.' }));
  pintarEstado();
}
