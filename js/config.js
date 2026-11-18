// Configuración general de MiAppVuala.
// Cambia APP_VERSION en cada publicación (y también CACHE_VERSION en sw.js).

export const APP_NOMBRE = 'MiAppVuala';
export const APP_VERSION = '1.0.3';

// Base de datos local (IndexedDB)
export const DB_NOMBRE = 'miappvuala';
export const DB_VERSION = 1; // súbelo solo al agregar una migración en js/core/db.js

// Reglas del código de lote
export const CODIGO_MIN = 5;   // longitud mínima aceptada
export const CODIGO_MAX = 12;  // longitud máxima aceptada (hoy se ven de 9)
export const CODIGO_REGEX = new RegExp(`^[A-Z0-9]{${CODIGO_MIN},${CODIGO_MAX}}$`);

// OCR (lector de texto)
export const OCR = {
  workerPath: './vendor/tesseract/worker.min.js',
  corePath: './vendor/tesseract/core',
  langPath: './vendor/tesseract/lang',
  idioma: 'eng',
  listaBlanca: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
};

// Funciones habilitadas (para crecer por fases sin romper lo existente)
export const FUNCIONES = {
  figuras: false, // Fase 2: catálogo de figuras con imágenes por colección
};

// Valores por defecto de Configuración
export const AJUSTES_DEFAULT = {
  modoOscuro: false,
  colorPrincipal: '#e85d04',
  tamanoLetra: 100,          // porcentaje
  permitirArchivar: false,   // "Borrar colección" deshabilitado por defecto
  vibrar: true,
};

export const COLORES = ['#e85d04', '#d62828', '#2563eb', '#16a34a', '#7c3aed', '#0f766e'];
