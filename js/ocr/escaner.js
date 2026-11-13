// Cámara + lector de texto (OCR) 100% local, sin internet.
// Flujo: video -> recorte del marco de la carta -> zonas fijas -> limpieza -> Tesseract.

import { OCR } from '../config.js';
import { adivinarAtributo } from '../core/atributos.js';

let workerPromesa = null;

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar el lector de texto.'));
    document.head.append(s);
  });
}

export function prepararOCR(onProgreso) {
  if (workerPromesa) return workerPromesa;
  workerPromesa = (async () => {
    await cargarScript('./vendor/tesseract/tesseract.min.js');
    const w = await window.Tesseract.createWorker(OCR.idioma, 1 /* solo LSTM */, {
      workerPath: OCR.workerPath, corePath: OCR.corePath, langPath: OCR.langPath,
      gzip: true, workerBlobURL: false, cacheMethod: 'none',
      logger: (m) => onProgreso && onProgreso(m),
    });
    return w;
  })();
  workerPromesa.catch(() => { workerPromesa = null; });
  return workerPromesa;
}

// ---------- Cámara ----------

export async function abrirCamara(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara.');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  });
  video.srcObject = stream;
  await video.play();
  const pista = stream.getVideoTracks()[0];
  try { await pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (_) {}
  return stream;
}

/** Qué permite el hardware de la cámara: zoom óptico/sensor, linterna y enfoque. */
export function capacidades(stream) {
  const pista = stream?.getVideoTracks()[0];
  const cap = pista?.getCapabilities ? pista.getCapabilities() : {};
  return {
    zoom: cap.zoom && cap.zoom.max > cap.zoom.min ? { min: cap.zoom.min, max: Math.min(cap.zoom.max, 8), step: cap.zoom.step || 0.1 } : null,
    linterna: !!cap.torch,
    enfoquePunto: Array.isArray(cap.focusMode) && cap.focusMode.includes('single-shot'),
  };
}

export async function ponerZoom(stream, valor) {
  const pista = stream?.getVideoTracks()[0];
  try { await pista.applyConstraints({ advanced: [{ zoom: valor }] }); return true; } catch (_) { return false; }
}

export async function ponerLinterna(stream, encendida) {
  const pista = stream?.getVideoTracks()[0];
  try { await pista.applyConstraints({ advanced: [{ torch: encendida }] }); return true; } catch (_) { return false; }
}

/** Enfoca en el punto tocado (x, y de 0 a 1) y luego regresa a enfoque continuo. */
export async function enfocarEn(stream, x, y) {
  const pista = stream?.getVideoTracks()[0];
  if (!pista) return;
  try {
    await pista.applyConstraints({ advanced: [{ pointsOfInterest: [{ x, y }], focusMode: 'single-shot' }] });
    setTimeout(() => pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {}), 2500);
  } catch (_) {
    try { await pista.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (__) {}
  }
}

export function cerrarCamara(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Recorta del video exactamente lo que se ve dentro del recuadro guía. */
export function recortarGuia(video, guia) {
  const vr = video.getBoundingClientRect();
  const gr = guia.getBoundingClientRect();
  const vw = video.videoWidth, vh = video.videoHeight;
  const escala = Math.max(vr.width / vw, vr.height / vh); // object-fit: cover
  const offX = (vr.width - vw * escala) / 2, offY = (vr.height - vh * escala) / 2;
  const sx = (gr.left - vr.left - offX) / escala, sy = (gr.top - vr.top - offY) / escala;
  const sw = gr.width / escala, sh = gr.height / escala;
  const c = document.createElement('canvas');
  c.width = Math.round(sw); c.height = Math.round(sh);
  c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

// ---------- Zonas de la carta (proporciones del formato actual) ----------
// x, y, ancho, alto como fracción de la carta. Ajustables aquí si hace falta.
export const ZONAS = {
  nombre:       { x: 0.06, y: 0.035, w: 0.74, h: 0.065 },
  atributo:     { x: 0.815, y: 0.04, w: 0.12, h: 0.075 },
  numero:       { x: 0.55, y: 0.722, w: 0.41, h: 0.045 }, // bajo la imagen, a la derecha
  numeroPend:   { x: 0.04, y: 0.900, w: 0.42, h: 0.040 }, // Péndulo: abajo a la izquierda
  edicionVieja: { x: 0.05, y: 0.722, w: 0.42, h: 0.045 }, // formato antiguo: bajo la imagen, izquierda
  pie:          { x: 0.02, y: 0.935, w: 0.62, h: 0.050 }, // passcode + edición (formato actual)
  atkdef:       { x: 0.45, y: 0.895, w: 0.52, h: 0.045 },
};

function recortarZona(carta, z, escala = 3) {
  const sx = z.x * carta.width, sy = z.y * carta.height, sw = z.w * carta.width, sh = z.h * carta.height;
  const k = Math.min(escala, 1400 / sw);
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.filter = 'grayscale(1) contrast(1.4)';
  ctx.drawImage(carta, sx, sy, sw, sh, 0, 0, c.width, c.height);
  ctx.filter = 'none';
  return [conBorde(c), conBorde(soloOscuro(c)), conBorde(binarizar(c))];
}

/**
 * Deja en negro solo lo más oscuro (la tinta) y en blanco todo lo demás.
 * Funciona aunque el fondo sea de color (marco café, naranja, morado…).
 */
function soloOscuro(origen) {
  const c = document.createElement('canvas'); c.width = origen.width; c.height = origen.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(origen, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const hist = new Array(256).fill(0), n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  const percentil = (p) => { let a = 0; for (let i = 0; i < 256; i++) { a += hist[i]; if (a >= n * p) return i; } return 255; };
  const umbral = (percentil(0.01) + percentil(0.5)) / 2;
  for (let i = 0; i < d.length; i += 4) { const v = d[i] > umbral ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
  // Borra filas y columnas casi totalmente negras (bordes del marco, no texto)
  const W = c.width, H = c.height;
  const negro = (x, y) => d[(y * W + x) * 4] === 0;
  const blanquear = (x, y) => { const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; };
  for (let y = 0; y < H; y++) { let k = 0; for (let x = 0; x < W; x++) if (negro(x, y)) k++; if (k > W * 0.6) for (let x = 0; x < W; x++) blanquear(x, y); }
  for (let x = 0; x < W; x++) { let k = 0; for (let y = 0; y < H; y++) if (negro(x, y)) k++; if (k > H * 0.6) for (let y = 0; y < H; y++) blanquear(x, y); }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Blanco y negro con umbral automático de Otsu (texto oscuro sobre fondo claro u oscuro de color). */
function binarizar(origen) {
  const c = document.createElement('canvas'); c.width = origen.width; c.height = origen.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(origen, 0, 0);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  const hist = new Array(256).fill(0), n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  let suma = 0, sumaB = 0, wB = 0, max = 0, umbral = 127;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = n - wB; if (!wF) break;
    sumaB += i * hist[i];
    const v = wB * wF * (sumaB / wB - (suma - sumaB) / wF) ** 2;
    if (v > max) { max = v; umbral = i; }
  }
  for (let i = 0; i < d.length; i += 4) { const v = d[i] > umbral ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Tesseract lee mejor con un margen blanco alrededor
function conBorde(c) {
  const m = 20;
  const k = document.createElement('canvas'); k.width = c.width + 2 * m; k.height = c.height + 2 * m;
  const x = k.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, k.width, k.height); x.drawImage(c, m, m);
  return k;
}

/** Color promedio (HSL) del centro del círculo de atributo. */
function colorZona(carta, z) {
  const c = document.createElement('canvas'); c.width = 24; c.height = 24;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const cx = (z.x + z.w * 0.25) * carta.width, cy = (z.y + z.h * 0.25) * carta.height;
  ctx.drawImage(carta, cx, cy, z.w * 0.5 * carta.width, z.h * 0.5 * carta.height, 0, 0, 24, 24);
  const d = ctx.getImageData(0, 0, 24, 24).data;
  let r = 0, g = 0, b = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
  r /= n * 255; g /= n * 255; b /= n * 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let hu = 0, s = 0;
  if (max !== min) {
    const dd = max - min; s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
    hu = max === r ? (g - b) / dd + (g < b ? 6 : 0) : max === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
    hu *= 60;
  }
  return { h: hu, s, l };
}

/** Lee una zona probando sus variantes (gris y blanco/negro) hasta que `valido(texto)` se cumpla. */
async function leerZona(w, variantes, lista, valido = (t) => !!t, psm = '7') {
  await w.setParameters({ tessedit_char_whitelist: lista || '', tessedit_pageseg_mode: psm });
  let ultimo = '';
  for (const img of variantes) {
    const { data } = await w.recognize(img);
    ultimo = (data.text || '').replace(/\s+/g, ' ').trim();
    if (valido(ultimo)) return ultimo;
  }
  return ultimo;
}

const LETRAS_NUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';

/** Busca algo con forma de Card Number (ej. LOB-EN001, SD1-JP005, RA05-EN013). */
export function extraerNumero(t) {
  const s = String(t || '').toUpperCase().replace(/\s+/g, '');
  // En la parte numérica, el lector a veces confunde 0 con O e 1 con I/L
  const m = s.match(/([A-Z0-9]{2,5})-?([A-Z]{1,2})?([0-9OIL]{3}[A-Z]?)(?![0-9])/);
  if (!m || !/\d/.test(m[3])) return '';
  const num = m[3].slice(0, 3).replace(/O/g, '0').replace(/[IL]/g, '1') + m[3].slice(3);
  return `${m[1]}-${m[2] || ''}${num}`;
}

function extraerEdicion(t) {
  const s = String(t || '').toUpperCase();
  if (/LIMITED/.test(s)) return 'Limited Edition';
  if (/1\s*(ST|A|º|ª)?\s*(ED|EDITION|EDICI)/.test(s) || /\b1ST\b/.test(s)) return '1st Edition';
  return '';
}

/**
 * Lee la carta completa. Devuelve lo que pudo encontrar; lo demás queda vacío.
 * onPaso(texto) informa el avance.
 */
export async function leerCarta(carta, onPaso) {
  const w = await prepararOCR();
  const res = { cardNumber: '', passcode: '', edicion: '', atk: '', def: '', nombreEn: '', atributo: '' };

  onPaso?.('Leyendo Card Number…');
  let t = await leerZona(w, recortarZona(carta, ZONAS.numero), LETRAS_NUM, (x) => !!extraerNumero(x));
  res.cardNumber = extraerNumero(t);
  if (!res.cardNumber) {
    t = await leerZona(w, recortarZona(carta, ZONAS.numeroPend), LETRAS_NUM, (x) => !!extraerNumero(x));
    res.cardNumber = extraerNumero(t);
  }

  onPaso?.('Leyendo passcode y edición…');
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ªº ';
  const pie = recortarZona(carta, ZONAS.pie);
  t = await leerZona(w, pie, '0123456789 ', (x) => /\d{8}/.test(x.replace(/ /g, '')));
  const pc = t.replace(/ /g, '').match(/\d{8}/);
  if (pc) res.passcode = pc[0];
  t = await leerZona(w, pie, letras, (x) => !!extraerEdicion(x));
  res.edicion = extraerEdicion(t);
  if (!res.edicion) {
    t = await leerZona(w, recortarZona(carta, ZONAS.edicionVieja), letras, (x) => !!extraerEdicion(x));
    res.edicion = extraerEdicion(t);
  }

  onPaso?.('Leyendo ATK/DEF…');
  const atkOk = (x) => /ATK\s*\/?\s*[\d?]{1,5}/i.test(x) && /DEF\s*\/?\s*[\d?]{1,5}/i.test(x);
  t = (await leerZona(w, recortarZona(carta, ZONAS.atkdef), 'ATKDEFLIN0123456789?/- ', atkOk)).toUpperCase();
  const a = t.match(/ATK\s*\/?\s*([\d?]{1,5})/), d = t.match(/DEF\s*\/?\s*([\d?]{1,5})/);
  if (a) res.atk = a[1];
  if (d) res.def = d[1];

  onPaso?.('Leyendo nombre…');
  res.nombreEn = (await leerZona(w, recortarZona(carta, ZONAS.nombre, 2), '', (x) => x.length > 2)).replace(/[^\w\s'".,:&!?-]/g, '').trim();

  res.atributo = adivinarAtributo(colorZona(carta, ZONAS.atributo));
  return res;
}
