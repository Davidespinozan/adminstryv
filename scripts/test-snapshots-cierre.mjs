#!/usr/bin/env node
// FIX-01 · Regresión del cierre de mes en el panel viejo (index.html).
// Sin dependencias ni servicios externos. Ejecutar: node scripts/test-snapshots-cierre.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'index.html'), 'utf8');
const grab = (name) => { const m = src.match(new RegExp('const ' + name + '=([^\\n]+);\\n')); if (!m) throw new Error('no se encontró ' + name); return m[1]; };
let n = 0; const ok = (msg) => { n++; console.log('PASS', msg); };

// 1. Columnas reales de public.snapshots tras la migración FIX-01 (verdad de la base).
const SNAPSHOT_COLS = new Set(['id','month','mrr_clientes','mrr_academia','costo_equipo','costo_tools','costo_total','utilidad','num_clientes','num_leads','num_alumnos','num_equipo','inversion_mes','created_at','revenue_mes','invertido_mes','clientes_activos','alumnos_activos','team_activos','tools_activos','cobrado_total','costo_stack','notes','costo_ads','stack_terceros','utilidad_caja']);
const buildLine = src.split('\n').find((l) => l.startsWith('const buildSnap='));
const sent = [...buildLine.slice(buildLine.indexOf('return{') + 7).matchAll(/(?:^|,)([a-zA-Z]+):/g)].map((m) => m[1].replace(/([A-Z])/g, (x) => '_' + x.toLowerCase()));
const unknown = sent.filter((k) => !SNAPSHOT_COLS.has(k));
assert.deepEqual(unknown, [], 'buildSnap envía columnas inexistentes: ' + unknown.join(','));
assert.ok(sent.includes('stack_terceros') && sent.includes('utilidad_caja'));
ok('buildSnap solo envía columnas que existen tras la migración (incluye stack_terceros y utilidad_caja)');

// 2. No existe cierre automático: ningún useEffect invoca cerrarMes y autoCloseRef desapareció.
assert.ok(!/autoCloseRef/.test(src), 'autoCloseRef sigue presente');
const effects = src.split('useEffect(').slice(1);
assert.ok(!effects.some((e) => /cerrarMes\(/.test(e.split('},[')[0])), 'un useEffect sigue llamando a cerrarMes');
ok('ningún useEffect llama a cerrarMes (sin cierres automáticos)');

// 3. cerrarMes solo se invoca desde la UI, con el mes en curso.
const calls = [...src.matchAll(/cerrarMes\(([^)]*)\)/g)].map((m) => m[1].trim()).filter((a) => a !== 'targetMo');
assert.deepEqual(calls, [''], 'llamadas inesperadas a cerrarMes: ' + JSON.stringify(calls));
assert.ok(/onClick=\{\(\)=>cerrarMes\(\)\}/.test(src), 'falta el botón explícito');
ok('cerrarMes solo se invoca desde el botón "Cerrar <mes actual>"');

// 4. cerrarMes rechaza meses pasados y comprueba el resultado del insert.
const cerrar = src.slice(src.indexOf('const cerrarMes=async(targetMo)=>{'), src.indexOf('const mesesPendientes='));
assert.ok(/targetMo&&targetMo!==mo/.test(cerrar) && /retroactivamente/.test(cerrar), 'no rechaza meses pasados');
assert.ok(/const res=await dIns\("snapshots",buildSnap\(mo\)\)/.test(cerrar) && /if\(!res\)return false/.test(cerrar), 'no verifica el insert');
ok('cerrarMes rechaza cierres retroactivos y no anuncia éxito si el insert falla');

// 5. mesesSinCierre: helper puro.
const mesesSinCierre = eval(grab('mesesSinCierre'));
assert.deepEqual(mesesSinCierre('2026-03', '2026-10', [{ month: '2026-03' }, { month: '2026-04' }, { month: '2026-05' }, { month: '2026-06' }]), ['2026-07', '2026-08', '2026-09']);
assert.deepEqual(mesesSinCierre('2026-10', '2026-10', []), [], 'el mes actual nunca es pendiente');
assert.deepEqual(mesesSinCierre('2025-11', '2026-02', []), ['2025-11', '2025-12', '2026-01'], 'cruce de año');
assert.deepEqual(mesesSinCierre(null, '2026-10', []), []);
ok('mesesSinCierre: meses anteriores sin cierre, cruce de año, sin datos');

// 6. El aviso de pendientes no dispara escrituras.
assert.ok(/Sin cierre registrado: \{mesesPendientes\.join/.test(src), 'falta el aviso');
assert.ok(!/mesesPendientes[^\n]{0,80}(dIns|cerrarMes)/.test(src), 'el aviso ejecuta escrituras');
ok('el aviso de meses pendientes es solo informativo');

console.log(`\n${n} comprobaciones OK`);
