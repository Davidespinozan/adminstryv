// ============================================================================
// LECTOR CONSOLIDADO — la única puerta por la que el panel ve a los negocios.
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE Y POR QUÉ ES DE SERVIDOR: para consolidar hay que leer TODO de
// cada base (todos los gyms de SALA, todos los pedidos, todos los clientes), y
// eso solo lo permite la clave `service_role`, que se salta la seguridad de la
// base entera. Esa clave NO PUEDE tocar el navegador: quien la ve, se lleva las
// llaves maestras de los tres negocios. Acá vive del lado del servidor y lo
// único que sale al cliente son datos ya normalizados.
//
// ARQUITECTURA: esta función es un ADAPTADOR TONTO. Traduce cada negocio al
// contrato común (movimientos + eventos) y no calcula ninguna métrica. Todos los
// números los computa `apps/panel/src/data/ops/metricas.ts`, que es puro y está
// testeado. Un solo lugar decide qué es "churn" — si además se calculara acá,
// los dos se separarían sin que nadie lo note.
//
// FALLA ABIERTO POR NEGOCIO: si una base no responde, ese negocio viene con su
// hueco explicado y el resto del panel funciona igual. Un negocio caído no
// puede dejar ciego al grupo entero.
// ============================================================================

const env = (k) => process.env[k] || '';

/** Consulta PostgREST con la clave de servicio. Sin SDK: una dependencia menos
 *  y el mismo mecanismo que ya usan las otras funciones del repo. */
async function q(baseUrl, key, path) {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
});

// ── Autenticación ───────────────────────────────────────────────────────────
// FALLA CERRADO a propósito: ante cualquier duda, 401/403. El panel viejo hace
// lo contrario (`const isA = true`: todo usuario autenticado es admin total), y
// eso era tolerable cuando solo había datos de Stryv. Con las llaves de tres
// negocios detrás, no lo es.
//
// EL PERMISO LO DECIDE `is_admin()`, la misma función de la que ya cuelga toda
// la RLS del panel (`profiles.role = 'admin'`). No se reimplementa acá: se la
// llama. Copiar la regla en JavaScript crearía una segunda fuente de verdad que
// se separa de la primera en cuanto una de las dos cambie, y el día que eso
// pase nadie se va a enterar hasta que sea tarde.
//
// Se la invoca con el JWT DEL USUARIO, no con la clave de servicio: así
// `auth.uid()` dentro de la función resuelve a quien realmente está pidiendo.
// Con la clave de servicio, `auth.uid()` sería nulo y la respuesta siempre no.
async function autorizar(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return { ok: false, code: 401, msg: 'Falta el token' };

  const url = env('SB_STRYV_URL');
  const key = env('SB_STRYV_SERVICE_KEY');
  if (!url || !key) return { ok: false, code: 500, msg: 'Panel sin configurar' };

  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: auth }
  });
  if (!res.ok) return { ok: false, code: 401, msg: 'Sesión inválida' };

  const user = await res.json();
  const email = (user?.email || '').toLowerCase();

  const rpc = await fetch(`${url}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: key, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}'
  });

  // Si la verificación no se puede hacer, NO se deja pasar. Un error de red no
  // puede convertirse en un permiso concedido.
  if (!rpc.ok) {
    return { ok: false, code: 503, msg: 'No se pudo verificar el permiso: ' + (await rpc.text()) };
  }
  if ((await rpc.json()) !== true) {
    return { ok: false, code: 403, msg: `${email} no es admin` };
  }

  return { ok: true, email };
}

// ── Herramientas comunes ────────────────────────────────────────────────────

/** Consulta que NO tumba al negocio entero si falla. Un nombre de columna que
 *  cambió no puede dejar en blanco todo el panel: se registra el hueco y se
 *  sigue con el resto. */
async function qSafe(url, key, path, huecos, queEs) {
  try {
    return await q(url, key, path);
  } catch (e) {
    huecos.push(`No se pudo leer ${queEs}: ${e instanceof Error ? e.message : 'error'}`);
    return [];
  }
}

const mesDe = (iso) => String(iso || '').substring(0, 7);

/** Agrupa importes por mes. Devuelve { '2026-07': centavos, ... } */
function porMes(filas, campoFecha, centavosDe) {
  const out = {};
  for (const f of filas) {
    const m = mesDe(f[campoFecha]);
    if (!/^\d{4}-\d{2}$/.test(m)) continue;
    out[m] = (out[m] || 0) + centavosDe(f);
  }
  return out;
}

/** Cuenta ocurrencias de un campo. Devuelve [{l, v}] ordenado de mayor a menor. */
function contarPor(filas, campo, etiqueta = (x) => x || '(sin dato)') {
  const acc = {};
  for (const f of filas) {
    const k = etiqueta(f[campo]);
    acc[k] = (acc[k] || 0) + 1;
  }
  return Object.entries(acc)
    .map(([l, v]) => ({ l, v }))
    .sort((a, b) => b.v - a.v);
}

/** La moneda en la que más dinero hay. NO se convierte nada: los precios son
 *  fijos por mercado. Si hay más de una, se declara como hueco en vez de
 *  sumarlas, que daría un número inventado. */
function monedaDominante(filas, huecos, queEs) {
  const porMoneda = {};
  for (const f of filas) {
    const m = (f.moneda || 'MXN').toUpperCase();
    porMoneda[m] = (porMoneda[m] || 0) + Math.abs(Number(f.monto_centavos) || 0);
  }
  const monedas = Object.keys(porMoneda);
  if (monedas.length > 1) {
    const detalle = monedas.map((m) => `${m} ${(porMoneda[m] / 100).toFixed(0)}`).join(' · ');
    huecos.push(`${queEs} en varias monedas (${detalle}). Se muestra solo la principal: sumarlas daría un número falso.`);
  }
  return monedas.sort((a, b) => porMoneda[b] - porMoneda[a])[0] || 'MXN';
}

// ── Adaptadores: cada negocio → su radiografía ──────────────────────────────

/** SALA — SaaS de gyms. Lo que SALA cobra a sus tenants. */
async function leerSala(desdeISO) {
  const url = env('SB_SALA_URL');
  const key = env('SB_SALA_SERVICE_KEY');
  if (!url || !key) return { huecos: ['Sin configurar'] };

  const huecos = [];

  // El dinero de SALA. NO es `pagos`: eso es lo que los socios pagan a los
  // gyms, volumen que pasa por la plataforma pero no es ingreso propio.
  const movs = await qSafe(url, key,
    `movimientos_dinero?select=ocurrido_en,monto_centavos,moneda,concepto,tenant_id&negocio=eq.sala&order=ocurrido_en.desc&limit=5000`,
    huecos, 'el libro de cobros');

  const subs = await qSafe(url, key,
    `suscripciones_saas?select=tenant_id,tier,estado,moneda,ciclo,precio_centavos,trial_termina,payment_past_due,stripe_subscription_id&limit=2000`,
    huecos, 'las suscripciones');

  const tenants = await qSafe(url, key,
    `tenants?select=id,slug,created_at,status&limit=2000`, huecos, 'los tenants');

  // El demo contamina todo: tiene suscripción falsa y socios sembrados.
  const demo = new Set(tenants.filter((t) => t.slug === 'healthyspace').map((t) => t.id));
  const subsReales = subs.filter((s) => !demo.has(s.tenant_id));

  const moneda = monedaDominante(movs, huecos, 'Los cobros');
  const ingresoPorMes = porMes(movs.filter((m) => (m.moneda || 'MXN').toUpperCase() === moneda),
    'ocurrido_en', (m) => Number(m.monto_centavos) || 0);

  if (movs.length === 0) {
    huecos.push('El libro de cobros está vacío: se llena desde que Stripe cobra. Las facturas anteriores necesitan correr el backfill.');
  }

  // MRR comprometido: lo que deberían pagar los activos. Distinto del cobrado.
  const activas = subsReales.filter((s) => s.estado === 'activa');
  const mrrCentavos = activas
    .filter((s) => (s.moneda || 'mxn').toUpperCase() === moneda)
    .reduce((t, s) => t + (s.ciclo === 'anual' ? Math.round(Number(s.precio_centavos) / 12) : Number(s.precio_centavos) || 0), 0);

  const trials = subsReales.filter((s) => s.estado === 'trial');
  const sinTarjeta = trials.filter((s) => !s.stripe_subscription_id || String(s.stripe_subscription_id).startsWith('mock_'));
  const morosos = subsReales.filter((s) => s.payment_past_due);

  if (morosos.length > 0) {
    huecos.push(`${morosos.length} gym(s) con pago vencido siguen contando como activos: la gracia no les baja el acceso.`);
  }

  return {
    moneda,
    ingresoPorMes,
    metricas: [
      { l: 'MRR comprometido', v: mrrCentavos, tipo: 'dinero' },
      { l: 'Gyms pagando', v: activas.length, tipo: 'num' },
      { l: 'En prueba', v: trials.length, tipo: 'num' },
      { l: 'Con pago vencido', v: morosos.length, tipo: 'num', alerta: morosos.length > 0 }
    ],
    desgloses: [
      { t: 'Por plan', filas: contarPor(subsReales, 'tier') },
      { t: 'Por estado', filas: contarPor(subsReales, 'estado') },
      {
        t: 'Pruebas',
        filas: [
          { l: 'con tarjeta puesta', v: trials.length - sinTarjeta.length },
          { l: 'sin tarjeta', v: sinTarjeta.length }
        ]
      },
      { t: 'Altas de gym por mes', filas: mesesRecientes(porMes(tenants.filter((t) => !demo.has(t.id)), 'created_at', () => 1)) }
    ],
    huecos
  };
}

/** HEALTHY SPACE — food trucks. El mejor instrumentado del grupo. */
async function leerHealthy(desdeISO) {
  const url = env('SB_HEALTHY_URL');
  const key = env('SB_HEALTHY_SERVICE_KEY');
  if (!url || !key) return { huecos: ['Sin configurar'] };

  const huecos = [];

  const pedidos = await qSafe(url, key,
    `truck_orders?select=total,payment_method,channel,branch,status,created_at,items&created_at=gte.${desdeISO}&order=created_at.desc&limit=5000`,
    huecos, 'los pedidos');

  // Se cuenta como venta lo ENTREGADO, igual que el P&L del propio negocio
  // (`estado_resultados`). Contar los pedidos abiertos adelanta el ingreso
  // contra un costo que todavía no se asentó, e infla el margen del día.
  const vendidos = pedidos.filter((p) => p.status === 'entregado' || p.status === 'recogido');
  const enCurso = pedidos.filter((p) => p.status !== 'cancelado' && !vendidos.includes(p));

  const centavosDe = (p) => Math.round(Number(p.total || 0) * 100);
  const ingresoPorMes = porMes(vendidos, 'created_at', centavosDe);
  const totalVendido = vendidos.reduce((t, p) => t + centavosDe(p), 0);
  const ticket = vendidos.length ? Math.round(totalVendido / vendidos.length) : 0;

  const gastos = await qSafe(url, key,
    `truck_gastos?select=monto,fecha,categoria&limit=5000`, huecos, 'los gastos');
  const compras = await qSafe(url, key,
    `truck_compras?select=total,created_at,pagada&limit=5000`, huecos, 'las compras');

  // Top productos: hay que desarmar el jsonb de cada pedido.
  const porProducto = {};
  for (const p of vendidos) {
    for (const it of Array.isArray(p.items) ? p.items : []) {
      const n = it?.name || '(sin nombre)';
      const q2 = Number(it?.qty) || 0;
      if (!porProducto[n]) porProducto[n] = { unidades: 0, centavos: 0 };
      porProducto[n].unidades += q2;
      porProducto[n].centavos += Math.round((Number(it?.price) || 0) * q2 * 100);
    }
  }
  const topProductos = Object.entries(porProducto)
    .map(([l, d]) => ({ l, v: d.unidades, monto: d.centavos }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);

  // Horario pico: en hora local. `created_at::date` en UTC corta a las 17:00
  // hora de Culiacán, en plena cena, y parte el día por la mitad.
  const porHora = {};
  for (const p of vendidos) {
    const h = new Date(new Date(p.created_at).toLocaleString('en-US', { timeZone: 'America/Mazatlan' })).getHours();
    porHora[h] = (porHora[h] || 0) + 1;
  }
  const horasPico = Object.entries(porHora)
    .map(([h, v]) => ({ l: `${h}:00`, v }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 5);

  if (enCurso.length > 0) {
    huecos.push(`${enCurso.length} pedido(s) abiertos no cuentan como venta todavía: se cuentan al entregarse.`);
  }
  huecos.push('Los pedidos son anónimos salvo los del Club: no hay retención ni LTV del truck.');

  return {
    moneda: 'MXN',
    ingresoPorMes,
    metricas: [
      { l: 'Vendido (90 días)', v: totalVendido, tipo: 'dinero' },
      { l: 'Pedidos entregados', v: vendidos.length, tipo: 'num' },
      { l: 'Ticket promedio', v: ticket, tipo: 'dinero' },
      { l: 'Gastos cargados', v: Math.round(gastos.reduce((t, g) => t + Number(g.monto || 0), 0) * 100), tipo: 'dinero' }
    ],
    desgloses: [
      { t: 'Productos más vendidos', filas: topProductos },
      { t: 'Por remolque', filas: contarPor(vendidos, 'branch') },
      { t: 'Por forma de pago', filas: contarPor(vendidos, 'payment_method') },
      { t: 'Horas con más pedidos', filas: horasPico },
      { t: 'Gastos por categoría', filas: agrupaMonto(gastos, 'categoria', (g) => Math.round(Number(g.monto || 0) * 100)) },
      { t: 'Compras sin pagar', filas: [
        { l: 'pendientes', v: compras.filter((c) => !c.pagada).length,
          monto: Math.round(compras.filter((c) => !c.pagada).reduce((t, c) => t + Number(c.total || 0), 0) * 100) }
      ] }
    ],
    huecos
  };
}

/** HSC — suscripción B2C del Club. */
async function leerHsc() {
  const url = env('SB_HEALTHY_URL'); // comparte proyecto con los food trucks
  const key = env('SB_HEALTHY_SERVICE_KEY');
  if (!url || !key) return { huecos: ['Sin configurar'] };

  const huecos = [];

  const movs = await qSafe(url, key,
    `movimientos_dinero?select=ocurrido_en,monto_centavos,moneda,concepto,cliente_id&negocio=eq.hsc&order=ocurrido_en.desc&limit=5000`,
    huecos, 'el libro de cobros');

  const perfiles = await qSafe(url, key,
    `user_profiles?select=user_id,subscription_status,payment_past_due,billing_cycle,created_at&limit=5000`,
    huecos, 'los perfiles');

  const moneda = monedaDominante(movs, huecos, 'Los cobros');
  const ingresoPorMes = porMes(movs.filter((m) => (m.moneda || 'MXN').toUpperCase() === moneda),
    'ocurrido_en', (m) => Number(m.monto_centavos) || 0);

  if (movs.length === 0) {
    huecos.push('El libro de cobros está vacío: se llena desde que Stripe cobra. Las facturas anteriores necesitan correr el backfill.');
  }

  const suscritos = perfiles.filter((p) => p.subscription_status === 'pro');
  const morosos = perfiles.filter((p) => p.payment_past_due);
  const pagando = suscritos.length - morosos.filter((p) => p.subscription_status === 'pro').length;

  // Cuánto vale cada socio, calculado de lo COBRADO, no de una lista de precios.
  const socios = new Set(movs.map((m) => m.cliente_id).filter(Boolean));
  const totalCobrado = movs.reduce((t, m) => t + (Number(m.monto_centavos) || 0), 0);

  huecos.push('Sin historial de estados: al cancelar se sobrescribe y se pierde que antes estuvo activo. No hay churn ni cohortes.');

  return {
    moneda,
    ingresoPorMes,
    metricas: [
      { l: 'Suscriptores', v: suscritos.length, tipo: 'num' },
      { l: 'Pagando al día', v: pagando, tipo: 'num' },
      { l: 'Con pago vencido', v: morosos.length, tipo: 'num', alerta: morosos.length > 0 },
      { l: 'Cobrado por socio', v: socios.size ? Math.round(totalCobrado / socios.size) : 0, tipo: 'dinero' }
    ],
    desgloses: [
      { t: 'Por estado', filas: contarPor(perfiles, 'subscription_status', (x) => x || 'none') },
      { t: 'Por ciclo de cobro', filas: contarPor(perfiles.filter((p) => p.subscription_status === 'pro'), 'billing_cycle') },
      { t: 'Altas por mes', filas: mesesRecientes(porMes(perfiles, 'created_at', () => 1)) }
    ],
    huecos
  };
}

/** STRYV — clientes de implementación con retainer mensual. */
async function leerStryv() {
  const url = env('SB_STRYV_URL');
  const key = env('SB_STRYV_SERVICE_KEY');
  if (!url || !key) return { huecos: ['Sin configurar'] };

  const huecos = [];

  const movs = await qSafe(url, key,
    `movimientos_dinero?select=ocurrido_en,monto_centavos,moneda,concepto,cliente_id,metadata&negocio=eq.stryv&order=ocurrido_en.desc&limit=5000`,
    huecos, 'el libro de cobros');

  const clientes = await qSafe(url, key,
    `clients?select=id,name,company,stage,mrr,currency,amount,amount_paid,deleted_at&limit=2000`,
    huecos, 'los clientes');
  const vivos = clientes.filter((c) => !c.deleted_at);

  const moneda = monedaDominante(movs, huecos, 'Los cobros');
  const ingresoPorMes = porMes(movs.filter((m) => (m.moneda || 'MXN').toUpperCase() === moneda),
    'ocurrido_en', (m) => Number(m.monto_centavos) || 0);

  // MRR comprometido: solo de los que están en una etapa que factura. Un lead
  // con MRR proyectado escrito a mano NO es MRR.
  const ETAPAS_QUE_FACTURAN = ['En desarrollo', 'Entregado', 'Mantenimiento'];
  const facturando = vivos.filter((c) => ETAPAS_QUE_FACTURAN.includes(c.stage));
  const mrr = facturando
    .filter((c) => (c.currency || 'MXN').toUpperCase() === moneda)
    .reduce((t, c) => t + Math.round((Number(c.mrr) || 0) * 100), 0);

  const proyectado = vivos
    .filter((c) => !ETAPAS_QUE_FACTURAN.includes(c.stage) && Number(c.mrr) > 0);
  if (proyectado.length > 0) {
    huecos.push(`${proyectado.length} cliente(s) fuera de etapa de facturación tienen MRR escrito: se excluyen del MRR real.`);
  }

  // Pendiente de cobro, ya convertido a la misma moneda de cada cliente.
  const pendiente = vivos
    .filter((c) => (c.currency || 'MXN').toUpperCase() === moneda)
    .reduce((t, c) => t + Math.max(0, Math.round(((Number(c.amount) || 0) - (Number(c.amount_paid) || 0)) * 100)), 0);

  // Top clientes por lo COBRADO (del libro), no por lo prometido.
  const porCliente = {};
  for (const m of movs) {
    if (!m.cliente_id) continue;
    porCliente[m.cliente_id] = (porCliente[m.cliente_id] || 0) + (Number(m.monto_centavos) || 0);
  }
  const nombreDe = Object.fromEntries(clientes.map((c) => [c.id, c.company || c.name || '(sin nombre)']));
  const topClientes = Object.entries(porCliente)
    .map(([id, cent]) => ({ l: nombreDe[id] || '(cliente borrado)', v: null, monto: cent }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 8);

  huecos.push('La etapa es una columna mutable: el recorrido Lead→Mantenimiento no deja historia, así que no hay conversión ni ciclo de venta.');

  return {
    moneda,
    ingresoPorMes,
    metricas: [
      { l: 'MRR', v: mrr, tipo: 'dinero' },
      { l: 'Clientes facturando', v: facturando.length, tipo: 'num' },
      { l: 'Pendiente de cobro', v: pendiente, tipo: 'dinero', alerta: pendiente > 0 },
      { l: 'Cobrado (histórico)', v: movs.reduce((t, m) => t + (Number(m.monto_centavos) || 0), 0), tipo: 'dinero' }
    ],
    desgloses: [
      { t: 'Pipeline por etapa', filas: contarPor(vivos, 'stage') },
      { t: 'Quién paga más', filas: topClientes },
      { t: 'Cobros por mes', filas: mesesRecientes(ingresoPorMes, true) }
    ],
    huecos
  };
}

/** Los últimos 6 meses de un mapa {mes: valor}, del más nuevo al más viejo. */
function mesesRecientes(mapa, esDinero = false) {
  return Object.entries(mapa)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 6)
    .map(([l, v]) => (esDinero ? { l, v: null, monto: v } : { l, v }));
}

/** Agrupa sumando importes en vez de contar. */
function agrupaMonto(filas, campo, centavosDe) {
  const acc = {};
  for (const f of filas) {
    const k = f[campo] || '(sin categoría)';
    acc[k] = (acc[k] || 0) + centavosDe(f);
  }
  return Object.entries(acc)
    .map(([l, monto]) => ({ l, v: null, monto }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 8);
}

// ── Handler ─────────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const auth = await autorizar(event);
  if (!auth.ok) return json(auth.code, { error: auth.msg });

  let desde;
  try {
    const body = JSON.parse(event.body || '{}');
    desde = body.desde ? new Date(body.desde) : new Date(Date.now() - 90 * 86400000);
  } catch {
    desde = new Date(Date.now() - 90 * 86400000);
  }
  const desdeISO = desde.toISOString();

  // Cada negocio en su propio try: uno caído no deja ciego al resto.
  const negocios = {};
  for (const [id, fn] of [
    ['sala', () => leerSala(desdeISO)],
    ['healthyspace', () => leerHealthy(desdeISO)],
    ['hsc', () => leerHsc()],
    ['stryv', () => leerStryv()]
  ]) {
    try {
      negocios[id] = await fn();
    } catch (e) {
      console.error(`[consolidado] ${id}`, e instanceof Error ? e.message : e);
      negocios[id] = { huecos: [`No se pudo leer: ${e instanceof Error ? e.message : 'error desconocido'}`] };
    }
  }

  return json(200, { desde: desdeISO, generado_en: new Date().toISOString(), negocios });
};
