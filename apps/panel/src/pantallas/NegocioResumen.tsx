import { useParams } from 'react-router-dom';
import { useNegocio } from '../data/hooks/useGrupo';
import { negocioPorId } from '../negocios';
import { Barras, Cargando, Cifra, Desglose, Error_, Head, Huecos, Pendientes, dinero } from '../componentes/Piezas';

/* El resumen de UN negocio. Lo que hay que atender arriba, después la cifra
   del mes con su tendencia, después sus métricas propias, y al final los
   desgloses. El orden no es estético: es el orden en que se toman decisiones. */

export default function NegocioResumen() {
  const { id = '' } = useParams();
  const n = negocioPorId(id);
  const { d, error, cargando, recargar } = useNegocio(id);

  if (!n) return <div className="st-card">Ese negocio no existe.</div>;
  if (cargando) return <Cargando />;
  if (error) return <Error_ error={error} reintentar={recargar} />;

  const mes = new Date().toISOString().substring(0, 7);
  const meses = Object.keys(d.ingresoPorMes).sort();
  const hayDatos = meses.length > 0;
  const delMes = hayDatos ? (d.ingresoPorMes[mes] ?? 0) : null;
  const i = meses.indexOf(mes);
  const previo = i > 0 ? d.ingresoPorMes[meses[i - 1] as string] : null;
  const varia = delMes != null && previo ? Math.round(((delMes - previo) / previo) * 100) : null;

  return (
    <div>
      <Head accion={<button onClick={recargar} style={est.actualizar}>Actualizar</button>}>
        {n.nombre} · {n.modelo}
      </Head>

      <Pendientes senales={d.senales} base={`/${id}`} />

      <div className="st-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div className="st-label">Cobrado este mes</div>
            <div className={`st-cifra${delMes == null ? ' st-sindato' : ''}`} style={{ marginTop: 6, color: delMes == null ? undefined : 'var(--st-ok)' }}>
              {delMes == null ? '—' : dinero(delMes, d.moneda)}
              {varia != null && (
                <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 10, color: varia >= 0 ? 'var(--st-ok)' : 'var(--st-danger)' }}>
                  {varia >= 0 ? '▲' : '▼'}{Math.abs(varia)}%
                </span>
              )}
            </div>
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 240 }}>
            <Barras datos={d.ingresoPorMes} moneda={d.moneda} />
          </div>
        </div>
      </div>

      {d.metricas.length > 0 && (
        <div className="st-card st-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          {d.metricas.map((m, k) => <Cifra key={k} m={m} moneda={d.moneda} />)}
        </div>
      )}

      {d.desgloses.length > 0 && (
        <div className="st-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))' }}>
          {d.desgloses.map((g, k) => (
            <div key={k} className="st-card">
              <Desglose t={g.t} filas={g.filas} moneda={d.moneda} />
            </div>
          ))}
        </div>
      )}

      <Huecos huecos={d.huecos} />
    </div>
  );
}

const est: Record<string, React.CSSProperties> = {
  actualizar: {
    background: 'transparent',
    border: '1px solid var(--st-line)',
    borderRadius: 10,
    padding: '6px 13px',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    color: 'var(--st-ink-muted)'
  }
};
