import { Link } from 'react-router-dom';
import { useGrupo } from '../data/hooks/useGrupo';
import { NEGOCIOS } from '../negocios';
import { Barras, Cargando, Error_, Head, dinero } from '../componentes/Piezas';

/* ══════════════════════════════════════════════════════════════════════════
   GRUPO — los cuatro negocios de un vistazo.
   ──────────────────────────────────────────────────────────────────────────
   Es la pantalla de entrada. No intenta contar todo: muestra lo mínimo para
   decidir a cuál entrar, y todo lo que se ve es un enlace a ese negocio.

   REGLA: los totales se agrupan POR MONEDA y no se suman entre sí. Sumar
   pesos con dólares porque "total" suena bien fabrica una cifra que nadie
   puede usar para nada.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Grupo() {
  const { datos, error, cargando, recargar } = useGrupo();
  if (cargando) return <Cargando />;
  if (error) return <Error_ error={error} reintentar={recargar} />;

  const mes = new Date().toISOString().substring(0, 7);
  const totales: Record<string, number> = {};
  let medibles = 0;
  let pendientes = 0;

  for (const n of NEGOCIOS) {
    const d = datos?.negocios?.[n.id] ?? {};
    pendientes += (d.senales ?? []).length;
    const ing = d.ingresoPorMes ?? {};
    if (Object.keys(ing).length === 0) continue;
    medibles++;
    const mo = d.moneda ?? 'MXN';
    totales[mo] = (totales[mo] ?? 0) + (ing[mes] ?? 0);
  }

  return (
    <div>
      <Head
        accion={
          <button onClick={recargar} style={est.actualizar}>Actualizar</button>
        }
      >
        {Object.keys(totales).length === 0
          ? 'Los 4 negocios'
          : Object.entries(totales).map(([m, c]) => dinero(c, m)).join('   ·   ') + ' este mes'}
      </Head>

      <p style={est.nota}>
        {medibles} de {NEGOCIOS.length} negocios registran su dinero
        {Object.keys(totales).length > 1 && ' · los totales van separados por moneda, no se suman entre sí'}
        {pendientes > 0 && ` · ${pendientes} cosa${pendientes === 1 ? '' : 's'} por atender`}
      </p>

      <div className="st-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        {NEGOCIOS.map((n) => {
          const d = datos?.negocios?.[n.id] ?? {};
          const ing = d.ingresoPorMes ?? {};
          const hayDatos = Object.keys(ing).length > 0;
          const delMes = hayDatos ? (ing[mes] ?? 0) : null;
          const alertas = (d.senales ?? []).filter((s) => s.nivel === 'alta').length;
          const avisos = (d.senales ?? []).length - alertas;

          return (
            <Link key={n.id} to={`/${n.id}`} className="st-card" style={est.tarjeta}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img src={n.logo} alt="" width={40} height={40} style={est.logo} />
                <div style={{ minWidth: 0 }}>
                  <div style={est.nombre}>{n.nombre}</div>
                  <div style={est.modelo}>{n.modelo}</div>
                </div>
              </div>

              <div className={`st-cifra${delMes == null ? ' st-sindato' : ''}`} style={{ marginTop: 16, color: delMes == null ? undefined : 'var(--st-ok)' }}>
                {delMes == null ? '—' : dinero(delMes, d.moneda)}
              </div>
              <div style={est.pie}>cobrado este mes</div>

              <Barras datos={ing} moneda={d.moneda ?? 'MXN'} />

              {(alertas > 0 || avisos > 0) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  {alertas > 0 && <span style={{ ...est.chip, background: 'var(--st-danger-soft)', color: 'var(--st-danger)' }}>{alertas} urgente{alertas === 1 ? '' : 's'}</span>}
                  {avisos > 0 && <span style={{ ...est.chip, background: 'var(--st-warn-soft)', color: 'var(--st-warn)' }}>{avisos} por mirar</span>}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      <p style={{ ...est.nota, marginTop: 20 }}>
        <b>—</b> significa <b>no medible todavía</b>, no cero. Entrá a cada negocio para ver qué le falta.
      </p>
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
  nota: { fontSize: 12.5, color: 'var(--st-ink-faint)', margin: '0 0 20px', paddingLeft: 12 },
  tarjeta: { textDecoration: 'none', color: 'inherit', display: 'block' },
  logo: { borderRadius: 10, objectFit: 'contain', background: 'var(--st-surface-soft)', flexShrink: 0 },
  nombre: { fontFamily: 'var(--st-font-display)', fontSize: 14.5, fontWeight: 800 },
  modelo: { fontSize: 11.5, color: 'var(--st-ink-faint)', marginTop: 2 },
  pie: { fontSize: 10.5, color: 'var(--st-ink-faint)', marginTop: 4 },
  chip: { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }
};
