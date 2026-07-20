// ============================================================================
// MÉTRICAS — lógica PURA. Sin red, sin React, sin Supabase.
// ----------------------------------------------------------------------------
// Todo lo que decide un número vive acá y se testea sin levantar nada. Si el
// panel muestra un ingreso equivocado, el bug está en este archivo y hay un test
// que lo reproduce en milisegundos. Patrón tomado de `renovacell-sistema`
// (data/ops/finanzas.ts), que es lo único que evita que los números del tablero
// y los del negocio se separen sin que nadie lo note.
//
// Vocabulario según el glosario operativo de David (MRR, ARPU, churn, GMV...).
// ============================================================================

import type {
  EventoEstado,
  MovimientoDinero,
  Moneda,
  NegocioId,
  Rango,
  TipoCambio
} from '../types';
import { ESTADOS_VIVOS } from '../types';

// ── Moneda ──────────────────────────────────────────────────────────────────

/**
 * Convierte a la moneda base. Se redondea con `Math.round` a centavo entero:
 * arrastrar decimales en dinero termina en descuadres de un centavo que después
 * nadie encuentra.
 */
export function aMonedaBase(centavos: number, moneda: Moneda, tc: TipoCambio): number {
  const tasa = tc[moneda];
  // Sin tasa no se inventa una: mezclar monedas con un 1 por defecto daría un
  // total plausible pero falso, que es peor que un error visible.
  if (typeof tasa !== 'number' || !Number.isFinite(tasa) || tasa <= 0) {
    throw new Error(`Sin tipo de cambio para ${moneda}`);
  }
  return Math.round(centavos * tasa);
}

// ── Rango ───────────────────────────────────────────────────────────────────

/** [desde, hasta) — ver la nota en types.ts sobre por qué el fin es exclusivo. */
export function dentroDe(iso: string, r: Rango): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= r.desde.getTime() && t < r.hasta.getTime();
}

/** Mes calendario en hora local: [1 del mes, 1 del mes siguiente). */
export function mesDe(fecha: Date): Rango {
  const desde = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  const hasta = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 1);
  return { desde, hasta };
}

// ── Dinero ──────────────────────────────────────────────────────────────────

/**
 * Ingresos del período, en moneda base. Los montos negativos (reembolsos,
 * correcciones) restan solos — por eso el ledger admite signo en vez de tener
 * una tabla aparte de devoluciones que después nadie cruza.
 */
export function ingresos(movs: MovimientoDinero[], r: Rango, tc: TipoCambio): number {
  return movs
    .filter((m) => dentroDe(m.ocurrido_en, r))
    .reduce((acc, m) => acc + aMonedaBase(m.monto_centavos, m.moneda, tc), 0);
}

/** Ingresos separados por negocio. Base del tablero de la matriz. */
export function ingresosPorNegocio(
  movs: MovimientoDinero[],
  r: Rango,
  tc: TipoCambio
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of movs) {
    if (!dentroDe(m.ocurrido_en, r)) continue;
    out[m.negocio] = (out[m.negocio] ?? 0) + aMonedaBase(m.monto_centavos, m.moneda, tc);
  }
  return out;
}

/**
 * GMV — todo el dinero que pasa por la plataforma, cobre comisión o no
 * (concepto 010 del glosario). En SALA hoy la comisión es 0, así que el GMV no
 * es ingreso propio; sirve para dos cosas: probar el valor de la plataforma y
 * detectar un gym que se está muriendo mucho antes de que cancele — su volumen
 * cae primero.
 */
export function gmv(movs: MovimientoDinero[], r: Rango, tc: TipoCambio): number {
  return ingresos(movs, r, tc);
}

/** Ticket promedio: cuánto entra por movimiento. */
export function ticketPromedio(movs: MovimientoDinero[], r: Rango, tc: TipoCambio): number {
  const dentro = movs.filter((m) => dentroDe(m.ocurrido_en, r));
  if (dentro.length === 0) return 0;
  return Math.round(ingresos(dentro, r, tc) / dentro.length);
}

// ── Ciclo de vida (sobre eventos_estado) ────────────────────────────────────

const esVivo = (estado: string | null): boolean =>
  estado != null && (ESTADOS_VIVOS as readonly string[]).includes(estado);

/** Altas del período: entidades que nacen (`de_estado === null`). */
export function altas(eventos: EventoEstado[], r: Rango): number {
  return eventos.filter((e) => e.de_estado === null && dentroDe(e.ocurrido_en, r)).length;
}

/**
 * Bajas del período: pasar de un estado VIVO a uno que no lo es.
 *
 * Se mide por la transición y no por "quedó en cancelada", porque si no, un gym
 * que cancela y vuelve el mismo mes contaría como baja permanente. Y un cambio
 * entre dos estados vivos (trial → activa) no es una baja.
 */
export function bajas(eventos: EventoEstado[], r: Rango): number {
  return eventos.filter(
    (e) => dentroDe(e.ocurrido_en, r) && esVivo(e.de_estado) && !esVivo(e.a_estado)
  ).length;
}

/**
 * Churn del período (concepto 004): bajas ÷ activos al inicio.
 * Sin activos al inicio devuelve 0 y no Infinity: un negocio que arranca de cero
 * no tiene 100% de churn, no tiene churn.
 */
export function churn(eventos: EventoEstado[], r: Rango, activosAlInicio: number): number {
  if (activosAlInicio <= 0) return 0;
  return bajas(eventos, r) / activosAlInicio;
}

/**
 * Conversión de prueba (concepto 052): de los que entraron en prueba dentro del
 * período, cuántos terminaron pagando — aunque el pago haya sido después.
 *
 * Se cuenta por la COHORTE de entrada, no por la fecha de conversión: si no,
 * un mes con muchas altas se ve mal solo porque sus pruebas todavía no vencen.
 */
export function conversionDePrueba(eventos: EventoEstado[], r: Rango): number {
  const entraronEnPrueba = eventos.filter(
    (e) => e.a_estado === 'trial' && dentroDe(e.ocurrido_en, r)
  );
  if (entraronEnPrueba.length === 0) return 0;

  const ids = new Set(entraronEnPrueba.map((e) => `${e.negocio}:${e.entidad_id}`));
  const convirtieron = new Set(
    eventos
      .filter((e) => e.de_estado === 'trial' && e.a_estado === 'activa')
      .map((e) => `${e.negocio}:${e.entidad_id}`)
      .filter((k) => ids.has(k))
  );
  return convirtieron.size / ids.size;
}

/**
 * Estado actual de cada entidad, reconstruido desde el historial.
 * Es la prueba de que con `eventos_estado` no hace falta consultar la tabla
 * mutable del negocio: el historial ya contiene el presente.
 */
export function estadoActual(eventos: EventoEstado[]): Map<string, string> {
  const orden = [...eventos].sort(
    (a, b) => new Date(a.ocurrido_en).getTime() - new Date(b.ocurrido_en).getTime()
  );
  const out = new Map<string, string>();
  for (const e of orden) out.set(`${e.negocio}:${e.entidad_id}`, e.a_estado);
  return out;
}

/** Cuántas entidades están vivas hoy, según el historial. */
export function activos(eventos: EventoEstado[], negocio?: NegocioId): number {
  let n = 0;
  for (const [clave, estado] of estadoActual(eventos)) {
    if (negocio && !clave.startsWith(`${negocio}:`)) continue;
    if (esVivo(estado)) n++;
  }
  return n;
}

/** ARPU (concepto 003): ingreso medio por cliente activo. */
export function arpu(ingresosBase: number, clientesActivos: number): number {
  if (clientesActivos <= 0) return 0;
  return Math.round(ingresosBase / clientesActivos);
}