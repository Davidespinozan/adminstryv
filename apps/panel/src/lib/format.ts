// ============================================================================
// Formato. Puro y testeable — el dinero mal mostrado se lee como dinero mal
// contado, aunque el cálculo esté bien.
// ============================================================================

import type { Moneda } from '../data/types';

/**
 * Centavos → texto legible. Sin decimales: en un tablero, "$1,234" se compara
 * de un vistazo y "$1,234.00" solo agrega ruido. El detalle exacto vive en el
 * negocio, no en la vista de la matriz.
 */
export function dinero(centavos: number, moneda: Moneda = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 0
  }).format(centavos / 100);
}

/** 0.0731 → "7.3%". */
export function porcentaje(fraccion: number): string {
  return `${(fraccion * 100).toFixed(1)}%`;
}

/** Números grandes abreviados para los titulares: 1250000 → "1.3M". */
export function compacto(n: number): string {
  return new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

/**
 * Lo que se muestra cuando un negocio NO PUEDE medir algo todavía.
 * Nunca un cero: un cero dice "vendiste nada" y esto dice "no lo sabemos".
 * Confundirlos es la diferencia entre un tablero honesto y uno que miente.
 */
export const SIN_DATO = '—';

export function dineroOpcional(centavos: number | null, moneda: Moneda = 'MXN'): string {
  return centavos == null ? SIN_DATO : dinero(centavos, moneda);
}

export function numeroOpcional(n: number | null): string {
  return n == null ? SIN_DATO : new Intl.NumberFormat('es-MX').format(n);
}