// Escanear carta en "modo línea" (dos pasos):
//   Paso 1: passcode (8 dígitos, abajo a la izquierda) → identifica la carta en el catálogo.
//   Paso 2: Card Number → elige la impresión (TCG/OCG). Si la carta no lo trae, se usa un número propio.

import { h, toast, alertaResultado, fechaCorta, cargando, elegir } from '../core/ui.js';
import { agregarCarta, numerosPropiosDe, revisarNumeroPropio } from '../core/repo.js';
import { formularioCarta } from '../core/formCarta.js';
import { abrirCamara, cerrarCamara, recortarGuia, prepararOCR, capacidades, ponerZoom, ponerLinterna, enfocarEn, leerLineaPasscode, leerLineaNumero } from '../ocr/escaner.js';
import { ajustes } from '../core/tema.js';
import { infoCatalogo, cartaPorPasscode, impresionesDe, impresionPorLectura, datosDe, buscarPorNombre, cartaPorId } from '../core/catalogo.js';
import { iconoAtributo } from '../core/atributos.js';
import { FORMATO_CATALOGO } from '../config.js';
import { ir } from '../app.js';

export const titulo = 'Escanear carta';

let zoomActual = 1;

const AYUDA = {
  passcode: 'Paso 1 · Encuadra la línea de ABAJO a la izquierda: el passcode de 8 dígitos (y "1st Edition" si lo trae)',
  numero: 'Paso 2 · Encuadra el Card Number (bajo la imagen, a la derecha; ej. SDY-010)',
};

export async function render(cont) {
  let stream = null, activo = true, ocupado = false;
  let paso = 'passcode';
  let carta = null;          // registro del catálogo identificado en el paso 1
  let edicionLeida = '';     // "1st Edition"/"Limited Edition" si se leyó en el paso 1

  const meta = await infoCatalogo();
  if (!meta || (meta.formato || 1) < FORMATO_CATALOGO) {
    cont.append(h('div', { class: 'aviso' },
      h('p', { text: meta ? 'Actualiza el catálogo: esta versión necesita la descarga nueva (incluye las impresiones antiguas sin Card Number).' : 'Aún no descargas el catálogo. Sin él solo puedes capturar a mano.' }),
      h('button', { class: 'btn secundario', text: 'Ir a Catálogo', onclick: () => ir('catalogo') })));
  }

  // ---- Cámara con recuadro de línea ----
  const video = h('video', { muted: true, autoplay: true });
  video.setAttribute('playsinline', '');
  const guia = h('div', { class: 'guia guia-linea' });
  const ayuda = h('div', { class: 'camara-ayuda arriba' });
  const zonaCamara = h('div', { class: 'camara camara-linea' }, video, guia, ayuda);
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

  const tituloPaso = h('h2');
  const ficha = h('div');                 // carta identificada (paso 2)
  const zonaImpresiones = h('div');       // botones de impresiones (paso 2)
  const btnLeer = h('button', { class: 'btn primario grande', onclick: () => leer() });
  const filaPaso1 = h('div', { class: 'fila-botones' },
    h('button', { class: 'btn secundario', text: '🔎 Buscar por nombre', onclick: () => mostrarNombre() }),
    h('button', { class: 'btn secundario', text: '⌨️ Capturar a mano', onclick: () => mostrarFormulario({}, 'manual') }));
  const filaPaso2 = h('div', { class: 'fila-botones' },
    h('button', { class: 'btn secundario', text: '↩️ Otra carta', onclick: () => irPaso1() }),
    h('button', { class: 'btn secundario', text: 'Esta carta no tiene Card Number', onclick: () => abrirSinNumero() }));

  const panelCamara = h('div', { class: 'panel' }, tituloPaso, ficha, zonaCamara,
    h('div', { class: 'controles-cam' }, h('span', { text: '🔍' }), sliderZoom, etiquetaZoom, btnLinterna),
    estadoOCR, btnLeer, filaPaso1, filaPaso2, zonaImpresiones);

  // ---- Búsqueda por nombre ----
  const qNombre = h('input', { type: 'search', placeholder: 'Nombre en inglés o japonés (ej. Mammoth, マンモス)', autocomplete: 'off' });
  const resNombre = h('div', { class: 'resultados-nombre' });
  let temporizador = null;
  qNombre.addEventListener('input', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(async () => {
      const lista = await buscarPorNombre(qNombre.value);
      resNombre.replaceChildren(...lista.map((r) => h('button', {
        class: 'fila-carta', onclick: async () => { const c = await cartaPorId(r.id); if (c) { edicionLeida = ''; setCarta(c); } },
      }, iconoAtributo(r.attr, 30), h('div', { class: 'fila-carta-texto' }, h('strong', { text: r.en || r.ja }),
        r.ja && r.en ? h('span', { class: 'nota', lang: 'ja', text: r.ja }) : null,
        h('span', { class: 'nota mono', text: r.passcode || '' })))));
      if (qNombre.value.trim().length >= 2 && !lista.length) resNombre.append(h('p', { class: 'nota', text: 'Sin resultados en el catálogo.' }));
    }, 250);
  });
  const panelNombre = h('div', { class: 'panel oculto' }, h('h2', { text: 'Buscar por nombre' }), qNombre,
    h('button', { class: 'btn secundario', text: '↩️ Volver a la cámara', onclick: () => irPaso1() }), resNombre);

  const panelForm = h('div', { class: 'panel oculto' });
  cont.append(panelCamara, panelNombre, panelForm);

  // ================= Pasos =================

  function mostrarSolo(panel) {
    for (const p of [panelCamara, panelNombre, panelForm]) p.classList.toggle('oculto', p !== panel);
    if (panel !== panelCamara) { cerrarCamara(stream); stream = null; }
    window.scrollTo(0, 0);
  }

  function pintarPaso() {
    const p1 = paso === 'passcode';
    tituloPaso.textContent = p1 ? 'Paso 1 · Passcode' : 'Paso 2 · Card Number';
    ayuda.textContent = AYUDA[paso];
    btnLeer.textContent = p1 ? '📷 Leer passcode' : '📷 Leer Card Number';
    filaPaso1.classList.toggle('oculto', !p1);
    filaPaso2.classList.toggle('oculto', p1);
    if (p1) { ficha.replaceChildren(); zonaImpresiones.replaceChildren(); }
  }

  function irPaso1() {
    paso = 'passcode'; carta = null; edicionLeida = '';
    pintarPaso(); mostrarCamara();
  }

  /** Carta identificada (por passcode o por nombre): decide si hace falta el paso 2. */
  function setCarta(c) {
    carta = c;
    const imps = impresionesDe(c);
    const conNum = imps.filter((i) => i.n);
    // 1st/Limited leído → TCG; si hay una sola impresión TCG, se elige sola
    if (edicionLeida) {
      const tcg = conNum.filter((i) => i.j === 'TCG');
      if (tcg.length === 1) return abrirFormulario(tcg[0], 'Impresión elegida por la edición leída (única TCG): verifícala');
    }
    if (!conNum.length) return abrirSinNumero();
    paso = 'numero';
    pintarPaso();
    ficha.replaceChildren(h('div', { class: 'ficha-carta' }, iconoAtributo(c.attr, 40),
      h('div', {}, h('strong', { text: c.en || c.ja }), c.ja ? h('span', { class: 'nota', lang: 'ja', text: c.ja }) : null,
        h('span', { class: 'nota mono', text: 'Passcode ' + c.passcode + (edicionLeida ? ' · ' + edicionLeida : '') }))));
    // Impresiones agrupadas por juego (también se pueden tocar directo sin leer)
    const grupo = (j, etiqueta) => {
      const lista = imps.filter((i) => i.j === j);
      if (!lista.length) return null;
      return h('div', { class: 'grupo-impresiones' }, h('h3', { text: etiqueta }),
        h('div', { class: 'sugerencias' }, lista.map((i) => h('button', {
          type: 'button', class: 'chip' + (i.n ? '' : ' propio'),
          text: (i.n || '(sin número) ' + i.s) + (i.r.length ? ' · ' + i.r.join('/') : ''),
          onclick: () => (i.n ? abrirFormulario(i) : abrirSinNumero(i)),
        }))));
    };
    zonaImpresiones.replaceChildren(h('p', { class: 'nota', text: 'Lee el Card Number o toca tu impresión:' }),
      grupo('TCG', 'TCG (inglés)'), grupo('OCG', 'OCG (japonés / Asia)'));
    if (panelCamara.classList.contains('oculto') || !stream) mostrarCamara();
  }

  function abrirFormulario(imp, aviso = '') {
    const datos = datosDe(carta, imp);
    if (edicionLeida) datos.edicion = edicionLeida;
    if (/-(JP|JA)\d/i.test(imp.n)) datos.edicion = 'Sin edición (OCG)';
    const f = mostrarFormulario(datos, 'camara');
    f.setEstado('✔ Encontrada en el catálogo' + (imp.s ? ` · ${imp.s}` : '') + (aviso ? ` · ${aviso}` : ''));
  }

  /** Carta sin Card Number impreso: se usa un número propio. */
  async function abrirSinNumero(impSinNumero = null) {
    if (!carta) return;
    const imps = impresionesDe(carta).filter((i) => !i.n);
    const datos = datosDe(carta, null);
    datos.numeroPropio = true;
    datos.edicion = 'Sin edición (OCG)';
    datos.rarezas = impSinNumero ? impSinNumero.r : [...new Set(imps.flatMap((i) => i.r))];
    const propios = await numerosPropiosDe(carta.passcode);
    if (propios.length === 1) datos.cardNumber = propios[0].cardNumber;
    const f = mostrarFormulario(datos, 'camara');
    f.ofrecerPropios(propios, impSinNumero ? [impSinNumero.s] : imps.map((i) => i.s));
    f.setEstado(propios.length
      ? '✔ Carta identificada. Ya la tienes con número propio: revisa que sea el mismo.'
      : '✔ Carta identificada. Escribe un Card Number propio (ej. VOL1-JP002).');
  }

  function mostrarNombre() { mostrarSolo(panelNombre); qNombre.focus(); }

  let form = null, origen = 'manual';
  function mostrarFormulario(datos, org) {
    origen = org;
    form = formularioCarta(datos, {
      botones: [
        h('button', { type: 'button', class: 'btn secundario', text: 'Volver a escanear', onclick: () => irPaso1() }),
        h('button', { type: 'button', class: 'btn primario', text: 'Guardar en inventario', onclick: () => guardar() }),
      ],
    });
    panelForm.replaceChildren(h('h2', { text: 'Revisa los datos' }), form.el);
    mostrarSolo(panelForm);
    return form;
  }

  async function mostrarCamara() {
    mostrarSolo(panelCamara);
    if (stream) return;
    try {
      const s = await abrirCamara(video);
      if (!activo || panelCamara.classList.contains('oculto')) { cerrarCamara(s); return; }
      stream = s;
      await configurarControles();
    } catch (e) {
      estadoOCR.textContent = 'No se pudo abrir la cámara: ' + (e.message || e.name) + '. Puedes buscar por nombre o capturar a mano.';
    }
  }

  async function leer() {
    if (ocupado || !stream) return;
    ocupado = true; btnLeer.disabled = true;
    const c = cargando(paso === 'passcode' ? 'Leyendo passcode…' : 'Leyendo Card Number…');
    try {
      const recorte = recortarGuia(video, guia);
      if (paso === 'passcode') {
        const l = await leerLineaPasscode(recorte);
        if (!l.passcode) { toast('No se leyó el passcode. Usa zoom para que los 8 dígitos llenen el recuadro y toca para enfocar.', 4000); return; }
        const r = await cartaPorPasscode(l.passcode);
        if (!r) {
          const v = await elegir('Passcode no encontrado', [`Leí ${l.passcode}, pero no está en el catálogo. Puede ser un error de lectura.`],
            [{ texto: 'Volver a leer', valor: 'leer', clase: 'primario' }, { texto: 'Capturar a mano con este passcode', valor: 'mano' }]);
          if (v === 'mano') mostrarFormulario({ passcode: l.passcode, edicion: l.edicion || undefined }, 'camara');
          return;
        }
        edicionLeida = l.edicion;
        setCarta(r);
      } else {
        const t = await leerLineaNumero(recorte);
        const imp = impresionPorLectura(carta, t);
        if (imp) abrirFormulario(imp);
        else toast('No coincidió con ninguna impresión de esta carta. Intenta de nuevo o toca tu impresión abajo.', 4000);
      }
    } catch (e) {
      toast('Error al leer: ' + e.message);
    } finally {
      c.cerrar(); ocupado = false; btnLeer.disabled = false;
    }
  }

  async function guardar() {
    try {
      const datos = { ...form.leer(), origen };
      // Revisiones de Card Number propio
      if (datos.numeroPropio) {
        const rev = await revisarNumeroPropio(datos);
        if (rev.distintos.length) {
          const lista = rev.distintos.map((x) => `${x.carta.cardNumber} (${x.carta.rareza} · ${fechaCorta(x.carta.fechaAlta)})`).join(', ');
          const parecido = rev.distintos.some((x) => x.parecido);
          const v = await elegir('⚠️ Esta carta ya tiene otro número', [
            `Ya está registrada como: ${lista}.`,
            `Escribiste ${datos.cardNumber}.` + (parecido ? ' Se parece mucho: puede ser un error de escritura.' : ''),
            '¿Es una versión distinta?',
          ], [
            ...rev.distintos.slice(0, 3).map((x) => ({ texto: `Usar ${x.carta.cardNumber}`, valor: 'usar:' + x.carta.cardNumber, clase: 'primario' })),
            { texto: 'Guardar como nueva', valor: 'nueva' },
            { texto: 'Cancelar', valor: null },
          ], 'aviso');
          if (!v) return;
          if (v.startsWith('usar:')) { datos.cardNumber = v.slice(5); form.llenar({ cardNumber: datos.cardNumber }); }
        }
        const rev2 = await revisarNumeroPropio(datos);
        if (rev2.enOtraCarta.length) {
          const x = rev2.enOtraCarta[0];
          const v = await elegir('⚠️ Número ya usado en otra carta', [
            `${datos.cardNumber} ya lo usaste para ${x.nombreEn || x.nombreJa} (passcode ${x.passcode}).`,
            '¿Guardar de todos modos?',
          ], [{ texto: 'Guardar de todos modos', valor: 'si' }, { texto: 'Cancelar', valor: null, clase: 'primario' }], 'aviso');
          if (!v) return;
        }
      }

      const r = await agregarCarta(datos);
      const x = r.registro;
      const nombre = x.nombreEn || x.nombreJa || x.cardNumber;
      if (r.nueva) {
        const otras = [...new Map((r.otrasVersiones || []).map((o) => [o.cardNumberKey, o])).values()];
        const nota = otras.length
          ? 'Ya tienes esta carta en otra versión: ' + otras.slice(0, 3).map((o) => `${o.numeroPropio ? '✎ ' : ''}${o.cardNumber} (${o.juego || '?'})`).join(', ')
          : '';
        await alertaResultado('verde', 'Carta nueva guardada', x.cardNumber, `${nombre} · ${x.rareza} · ${x.edicion}`, ajustes.vibrar, nota);
      } else {
        await alertaResultado('rojo', 'Ya tienes esta carta', x.cardNumber,
          `${nombre} · ${x.rareza} · ${x.edicion} · registrada el ${fechaCorta(x.fechaAlta)}`, ajustes.vibrar);
      }
      irPaso1();
    } catch (e) {
      toast(e.message, 3500);
    }
  }

  prepararOCR().then(() => { estadoOCR.textContent = 'Lector listo. Usa el zoom para que el texto llene el recuadro y toca para enfocar.'; })
    .catch((e) => { estadoOCR.textContent = 'Lector no disponible (' + e.message + '). Puedes buscar por nombre o capturar a mano.'; });
  irPaso1();
  return () => { activo = false; cerrarCamara(stream); };
}

