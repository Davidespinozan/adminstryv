'use strict';
// SEC-2 · Pruebas sin servicios externos. `fetch` se reemplaza por un doble que
// registra cada llamada; ninguna prueba toca Supabase, Anthropic, Places ni Resend.
// Ejecutar: node --test netlify/functions/_lib/
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FN = path.join(__dirname, '..');
const SB = 'https://sb.test';
const ADMIN_ORIGIN = 'https://adminstryv.netlify.app';

const baseEnv = {
  SB_STRYV_URL: SB,
  SB_STRYV_SERVICE_KEY: 'service-key-de-prueba',
  ANTHROPIC_API_KEY: 'anthropic-key-de-prueba',
  INTERNAL_CRON_TOKEN: 'token-interno-de-prueba',
  URL: ADMIN_ORIGIN,
  AI_FUNCTIONS_DISABLED: '',
};

const realFetch = globalThis.fetch;
let calls;
let script; // decide cada respuesta según la URL

function resp(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

beforeEach(() => {
  Object.assign(process.env, baseEnv);
  calls = [];
  script = {};
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body });
    const u = String(url);
    if (u.startsWith(`${SB}/auth/v1/user`)) return script.user ? script.user() : resp(200, { id: 'uid-admin', email: 'x@y' });
    if (u.startsWith(`${SB}/rest/v1/rpc/is_admin`)) return script.isAdmin ? script.isAdmin() : resp(200, true);
    if (u.startsWith('https://api.anthropic.com')) return script.anthropic ? script.anthropic() : resp(200, { content: [{ type: 'text', text: '{"ok":1}' }], usage: { input_tokens: 1, output_tokens: 1 } });
    throw new Error('fetch inesperado: ' + u);
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

const generate = require(path.join(FN, 'generate.js')).handler;
const generateContent = require(path.join(FN, 'generate-content.js')).handler;
const background = require(path.join(FN, 'prospect-agent-background.js')).handler;
const auth = require('./auth');

const ev = ({ method = 'POST', headers = {}, body = {} } = {}) => ({
  httpMethod: method,
  headers: { origin: ADMIN_ORIGIN, ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const admin = (body) => ev({ headers: { authorization: 'Bearer jwt-valido' }, body });
const parse = (r) => JSON.parse(r.body);
const paidCalls = () => calls.filter((c) => /anthropic\.com|googleapis\.com|resend\.com/.test(c.url));

const HANDLERS = [
  ['generate', generate, { mode: 'manual', data: { name: 'A', business: 'B' } }],
  ['generate-content', generateContent, { input: 'tema' }],
  ['prospect-agent-background', background, { useDb: true, limit: 5 }],
];

for (const [name, handler, okBody] of HANDLERS) {
  test(`${name}: anónimo → 401 y ninguna llamada externa`, async () => {
    const r = await handler(ev({ body: okBody }));
    assert.equal(r.statusCode, 401);
    assert.equal(typeof parse(r).error.message, 'string');
    assert.equal(calls.length, 0);
  });

  test(`${name}: token inválido → 401 sin tocar Anthropic`, async () => {
    script.user = () => resp(401, { message: 'invalid' });
    const r = await handler(admin(okBody));
    assert.equal(r.statusCode, 401);
    assert.equal(paidCalls().length, 0);
  });

  test(`${name}: autenticado sin perfil (is_admin=false) → 403`, async () => {
    script.isAdmin = () => resp(200, false);
    const r = await handler(admin(okBody));
    assert.equal(r.statusCode, 403);
    assert.equal(paidCalls().length, 0);
  });

  test(`${name}: Supabase caído → 503, nunca 200`, async () => {
    script.user = () => { throw new Error('ECONNRESET'); };
    let r = await handler(admin(okBody));
    assert.equal(r.statusCode, 503);
    script.user = undefined;
    script.isAdmin = () => resp(500, {});
    r = await handler(admin(okBody));
    assert.equal(r.statusCode, 503);
    assert.equal(paidCalls().length, 0);
  });

  test(`${name}: interruptor AI_FUNCTIONS_DISABLED → 503 antes de cualquier llamada`, async () => {
    process.env.AI_FUNCTIONS_DISABLED = 'true';
    const r = await handler(admin(okBody));
    assert.equal(r.statusCode, 503);
    assert.equal(calls.length, 0);
  });

  test(`${name}: GET → 405`, async () => {
    const r = await handler(ev({ method: 'GET' }));
    assert.equal(r.statusCode, 405);
  });

  test(`${name}: preflight con origen permitido → 204 con CORS; origen ajeno → sin CORS`, async () => {
    let r = await handler(ev({ method: 'OPTIONS' }));
    assert.equal(r.statusCode, 204);
    assert.equal(r.headers['Access-Control-Allow-Origin'], ADMIN_ORIGIN);
    r = await handler(ev({ method: 'OPTIONS', headers: { origin: 'https://evil.example' } }));
    assert.equal(r.statusCode, 204);
    assert.equal(r.headers['Access-Control-Allow-Origin'], undefined);
    const denied = await handler(ev({ headers: { origin: 'https://evil.example' }, body: okBody }));
    assert.equal(denied.statusCode, 401);
    assert.equal(denied.headers['Access-Control-Allow-Origin'], undefined);
  });

  test(`${name}: admin con dryRun → 200 {authorized:true} sin costo`, async () => {
    const r = await handler(admin({ ...okBody, dryRun: true }));
    assert.equal(r.statusCode, 200);
    assert.equal(parse(r).authorized, true);
    assert.equal(paidCalls().length, 0);
  });

  test(`${name}: dryRun NO es un bypass: anónimo con dryRun → 401`, async () => {
    const r = await handler(ev({ body: { ...okBody, dryRun: true } }));
    assert.equal(r.statusCode, 401);
    assert.equal(calls.length, 0);
  });
}

test('generate: validaciones → 400 (JSON inválido, mode, data)', async () => {
  assert.equal((await generate(admin('{nope'))).statusCode, 400);
  assert.equal((await generate(admin({ mode: 'prompt', prompt: 'libre' }))).statusCode, 400);
  assert.equal((await generate(admin({ mode: 'manual', data: [1, 2] }))).statusCode, 400);
  assert.equal((await generate(admin({ mode: 'manual', data: { name: 'x'.repeat(1001) } }))).statusCode, 400);
  assert.equal((await generate(admin({ mode: 'manual', data: { 'bad key': 'x' } }))).statusCode, 400);
  assert.equal(paidCalls().length, 0);
});

test('generate-content: validaciones → 400 (input requerido, demasiado largo)', async () => {
  const r1 = await generateContent(admin({ input: '' }));
  assert.equal(r1.statusCode, 400);
  assert.equal(parse(r1).error.message, 'Input requerido');
  const r2 = await generateContent(admin({ input: 'x'.repeat(2001) }));
  assert.equal(r2.statusCode, 400);
  assert.equal(paidCalls().length, 0);
});

test('generate: éxito conserva el contrato (objeto crudo de Anthropic) y usa el modelo original', async () => {
  const r = await generate(admin({ mode: 'manual', data: { name: 'Ana', business: 'Café' } }));
  assert.equal(r.statusCode, 200);
  const body = parse(r);
  assert.equal(body.content[0].type, 'text');
  assert.ok(body.usage);
  const call = calls.find((c) => c.url.includes('anthropic.com'));
  assert.equal(call.headers['x-api-key'], 'anthropic-key-de-prueba');
  assert.equal(JSON.parse(opts(call)).model, 'claude-sonnet-4-20250514');
  assert.equal(r.headers['Access-Control-Allow-Origin'], ADMIN_ORIGIN);
});

function opts(call) { return call.body || '{}'; }
test('generate: el cuerpo enviado a Anthropic respeta max_tokens y el prompt', async () => {
  await generate(admin({ mode: 'agent', data: { name: 'Ana' } }));
  const sent = JSON.parse(calls.find((c) => c.url.includes('anthropic.com')).body);
  assert.equal(sent.max_tokens, 3000);
  assert.equal(sent.model, 'claude-haiku-4-5-20251001');
  assert.match(sent.messages[0].content, /Ana/);
});

test('generate-content: error de Anthropic → 502 sin cuerpo crudo; timeout → 504', async () => {
  script.anthropic = () => resp(500, { type: 'error', error: { type: 'api_error', message: 'detalle interno secreto' } });
  let r = await generateContent(admin({ input: 'tema' }));
  assert.equal(r.statusCode, 502);
  assert.doesNotMatch(r.body, /secreto|api_error/);
  script.anthropic = () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; };
  r = await generateContent(admin({ input: 'tema' }));
  assert.equal(r.statusCode, 504);
});

test('prospect-agent-background: cron sin token → 401; token incorrecto → 401; token válido → 200 paused sin costo', async () => {
  let r = await background(ev({ body: { useDb: true } }));
  assert.equal(r.statusCode, 401);
  r = await background(ev({ headers: { 'x-internal-token': 'otro' }, body: { useDb: true } }));
  assert.equal(r.statusCode, 401);
  r = await background(ev({ headers: { 'X-Internal-Token': 'token-interno-de-prueba' }, body: { useDb: true } }));
  assert.equal(r.statusCode, 200);
  assert.equal(parse(r).paused, true);
  assert.equal(calls.length, 0);
});

test('prospect-agent-background: token interno sin variable configurada → 503 (camino cerrado)', async () => {
  process.env.INTERNAL_CRON_TOKEN = '';
  const r = await background(ev({ headers: { 'x-internal-token': 'lo-que-sea' }, body: {} }));
  assert.equal(r.statusCode, 503);
  assert.equal(calls.length, 0);
});

test('prospect-agent-background: admin autorizado → 200 paused; la pausa sigue vigente', async () => {
  const r = await background(admin({ useDb: true }));
  assert.equal(r.statusCode, 200);
  assert.equal(parse(r).paused, true);
  assert.equal(paidCalls().length, 0);
});

test('auth.verifyInternalToken compara en tiempo constante y nunca acepta vacío', () => {
  assert.equal(auth.verifyInternalToken({ headers: {} }).code, 401);
  assert.equal(auth.verifyInternalToken({ headers: { 'x-internal-token': '' } }).code, 401);
  assert.equal(auth.verifyInternalToken({ headers: { 'x-internal-token': 'token-interno-de-prueba' } }).ok, true);
});

test('auth.allowedOrigins incluye URL y DEPLOY_PRIME_URL y no refleja otros', () => {
  process.env.DEPLOY_PRIME_URL = 'https://deploy-preview-7--adminstryv.netlify.app/';
  const set = auth.allowedOrigins();
  assert.ok(set.has('https://deploy-preview-7--adminstryv.netlify.app'));
  assert.ok(!set.has('https://evil.example'));
  delete process.env.DEPLOY_PRIME_URL;
});

test('prospect-cron.js envía X-Internal-Token, no lo registra y conserva AGENT_PAUSED', () => {
  const src = fs.readFileSync(path.join(FN, 'prospect-cron.js'), 'utf8');
  assert.match(src, /"X-Internal-Token": internalToken/);
  assert.match(src, /const AGENT_PAUSED = true/);
  assert.doesNotMatch(src, /console\.(log|error)\([^)]*internalToken/);
});

test('AGENT_PAUSED permanece en las cuatro funciones programadas', () => {
  for (const f of ['content-agent.js', 'prospect-agent-background.js', 'prospect-cron.js', 'warmup-check.js']) {
    assert.match(fs.readFileSync(path.join(FN, f), 'utf8'), /const AGENT_PAUSED = true;/, f);
  }
});

test('index.html: las tres llamadas llevan JWT y no queda el reintento automático', () => {
  const html = fs.readFileSync(path.join(FN, '..', '..', 'index.html'), 'utf8');
  for (const f of ['generate"', 'generate-content"', 'prospect-agent-background"']) {
    const i = html.indexOf('/.netlify/functions/' + f);
    assert.ok(i > 0, f);
    assert.match(html.slice(i, i + 120), /headers:await aiHeaders\(\)/, f);
  }
  assert.doesNotMatch(html, /genContent\(2\)/);
  assert.match(html, /"Authorization":"Bearer "\+session\.access_token/);
});

// ─── Regresiones SEC-2E ─────────────────────────────────────────────────────
test('generate y generate-content NUNCA aceptan X-Internal-Token: con token interno válido → 401', async () => {
  for (const [handler, body] of [[generate, { mode: 'manual', data: {} }], [generateContent, { input: 'x' }]]) {
    const r = await handler(ev({ headers: { 'x-internal-token': 'token-interno-de-prueba' }, body }));
    assert.equal(r.statusCode, 401);
  }
  assert.equal(calls.length, 0);
});

test('token caducado o sesión revocada (auth/v1/user → 401/403) → 401, sin consultar is_admin', async () => {
  for (const code of [401, 403]) {
    calls.length = 0;
    script.user = () => resp(code, { message: 'expired' });
    const r = await generate(admin({ mode: 'manual', data: {} }));
    assert.equal(r.statusCode, 401);
    assert.equal(calls.filter((c) => c.url.includes('is_admin')).length, 0);
  }
});

test('is_admin devuelve algo distinto de true (null, "true", 1) → 403 siempre', async () => {
  for (const v of [null, 'true', 1, { ok: true }]) {
    script.isAdmin = () => resp(200, v);
    const r = await generateContent(admin({ input: 'x' }));
    assert.equal(r.statusCode, 403, String(v));
  }
  assert.equal(paidCalls().length, 0);
});

test('usuario sin id en la respuesta de auth → 401', async () => {
  script.user = () => resp(200, { email: 'sin-id@x' });
  const r = await generate(admin({ mode: 'manual', data: {} }));
  assert.equal(r.statusCode, 401);
});

test('background: X-Internal-Token tiene prioridad y si es inválido no rescata el JWT → 401', async () => {
  const r = await background(ev({ headers: { authorization: 'Bearer jwt-valido', 'x-internal-token': 'malo' }, body: {} }));
  assert.equal(r.statusCode, 401);
  assert.equal(calls.length, 0);
});

test('interruptor: valores no afirmativos no apagan ("false", "0", "")', async () => {
  for (const v of ['false', '0', '', 'off']) {
    process.env.AI_FUNCTIONS_DISABLED = v;
    const r = await generate(admin({ mode: 'manual', data: {}, dryRun: true }));
    assert.equal(r.statusCode, 200, JSON.stringify(v));
  }
});

test('ninguna respuesta de error incluye claves, cuerpos del proveedor ni el token interno', async () => {
  script.anthropic = () => resp(401, { error: { message: 'invalid x-api-key anthropic-key-de-prueba' } });
  const r = await generate(admin({ mode: 'manual', data: {} }));
  assert.equal(r.statusCode, 502);
  assert.doesNotMatch(r.body, /anthropic-key-de-prueba|service-key-de-prueba|token-interno-de-prueba|x-api-key/);
  const r2 = await background(ev({ headers: { 'x-internal-token': 'malo' }, body: {} }));
  assert.doesNotMatch(r2.body, /token-interno-de-prueba/);
});

// ─── SEC-2I · Observabilidad del background ──────────────────────────────────
// Captura console.log/console.error durante cada invocación y extrae la línea
// "prospect-agent-background: gate {...}".
async function conLogs(fn) {
  const lines = [];
  const origLog = console.log, origErr = console.error;
  console.log = (...a) => lines.push(a.map(String).join(' '));
  console.error = (...a) => lines.push(a.map(String).join(' '));
  try { const r = await fn(); return { r, lines }; } finally { console.log = origLog; console.error = origErr; }
}
const gateLines = (lines) => lines.filter((l) => l.startsWith('prospect-agent-background: gate ')).map((l) => JSON.parse(l.slice('prospect-agent-background: gate '.length)));
const SENSIBLES = /jwt-valido|token-interno-de-prueba|anthropic-key-de-prueba|service-key-de-prueba|x@y|Bearer |useDb/;

test('bg obs: anónimo → una línea DENIED 401 auth=NONE', async () => {
  const { r, lines } = await conLogs(() => background(ev({ body: { useDb: true } })));
  assert.equal(r.statusCode, 401);
  const g = gateLines(lines);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0], { result: 'DENIED', code: 401, auth: 'NONE' });
  assert.equal(calls.length, 0);
});

test('bg obs: token inválido → DENIED 401 auth=JWT', async () => {
  script.user = () => resp(401, {});
  const { lines } = await conLogs(() => background(admin({ useDb: true })));
  assert.deepEqual(gateLines(lines), [{ result: 'DENIED', code: 401, auth: 'JWT' }]);
  assert.equal(paidCalls().length, 0);
});

test('bg obs: usuario sin perfil → DENIED 403 auth=JWT', async () => {
  script.isAdmin = () => resp(200, false);
  const { lines } = await conLogs(() => background(admin({ useDb: true })));
  assert.deepEqual(gateLines(lines), [{ result: 'DENIED', code: 403, auth: 'JWT' }]);
});

test('bg obs: servicio de autenticación caído → ERROR 503', async () => {
  script.user = () => { throw new Error('ECONNRESET'); };
  const { lines } = await conLogs(() => background(admin({ useDb: true })));
  assert.deepEqual(gateLines(lines), [{ result: 'ERROR', code: 503, auth: 'JWT' }]);
});

test('bg obs: interruptor activo → DISABLED 503, sin consultar nada', async () => {
  process.env.AI_FUNCTIONS_DISABLED = 'true';
  const { lines } = await conLogs(() => background(admin({ useDb: true })));
  assert.deepEqual(gateLines(lines), [{ result: 'DISABLED', code: 503, auth: 'JWT' }]);
  assert.equal(calls.length, 0);
});

test('bg obs: token interno correcto alcanza PAUSED con auth=INTERNAL uid=cron', async () => {
  const { r, lines } = await conLogs(() => background(ev({ headers: { 'x-internal-token': 'token-interno-de-prueba' }, body: { useDb: true } })));
  assert.equal(parse(r).paused, true);
  assert.deepEqual(gateLines(lines), [{ result: 'PAUSED', code: 200, auth: 'INTERNAL', uid: 'cron' }]);
  assert.equal(calls.length, 0);
});

test('bg obs: token interno incorrecto → DENIED 401 auth=INTERNAL y nunca PAUSED', async () => {
  const { lines } = await conLogs(() => background(ev({ headers: { 'x-internal-token': 'malo' }, body: { useDb: true } })));
  const g = gateLines(lines);
  assert.deepEqual(g, [{ result: 'DENIED', code: 401, auth: 'INTERNAL' }]);
  assert.ok(!lines.some((l) => /PAUSED/.test(l)));
});

test('bg obs: admin con dryRun → ALLOWED dryRun, sin PAUSED; preflight no registra', async () => {
  let out = await conLogs(() => background(admin({ dryRun: true })));
  assert.deepEqual(gateLines(out.lines), [{ result: 'ALLOWED', code: 200, auth: 'JWT', uid: 'uid-admin', dryRun: true }]);
  out = await conLogs(() => background(ev({ method: 'OPTIONS' })));
  assert.equal(gateLines(out.lines).length, 0);
});

test('bg obs: ningún log contiene credenciales, correos ni payloads', async () => {
  const casos = [
    () => background(ev({ body: { useDb: true, searches: [{ query: 'secreto-payload', city: 'X' }] } })),
    () => background(admin({ useDb: true })),
    () => background(ev({ headers: { 'x-internal-token': 'token-interno-de-prueba' }, body: { useDb: true } })),
    () => background(ev({ headers: { 'x-internal-token': 'malo' }, body: {} })),
  ];
  for (const c of casos) {
    const { lines } = await conLogs(c);
    for (const l of lines) { assert.doesNotMatch(l, SENSIBLES, l); assert.doesNotMatch(l, /secreto-payload/, l); }
  }
});

test('bg obs: ningún intento denegado invoca Anthropic, Places ni Resend', async () => {
  script.isAdmin = () => resp(200, false);
  await background(admin({ useDb: true, searches: [{ query: 'a', city: 'b' }] }));
  await background(ev({ headers: { 'x-internal-token': 'malo' }, body: { useDb: true } }));
  await background(ev({ body: { useDb: true } }));
  assert.equal(paidCalls().length, 0);
});
