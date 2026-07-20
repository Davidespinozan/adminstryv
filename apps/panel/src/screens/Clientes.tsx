import { useMemo } from 'react';
import { useClientes } from '../data/hooks/useClientes';
import { useTipoCambio } from '../data/hooks/useTipoCambio';
import { ETAPAS_CLIENTE, type EtapaCliente } from '../data/entidades';
import { mrrClientes, porCobrar, sumaPagos, aUSD } from '../data/ops/finanzas';

// ============================================================================
// CLIENTES — el pipeline de implementación y donde vive el MRR de Stryv.
// ============================================================================

const fmt = (usd: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format(usd);

export function Clientes() {
  const { clientes, cargando, error, recargar, moverEtapa } = useClientes();
  const { tc, actualizado, esRespaldo } = useTipoCambio();

  const resumen = useMemo(
    () => ({
      mrr: mrrClientes(clientes, tc),
      porCobrar: porCobrar(clientes, tc),
      enMantenimiento: clientes.filter((c) => c.stage === 'Mantenimiento').length
    }),
    [clientes, tc]
  );

  const porEtapa = useMemo(() => {
    const m = new Map<EtapaCliente, typeof clientes>();
    for (const e of ETAPAS_CLIENTE) m.set(e, []);
    for (const c of clientes) m.get(c.stage)?.push(c);
    return m;
  }, [clientes]);

  if (cargando) return <p style={s.info}>Cargando clientes…</p>;

  // El error se muestra en vez de una lista vacía: no saber y no tener son
  // cosas distintas, y confundirlas en finanzas lleva a decisiones malas.
  if (error) {
    return (
      <div style={s.info}>
        <p style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</p>
        <button style={s.boton} onClick={() => void recargar()}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>STRYV · CLIENTES</p>
          <h1 style={s.h1}>{fmt(resumen.mrr)} <span style={s.h1sub}>de retainer mensual</span></h1>
          <p style={s.nota}>
            {resumen.enMantenimiento} en mantenimiento · {fmt(resumen.porCobrar)} por cobrar ·
            {' '}USD a {tc.mxn} MXN{' '}
            {esRespaldo
              ? '(valor de respaldo: no se pudo consultar)'
              : actualizado
                ? `(al ${actualizado})`
                : ''}
          </p>
        </div>
        <button style={s.boton} onClick={() => void recargar()}>Actualizar</button>
      </header>

      <div style={s.tablero}>
        {ETAPAS_CLIENTE.map((etapa) => {
          const items = porEtapa.get(etapa) ?? [];
          const mrrEtapa = mrrClientes(items, tc);
          return (
            <section key={etapa} style={s.columna}>
              <header style={s.colHead}>
                <span style={s.colTitulo}>{etapa}</span>
                <span style={s.colCuenta}>{items.length}</span>
              </header>
              {mrrEtapa > 0 && <p style={s.colMrr}>{fmt(mrrEtapa)}/mes</p>}

              {items.map((c) => {
                const pagado = aUSD(sumaPagos(c), c.currency, tc);
                const total = aUSD(c.amount, c.currency, tc);
                const pendiente = Math.max(0, total - pagado);
                return (
                  <article key={c.id} style={s.tarjeta}>
                    <p style={s.nombre}>{c.name || '(sin nombre)'}</p>
                    {c.company && <p style={s.empresa}>{c.company}</p>}

                    <div style={s.montos}>
                      {c.mrr > 0 && <span style={s.mrr}>{fmt(aUSD(c.mrr, c.currency, tc))}/mes</span>}
                      {pendiente > 0 && <span style={s.pendiente}>{fmt(pendiente)} pendiente</span>}
                    </div>

                    <select
                      style={s.select}
                      value={c.stage}
                      onChange={(e) => void moverEtapa(c.id, e.target.value as EtapaCliente)}
                    >
                      {ETAPAS_CLIENTE.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </article>
                );
              })}

              {items.length === 0 && <p style={s.vacio}>—</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1400, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif', color: '#111827' },
  info: { padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 22 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6b7280', margin: '0 0 6px' },
  h1: { fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 },
  h1sub: { fontSize: 15, fontWeight: 500, color: '#6b7280' },
  nota: { fontSize: 12.5, color: '#6b7280', margin: '6px 0 0' },
  boton: { padding: '9px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  tablero: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, alignItems: 'start' },
  columna: { background: '#f3f4f6', borderRadius: 10, padding: 10, minHeight: 90 },
  colHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  colTitulo: { fontSize: 12, fontWeight: 700 },
  colCuenta: { fontSize: 11, color: '#6b7280', background: '#fff', borderRadius: 999, padding: '1px 7px' },
  colMrr: { fontSize: 11, color: '#059669', fontWeight: 600, margin: '3px 0 0' },
  tarjeta: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, marginTop: 8 },
  nombre: { fontSize: 13, fontWeight: 600, margin: 0 },
  empresa: { fontSize: 11.5, color: '#6b7280', margin: '1px 0 0' },
  montos: { display: 'flex', flexWrap: 'wrap', gap: 6, margin: '7px 0' },
  mrr: { fontSize: 11, fontWeight: 600, color: '#059669', background: '#ecfdf5', borderRadius: 5, padding: '2px 6px' },
  pendiente: { fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb', borderRadius: 5, padding: '2px 6px' },
  select: { width: '100%', fontSize: 11.5, padding: '4px 6px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff' },
  vacio: { color: '#9ca3af', fontSize: 12, textAlign: 'center', margin: '14px 0 6px' }
};