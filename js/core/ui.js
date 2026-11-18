// Utilidades de interfaz. Regla de seguridad: los datos del usuario
// SIEMPRE se insertan como texto (textContent), nunca como HTML.

export function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

export function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
export function fechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${fechaCorta(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function toast(mensaje, ms = 2500) {
  const t = h('div', { class: 'toast', role: 'status', text: mensaje });
  document.body.append(t);
  setTimeout(() => t.classList.add('visible'), 10);
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, ms);
}

/** Ventana de confirmación propia (evita los diálogos nativos). */
export function confirmar(titulo, mensaje, { aceptar = 'Aceptar', cancelar = 'Cancelar', peligro = false } = {}) {
  return new Promise((resolve) => {
    const cerrar = (v) => { fondo.remove(); resolve(v); };
    const fondo = h('div', { class: 'modal-fondo' },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('h2', { text: titulo }),
        h('p', { text: mensaje }),
        h('div', { class: 'fila-botones' },
          cancelar ? h('button', { class: 'btn secundario', text: cancelar, onclick: () => cerrar(false) }) : null,
          h('button', { class: 'btn ' + (peligro ? 'peligro' : 'primario'), text: aceptar, onclick: () => cerrar(true) }),
        )));
    document.body.append(fondo);
  });
}

/**
 * Alerta grande de resultado: tipo 'rojo' (ya registrado) o 'verde' (nuevo).
 * Parpadea, vibra y se cierra al tocarla.
 */
export function alertaResultado(tipo, titulo, codigo, detalle, vibrar = true) {
  return new Promise((resolve) => {
    const el = h('div', { class: `alerta alerta-${tipo}`, role: 'alert' },
      h('div', { class: 'alerta-icono', text: tipo === 'rojo' ? '✖' : '✔' }),
      h('div', { class: 'alerta-titulo', text: titulo }),
      h('div', { class: 'alerta-codigo', text: codigo }),
      h('div', { class: 'alerta-detalle', text: detalle }),
      h('div', { class: 'alerta-pie', text: 'Toca para continuar' }));
    el.addEventListener('click', () => { el.remove(); resolve(); });
    document.body.append(el);
    if (vibrar && navigator.vibrate) navigator.vibrate(tipo === 'rojo' ? [300, 120, 300, 120, 300] : [120]);
  });
}

export function cargando(texto = 'Procesando…') {
  const el = h('div', { class: 'modal-fondo' }, h('div', { class: 'cargando' }, h('div', { class: 'spinner' }), h('p', { text: texto })));
  document.body.append(el);
  return { texto: (t) => { el.querySelector('p').textContent = t; }, cerrar: () => el.remove() };
}

/** Selector de colección con filtro por año (reutilizado en Capturar y Consultar). */
export function selectorColeccion({ colecciones, anios, seleccionId, onCambio }) {
  const selAnio = h('select', { 'aria-label': 'Año de la promoción' },
    h('option', { value: '', text: 'Todos' }),
    anios.map((a) => h('option', { value: String(a), text: String(a) })));
  const selCol = h('select', { 'aria-label': 'Colección' });

  const pintar = () => {
    const anio = selAnio.value ? Number(selAnio.value) : null;
    const lista = colecciones.filter((c) => !anio || c.anio === anio);
    selCol.replaceChildren(...lista.map((c) =>
      h('option', { value: String(c.id), text: `${c.nombre} (${c.anio}) · creada ${fechaCorta(c.fechaCreacion)}` })));
    if (lista.some((c) => c.id === seleccionId)) selCol.value = String(seleccionId);
    onCambio(selCol.value ? Number(selCol.value) : null);
  };
  selAnio.addEventListener('change', pintar);
  selCol.addEventListener('change', () => { seleccionId = Number(selCol.value); onCambio(seleccionId); });
  const caja = h('div', { class: 'selector' },
    h('label', {}, 'Año', selAnio), h('label', {}, 'Colección', selCol));
  queueMicrotask(pintar);
  return caja;
}
