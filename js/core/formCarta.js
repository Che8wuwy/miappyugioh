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
  const estado = h('p', { class: 'nota estado-busqueda' });
  const opcionesNum = h('div');
  const filaAtaque = h('div', { class: 'fila' }, campo('ATK', atk), campo('DEF', def));

  const pintarIcono = () => icono.replaceChildren(iconoAtributo(atributo.value, 40));
  const pintarJuego = () => { const j = juegoDesdeNumero(cardNumber.value); juego.textContent = j || '¿TCG/OCG?'; };
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
  cardNumber.addEventListener('input', () => { cardNumber.value = cardNumber.value.toUpperCase(); pintarJuego(); });
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
    if (d.cardNumber && !inicial) edicionJaponesa();
    pintarIcono(); pintarJuego(); pintarTipo();
  }
  edicion.addEventListener('change', () => { edicion.dataset.tocado = '1'; });

  function leer() {
    return {
      cardNumber: cardNumber.value, edicion: edicion.value, rareza: rareza.value, nombreEn: nombreEn.value,
      nombreJa: nombreJa.value, passcode: passcode.value, tipo: tipo.value, atributo: atributo.value,
      atk: atk.value, def: def.value,
    };
  }

  /** Busca en el catálogo (y en línea si está permitido) y llena los datos de la carta. */
  async function buscar({ silencioso = false, preferencia = '' } = {}) {
    const d = leer();
    estado.textContent = 'Buscando…';
    let r = await buscarPorNumero(d.cardNumber);
    if (!r) r = await buscarPorPasscode(d.passcode, d.cardNumber, preferencia);
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

  return { el, leer, llenar, buscar, setEstado: (t) => { estado.textContent = t; } };
}
