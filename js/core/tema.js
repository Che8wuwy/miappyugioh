// Aplica la apariencia (modo oscuro, color, tamaño de letra) y guarda ajustes en memoria.

import { leerAjustes, guardarAjuste } from './repo.js';

export const ajustes = {};

export async function cargarAjustes() {
  Object.assign(ajustes, await leerAjustes());
  aplicar();
}

export async function cambiarAjuste(clave, valor) {
  ajustes[clave] = valor;
  await guardarAjuste(clave, valor);
  aplicar();
}

function aplicar() {
  const raiz = document.documentElement;
  raiz.dataset.tema = ajustes.modoOscuro ? 'oscuro' : 'claro';
  if (/^#[0-9a-f]{6}$/i.test(ajustes.colorPrincipal)) raiz.style.setProperty('--principal', ajustes.colorPrincipal);
  const t = Math.min(150, Math.max(80, Number(ajustes.tamanoLetra) || 100));
  raiz.style.setProperty('--escala', String(t / 100));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', ajustes.colorPrincipal);
}
