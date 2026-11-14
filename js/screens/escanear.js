import { h, toast, alertaResultado, fechaCorta, cargando } from '../core/ui.js';
import { agregarCarta } from '../core/repo.js';
import { formularioCarta } from '../core/formCarta.js';
import { abrirCamara, cerrarCamara, recortarGuia, leerCarta, prepararOCR, capacidades, ponerZoom, ponerLinterna, enfocarEn } from '../ocr/escaner.js';
import { ajustes } from '../core/tema.js';
import { infoCatalogo, buscarPorNumero } from '../core/catalogo.js';
import { ir } from '../app.js';

export const titulo = 'Escanear carta';

let zoomActual = 1;

export async function render(cont) {
  let stream = null, activo = true, ocupado = false;

  if (!(await infoCatalogo())) {
    cont.append(h('div', { class: 'aviso' },
      h('p', { text: 'Aún no descargas el catálogo. Sin él la app solo puede buscar en línea o capturar a mano.' }),
      h('button', { class: 'btn secundario', text: 'Ir a Catálogo', onclick: () => ir('catalogo') })));
  }

  // ---- Cámara con marco de carta ----
  const video = h('video', { muted: true, autoplay: true });
  video.setAttribute('playsinline', '');
  const guia = h('div', { class: 'guia-carta' });
  const zonaCamara = h('div', { class: 'camara camara-carta' }, video, guia,
    h('div', { class: 'camara-ayuda arriba', text: 'Encuadra la carta completa dentro del marco' }));
  const estadoOCR = h('p', { class: 'nota', text: 'Preparando lector…' });

  const etiquetaZoom = h('span', { class: 'zoom-valor', text: '1.0x' });
  const sliderZoom = h('input', { type: 'range', min: '1', max: '3', step: '0.1', value: String(zoomActual), 'aria-label': 'Zoom' });
  const btnLinterna = h('button', { class: 'btn-cam oculto', text: '🔦', 'aria-label': 'Linterna' });
  let zoomDigital = true, linterna = false;
  const aplicarZoomVisual = (v) => { etiquetaZoom.textContent = Number(v).toFixed(1) + 'x'; video.style.transform = zoomDigital ? `scale(${v})` : ''; };
  sliderZoom.addEventListener('input', async () => {
    zoomActual = Number(sliderZoom.value);
    if (!zoomDigital) await ponerZoom(stream, zoomActual);
    aplicarZoomVisual(zoomActual);
  });
  btnLinterna.addEventListener('click', async () => {
    linterna = !linterna;
    if (await ponerLinterna(stream, linterna)) btnLinterna.classList.toggle('activo', linterna); else linterna = false;
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
    if (cap.zoom) { sliderZoom.min = String(Math.max(1, cap.zoom.min)); sliderZoom.max = String(cap.zoom.max); sliderZoom.step = String(cap.zoom.step); }
    zoomActual = Math.min(Number(sliderZoom.max), Math.max(Number(sliderZoom.min), zoomActual));
    sliderZoom.value = String(zoomActual);
    if (!zoomDigital) await ponerZoom(stream, zoomActual);
    aplicarZoomVisual(zoomActual);
    btnLinterna.classList.toggle('oculto', !cap.linterna);
    if (linterna) await ponerLinterna(stream, true);
  }

  const btnEscanear = h('button', { class: 'btn primario grande', text: '📷 Escanear carta', onclick: () => escanear() });
  const panelCamara = h('div', { class: 'panel' }, zonaCamara,
    h('div', { class: 'controles-cam' }, h('span', { text: '🔍' }), sliderZoom, etiquetaZoom, btnLinterna),
    estadoOCR,
    h('div', { class: 'fila-botones' },
      h('button', { class: 'btn secundario', text: '⌨️ Capturar a mano', onclick: () => mostrarFormulario({}, 'manual') }),
      btnEscanear));

  const panelForm = h('div', { class: 'panel oculto' });
  cont.append(panelCamara, panelForm);

  let form = null, origen = 'manual';

  function mostrarFormulario(datos, org) {
    origen = org;
    form = formularioCarta(datos, {
      botones: [
        h('button', { type: 'button', class: 'btn secundario', text: 'Volver a escanear', onclick: () => mostrarCamara() }),
        h('button', { type: 'button', class: 'btn primario', text: 'Guardar en inventario', onclick: () => guardar() }),
      ],
    });
    panelForm.replaceChildren(h('h2', { text: 'Revisa los datos' }), form.el);
    panelCamara.classList.add('oculto');
    panelForm.classList.remove('oculto');
    cerrarCamara(stream); stream = null;
    window.scrollTo(0, 0);
    return form;
  }

  async function mostrarCamara() {
    panelForm.classList.add('oculto');
    panelCamara.classList.remove('oculto');
    try {
      const s = await abrirCamara(video);
      if (!activo || !panelForm.classList.contains('oculto')) { cerrarCamara(s); return; }
      stream = s;
      await configurarControles();
    } catch (e) {
      estadoOCR.textContent = 'No se pudo abrir la cámara: ' + (e.message || e.name) + '. Puedes capturar a mano.';
    }
  }

  async function escanear() {
    if (ocupado || !stream) return;
    ocupado = true; btnEscanear.disabled = true;
    const c = cargando('Leyendo la carta…');
    try {
      const carta = recortarGuia(video, guia);
      const leido = await leerCarta(carta, (t) => c.texto(t));
      c.texto('Buscando en el catálogo…');
      const f = mostrarFormulario({
        cardNumber: leido.cardNumber, passcode: leido.passcode, edicion: leido.edicion || undefined,
        nombreEn: leido.nombreEn, atk: leido.atk, def: leido.def, atributo: leido.atributo,
        tipo: leido.atributo === 'SPELL' ? 'Mágica' : leido.atributo === 'TRAP' ? 'Trampa' : (leido.atributo ? 'Monstruo' : ''),
      }, 'camara');
      // Prueba cada Card Number candidato en el catálogo antes de buscar por passcode
      for (const cand of leido.candidatos || []) {
        if (await buscarPorNumero(cand)) { f.llenar({ cardNumber: cand }); break; }
      }
      // Si se leyó texto de edición (1st/Limited) la carta es TCG: las OCG japonesas no lo traen
      const r = await f.buscar({ silencioso: true, preferencia: leido.edicion ? 'TCG' : '' });
      if (r) origen = r.origen;
      else f.setEstado('No se encontró en el catálogo. Lo leído por la cámara puede tener errores: revisa todo.');
      if (!leido.edicion) toast('Revisa la edición: no se pudo leer.', 3000);
    } catch (e) {
      toast('Error al leer: ' + e.message);
    } finally {
      c.cerrar(); ocupado = false; btnEscanear.disabled = false;
    }
  }

  async function guardar() {
    try {
      const r = await agregarCarta({ ...form.leer(), origen });
      const x = r.registro;
      const titulo = x.nombreEn || x.nombreJa || x.cardNumber;
      if (r.nueva) {
        await alertaResultado('verde', 'Carta nueva guardada', x.cardNumber, `${titulo} · ${x.rareza} · ${x.edicion}`, ajustes.vibrar);
      } else {
        await alertaResultado('rojo', 'Ya tienes esta carta', x.cardNumber,
          `${titulo} · ${x.rareza} · ${x.edicion} · registrada el ${fechaCorta(x.fechaAlta)}`, ajustes.vibrar);
      }
      mostrarCamara();
    } catch (e) {
      toast(e.message, 3500);
    }
  }

  prepararOCR().then(() => { estadoOCR.textContent = 'Lector listo. Tip: buena luz, sin reflejos, usa zoom y toca para enfocar.'; })
    .catch((e) => { estadoOCR.textContent = 'Lector no disponible (' + e.message + '). Puedes capturar a mano.'; });
  mostrarCamara();
  return () => { activo = false; cerrarCamara(stream); };
}
