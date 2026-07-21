import { useParams, useLocation } from 'react-router-dom';
import { useNegocio } from '../data/hooks/useGrupo';
import { negocioPorId } from '../negocios';
import { Cargando, Error_, Head } from '../componentes/Piezas';

/* ══════════════════════════════════════════════════════════════════════════
   LA LISTA DE LO QUE SE ADMINISTRA
   ──────────────────────────────────────────────────────────────────────────
   Un panel administrativo es, sobre todo, esto: la lista de las cosas que
   manejás con lo justo para decidir sin abrir cada una.

   Una sola pantalla sirve a las cuatro empresas porque el servidor manda la
   tabla ya armada —título, columnas, filas— y cada negocio decide qué
   columnas tienen sentido para él. Un food truck no se administra como un
   SaaS, pero los dos se miran en una tabla.

   El color de la fila comunica antes que el texto: rojo lo que hay que
   atender, ámbar lo que conviene mirar. Se decide en el servidor, junto al
   dato, y no acá — si no, la regla se duplica y las dos versiones se separan.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Tabla() {
  const { id = '' } = useParams();
  const loc = useLocation();
  const clave = loc.pathname.split('/')[2] ?? '';
  const n = negocioPorId(id);
  const { d, error, cargando, recargar } = useNegocio(id);

  if (!n) return <div className="st-card">Ese negocio no existe.</div>;
  if (cargando) return <Cargando />;
  if (error) return <Error_ error={error} reintentar={recargar} />;

  const tabla = d.tablas?.[clave];
  const nombrePantalla = n.pantallas.find((p) => p.ruta === clave)?.nombre ?? clave;

  if (!tabla) {
    return (
      <div className="st-card">
        <div className="st-label">{n.nombre}</div>
        <h3 style={{ fontFamily: 'var(--st-font-display)', fontSize: 18, margin: '8px 0 10px' }}>{nombrePantalla}</h3>
        <p style={{ fontSize: 13, color: 'var(--st-ink-muted)', lineHeight: 1.6, margin: 0, maxWidth: 560 }}>
          Esta pantalla todavía no está construida. Está declarada acá para que se
          vea qué falta, en vez de que el panel simule estar completo.
        </p>
      </div>
    );
  }

  const conAlerta = tabla.filas.filter((f) => f.alerta).length;

  return (
    <div>
      <Head accion={<button onClick={recargar} style={est.actualizar}>Actualizar</button>}>
        {tabla.titulo}
      </Head>

      <p style={est.nota}>
        {tabla.filas.length} en total
        {conAlerta > 0 && ` · ${conAlerta} que necesitan atención`}
      </p>

      {tabla.filas.length === 0 ? (
        <div className="st-card">
          <p style={{ fontSize: 13, color: 'var(--st-ink-muted)', margin: 0 }}>
            Todavía no hay nada acá. Cuando el negocio empiece a operar, aparece solo.
          </p>
        </div>
      ) : (
        <div className="st-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="st-tabla">
            <thead>
              <tr>{tabla.columnas.map((c, i) => <th key={i}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {tabla.filas.map((f, i) => (
                <tr
                  key={i}
                  style={{
                    background: f.alerta ? 'var(--st-danger-soft)' : f.aviso ? 'var(--st-warn-soft)' : undefined
                  }}
                >
                  {f.celdas.map((c, k) => (
                    <td key={k} style={{ fontWeight: k === 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  },
  nota: { fontSize: 12.5, color: 'var(--st-ink-faint)', margin: '0 0 18px', paddingLeft: 12 }
};
