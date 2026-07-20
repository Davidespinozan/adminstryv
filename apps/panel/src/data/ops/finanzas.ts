// ============================================================================
// FINANZAS DE STRYV — portado del panel viejo, con las contradicciones resueltas.
// ----------------------------------------------------------------------------
// Todo puro y testeable. Cada corrección respecto del panel viejo está marcada
// con "CAMBIO:" y explicada, para que cuando un número no coincida con el
// panel anterior se sepa exactamente por qué.
// ============================================================================

import type { Cliente, Herramienta, Inversion, Miembro, Moneda, Alumno } from '../entidades';

/** Cuántos pesos vale un dólar. El viejo lo cacheaba a diario con fallback 20.5. */
export interface TipoCambioUSD {
  mxn: number;
}

/**
 * Todo se normaliza a USD, que es la moneda en que Stryv mide.
 *
 * CAMBIO: el viejo redondeaba a 2 decimales EN CADA ítem antes de sumar, lo que
 * acumulaba error por fila. Acá se redondea solo al presentar. La diferencia es
 * de centavos, pero con cientos de filas se nota y no hay razón para heredarla.
 */
export function aUSD(valor: number | string, moneda: Moneda, tc: TipoCambioUSD): number {
  const n = Number(valor || 0);
  if (!Number.isFinite(n)) return 0;
  if (moneda === 'MXN') return n / tc.mxn;
  // EUR y USD se tratan igual que en el viejo (pasa sin convertir). Si algún día
  // hay clientes en euros de verdad, hay que agregar su tasa acá y no antes.
  return n;
}

/** "2026-03-15" → "2026-03". Las comparaciones de mes son por string, como en
 *  el viejo: ordenan bien y no dependen de zona horaria. */
export const mesDe = (fechaISO: string): string => String(fechaISO).substring(0, 7);
export const mesActual = (): string => new Date().toISOString().substring(0, 7);

const MES_VALIDO = /^\d{4}-\d{2}$/;

// ── Ingresos ────────────────────────────────────────────────────────────────

/** MRR de clientes: la suma de los retainers vigentes. */
export function mrrClientes(clientes: Cliente[], tc: TipoCambioUSD): number {
  return clientes
    .filter((c) => Number(c.mrr || 0) > 0)
    .reduce((s, c) => s + aUSD(c.mrr, c.currency, tc), 0);
}

/** MRR de academia: alumnos activos, por lo que se les cobra. */
export function mrrAcademia(alumnos: Alumno[], tc: TipoCambioUSD): number {
  return alumnos
    .filter((a) => a.status === 'Activo')
    .reduce((s, a) => s + aUSD(a.amount, a.currency, tc), 0);
}

/**
 * Lo COBRADO por mes. Regla dual heredada del viejo, a propósito:
 *  - Si el cliente tiene pagos cargados, manda `payments[]`.
 *  - Si no tiene ninguno pero sí `amountPaid`, se imputa todo al mes de alta.
 * Es la única forma de no perder los clientes viejos que se cargaron antes de
 * que existiera el detalle de pagos.
 */
export function cobradoPorMes(clientes: Cliente[], tc: TipoCambioUSD): Record<string, number> {
  const out: Record<string, number> = {};

  for (const c of clientes) {
    const pagos = c.payments ?? [];

    if (pagos.length > 0) {
      for (const p of pagos) {
        if (!p.date || !p.amount) continue; // sin fecha o en 0: no es un cobro
        const m = mesDe(p.date);
        if (!MES_VALIDO.test(m)) continue;
        out[m] = (out[m] ?? 0) + aUSD(p.amount, c.currency, tc);
      }
      continue;
    }

    if (Number(c.amountPaid || 0) > 0 && c.createdAt) {
      const m = mesDe(c.createdAt);
      if (!MES_VALIDO.test(m)) continue;
      out[m] = (out[m] ?? 0) + aUSD(c.amountPaid, c.currency, tc);
    }
  }
  return out;
}

// ── Costos ──────────────────────────────────────────────────────────────────

/** Anual → /12 · Lifetime y Gratis → 0 · resto → tal cual. */
export function costoMensual(h: Herramienta, tc: TipoCambioUSD): number {
  const c = aUSD(h.cost, h.currency, tc);
  if (h.billing === 'Anual') return c / 12;
  if (h.billing === 'Lifetime' || h.billing === 'Gratis') return 0;
  return c;
}

/**
 * ¿Esta herramienta estaba activa en ESE mes?
 *
 * CAMBIO IMPORTANTE: el viejo filtraba por el estado de HOY, así que al
 * cancelar una herramienta desaparecía de TODO el historial — incluidos los
 * meses en que sí se pagó. Eso reescribía el pasado y hacía que los costos
 * históricos bajaran solos.
 * Acá se decide por fechas: cuenta desde que se dio de alta hasta que se canceló.
 */
export function activaEnMes(h: Herramienta, mes: string): boolean {
  const alta = h.createdAt ? mesDe(h.createdAt) : mes;
  if (mes < alta) return false;
  if (h.cancelDate && mesDe(h.cancelDate) < mes) return false;
  return true;
}

/** Costo de una herramienta en un mes, respetando el ajuste puntual de
 *  `costHistory` (un 0 explícito ANULA ese mes). */
export function costoEnMes(h: Herramienta, mes: string, tc: TipoCambioUSD): number {
  if (!activaEnMes(h, mes)) return 0;
  const ajuste = h.costHistory?.[mes];
  if (ajuste !== undefined) return Number(ajuste) || 0;
  return costoMensual(h, tc);
}

/**
 * Stack separado por QUIÉN lo paga.
 *
 * CAMBIO: el viejo sumaba todo junto en `tlCost` y lo llamaba "costo de stack",
 * pero incluía lo que pagan clientes e inversores — o sea, mostraba como gasto
 * propio dinero que Stryv nunca desembolsó. Acá se devuelve desglosado y el
 * costo real de Stryv es `propio`.
 */
export function stackPorPagador(
  herramientas: Herramienta[],
  mes: string,
  tc: TipoCambioUSD
): { propio: number; inversor: number; cliente: number; total: number } {
  const acc = { propio: 0, inversor: 0, cliente: 0, total: 0 };
  for (const h of herramientas) {
    const c = costoEnMes(h, mes, tc);
    if (c === 0) continue;
    acc.total += c;
    if (h.paidBy === 'Cliente') acc.cliente += c;
    else if (h.paidBy === 'Inversor') acc.inversor += c;
    else acc.propio += c;
  }
  return acc;
}

/**
 * Costo de equipo mensual.
 * Se excluye a quien es SOLO inversionista (no cobra sueldo). Si tiene ese rol
 * más otro, sí cuenta — igual que en el viejo.
 * 'Por proyecto' y 'Por hora' valen 0: no son costo fijo mensual.
 */
export function costoEquipo(equipo: Miembro[], tc: TipoCambioUSD): number {
  return equipo
    .filter((m) => m.status === 'Activo')
    .filter((m) => !((m.roles ?? []).length === 1 && m.roles[0] === 'Inversionista'))
    .reduce((s, m) => {
      const r = aUSD(m.rate, m.currency, tc);
      if (m.rateType === 'Anual') return s + r / 12;
      if (m.rateType === 'Por proyecto' || m.rateType === 'Por hora') return s;
      return s + r;
    }, 0);
}

/** Ads de un mes. Salen de `investments` con tipo Ads. */
export function costoAds(inversiones: Inversion[], mes: string, tc: TipoCambioUSD): number {
  return inversiones
    .filter((i) => i.type === 'Ads' && i.date && mesDe(i.date) === mes)
    .reduce((s, i) => s + aUSD(i.amount, i.currency, tc), 0);
}

// ── Resultado del mes ───────────────────────────────────────────────────────

export interface ResultadoMes {
  mes: string;
  /** Lo que realmente entró. */
  cobrado: number;
  /** Lo que debería entrar si el mes se repitiera. */
  mrr: number;
  costoEquipo: number;
  /** Solo lo que paga Stryv. Lo de clientes/inversores va aparte. */
  costoStackPropio: number;
  stackCubiertoPorTerceros: number;
  costoAds: number;
  costoTotal: number;
  /**
   * CAMBIO: el viejo tenía TRES fórmulas de utilidad conviviendo sin nombre y
   * daban distinto. No son un error de cálculo: son DOS PREGUNTAS DISTINTAS,
   * y las dos importan. Ahora cada una tiene nombre propio.
   */
  utilidadCaja: number;    // cobrado − costos: lo que pasó de verdad
  utilidadRunRate: number; // mrr − costos: lo que pasaría si el mes se repitiera
}

export function resultadoDelMes(
  mes: string,
  datos: {
    clientes: Cliente[];
    alumnos: Alumno[];
    equipo: Miembro[];
    herramientas: Herramienta[];
    inversiones: Inversion[];
  },
  tc: TipoCambioUSD
): ResultadoMes {
  const cobrado = cobradoPorMes(datos.clientes, tc)[mes] ?? 0;
  const mrr = mrrClientes(datos.clientes, tc) + mrrAcademia(datos.alumnos, tc);

  const equipo = costoEquipo(datos.equipo, tc);
  const stack = stackPorPagador(datos.herramientas, mes, tc);
  const ads = costoAds(datos.inversiones, mes, tc);
  const costoTotal = equipo + stack.propio + ads;

  return {
    mes,
    cobrado,
    mrr,
    costoEquipo: equipo,
    costoStackPropio: stack.propio,
    stackCubiertoPorTerceros: stack.cliente + stack.inversor,
    costoAds: ads,
    costoTotal,
    utilidadCaja: cobrado - costoTotal,
    utilidadRunRate: mrr - costoTotal
  };
}

// ── Inversión ───────────────────────────────────────────────────────────────

/**
 * Capital realmente inyectado.
 *
 * CAMBIO: el viejo sumaba TODOS los tipos bajo "total invertido", incluidos Ads
 * y Equipo — que son gastos, no inversión. Eso inflaba la cifra y mezclaba dos
 * conceptos contables distintos. Acá solo cuenta la inyección de capital.
 */
export function capitalInyectado(inversiones: Inversion[], tc: TipoCambioUSD): number {
  return inversiones
    .filter((i) => i.type === 'Inyección de capital')
    .reduce((s, i) => s + aUSD(i.amount, i.currency, tc), 0);
}

/** Lo pendiente de cobro: contratado menos pagado, ya convertido.
 *  CAMBIO: el viejo comparaba montos SIN convertir moneda, así que un cliente
 *  en pesos aparecía con un pendiente enorme etiquetado en dólares. */
export function porCobrar(clientes: Cliente[], tc: TipoCambioUSD): number {
  return clientes.reduce((s, c) => {
    const total = aUSD(c.amount, c.currency, tc);
    const pagado = aUSD(sumaPagos(c), c.currency, tc);
    return s + Math.max(0, total - pagado);
  }, 0);
}

/** Suma real de los pagos cargados. Se usa en vez de `amountPaid` porque en el
 *  viejo ese campo no se recalculaba al AGREGAR un pago, y quedó desalineado. */
export function sumaPagos(c: Cliente): number {
  return (c.payments ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
}