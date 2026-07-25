import { useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useNegocio } from '../data/hooks/useGrupo';
import { negocioPorId } from '../negocios';
import { Cargando, Error_, Head } from '../componentes/Piezas';

/* ══════════════════════════════════════════════════════════════════════════
   LA LISTA DE LO QUE SE ADMINISTRA
   ──────────────────────────────────────────────────────────────────────────
   Un panel administrativo es, sobre todo, esto: la lista de las cosas que
   manejás, con lo justo para decidir sin abrir cada una.

   Una sola pantalla sirve a los cuatro negocios porque el servidor manda la
   tabla ya armada —título, columnas, filas—. Un food truck no se administra
   como un SaaS, pero los dos se miran en una tabla.

   El color de la fila comunica antes que el texto: rojo lo que hay que
   atender, ámbar lo que conviene mirar. Se decide en el servidor, junto al
   dato; si la regla viviera también acá, las dos versiones se separarían sin
   que nadie lo note.
   ══════════════════════════════════════════════════════════════════════════ */

/** Orden natural: si las dos celdas son números (aunque traigan $ , % o
 *  espacios), se comparan como números. "$1,144" vs "$572" ordenado como texto
 *  pone el 1,144 antes por el "1", que es exactamente al revés de lo útil. */
function comparar(a: string, b: string): number {
  const na = Number(String(a).replace(/[^0-9.-]/g, ''));
  const nb = Number(String(b).replace(/[^0-9.-]/g, ''));
  const sonNumeros = !Number.isNaN(na) && !Number.isNaN(nb) && /\d/.test(a) && /\d/.test(b);
  if (sonNumeros) return na - nb;
  return String(a).localeCompare(String(b), 'es');
}

export default function Tabla() {
  const { id = '' } = useParams();
  const loc = useLocation();
  const clave = loc.pathname.split('/')[2] ?? '';
  const n = negocioPorId(id);
  const ir = useNavigate();
  const { d, error, cargando, recargar } = useNegocio(id);

  const [busca, setBusca] = useState('');
  const [orden, setOrden] = useState<{ col: number; desc: boolean } | null>(null);
  const [soloAtencion, setSoloAtencion] = useState(false);

  const tabla = d.tablas?.[clave];

  const filas = useMemo(() => {
    if (!tabla) return [];
    let f = tabla.filas;
    if (soloAtencion) f = f.filter((x) => x.alerta || x.aviso);
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      f = f.filter((x) => x.celdas.some((c) => String(c).toLowerCase().includes(q)));
    }
    if (orden) {
      // Copia: ordenar en su lugar mutaría los datos compartidos entre pantallas.
      f = [...f].sort((x, y) => {
        const r = comparar(x.celdas[orden.col] ?? '', y.celdas[orden.col] ?? '');
        return orden.desc ? -r : r;
      });
    }
    return f;
  }, [tabla, busca, orden, soloAtencion]);

  if (!n) return <div className="st-card">Ese negocio no existe.</div>;
  if (cargando) return <Cargando />;
  if (error) return <Error_ error={error} reintentar={recargar} />;

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

  const conAtencion = tabla.filas.filter((f) => f.alerta || f.aviso).length;

  return (
    <div>
      <Head accion={<button onClick={recargar} style={est.boton}>Actualizar</button>}>
        {tabla.titulo}
      </Head>

      {tabla.resumen && tabla.resumen.length > 0 && (
        <div className="st-card st-grid" style={{ marginBottom: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
          {tabla.resumen.map((r, i) => (
            <div key={i}>
              <div className="st-label">{r.l}</div>
              <div className="st-cifra" style={{ fontSize: 20, marginTop: 4, color: 'var(--st-ok)' }}>{r.v}</div>
            </div>
          ))}
        </div>
      )}

      {tabla.filas.length > 0 && (
        <div style={est.controles}>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar…"
            style={est.buscar}
          />
          {conAtencion > 0 && (
            <button
              onClick={() => setSoloAtencion(!soloAtencion)}
              style={{ ...est.boton, ...(soloAtencion ? est.botonOn : null) }}
            >
              Solo lo que necesita atención ({conAtencion})
            </button>
          )}
          <span style={est.conteo}>
            {filas.length === tabla.filas.length
              ? `${filas.length} en total`
              : `${filas.length} de ${tabla.filas.length}`}
          </span>
        </div>
      )}

      {tabla.filas.length === 0 ? (
        <div className="st-card">
          <p style={{ fontSize: 13, color: 'var(--st-ink-muted)', margin: 0 }}>
            Todavía no hay nada acá. Cuando el negocio empiece a operar, aparece solo.
          </p>
        </div>
      ) : filas.length === 0 ? (
        <div className="st-card">
          <p style={{ fontSize: 13, color: 'var(--st-ink-muted)', margin: 0 }}>
            Nada coincide con lo que buscaste.
          </p>
        </div>
      ) : (
        <div className="st-card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="st-tabla">
            <thead>
              <tr>
                {tabla.columnas.map((c, i) => (
                  <th
                    key={i}
                    onClick={() => setOrden(orden?.col === i ? { col: i, desc: !orden.desc } : { col: i, desc: false })}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    title="Ordenar por esta columna"
                  >
                    {c}
                    {orden?.col === i && <span style={{ marginLeft: 5 }}>{orden.desc ? '▾' : '▴'}</span>}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr
                  key={i}
                  onClick={f.id ? () => ir(`/${id}/${clave}/${encodeURIComponent(f.id!)}`) : undefined}
                  style={{
                    background: f.alerta ? 'var(--st-danger-soft)' : f.aviso ? 'var(--st-warn-soft)' : undefined,
                    cursor: f.id ? 'pointer' : undefined
                  }}
                >
                  {f.celdas.map((c, k) => (
                    <td key={k} style={{ fontWeight: k === 0 ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>{c}</td>
                  ))}
                  {/* La flecha solo aparece si la fila se puede abrir: así no se
                      invita a hacer clic donde no hay nada. */}
                  <td style={{ color: 'var(--st-ink-faint)', width: 20 }}>{f.id ? '›' : ''}</td>
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
  controles: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', paddingLeft: 2 },
  buscar: {
    padding: '8px 13px',
    borderRadius: 10,
    border: '1px solid var(--st-line)',
    fontSize: 13,
    fontFamily: 'inherit',
    minWidth: 210,
    background: 'var(--st-surface)'
  },
  boton: {
    background: 'transparent',
    border: '1px solid var(--st-line)',
    borderRadius: 10,
    padding: '7px 13px',
    fontSize: 11.5,
    fontWeight: 600,
    cursor: 'pointer',
    color: 'var(--st-ink-muted)',
    fontFamily: 'inherit'
  },
  botonOn: { background: 'var(--st-brand-soft)', borderColor: 'var(--st-brand-line)', color: 'var(--st-brand)' },
  conteo: { fontSize: 12, color: 'var(--st-ink-faint)', marginLeft: 'auto' }
};
