// Atributos y su ícono (diseño propio: círculo de color con abreviatura).

import { h } from './ui.js';

export const ATRIBUTOS = {
  DARK:   { nombre: 'Oscuridad', abrev: 'OSC', color: '#6d28d9' },
  LIGHT:  { nombre: 'Luz',       abrev: 'LUZ', color: '#ca8a04' },
  EARTH:  { nombre: 'Tierra',    abrev: 'TIE', color: '#57534e' },
  WATER:  { nombre: 'Agua',      abrev: 'AGU', color: '#0284c7' },
  FIRE:   { nombre: 'Fuego',     abrev: 'FUE', color: '#dc2626' },
  WIND:   { nombre: 'Viento',    abrev: 'VIE', color: '#16a34a' },
  DIVINE: { nombre: 'Divino',    abrev: 'DIV', color: '#a16207' },
  SPELL:  { nombre: 'Mágica',    abrev: 'MAG', color: '#0d9488' },
  TRAP:   { nombre: 'Trampa',    abrev: 'TRA', color: '#be185d' },
};

/** Ícono SVG del atributo. Si no hay atributo, círculo gris con "?". */
export function iconoAtributo(clave, tam = 36) {
  const a = ATRIBUTOS[clave] || { abrev: '?', color: '#9ca3af', nombre: 'Sin atributo' };
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', tam); svg.setAttribute('height', tam);
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', a.nombre);
  const c = document.createElementNS(ns, 'circle');
  c.setAttribute('cx', 20); c.setAttribute('cy', 20); c.setAttribute('r', 18);
  c.setAttribute('fill', a.color); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', 2);
  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', 20); t.setAttribute('y', 24.5); t.setAttribute('text-anchor', 'middle');
  t.setAttribute('font-size', 12); t.setAttribute('font-weight', 700); t.setAttribute('fill', '#fff');
  t.setAttribute('font-family', 'system-ui, sans-serif');
  t.textContent = a.abrev;
  svg.append(c, t);
  return h('span', { class: 'icono-atributo', title: a.nombre }, svg);
}

/** Tipo de carta según el atributo: Mágica/Trampa usan su propio símbolo. */
export function tipoDesdeAtributo(attr) {
  if (attr === 'SPELL') return 'Mágica';
  if (attr === 'TRAP') return 'Trampa';
  return attr ? 'Monstruo' : '';
}

// Colores aproximados del círculo de atributo impreso (matiz HSL en grados)
// para adivinar el atributo por la cámara. Siempre se pide confirmación.
const MUESTRAS = [
  { clave: 'DARK', h: 285, s: 0.45, l: 0.35 },
  { clave: 'LIGHT', h: 45, s: 0.55, l: 0.55 },
  { clave: 'EARTH', h: 30, s: 0.15, l: 0.25 },
  { clave: 'WATER', h: 200, s: 0.65, l: 0.45 },
  { clave: 'FIRE', h: 0, s: 0.7, l: 0.45 },
  { clave: 'WIND', h: 120, s: 0.55, l: 0.4 },
  { clave: 'DIVINE', h: 38, s: 0.4, l: 0.4 },
  { clave: 'SPELL', h: 175, s: 0.5, l: 0.4 },
  { clave: 'TRAP', h: 325, s: 0.55, l: 0.45 },
];

export function adivinarAtributo({ h: hu, s, l }) {
  let mejor = null, dist = Infinity;
  for (const m of MUESTRAS) {
    const dh = Math.min(Math.abs(hu - m.h), 360 - Math.abs(hu - m.h)) / 180;
    const d = dh * 2 * Math.min(1, s * 2) + Math.abs(s - m.s) + Math.abs(l - m.l);
    if (d < dist) { dist = d; mejor = m.clave; }
  }
  return mejor;
}
