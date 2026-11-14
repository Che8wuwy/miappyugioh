// Configuración general de MiAppYuGiOh!
// Cambia APP_VERSION en cada publicación (y también CACHE_VERSION en sw.js).

export const APP_NOMBRE = 'MiAppYuGiOh';
export const APP_TITULO = 'MiAppYuGiOh!';
export const APP_VERSION = '1.1.0';

// Base de datos local (IndexedDB)
export const DB_NOMBRE = 'miappyugioh';
export const DB_VERSION = 1; // súbelo solo al agregar una migración en js/core/db.js

// OCR (lector de texto)
export const OCR = {
  workerPath: './vendor/tesseract/worker.min.js',
  corePath: './vendor/tesseract/core',
  langPath: './vendor/tesseract/lang',
  idioma: 'eng',
};

// Fuentes del catálogo (solo se usan al tocar "Actualizar catálogo" o al buscar en línea)
export const FUENTES = {
  // YAML Yugi: todas las cartas OCG/TCG con nombres en inglés y japonés
  yamlYugi: 'https://dawnbrandbots.github.io/yaml-yugi/cards.json',
  // YGOPRODeck: respaldo en línea por Card Number (solo TCG)
  ygoSetInfo: 'https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode=',
  ygoCardInfo: 'https://db.ygoprodeck.com/api/v7/cardinfo.php?id=',
};

// Funciones habilitadas (para crecer por fases sin romper lo existente)
export const FUNCIONES = {
  fotos: false,    // Fase 2: foto/imagen de cada carta
  detalles: false, // Fase 3: consultar características y descripción
};

export const EDICIONES = ['1st Edition', 'Unlimited', 'Limited Edition', 'Sin edición (OCG)'];

// Lista base de rarezas (TCG y OCG). En el formulario también se puede escribir otra.
export const RAREZAS = [
  'Common', 'Normal', 'Parallel Rare', 'Short Print', 'Rare', 'Super Rare', 'Ultra Rare', 'Secret Rare', 'Ultimate Rare',
  'Ghost Rare', 'Starlight Rare', "Collector's Rare", 'Prismatic Secret Rare', 'Platinum Secret Rare',
  'Quarter Century Secret Rare', 'Extra Secret Rare', 'Holographic Rare', 'Normal Parallel Rare',
  'Super Parallel Rare', 'Ultra Parallel Rare', 'Gold Rare', 'Premium Gold Rare', 'Starfoil Rare',
  'Mosaic Rare', 'Shatterfoil Rare', 'Grand Master Rare',
];

// Formato de catálogo que espera esta versión (si el descargado es más viejo, se pide actualizarlo)
export const FORMATO_CATALOGO = 2;

export const TIPOS_CARTA = ['Monstruo', 'Mágica', 'Trampa'];

// Valores por defecto de Configuración
export const AJUSTES_DEFAULT = {
  modoOscuro: false,
  colorPrincipal: '#7c3aed',
  tamanoLetra: 100,
  vibrar: true,
  buscarEnLinea: true, // si no está en el catálogo y hay internet, consultar YGOPRODeck
};

export const COLORES = ['#7c3aed', '#d62828', '#2563eb', '#16a34a', '#e85d04', '#0f766e'];
