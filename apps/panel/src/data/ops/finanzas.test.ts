import { describe, it, expect } from 'vitest';
import {
  aUSD,
  activaEnMes,
  capitalInyectado,
  cobradoPorMes,
  costoAds,
  costoEnMes,
  costoEquipo,
  costoMensual,
  mrrAcademia,
  mrrClientes,
  porCobrar,
  resultadoDelMes,
  stackPorPagador,
  sumaPagos
} from './finanzas';
import type { Alumno, Cliente, Herramienta, Inversion, Miembro } from '../entidades';

const TC = { mxn: 20 }; // 1 USD = 20 MXN

const cliente = (o: Partial<Cliente> = {}): Cliente =>
  ({
    id: 'c1', name: 'X', company: '', phone: '', email: '', source: '',
    solutions: [], stage: 'Mantenimiento', amount: 0, amountPaid: 0, mrr: 0,
    notes: '', tasks: [], payments: [], adsPayments: [], currency: 'USD',
    ...o
  }) as Cliente;

const tool = (o: Partial<Herramienta> = {}): Herramienta =>
  ({
    id: 't1', name: 'T', category: '', cost: 100, billing: 'Mensual', url: '',
    loginEmail: '', notes: '', status: 'Activo', cancelDate: null, renewDate: null,
    paidBy: 'STRYV', paidByName: '', currency: 'USD', costHistory: {},
    createdAt: '2026-01-05',
    ...o
  }) as Herramienta;

const miembro = (o: Partial<Miembro> = {}): Miembro =>
  ({
    id: 'm1', name: 'M', roles: ['Dev'], email: '', phone: '', rate: 1000,
    rateType: 'Mensual', invested: 0, status: 'Activo', projects: [], notes: '',
    currency: 'USD',
    ...o
  }) as Miembro;

describe('moneda', () => {
  it('pesos a dólares', () => {
    expect(aUSD(2000, 'MXN', TC)).toBe(100);
  });
  it('dólares se dejan igual', () => {
    expect(aUSD(150, 'USD', TC)).toBe(150);
  });
  it('valores basura no rompen: dan 0', () => {
    expect(aUSD('', 'USD', TC)).toBe(0);
    expect(aUSD('abc', 'USD', TC)).toBe(0);
  });
});

describe('MRR', () => {
  it('suma retainers convirtiendo moneda', () => {
    const cs = [cliente({ mrr: 500 }), cliente({ mrr: 4000, currency: 'MXN' })];
    expect(mrrClientes(cs, TC)).toBe(700); // 500 + 200
  });
  it('ignora clientes sin retainer', () => {
    expect(mrrClientes([cliente({ mrr: 0 })], TC)).toBe(0);
  });
  it('academia solo cuenta alumnos activos', () => {
    const as = [
      { status: 'Activo', amount: 100, currency: 'USD' },
      { status: 'Inactivo', amount: 999, currency: 'USD' }
    ] as Alumno[];
    expect(mrrAcademia(as, TC)).toBe(100);
  });
});

describe('cobrado por mes — regla dual', () => {
  it('si hay pagos cargados, mandan los pagos', () => {
    const c = cliente({
      amountPaid: 9999,
      createdAt: '2026-01-01',
      payments: [
        { id: 'p1', date: '2026-03-10', amount: 300, note: '' },
        { id: 'p2', date: '2026-04-02', amount: 200, note: '' }
      ]
    });
    expect(cobradoPorMes([c], TC)).toEqual({ '2026-03': 300, '2026-04': 200 });
  });

  it('sin pagos cargados, imputa lo pagado al mes de alta (clientes viejos)', () => {
    const c = cliente({ amountPaid: 400, createdAt: '2026-02-20', payments: [] });
    expect(cobradoPorMes([c], TC)).toEqual({ '2026-02': 400 });
  });

  it('descarta pagos sin fecha o en cero', () => {
    const c = cliente({
      payments: [
        { id: 'a', date: '', amount: 100, note: '' },
        { id: 'b', date: '2026-03-01', amount: 0, note: '' }
      ]
    });
    expect(cobradoPorMes([c], TC)).toEqual({});
  });

  it('convierte con la moneda del cliente', () => {
    const c = cliente({
      currency: 'MXN',
      payments: [{ id: 'p', date: '2026-03-01', amount: 2000, note: '' }]
    });
    expect(cobradoPorMes([c], TC)).toEqual({ '2026-03': 100 });
  });
});

describe('herramientas', () => {
  it('anual se divide en 12; lifetime y gratis no cuestan', () => {
    expect(costoMensual(tool({ cost: 120, billing: 'Anual' }), TC)).toBe(10);
    expect(costoMensual(tool({ billing: 'Lifetime' }), TC)).toBe(0);
    expect(costoMensual(tool({ billing: 'Gratis' }), TC)).toBe(0);
  });

  // CORRECCIÓN respecto del panel viejo
  it('una herramienta CANCELADA sigue contando en los meses en que estuvo activa', () => {
    const t = tool({ createdAt: '2026-01-05', cancelDate: '2026-03-31' });
    expect(activaEnMes(t, '2026-02')).toBe(true);
    expect(activaEnMes(t, '2026-03')).toBe(true);
    expect(activaEnMes(t, '2026-04')).toBe(false);
  });

  it('no cuenta antes de darse de alta', () => {
    expect(activaEnMes(tool({ createdAt: '2026-05-01' }), '2026-03')).toBe(false);
  });

  it('costHistory pisa el costo de ese mes, y un 0 lo anula', () => {
    const t = tool({ cost: 100, costHistory: { '2026-02': 40, '2026-03': 0 } });
    expect(costoEnMes(t, '2026-01', TC)).toBe(100);
    expect(costoEnMes(t, '2026-02', TC)).toBe(40);
    expect(costoEnMes(t, '2026-03', TC)).toBe(0);
  });
});

describe('stack por pagador — la corrección clave', () => {
  it('separa lo que paga Stryv de lo que pagan terceros', () => {
    const hs = [
      tool({ id: 'a', cost: 100, paidBy: 'STRYV' }),
      tool({ id: 'b', cost: 50, paidBy: 'Cliente' }),
      tool({ id: 'c', cost: 30, paidBy: 'Inversor' })
    ];
    const s = stackPorPagador(hs, '2026-02', TC);
    expect(s.propio).toBe(100);
    expect(s.cliente).toBe(50);
    expect(s.inversor).toBe(30);
    expect(s.total).toBe(180);
  });

  it('el costo REAL de Stryv es solo `propio`, no el total', () => {
    const hs = [tool({ cost: 100, paidBy: 'Cliente' })];
    const s = stackPorPagador(hs, '2026-02', TC);
    expect(s.propio).toBe(0);   // el viejo reportaba 100 como gasto propio
    expect(s.total).toBe(100);
  });
});

describe('costo de equipo', () => {
  it('anual se prorratea; por proyecto y por hora no son costo fijo', () => {
    expect(costoEquipo([miembro({ rate: 1200, rateType: 'Anual' })], TC)).toBe(100);
    expect(costoEquipo([miembro({ rateType: 'Por proyecto' })], TC)).toBe(0);
    expect(costoEquipo([miembro({ rateType: 'Por hora' })], TC)).toBe(0);
  });

  it('excluye a quien es SOLO inversionista', () => {
    expect(costoEquipo([miembro({ roles: ['Inversionista'] })], TC)).toBe(0);
  });

  it('pero si además tiene otro rol, sí cobra', () => {
    expect(costoEquipo([miembro({ roles: ['Inversionista', 'Dev'] })], TC)).toBe(1000);
  });

  it('los inactivos no cuestan', () => {
    expect(costoEquipo([miembro({ status: 'Inactivo' })], TC)).toBe(0);
  });
});

describe('resultado del mes — las DOS utilidades', () => {
  const datos = {
    clientes: [
      cliente({
        mrr: 1000,
        payments: [{ id: 'p', date: '2026-03-05', amount: 600, note: '' }]
      })
    ],
    alumnos: [] as Alumno[],
    equipo: [miembro({ rate: 200 })],
    herramientas: [tool({ cost: 100, paidBy: 'STRYV' })],
    inversiones: [
      { id: 'i', type: 'Ads', investor: '', amount: 50, date: '2026-03-10', notes: '', currency: 'USD' }
    ] as Inversion[]
  };

  const r = resultadoDelMes('2026-03', datos, TC);

  it('los costos son equipo + stack PROPIO + ads', () => {
    expect(r.costoTotal).toBe(350); // 200 + 100 + 50
  });

  it('utilidad de caja = lo que entró menos los costos', () => {
    expect(r.utilidadCaja).toBe(250); // 600 − 350
  });

  it('utilidad run-rate = lo que entraría si el mes se repitiera', () => {
    expect(r.utilidadRunRate).toBe(650); // 1000 − 350
  });

  it('son distintas a propósito: el panel viejo las mezclaba sin nombre', () => {
    expect(r.utilidadCaja).not.toBe(r.utilidadRunRate);
  });

  it('el stack de terceros se informa aparte, no como gasto propio', () => {
    const conCliente = {
      ...datos,
      herramientas: [...datos.herramientas, tool({ id: 'z', cost: 80, paidBy: 'Cliente' })]
    };
    const r2 = resultadoDelMes('2026-03', conCliente, TC);
    expect(r2.costoTotal).toBe(350); // no cambia
    expect(r2.stackCubiertoPorTerceros).toBe(80);
  });
});

describe('inversión y cobranza', () => {
  const invs = [
    { id: '1', type: 'Inyección de capital', investor: 'A', amount: 5000, date: '2026-01-01', notes: '', currency: 'USD' },
    { id: '2', type: 'Ads', investor: '', amount: 300, date: '2026-01-05', notes: '', currency: 'USD' },
    { id: '3', type: 'Equipo', investor: '', amount: 900, date: '2026-01-06', notes: '', currency: 'USD' }
  ] as Inversion[];

  it('capital inyectado NO incluye ads ni equipo (son gastos)', () => {
    expect(capitalInyectado(invs, TC)).toBe(5000); // el viejo daba 6200
  });

  it('ads solo del mes pedido', () => {
    expect(costoAds(invs, '2026-01', TC)).toBe(300);
    expect(costoAds(invs, '2026-02', TC)).toBe(0);
  });

  it('por cobrar convierte moneda (el viejo comparaba pesos contra dólares)', () => {
    const c = cliente({
      currency: 'MXN',
      amount: 20000, // = 1000 USD
      payments: [{ id: 'p', date: '2026-01-01', amount: 8000, note: '' }] // = 400 USD
    });
    expect(porCobrar([c], TC)).toBe(600);
  });

  it('nunca da negativo si pagaron de más', () => {
    const c = cliente({ amount: 100, payments: [{ id: 'p', date: '2026-01-01', amount: 150, note: '' }] });
    expect(porCobrar([c], TC)).toBe(0);
  });

  it('lo pagado sale de los pagos, no del campo desalineado', () => {
    const c = cliente({
      amountPaid: 9999, // quedó mal en el viejo al agregar pagos
      payments: [{ id: 'p', date: '2026-01-01', amount: 250, note: '' }]
    });
    expect(sumaPagos(c)).toBe(250);
  });
});