'use strict';
// ============================================================================
// SEC-2 · Autenticación, autorización, CORS e interruptor para las funciones
// que generan costo (Anthropic, Google Places). Fail-closed en todos los
// caminos: ante cualquier duda, se deniega.
// ----------------------------------------------------------------------------
// Reproduce el mecanismo de `consolidado.js` (JWT del usuario validado contra
// Supabase Auth + RPC is_admin con ese mismo JWT) sin modificar aquel archivo.
// Un usuario sin perfil en `profiles` obtiene is_admin() = false → 403. Eso
// cubre también las cuentas creadas por HOGAR, que comparten el proyecto.
// ============================================================================

const crypto = require('crypto');

const env = (k) => (process.env[k] || '').trim();
const AUTH_TIMEOUT_MS = 8000;

// ─── CORS ───────────────────────────────────────────────────────────────────
// Lista blanca: el sitio publicado, la URL del deploy actual (incluye Deploy
// Previews) y, opcionalmente, ADMIN_ALLOWED_ORIGINS separado por comas.
// Nunca se refleja un Origin desconocido. CORS no autentica: solo decide si el
// navegador puede leer la respuesta.
function allowedOrigins() {
  const set = new Set(['https://adminstryv.netlify.app']);
  for (const k of ['URL', 'DEPLOY_PRIME_URL', 'DEPLOY_URL']) {
    const v = env(k);
    if (v) set.add(v.replace(/\/+$/, ''));
  }
  env('ADMIN_ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean).forEach((o) => set.add(o));
  return set;
}

function header(event, name) {
  const h = (event && event.headers) || {};
  const lower = name.toLowerCase();
  for (const k of Object.keys(h)) if (k.toLowerCase() === lower) return h[k] || '';
  return '';
}

function corsHeaders(event) {
  const origin = header(event, 'origin');
  if (origin && allowedOrigins().has(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    };
  }
  return {};
}

function json(statusCode, body, event) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(event) },
    body: JSON.stringify(body),
  };
}

// Forma de error que el panel viejo ya sabe leer: { error: { message } }.
function fail(statusCode, message, event) {
  return json(statusCode, { error: { message } }, event);
}

function preflight(event) {
  return { statusCode: 204, headers: corsHeaders(event), body: '' };
}

// ─── Interruptor de emergencia ──────────────────────────────────────────────
// Cualquier valor afirmativo apaga. Un valor raro o vacío no enciende nada:
// solo "true/1/yes/on" apaga, y la ausencia de la variable deja todo como está.
function aiDisabled() {
  return /^(1|true|yes|on)$/i.test(env('AI_FUNCTIONS_DISABLED'));
}

// ─── fetch con timeout ──────────────────────────────────────────────────────
async function fetchWithTimeout(url, options, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await globalThis.fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Autorización humana: JWT de Supabase + is_admin() ──────────────────────
// Devuelve { ok: true, uid } o { ok: false, code, message }.
// 401: sin sesión o sesión inválida · 403: sin permiso · 503: no se pudo verificar.
async function verifyAdmin(event) {
  const auth = header(event, 'authorization');
  if (!/^Bearer\s+\S+$/.test(auth)) return { ok: false, code: 401, message: 'Sesión requerida' };

  const url = env('SB_STRYV_URL');
  const key = env('SB_STRYV_SERVICE_KEY');
  if (!url || !key) return { ok: false, code: 503, message: 'Autorización no configurada' };

  let user;
  try {
    const res = await fetchWithTimeout(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: auth } }, AUTH_TIMEOUT_MS);
    if (res.status === 401 || res.status === 403) return { ok: false, code: 401, message: 'Sesión inválida' };
    if (!res.ok) return { ok: false, code: 503, message: 'No se pudo verificar la sesión' };
    user = await res.json();
  } catch (err) {
    console.error('auth: fallo al validar sesión', err && err.name);
    return { ok: false, code: 503, message: 'No se pudo verificar la sesión' };
  }
  if (!user || typeof user.id !== 'string' || !user.id) return { ok: false, code: 401, message: 'Sesión inválida' };

  // El permiso lo decide la base con el JWT DEL USUARIO: auth.uid() resuelve a
  // quien pide. Nunca se usa un user_id del body.
  try {
    const rpc = await fetchWithTimeout(`${url}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: { apikey: key, Authorization: auth, 'Content-Type': 'application/json' },
      body: '{}',
    }, AUTH_TIMEOUT_MS);
    if (!rpc.ok) {
      console.error('auth: is_admin respondió', rpc.status);
      return { ok: false, code: 503, message: 'No se pudo verificar el permiso' };
    }
    const allowed = await rpc.json();
    if (allowed !== true) return { ok: false, code: 403, message: 'Tu usuario no tiene permiso para esta acción' };
  } catch (err) {
    console.error('auth: fallo al consultar is_admin', err && err.name);
    return { ok: false, code: 503, message: 'No se pudo verificar el permiso' };
  }

  return { ok: true, uid: user.id };
}

// ─── Autorización interna: procesos programados ─────────────────────────────
// Compara X-Internal-Token con INTERNAL_CRON_TOKEN en tiempo constante sobre
// los SHA-256 de ambos (misma longitud siempre). Sin variable → camino cerrado.
function verifyInternalToken(event) {
  const expected = env('INTERNAL_CRON_TOKEN');
  if (!expected) return { ok: false, code: 503, message: 'Token interno no configurado' };
  const given = header(event, 'x-internal-token').trim();
  if (!given) return { ok: false, code: 401, message: 'Token interno requerido' };
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) return { ok: false, code: 401, message: 'Token interno inválido' };
  return { ok: true, uid: 'cron' };
}

// ─── Validación de entrada ──────────────────────────────────────────────────
function parseJsonBody(event) {
  if (!event || typeof event.body !== 'string' || !event.body.trim()) return { ok: false, message: 'Cuerpo requerido' };
  try {
    const body = JSON.parse(event.body);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, message: 'JSON inválido' };
    return { ok: true, body };
  } catch {
    return { ok: false, message: 'JSON inválido' };
  }
}

// `data` de generate: objeto plano, claves alfanuméricas, valores escalares o
// listas de cadenas, cada cadena acotada y el total acotado.
function validateDataObject(data, { maxKeys = 30, maxString = 1000, maxTotal = 6000 } = {}) {
  if (data === undefined) return { ok: true, value: {} };
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, message: 'data debe ser un objeto' };
  const keys = Object.keys(data);
  if (keys.length > maxKeys) return { ok: false, message: 'data tiene demasiados campos' };
  let total = 0;
  const value = {};
  for (const k of keys) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(k)) return { ok: false, message: `Campo inválido: ${k.slice(0, 20)}` };
    const v = data[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string') {
      if (v.length > maxString) return { ok: false, message: `El campo ${k} es demasiado largo` };
      total += v.length; value[k] = v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      value[k] = v;
    } else if (Array.isArray(v)) {
      if (v.length > 50 || !v.every((x) => typeof x === 'string' && x.length <= maxString)) return { ok: false, message: `El campo ${k} es inválido` };
      total += v.join('').length; value[k] = v;
    } else {
      return { ok: false, message: `El campo ${k} es inválido` };
    }
    if (total > maxTotal) return { ok: false, message: 'data es demasiado grande' };
  }
  return { ok: true, value };
}

// ─── Puerta común: método → interruptor → preflight → autorización ──────────
// Devuelve { response } cuando hay que responder ya, o { auth } con la identidad.
// `internal: true` acepta también X-Internal-Token (procesos programados).
async function gate(event, { internal = false } = {}) {
  const method = (event && event.httpMethod) || 'GET';
  if (method === 'OPTIONS') return { response: preflight(event) };
  if (method !== 'POST') return { response: fail(405, 'Método no permitido', event) };
  if (aiDisabled()) return { response: fail(503, 'Funciones de IA desactivadas temporalmente', event) };

  const auth = internal && header(event, 'x-internal-token')
    ? verifyInternalToken(event)
    : await verifyAdmin(event);
  if (!auth.ok) return { response: fail(auth.code, auth.message, event) };
  return { auth };
}

module.exports = {
  gate,
  verifyAdmin,
  verifyInternalToken,
  corsHeaders,
  json,
  fail,
  preflight,
  aiDisabled,
  fetchWithTimeout,
  parseJsonBody,
  validateDataObject,
  allowedOrigins,
};
