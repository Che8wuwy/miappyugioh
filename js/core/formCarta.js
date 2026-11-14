// Formulario de carta reutilizable (Escanear y editar en Inventario).

import { h, toast } from './ui.js';
import { EDICIONES, RAREZAS, TIPOS_CARTA } from '../config.js';
import { ATRIBUTOS, iconoAtributo, tipoDesdeAtributo } from './atributos.js';
import { juegoDesdeNumero, claveNumero } from './repo.js';
import { buscarPorNumero, buscarPorPasscode, buscarEnLinea } from './catalogo.js';
import { ajustes } from './tema.js';

let contadorListas = 0;

/**
 * Crea el formulario. Devuelve { el, leer(), llenar(datos), setEstado(texto) }.
 * opciones.botones: elementos extra para la fila de botones.
 */
export function formularioCarta(inicial = {}, { botones = [] } = {}) {
  const idLista = 'rarezas-' + (++contadorListas);
  const campo = (etq, input, extra) => h('label', { class: 'campo' }, h('span', { text: etq }), input, extra || null);

  const cardNumber = h('input', { type: 'text', maxlength: '30', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', class: 'mono-input', placeholder: 'Ej. LOB-EN001' });
  const edicion = h('select', {}, EDICIONES.map((e) => h('option', { value: e, text: e })));
  const rareza = h('input', { type: 'text', maxlength: '60', list: idLista, autocomplete: 'off', placeholder: 'Elige o escribe' });
  const listaRarezas = h('datalist', { id: idLista });
  const sugerRareza = h('div', { class: 'sugerencias' });
  const nombreEn = h('input', { type: 'text', maxlength: '120', autocomplete: 'off' });
  const nombreJa = h('input', { type: 'text', maxlength: '120', autocomplete: 'off', lang: 'ja' });
  const passcode = h('input', { type: 'text', inputmode: 'numeric', maxlength: '10', autocomplete: 'off', class: 'mono-input' });
  const tipo = h('select', {}, h('option', { value: '', text: '—' }), TIPOS_CARTA.map((t) => h('option', { value: t, text: t })));
  const atributo = h('select', {}, h('option', { value: '', text: '—' }),
    Object.entries(ATRIBUTOS).map(([k, a]) => h('option', { value: k, text: `${a.nombre} (${k})` })));
  const icono = h('span', { class: 'icono-contenedor' });
  const atk = h('input', { type: 'text', inputmode: 'numeric', maxlength: '5', autocomplete: 'off', placeholder: 'número o ?' });
  const def = h('input', { type: 'text', inputmode: 'numeric', maxlength: '5', autocomplete: 'off', placeholder: 'número o ?' });
  const juego = h('span', { class: 'etiqueta' });
  const propio = h('input', { type: 'checkbox' });
  const zonaPropios = h('div');
  const pintarPropio = () => { cardNumber.placeholder = propio.checked ? 'Escribe tu número, ej. VOL1-JP002' : 'Ej. LOB-EN001'; };
  propio.addEventListener('change', () => { pintarPropio(); pintarJuego(); });
  const estado = h('p', { class: 'nota estado-busqueda' });
  const opcionesNum = h('div');
  const filaAtaque = h('div', { class: 'fila' }, campo('ATK', atk), campo('DEF', def));

  const pintarIcono = () => icono.replaceChildren(iconoAtributo(atributo.value, 40));
  let juegoCatalogo = ''; // juego que dio el catálogo para la impresión elegida (cartas antiguas sin código de región)
  const pintarJuego = () => { const j = juegoCatalogo || juegoDesdeNumero(cardNumber.value) || (propio.checked ? 'OCG' : ''); juego.textContent = j || '¿TCG/OCG?'; };
  const pintarTipo = () => { filaAtaque.classList.toggle('oculto', tipo.value !== 'Monstruo' && tipo.value !== ''); };

  atributo.addEventListener('change', () => {
    pintarIcono();
    const t = tipoDesdeAtributo(atributo.value);
    if (t && t !== 'Monstruo') tipo.value = t; else if (t === 'Monstruo' && tipo.value !== 'Monstruo') tipo.value = 'Monstruo';
    pintarTipo();
  });
  tipo.addEventListener('change', () => {
    if (tipo.value === 'Mágica') atributo.value = 'SPELL';
    else if (tipo.value === 'Trampa') atributo.value = 'TRAP';
    else if (['SPELL', 'TRAP'].includes(atributo.value)) atributo.value = '';
    pintarIcono(); pintarTipo();
  });
  cardNumber.addEventListener('input', () => { cardNumber.value = cardNumber.value.toUpperCase(); juegoCatalogo = ''; pintarJuego(); });
  cardNumber.addEventListener('change', () => edicionJaponesa());

  // Las cartas japonesas (región JP) no tienen edición: se fija "Sin edición (OCG)"
  // para que la llave sea siempre la misma. Se puede cambiar a mano después.
  function edicionJaponesa() {
    if (/-(JP|JA)\d/i.test(cardNumber.value)) edicion.value = 'Sin edición (OCG)';
  }
  passcode.addEventListener('input', () => { passcode.value = passcode.value.replace(/\D/g, ''); });

  function ponerRarezas(lista) {
    const todas = [...new Set([...(lista || []), ...RAREZAS])];
    listaRarezas.replaceChildren(...todas.map((r) => h('option', { value: r })));
    sugerRareza.replaceChildren(...(lista || []).map((r) =>
      h('button', { type: 'button', class: 'chip', text: r, onclick: () => { rareza.value = r; } })));
  }

  function llenar(d = {}, { soloVacios = false, inicial = false } = {}) {
    const poner = (input, v) => { if (v === undefined || v === null) return; if (soloVacios && input.value) return; input.value = String(v); };
    poner(cardNumber, d.cardNumber); poner(rareza, d.rareza);
    if (d.edicion && EDICIONES.includes(d.edicion) && !(soloVacios && edicion.dataset.tocado)) edicion.value = d.edicion;
    poner(nombreEn, d.nombreEn); poner(nombreJa, d.nombreJa); poner(passcode, d.passcode);
    if (d.tipo !== undefined && !(soloVacios && tipo.value)) tipo.value = d.tipo || '';
    if (d.atributo !== undefined && !(soloVacios && atributo.value)) atributo.value = d.atributo || '';
    poner(atk, d.atk); poner(def, d.def);
    if (d.rarezas) ponerRarezas(d.rarezas);
    if (d.rarezas?.length === 1 && !rareza.value) rareza.value = d.rarezas[0];
    if (d.numeroPropio !== undefined) { propio.checked = !!d.numeroPropio; pintarPropio(); }
    if (d.juego !== undefined) juegoCatalogo = ['TCG', 'OCG'].includes(d.juego) ? d.juego : '';
    if (d.cardNumber && !inicial) edicionJaponesa();
    pintarIcono(); pintarJuego(); pintarTipo();
  }
  edicion.addEventListener('change', () => { edicion.dataset.tocado = '1'; });

  function leer() {
    return {
      cardNumber: cardNumber.value, edicion: edicion.value, rareza: rareza.value, nombreEn: nombreEn.value,
      nombreJa: nombreJa.value, passcode: passcode.value, tipo: tipo.value, atributo: atributo.value,
      atk: atk.value, def: def.value, numeroPropio: propio.checked, juego: juegoCatalogo,
    };
  }

  /** Busca en el catálogo (y en línea si está permitido) y llena los datos de la carta. */
  async function buscar({ silencioso = false, preferencia = '' } = {}) {
    const d = leer();
    estado.textContent = 'Buscando…';
    // Con número propio no se busca ni se corrige el Card Number: solo los datos por passcode
    let r = d.numeroPropio ? null : await buscarPorNumero(d.cardNumber);
    if (!r) r = await buscarPorPasscode(d.passcode, d.numeroPropio ? '' : d.cardNumber, d.numeroPropio ? '' : preferencia);
    if (r && d.numeroPropio) { delete r.cardNumber; delete r.opcionesNumero; delete r.autoElegido; }
    if (!r && ajustes.buscarEnLinea) r = await buscarEnLinea({ cardNumber: d.cardNumber, passcode: d.passcode });
    opcionesNum.replaceChildren();
    if (r) {
      const { origen, setNombre, opcionesNumero, autoElegido, ...datos } = r;
      llenar(datos);
      // Si se encontró por passcode y el Card Number no coincide, ofrecer las impresiones de esa carta
      if (opcionesNumero?.length && (!datos.cardNumber || autoElegido)) {
        opcionesNum.append(h('p', { class: 'nota', text: autoElegido ? '¿Es otra impresión? Elígela aquí:' : 'Elige tu Card Number (impresiones de esta carta):' }),
          h('div', { class: 'sugerencias' }, opcionesNumero.map((o) => h('button', {
            type: 'button', class: 'chip', text: `${o.n}${o.r.length ? ' · ' + o.r.join('/') : ''}`,
            onclick: () => { llenar({ cardNumber: o.n, rarezas: o.r }); rareza.value = o.r.length === 1 ? o.r[0] : rareza.value; opcionesNum.replaceChildren(); },
          }))));
      }
      estado.textContent = origen === 'catalogo'
        ? '✔ Encontrada en el catálogo' + (setNombre ? ` · ${setNombre}` : '') + (datos.cardNumber && claveNumero(datos.cardNumber) !== claveNumero(d.cardNumber) ? ' · Card Number corregido' : '')
        : '✔ Encontrada en línea (YGOPRODeck). El nombre en japonés se captura a mano.';
      if (autoElegido) estado.textContent += ' · Card Number elegido por la edición leída (única impresión TCG): verifícalo';
    } else {
      estado.textContent = 'No se encontró en el catálogo. Revisa y completa los datos a mano.';
      if (!silencioso) toast('No se encontró la carta.');
    }
    return r;
  }

  ponerRarezas([]);
  llenar(inicial, { inicial: true }); // al abrir una carta guardada no se cambia su edición

  const el = h('div', { class: 'formulario-carta' },
    estado,
    h('div', { class: 'fila' }, campo('Card Number *', cardNumber), h('div', { class: 'campo juego' }, h('span', { text: 'Juego' }), juego)),
    h('label', { class: 'check' }, propio, h('span', {}, 'Card Number propio', h('small', { class: 'nota bloque', text: 'La carta no trae Card Number (OCG antiguas): escribe uno tuyo para identificarla.' }))),
    zonaPropios,
    opcionesNum,
    h('div', { class: 'fila-botones' }, h('button', { type: 'button', class: 'btn secundario', text: '🔎 Buscar datos de la carta', onclick: () => buscar() })),
    h('div', { class: 'fila' }, campo('Edición *', edicion), campo('Rareza *', rareza)),
    sugerRareza, listaRarezas,
    campo('Nombre (inglés)', nombreEn),
    campo('Nombre (japonés)', nombreJa),
    h('div', { class: 'fila' }, campo('Passcode (8 dígitos)', passcode), campo('Tipo de carta', tipo)),
    h('div', { class: 'fila fila-atributo' }, campo('Atributo', atributo), icono),
    filaAtaque,
    botones.length ? h('div', { class: 'fila-botones' }, botones) : null);

  /** Para cartas sin Card Number: ofrece los números propios ya usados y los sets sin número del catálogo. */
  function ofrecerPropios(propios = [], sets = []) {
    zonaPropios.replaceChildren();
    if (propios.length) {
      zonaPropios.append(h('p', { class: 'nota', text: 'Ya usaste estos números para esta carta:' }),
        h('div', { class: 'sugerencias' }, propios.map((p) => h('button', {
          type: 'button', class: 'chip propio', text: `✎ ${p.cardNumber} · ${p.rareza}`,
          onclick: () => { cardNumber.value = p.cardNumber; },
        }))));
    }
    if (sets.length) zonaPropios.append(h('p', { class: 'nota', text: 'Sets sin número en el catálogo: ' + sets.join(' · ') }));
  }

  pintarPropio();
  return { el, leer, llenar, buscar, ofrecerPropios, setEstado: (t) => { estado.textContent = t; } };
}
