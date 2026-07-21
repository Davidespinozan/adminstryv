#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// Corre los adaptadores del consolidado contra las bases REALES y reporta qué
// devolvió cada uno.
//
// POR QUÉ EXISTE: las consultas se escriben contra un esquema que uno cree
// recordar. Un nombre de columna equivocado no rompe nada visible: la consulta
// falla, se registra como hueco, y la tabla aparece vacía — indistinguible de
// un negocio que todavía no operó. Este script hace visible esa diferencia,
// que es la que decide si hay que arreglar código o esperar a que haya datos.
//
// Las claves salen del CLI de Supabase y nunca se imprimen.
//
// USO:
//   node scripts/probar-consolidado.mjs
// ════════════════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const REFS = {
  SALA: 'omrlbvhbggnrwwzlgxji',
  HEALTHY: 'ltveorvqvvlyivjwxjlc',
  STRYV: 'lxpgqhghxfqsahwrdmzo'
};

for (const [nombre, ref] of Object.entries(REFS)) {
  try {
    const salida = execSync(`supabase projects api-keys --project-ref ${ref} -o json`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    });
    const k = JSON.parse(salida).find((x) => x.name === 'service_role');
    if (!k) throw new Error('sin service_role');
    process.env[`SB_${nombre}_SERVICE_KEY`] = k.api_key;
    process.env[`SB_${nombre}_URL`] = `https://${ref}.supabase.co`;
  } catch (e) {
    console.error(`✖ No se pudo leer la clave de ${nombre}: ${e.message}`);
    console.error('  ¿Estás logueado? Probá: supabase login');
    process.exit(1);
  }
}

const require = createRequire(import.meta.url);
const { _adaptadores } = require('../netlify/functions/consolidado.js');

const desde = new Date(Date.now() - 90 * 86400000).toISOString();
const NEGOCIOS = [
  ['SALA', () => _adaptadores.leerSala(desde)],
  ['HEALTHY SPACE', () => _adaptadores.leerHealthy(desde)],
  ['HSC', () => _adaptadores.leerHsc()],
  ['STRYV', () => _adaptadores.leerStryv()]
];

let problemas = 0;

for (const [nombre, fn] of NEGOCIOS) {
  console.log(`\n${'═'.repeat(66)}\n${nombre}\n${'═'.repeat(66)}`);
  let d;
  try {
    d = await fn();
  } catch (e) {
    console.log(`  ✖ REVENTÓ: ${e.message}`);
    problemas++;
    continue;
  }

  const meses = Object.keys(d.ingresoPorMes || {});
  console.log(`  moneda ${d.moneda ?? '—'} · meses con ingreso: ${meses.length}`);

  const metricas = d.metricas || [];
  if (metricas.length) {
    console.log(`\n  MÉTRICAS`);
    for (const m of metricas) console.log(`    ${String(m.l).padEnd(30)} ${m.v}`);
  }

  const tablas = Object.entries(d.tablas || {});
  if (tablas.length) {
    console.log(`\n  TABLAS`);
    for (const [k, t] of tablas) {
      const n = t.filas.length;
      console.log(`    ${k.padEnd(16)} ${n === 0 ? '⚠ VACÍA' : `${n} fila(s)`}`);
      if (n > 0) console.log(`      ej: ${t.filas[0].celdas.join(' · ')}`);
    }
  }

  const senales = d.senales || [];
  if (senales.length) {
    console.log(`\n  AVISOS`);
    for (const s of senales) console.log(`    [${s.nivel}] ${s.que}`);
  }

  // Un hueco que empieza con "No se pudo" NO es un hueco de negocio: es una
  // consulta rota. Son dos cosas distintas y hay que separarlas.
  const rotos = (d.huecos || []).filter((h) => h.startsWith('No se pudo'));
  if (rotos.length) {
    console.log(`\n  ✖ CONSULTAS ROTAS`);
    for (const h of rotos) console.log(`    ${h}`);
    problemas += rotos.length;
  }
}

console.log(`\n${'═'.repeat(66)}`);
console.log(problemas === 0 ? '✓ Ninguna consulta falló.' : `⚠ ${problemas} consulta(s) rotas — hay que arreglar código, no esperar datos.`);