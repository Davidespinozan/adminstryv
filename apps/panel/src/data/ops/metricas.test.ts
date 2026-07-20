import { describe, it, expect } from 'vitest';
import {
  aMonedaBase,
  activos,
  altas,
  arpu,
  bajas,
  churn,
  conversionDePrueba,
  dentroDe,
  estadoActual,
  ingresos,
  ingresosPorNegocio,
  mesDe,
  ticketPromedio
} from './metricas';
import type { EventoEstado, MovimientoDinero, TipoCambio } from '../types';

// Base MXN. USD y EUR valen más que 1 peso.
const TC: TipoCambio = { MXN: 1, USD: 17, EUR: 19 };

const ENERO = { desde: new Date(2026, 0, 1), hasta: new Date(2026, 1, 1) };
const FEBRERO = { desde: new Date(2026, 1, 1), hasta: new Date(2026, 2, 1) };

function mov(over: Partial<MovimientoDinero> = {}): MovimientoDinero {
  return {
    negocio: 'sala',
    ocurrido_en: new Date(2026, 0, 15).toISOString(),
    monto_centavos: 100_000, // $1,000 MXN
    moneda: 'MXN',
    concepto: 'suscripcion',
    metodo: 'stripe',
    ...over
  };
}

function ev(over: Partial<EventoEstado> = {}): EventoEstado {
  return {
    negocio: 'sala',
    entidad: 'suscripcion_saas',
    entidad_id: 'e1',
    de_estado: null,
    a_estado: 'trial',
    motivo: null,
    ocurrido_en: new Date(2026, 0, 10).toISOString(),
    ...over
  };
}

describe('moneda', () => {
  it('convierte a la base y redondea a centavo entero', () => {
    expect(aMonedaBase(100, 'USD', TC)).toBe(1700);
    expect(aMonedaBase(333, 'EUR', TC)).toBe(6327);
  });

  it('sin tipo de cambio FALLA en vez de inventar un total plausible', () => {
    expect(() => aMonedaBase(100, 'USD', { MXN: 1 } as TipoCambio)).toThrow();
  });
});

describe('rango — el fin es exclusivo', () => {
  it('el primer instante del mes siguiente ya NO cuenta', () => {
    const finDeEnero = new Date(2026, 0, 31, 23, 59, 59).toISOString();
    const inicioFebrero = new Date(2026, 1, 1).toISOString();
    expect(dentroDe(finDeEnero, ENERO)).toBe(true);
    expect(dentroDe(inicioFebrero, ENERO)).toBe(false);
    expect(dentroDe(inicioFebrero, FEBRERO)).toBe(true);
  });

  it('meses contiguos no se solapan ni un instante', () => {
    const m = [mov({ ocurrido_en: new Date(2026, 1, 1).toISOString() })];
    expect(ingresos(m, ENERO, TC)).toBe(0);
    expect(ingresos(m, FEBRERO, TC)).toBe(100_000);
  });

  it('mesDe arma el rango del mes calendario', () => {
    const r = mesDe(new Date(2026, 0, 20));
    expect(r.desde.getTime()).toBe(ENERO.desde.getTime());
    expect(r.hasta.getTime()).toBe(ENERO.hasta.getTime());
  });
});

describe('dinero', () => {
  it('suma mezclando monedas', () => {
    const m = [mov(), mov({ monto_centavos: 100, moneda: 'USD' })];
    expect(ingresos(m, ENERO, TC)).toBe(100_000 + 1700);
  });

  it('un reembolso RESTA solo, sin tabla aparte', () => {
    const m = [mov(), mov({ monto_centavos: -40_000, concepto: 'reembolso' })];
    expect(ingresos(m, ENERO, TC)).toBe(60_000);
  });

  it('separa por negocio', () => {
    const m = [mov(), mov({ negocio: 'hsc', monto_centavos: 25_000 })];
    expect(ingresosPorNegocio(m, ENERO, TC)).toEqual({ sala: 100_000, hsc: 25_000 });
  });

  it('ticket promedio con lista vacía es 0, no NaN', () => {
    expect(ticketPromedio([], ENERO, TC)).toBe(0);
  });
});

describe('altas y bajas', () => {
  it('alta = la entidad nace (sin estado previo)', () => {
    expect(altas([ev(), ev({ de_estado: 'trial', a_estado: 'activa' })], ENERO)).toBe(1);
  });

  it('baja = pasar de vivo a NO vivo', () => {
    const eventos = [ev({ de_estado: 'activa', a_estado: 'cancelada' })];
    expect(bajas(eventos, ENERO)).toBe(1);
  });

  it('moverse entre dos estados vivos NO es una baja', () => {
    const eventos = [
      ev({ de_estado: 'trial', a_estado: 'activa' }),
      ev({ de_estado: 'activa', a_estado: 'pausada' })
    ];
    expect(bajas(eventos, ENERO)).toBe(0);
  });

  it('el alta tampoco es baja aunque nazca en un estado raro', () => {
    expect(bajas([ev({ de_estado: null, a_estado: 'cancelada' })], ENERO)).toBe(0);
  });
});

describe('churn', () => {
  it('bajas sobre activos al inicio', () => {
    const eventos = [ev({ de_estado: 'activa', a_estado: 'cancelada' })];
    expect(churn(eventos, ENERO, 10)).toBeCloseTo(0.1);
  });

  it('sin activos al inicio da 0, no Infinity', () => {
    const eventos = [ev({ de_estado: 'activa', a_estado: 'cancelada' })];
    expect(churn(eventos, ENERO, 0)).toBe(0);
  });
});

describe('conversión de prueba — por cohorte de entrada', () => {
  it('cuenta al que convirtió DESPUÉS del período de su alta', () => {
    const eventos = [
      ev({ entidad_id: 'a', a_estado: 'trial' }),
      ev({ entidad_id: 'b', a_estado: 'trial' }),
      // 'a' convierte en FEBRERO, pero entró en prueba en enero
      ev({
        entidad_id: 'a',
        de_estado: 'trial',
        a_estado: 'activa',
        ocurrido_en: new Date(2026, 1, 5).toISOString()
      })
    ];
    expect(conversionDePrueba(eventos, ENERO)).toBeCloseTo(0.5);
  });

  it('sin pruebas en el período da 0 y no NaN', () => {
    expect(conversionDePrueba([], ENERO)).toBe(0);
  });
});

describe('estado reconstruido desde el historial', () => {
  it('el último evento manda', () => {
    const eventos = [
      ev({ entidad_id: 'x', a_estado: 'trial', ocurrido_en: new Date(2026, 0, 1).toISOString() }),
      ev({
        entidad_id: 'x',
        de_estado: 'trial',
        a_estado: 'activa',
        ocurrido_en: new Date(2026, 0, 8).toISOString()
      })
    ];
    expect(estadoActual(eventos).get('sala:x')).toBe('activa');
  });

  it('no depende del orden en que lleguen los eventos', () => {
    const tarde = ev({
      entidad_id: 'x',
      de_estado: 'trial',
      a_estado: 'cancelada',
      ocurrido_en: new Date(2026, 0, 20).toISOString()
    });
    const temprano = ev({
      entidad_id: 'x',
      a_estado: 'trial',
      ocurrido_en: new Date(2026, 0, 1).toISOString()
    });
    expect(estadoActual([tarde, temprano]).get('sala:x')).toBe('cancelada');
  });

  it('cuenta activos y descarta los que se fueron', () => {
    const eventos = [
      ev({ entidad_id: 'a', a_estado: 'activa' }),
      ev({ entidad_id: 'b', a_estado: 'trial' }),
      ev({
        entidad_id: 'c',
        de_estado: 'activa',
        a_estado: 'cancelada',
        ocurrido_en: new Date(2026, 0, 25).toISOString()
      })
    ];
    expect(activos(eventos)).toBe(2);
  });

  it('puede contar por negocio', () => {
    const eventos = [
      ev({ entidad_id: 'a', a_estado: 'activa' }),
      ev({ negocio: 'hsc', entidad_id: 'z', a_estado: 'activa' })
    ];
    expect(activos(eventos, 'hsc')).toBe(1);
  });
});

describe('arpu', () => {
  it('ingreso ÷ activos', () => {
    expect(arpu(300_000, 3)).toBe(100_000);
  });
  it('sin clientes da 0, no división por cero', () => {
    expect(arpu(300_000, 0)).toBe(0);
  });
});