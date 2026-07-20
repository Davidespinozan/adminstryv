// ============================================================================
// Tipos del dominio del HUB. Espejo del contrato de datos (docs/CONTRATO-DATOS.md).
// ----------------------------------------------------------------------------
// El hub NO define el modelo de cada negocio: define el MÍNIMO COMÚN que todos
// deben entregar. Cada negocio traduce lo suyo a estas dos formas y el panel no
// necesita saber nada más sobre él. Así agregar un negocio nuevo no toca el
// panel: solo se escribe su adaptador.
// ============================================================================

/** Los negocios del grupo. Stryv es a la vez matriz y negocio operativo
 *  (sus clientes de implementación pagan retainer mensual). */
export type NegocioId = 'sala' | 'hsc' | 'healthyspace' | 'stryv';

export const NEGOCIOS: { id: NegocioId; nombre: string }[] = [
  { id: 'sala', nombre: 'SALA Studio' },
  { id: 'hsc', nombre: 'Healthy Space Club' },
  { id: 'healthyspace', nombre: 'Healthy Space' },
  { id: 'stryv', nombre: 'Stryv (clientes)' }
];

export type Moneda = 'MXN' | 'USD' | 'EUR';

/** Cuántas unidades de la moneda BASE vale 1 unidad de cada moneda.
 *  Ej. con base MXN: { MXN: 1, USD: 17.5, EUR: 19 }. */
export type TipoCambio = Record<Moneda, number>;

/** Un movimiento de dinero. Puede ser NEGATIVO: un reembolso o una corrección
 *  es otra fila, nunca la edición de la original. El saldo es la suma. */
export interface MovimientoDinero {
  negocio: NegocioId;
  ocurrido_en: string;          // ISO
  monto_centavos: number;
  moneda: Moneda;
  concepto: string;             // 'suscripcion' | 'venta' | 'retainer' | 'reembolso' | ...
  metodo: string;               // 'stripe' | 'efectivo' | ...
  cliente_id?: string | null;
}

/** Un cambio de estado. `de_estado: null` = alta (la entidad nace). */
export interface EventoEstado {
  negocio: NegocioId;
  entidad: string;              // 'suscripcion_saas' | 'cliente' | ...
  entidad_id: string;
  de_estado: string | null;
  a_estado: string;
  motivo: string | null;
  ocurrido_en: string;          // ISO
}

/** Rango [desde, hasta) — inicio inclusive, fin EXCLUSIVO.
 *  Exclusivo a propósito: con rangos inclusivos, un movimiento a las 23:59:59.999
 *  del último día cae o no cae según la precisión, y los meses contiguos se
 *  pisan un instante. Con fin exclusivo, "enero" y "febrero" nunca se solapan. */
export interface Rango {
  desde: Date;
  hasta: Date;
}

/** Estados que cuentan como "cliente vivo" al medir bajas. Cada negocio nombra
 *  sus estados distinto; el hub solo necesita saber cuáles significan activo. */
export const ESTADOS_VIVOS = ['activa', 'trial', 'pausada', 'mantenimiento'] as const;

/** Lo que el panel muestra por negocio. Los `null` son honestos: significan
 *  "este negocio todavía no puede medir esto", y se pintan como tal en vez de
 *  como un cero — un cero miente. */
export interface ResumenNegocio {
  negocio: NegocioId;
  ingresos_centavos: number | null;
  mrr_centavos: number | null;
  clientes_activos: number | null;
  altas: number | null;
  bajas: number | null;
  /** Qué NO se pudo medir y por qué. Se muestra en el panel. */
  huecos: string[];
}