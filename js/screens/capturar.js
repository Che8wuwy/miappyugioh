import { h, toast, alertaResultado, fechaHora, selectorColeccion } from '../core/ui.js';
import { listarColecciones, aniosDisponibles, registrarCodigo, normalizarCodigo, codigoValido } from '../core/repo.js';
import { abrirCamara, cerrarCamara, recortarGuia, leerCodigo, prepararOCR, capacidades, ponerZoom, ponerLinterna, enfocarEn } from '../ocr/escaner.js';
import { ajustes } from '../core/tema.js';
import { ir } from '../app.js';
import { CODIGO_MIN, CODIGO_MAX } from '../config.js';

export const titulo = 'Capturar código';

let zoomActual = 1; // se recuerda mientras la app esté abierta

export async function render(cont) {
  const colecciones = await listarColecciones();
  if (!colecciones.length) {
    cont.append(h('div', { class: 'vacio' },
      h('p', { text: 'Primero crea una colección para poder capturar códigos.' }),
      h('button', { class: 'btn primario', text: 'Crear colección', onclick: () => ir('colecciones', { nueva: 1 }) })));
    return;
  }

  // Por defecto: la colección creada más recientemente
  const masReciente = [...colecciones].sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion))[0];
  let coleccionId = masReciente.id;
  const coleccion = () => colecciones.find((c) => c.id === coleccionId);

  let stream = null;
  let ocupado = false;
  let activo = true;

  const video = h('video', { playsinline: true, muted: true, autoplay: true });
  video.setAttribute('playsinline', '');
  const guia = h('div', { class: 'guia' });
  const estadoOCR = h('p', { class: 'nota', text: 'Preparando lector de texto…' });
  const zonaCamara = h('div', { class: 'camara' }, video, guia,
    h('div', { class: 'camara-ayuda', text: 'Encuadra el código; puede entrar también la línea de abajo' }));

  // ---- Zoom, enfoque al tocar y linterna ----
  const etiquetaZoom = h('span', { class: 'zoom-valor', text: '1.0x' });
  const sliderZoom = h('input', { type: 'range', min: '1', max: '4', step: '0.1', value: String(zoomActual), 'aria-label': 'Zoom' });
  const btnLinterna = h('button', { class: 'btn-cam oculto', text: '🔦', 'aria-label': 'Linterna' });
  const controles = h('div', { class: 'controles-cam' }, h('span', { text: '🔍' }), sliderZoom, etiquetaZoom, btnLinterna);
  let zoomDigital = true;
  let linterna = false;

  function aplicarZoomVisual(v) {
    etiquetaZoom.textContent = Number(v).toFixed(1) + 'x';
    // Zoom digital (si la cámara no tiene zoom propio): agranda la vista
    video.style.transform = zoomDigital ? `scale(${v})` : '';
  }
  sliderZoom.addEventListener('input', async () => {
    zoomActual = Number(sliderZoom.value);
    if (!zoomDigital) await ponerZoom(stream, zoomActual);
    aplicarZoomVisual(zoomActual);
  });
  btnLinterna.addEventListener('click', async () => {
    linterna = !linterna;
    if (await ponerLinterna(stream, linterna)) btnLinterna.classList.toggle('activo', linterna);
    else linterna = false;
  });
  zonaCamara.addEventListener('click', (e) => {
    if (!stream) return;
    const r = zonaCamara.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const anillo = h('div', { class: 'anillo-enfoque' });
    anillo.style.left = (x * 100) + '%'; anillo.style.top = (y * 100) + '%';
    zonaCamara.append(anillo); setTimeout(() => anillo.remove(), 900);
    enfocarEn(stream, x, y);
  });

  async function configurarControles() {
    const cap = capacidades(stream);
    zoomDigital = !cap.zoom;
    if (cap.zoom) {
      sliderZoom.min = String(Math.max(1, cap.zoom.min)); sliderZoom.max = String(cap.zoom.max); sliderZoom.step = String(cap.zoom.step);
    } else { sliderZoom.min = '1'; sliderZoom.max = '3'; sliderZoom.step = '0.1'; }
    zoomActual = Math.min(Number(sliderZoom.max), Math.max(Number(sliderZoom.min), zoomActual));
    sliderZoom.value = String(zoomActual);
    if (!zoomDigital) await ponerZoom(stream, zoomActual);
    aplicarZoomVisual(zoomActual);
    btnLinterna.classList.toggle('oculto', !cap.linterna);
    if (linterna) await ponerLinterna(stream, true);
  }

  const entrada = h('input', {
    class: 'codigo-input', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, maxlength: String(CODIGO_MAX), placeholder: 'Escribe el código', 'aria-label': 'Código',
  });
  entrada.addEventListener('input', () => {
    const pos = entrada.selectionStart;
    entrada.value = normalizarCodigo(entrada.value).slice(0, CODIGO_MAX);
    entrada.setSelectionRange(pos, pos);
  });
  const sugerencias = h('div', { class: 'sugerencias' });
  const panelConfirmar = h('div', { class: 'panel oculto' },
    h('p', { class: 'nota', text: 'Revisa el código y corrígelo si hace falta (ojo con 8/B, 0/O, 5/S, 1/I).' }),
    sugerencias, entrada,
    h('div', { class: 'fila-botones' },
      h('button', { class: 'btn secundario', text: 'Volver a leer', onclick: () => mostrarCamara() }),
      h('button', { class: 'btn primario', text: 'Verificar y guardar', onclick: () => verificar() })));

  const btnLeer = h('button', { class: 'btn primario grande', text: '📷 Leer código', onclick: () => leer() });
  const panelCamara = h('div', { class: 'panel' }, zonaCamara, controles, estadoOCR,
    h('div', { class: 'fila-botones' },
      h('button', { class: 'btn secundario', text: '⌨️ Escribir a mano', onclick: () => mostrarConfirmar([], 'manual') }),
      btnLeer));

  cont.append(
    selectorColeccion({ colecciones, anios: await aniosDisponibles(), seleccionId: coleccionId,
      onCambio: (id) => { coleccionId = id; } }),
    panelCamara, panelConfirmar);

  let metodo = 'manual';

  function mostrarConfirmar(lista, m) {
    metodo = m;
    sugerencias.replaceChildren(...lista.map((s) =>
      h('button', { class: 'chip', text: s, onclick: () => { entrada.value = s; } })));
    entrada.value = lista[0] || '';
    panelCamara.classList.add('oculto');
    panelConfirmar.classList.remove('oculto');
    cerrarCamara(stream); stream = null;
    entrada.focus();
  }

  async function mostrarCamara() {
    panelConfirmar.classList.add('oculto');
    panelCamara.classList.remove('oculto');
    try {
      const s = await abrirCamara(video);
      if (!activo || !panelConfirmar.classList.contains('oculto')) { cerrarCamara(s); return; }
      stream = s;
      await configurarControles();
    } catch (e) {
      estadoOCR.textContent = 'No se pudo abrir la cámara: ' + (e.message || e.name) + '. Puedes escribir el código a mano.';
    }
  }

  async function leer() {
    if (ocupado || !stream) return;
    ocupado = true; btnLeer.disabled = true; btnLeer.textContent = 'Leyendo…';
    try {
      const recorte = recortarGuia(video, guia);
      const lista = await leerCodigo(recorte);
      if (!lista.length) toast('No se pudo leer el código. Usa el zoom y toca la imagen para enfocar, o escríbelo a mano.', 4000);
      mostrarConfirmar(lista, 'camara');
    } catch (e) {
      toast('Error al leer: ' + e.message);
    } finally {
      ocupado = false; btnLeer.disabled = false; btnLeer.textContent = '📷 Leer código';
    }
  }

  async function verificar() {
    const codigo = normalizarCodigo(entrada.value);
    if (!coleccionId) return toast('Selecciona una colección.');
    if (!codigoValido(codigo)) return toast(`El código debe tener de ${CODIGO_MIN} a ${CODIGO_MAX} letras o números.`);
    try {
      const r = await registrarCodigo(coleccionId, codigo, metodo);
      const col = coleccion();
      if (r.nuevo) {
        await alertaResultado('verde', 'Código guardado exitosamente', codigo, `Colección: ${col?.nombre} (${col?.anio})`, ajustes.vibrar);
      } else {
        await alertaResultado('rojo', 'Este código ya existe', codigo,
          `Registrado el ${fechaHora(r.registro.fecha)} en ${col?.nombre} (${col?.anio})`, ajustes.vibrar);
      }
      mostrarCamara();
    } catch (e) {
      toast('No se pudo guardar: ' + e.message);
    }
  }

  prepararOCR((m) => {
    if (m.status === 'recognizing text') return;
    estadoOCR.textContent = m.progress >= 1 && m.status.includes('initialized api') ? 'Lector listo.' : 'Preparando lector de texto…';
  }).then(() => { estadoOCR.textContent = 'Lector listo. Tip: aléjate un poco, usa el zoom y toca la imagen para enfocar.'; })
    .catch((e) => { estadoOCR.textContent = 'El lector no está disponible (' + e.message + '). Puedes escribir el código a mano.'; });

  mostrarCamara();
  return () => { activo = false; cerrarCamara(stream); }; // al salir de la pantalla se apaga la cámara
}
