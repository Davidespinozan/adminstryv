// ============================================================================
// Entidades del hub de Stryv. Portadas del panel viejo (index.html) conservando
// los campos exactos para no romper los datos que ya existen en la base.
// ----------------------------------------------------------------------------
// Los nombres de campo se mantienen en camelCase como en el viejo; la capa de
// datos los traduce a snake_case al escribir (igual que `toSn`/`toCa`).
// ============================================================================

export type Moneda = 'MXN' | 'USD' | 'EUR';

/** Orden exacto del pipeline comercial. No reordenar: define el embudo. */
export const ETAPAS_CLIENTE = [
  'Lead',
  'Diagnóstico',
  'Propuesta',
  'En desarrollo',
  'Entregado',
  'Mantenimiento'
] as const;
export type EtapaCliente = (typeof ETAPAS_CLIENTE)[number];

export type Facturacion = 'Mensual' | 'Anual' | 'Lifetime' | 'Gratis';
export type TipoTarifa = 'Mensual' | 'Anual' | 'Por proyecto' | 'Por hora';

/** Un pago suelto dentro de un cliente. En el panel viejo `amount` se guardaba
 *  como string (venía del input); se acepta ambos y se normaliza al leer. */
export interface Pago {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number | string;
  note: string;
}

export interface Cliente {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  source: string;
  solutions: string[];
  stage: EtapaCliente;
  /** Total contratado. */
  amount: number;
  /** Suma de `payments`. En el viejo se recalculaba al editar/borrar un pago,
   *  pero NO al agregarlo — de ahí que existan clientes con `amountPaid`
   *  desalineado. Acá se recalcula siempre desde `payments`. */
  amountPaid: number;
  /** Retainer mensual. Es el MRR de Stryv como negocio operativo. */
  mrr: number;
  notes: string;
  tasks: { id: string; text: string; done: boolean }[];
  payments: Pago[];
  /** Ads que el cliente paga aparte. NO entran en `amountPaid` ni en los
   *  agregados: son un universo separado, como en el viejo. */
  adsPayments: Pago[];
  currency: Moneda;
  createdAt?: string;
  updatedAt?: string;
}

export interface Miembro {
  id: string;
  name: string;
  roles: string[];
  email: string;
  phone: string;
  rate: number;
  rateType: TipoTarifa;
  invested: number;
  status: 'Activo' | 'Inactivo' | 'Pausado';
  projects: string[];
  notes: string;
  currency: Moneda;
}

export interface Herramienta {
  id: string;
  name: string;
  category: string;
  cost: number;
  billing: Facturacion;
  url: string;
  loginEmail: string;
  notes: string;
  status: 'Activo' | 'Inactivo';
  /** YYYY-MM-DD. Desde este mes deja de devengar. */
  cancelDate: string | null;
  renewDate: string | null;
  /** Quién la paga: STRYV, un inversor, o un cliente. */
  paidBy: 'STRYV' | 'Inversor' | 'Cliente';
  /** Nombre del cliente/inversor que la paga. OJO: en el viejo el match es por
   *  NOMBRE exacto, así que renombrar un cliente rompe la atribución. */
  paidByName: string;
  currency: Moneda;
  /** Costo puntual por mes: { "2026-03": 12.5 }. Un 0 explícito ANULA el costo
   *  de ese mes (se chequea presencia, no verdad). */
  costHistory: Record<string, number>;
  createdAt?: string;
}

export interface Inversion {
  id: string;
  /** 'Inyección de capital' es la única que es inversión de verdad; el resto
   *  son gastos que el viejo mezclaba en el mismo total. */
  type: 'Inyección de capital' | 'Pago de stack mensual' | 'Equipo' | 'Ads' | 'Otro';
  investor: string;
  amount: number;
  date: string;
  notes: string;
  currency: Moneda;
}

export interface Alumno {
  id: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  amount: number;
  amountPaid: number;
  currentWeek: number;
  status: 'Activo' | 'Inactivo' | string;
  startDate: string;
  convertedToClient: boolean;
  notes: string;
  currency: Moneda;
}