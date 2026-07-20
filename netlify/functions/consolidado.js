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

// ── Adaptadores: cada negocio → contrato común ──────────────────────────────

/** SALA — SaaS de gyms. Es el más instrumentado: tiene ledger (`pagos`) e
 *  historial (`eventos_estado`). */
async function leerSala(desdeISO) {
  const url = env('SB_SALA_URL');
  const key = env('SB_SALA_SERVICE_KEY');
  if (!url || !key) return { movimientos: [], eventos: [], huecos: ['Sin configurar'] };

  const huecos = [];

  // GMV: todo lo que los gyms le cobran a sus socios. La comisión de SALA es 0,
  // así que esto NO es ingreso propio — es el volumen que pasa por la plataforma.
  const pagos = await q(
    url,
    key,
    `pagos?select=monto_centavos,moneda,concepto,metodo,created_at,tenant_id&created_at=gte.${desdeISO}&order=created_at.desc&limit=5000`
  );

  const movimientos = pagos.map((p) => ({
    negocio: 'sala',
    ocurrido_en: p.created_at,
    monto_centavos: p.monto_centavos,
    moneda: (p.moneda || 'MXN').toUpperCase(),
    concepto: p.concepto,
    metodo: p.metodo,
    cliente_id: p.tenant_id,
    // Marca que esto es volumen de la plataforma, no facturación de SALA.
    es_gmv: true
  }));

  const eventos = (
    await q(
      url,
      key,
      `eventos_estado?select=entidad,entidad_id,de_estado,a_estado,motivo,ocurrido_en&negocio=eq.sala&order=ocurrido_en.desc&limit=5000`
    )
  ).map((e) => ({ ...e, negocio: 'sala' }));

  // Ingreso PROPIO de SALA: todavía no hay ledger del cobro gym→SALA (vive solo
  // en Stripe). Se declara como hueco en vez de estimarlo.
  huecos.push('El ingreso propio de SALA (lo que pagan los gyms) aún no se registra en la base: solo existe en Stripe.');

  return { movimientos, eventos, huecos };
}

/** HEALTHY — food trucks. Tiene ventas reales, no tiene clientes identificados. */
async function leerHealthy(desdeISO) {
  const url = env('SB_HEALTHY_URL');
  const key = env('SB_HEALTHY_SERVICE_KEY');
  if (!url || !key) return { movimientos: [], eventos: [], huecos: ['Sin configurar'] };

  const pedidos = await q(
    url,
    key,
    `truck_orders?select=total,payment_method,channel,branch,status,created_at&created_at=gte.${desdeISO}&order=created_at.desc&limit=5000`
  );

  const movimientos = pedidos
    .filter((p) => p.status !== 'cancelado')
    .map((p) => ({
      negocio: 'healthyspace',
      ocurrido_en: p.created_at,
      // truck_orders.total viene en PESOS, no en centavos: se normaliza acá.
      // Es exactamente el tipo de diferencia que el contrato existe para tapar.
      monto_centavos: Math.round(Number(p.total || 0) * 100),
      moneda: 'MXN',
      concepto: 'venta',
      metodo: p.payment_method || 'desconocido'
    }));

  return {
    movimientos,
    eventos: [],
    huecos: [
      'Los pedidos son anónimos: no hay entidad cliente, así que no hay retención, cohortes ni LTV.',
      'Sin historial de estados (no aplica: no hay suscripción).'
    ]
  };
}

/** HSC — suscripción B2C. Hoy es el menos medible: no guarda ni un monto. */
async function leerHsc() {
  const url = env('SB_HEALTHY_URL'); // comparte proyecto con los food trucks
  const key = env('SB_HEALTHY_SERVICE_KEY');
  if (!url || !key) return { movimientos: [], eventos: [], huecos: ['Sin configurar'] };

  // Lo único medible: cuántos hay en cada estado. Snapshot, sin historia.
  const perfiles = await q(
    url,
    key,
    `user_profiles?select=user_id,subscription_status,payment_past_due&limit=5000`
  );

  const cuenta = perfiles.reduce((acc, p) => {
    const k = p.subscription_status || 'none';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  return {
    movimientos: [],
    eventos: [],
    snapshot: {
      pro: cuenta.pro || 0,
      trial: cuenta.trial || 0,
      none: cuenta.none || 0,
      con_pago_vencido: perfiles.filter((p) => p.payment_past_due).length
    },
    huecos: [
      'NO guarda ningún monto: el webhook ignora los eventos de Stripe que traen dinero. Los ingresos solo existen en Stripe.',
      'Sin historial de estados: al cancelar se sobrescribe y se pierde que antes estuvo activo. No hay churn ni cohortes.'
    ]
  };
}

/** STRYV — clientes de implementación con retainer mensual. */
async function leerStryv() {
  const url = env('SB_STRYV_URL');
  const key = env('SB_STRYV_SERVICE_KEY');
  if (!url || !key) return { movimientos: [], eventos: [], huecos: ['Sin configurar'] };

  const clientes = await q(
    url,
    key,
    `clients?select=id,name,company,stage,mrr,currency,deleted_at&limit=2000`
  );
  const vivos = clientes.filter((c) => !c.deleted_at);

  return {
    movimientos: [],
    eventos: [],
    snapshot: {
      clientes: vivos.length,
      en_mantenimiento: vivos.filter((c) => c.stage === 'Mantenimiento').length,
      mrr: vivos
        .filter((c) => Number(c.mrr) > 0)
        .map((c) => ({ mrr_centavos: Math.round(Number(c.mrr) * 100), moneda: (c.currency || 'MXN').toUpperCase() }))
    },
    huecos: [
      'Los pagos viven dentro del cliente (jsonb), no en un libro contable: no se pueden sumar ni auditar.',
      'La etapa es una columna mutable: el recorrido Lead→Mantenimiento no deja historia.'
    ]
  };
}

// ── Handler ─────────────────────────────────────────────────────────────────
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const auth = await autorizar(event);
  if (!auth.ok) return json(auth.code, { error: auth.msg });

  // Rango: por defecto los últimos 90 días, suficiente para ver el mes actual y
  // comparar con los anteriores sin traerse la historia entera.
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
      negocios[id] = {
        movimientos: [],
        eventos: [],
        huecos: [`No se pudo leer: ${e instanceof Error ? e.message : 'error desconocido'}`]
      };
    }
  }

  return json(200, { desde: desdeISO, generado_en: new Date().toISOString(), negocios });
};