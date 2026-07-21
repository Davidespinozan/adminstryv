import { Link, useParams, useLocation } from 'react-router-dom';
import { useNegocio } from '../data/hooks/useGrupo';
import { negocioPorId } from '../negocios';
import { Cargando, Error_, Head } from '../componentes/Piezas';

/* ══════════════════════════════════════════════════════════════════════════
   LA FICHA DE UNA COSA
   ──────────────────────────────────────────────────────────────────────────
   Es lo que le faltaba al panel: poder abrir una fila. Un food cost de 53%
   alarma pero no dice nada; la ficha del bowl muestra QUÉ lo encarece,
   ingrediente por ingrediente, y ahí sí se puede hacer algo.

   Sirve a los cuatro negocios porque el servidor manda la ficha ya armada.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Ficha() {
  const { id = '', fila = '' } = useParams();
  const loc = useLocation();
  const clave = loc.pathname.split('/')[2] ?? '';
  const n = negocioPorId(id);
  const { d, error, cargando, recargar } = useNegocio(id);

  if (!n) return <div className="st-card">Ese negocio no existe.</div>;
  if (cargando) return <Cargando />;
  if (error) return <Error_ error={error} reintentar={recargar} />;

  const tabla = d.tablas?.[clave];
  const registro = tabla?.filas.find((f) => f.id === decodeURIComponent(fila));
  const ficha = registro?.detalle;
  const volver = `/${id}/${clave}`;

  if (!ficha) {
    return (
      <div className="st-card">
        <p style={{ margin: 0, fontSize: 13, color: 'var(--st-ink-muted)' }}>
          No se encontró. <Link to={volver} style={{ color: 'var(--st-brand)' }}>Volver a la lista</Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <Link to={volver} style={est.volver}>‹ {tabla?.titulo}</Link>
      <Head
        accion={
          ficha.abrirEn ? (
            <a href={ficha.abrirEn.url} target="_blank" rel="noopener noreferrer" style={est.abrir}>
              {ficha.abrirEn.texto} ↗
            </a>
          ) : undefined
        }
      >
        {ficha.titulo}
      </Head>

      <div className="st-card st-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))' }}>
        {ficha.campos.map((c, i) => (
          <div key={i}>
            <div className="st-label">{c.l}</div>
            <div style={{ fontFamily: 'var(--st-font-display)', fontSize: 16, fontWeight: 700, marginTop: 4 }}>{c.v}</div>
          </div>
        ))}
      </div>

      {(ficha.listas ?? []).map((l, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <div className="st-label" style={{ marginBottom: 8, paddingLeft: 2 }}>{l.t}</div>
          <div className="st-card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="st-tabla">
              <thead><tr>{l.columnas.map((c, k) => <th key={k}>{c}</th>)}</tr></thead>
              <tbody>
                {l.filas.map((f, k) => (
                  <tr key={k} style={{ background: f.alerta ? 'var(--st-danger-soft)' : f.aviso ? 'var(--st-warn-soft)' : undefined }}>
                    {f.celdas.map((c, j) => (
                      <td key={j} style={{ fontWeight: j === 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

const est: Record<string, React.CSSProperties> = {
  abrir: {
    background: 'var(--st-brand)',
    color: '#fff',
    borderRadius: 10,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap'
  },
  volver: {
    display: 'inline-block',
    marginBottom: 12,
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--st-brand)',
    textDecoration: 'none'
  }
};
