import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NEGOCIOS, negocioPorId } from './negocios';
import { supabase } from './lib/supabase';

/* ══════════════════════════════════════════════════════════════════════════
   LAYOUT — dos niveles de navegación, que es la jerarquía real de la empresa.
   ──────────────────────────────────────────────────────────────────────────
   Arriba: el grupo y los cuatro negocios. Abajo: las pantallas del negocio en
   el que estás parado.

   Antes esto era un solo menú donde el consolidado colgaba del panel de
   Stryv, lo que decía lo contrario de lo que es: Stryv es UNO de los cuatro,
   no el marco de los otros tres.
   ══════════════════════════════════════════════════════════════════════════ */

export default function Layout({ email }: { email: string }) {
  const loc = useLocation();
  const idActual = loc.pathname.split('/')[1] ?? '';
  const negocio = negocioPorId(idActual);

  return (
    <>
      <nav style={est.barra}>
        <NavLink to="/" style={est.marca}>STRYV</NavLink>

        <div style={est.tabs}>
          <NavLink to="/" end style={({ isActive }) => ({ ...est.tab, ...(isActive ? est.tabOn : null) })}>
            Grupo
          </NavLink>
          {NEGOCIOS.map((n) => (
            <NavLink
              key={n.id}
              to={`/${n.id}`}
              style={({ isActive }) => ({ ...est.tab, ...(isActive ? est.tabOn : null) })}
            >
              <img src={n.logo} alt="" width={18} height={18} style={est.logo} />
              {n.nombre}
            </NavLink>
          ))}
        </div>

        <div style={est.derecha}>
          <span style={est.email}>{email}</span>
          <button style={est.salir} onClick={() => void supabase.auth.signOut()}>Salir</button>
        </div>
      </nav>

      {/* Segundo nivel: solo aparece si estás dentro de un negocio. */}
      {negocio && negocio.pantallas.length > 1 && (
        <div style={est.sub}>
          {negocio.pantallas.map((p) => (
            <NavLink
              key={p.ruta}
              to={`/${negocio.id}${p.ruta ? `/${p.ruta}` : ''}`}
              end={p.ruta === ''}
              style={({ isActive }) => ({ ...est.subTab, ...(isActive ? est.subTabOn : null) })}
            >
              {p.nombre}
            </NavLink>
          ))}
        </div>
      )}

      <main style={est.main}>
        <Outlet />
      </main>
    </>
  );
}

const est: Record<string, React.CSSProperties> = {
  barra: {
    background: 'var(--st-nav)',
    height: 58,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 18px',
    position: 'sticky',
    top: 0,
    zIndex: 100,
    boxShadow: '0 4px 14px rgba(0,0,0,.12)'
  },
  marca: {
    fontFamily: 'var(--st-font-display)',
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: '.22em',
    color: '#fff',
    textDecoration: 'none'
  },
  tabs: { display: 'flex', gap: 4, flex: 1, minWidth: 0, overflowX: 'auto' },
  tab: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '7px 12px',
    borderRadius: 9,
    fontSize: 12.5,
    fontWeight: 600,
    color: 'rgba(255,255,255,.55)',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    border: '1px solid transparent'
  },
  tabOn: {
    background: 'rgba(11,119,152,.28)',
    border: '1px solid rgba(11,119,152,.45)',
    color: '#5fd0e8'
  },
  logo: { borderRadius: 4, objectFit: 'contain', background: 'rgba(255,255,255,.06)' },
  derecha: { display: 'flex', alignItems: 'center', gap: 10 },
  email: { fontSize: 10.5, color: 'rgba(255,255,255,.35)' },
  salir: {
    background: 'none',
    border: '1px solid rgba(255,255,255,.18)',
    color: 'rgba(255,255,255,.6)',
    borderRadius: 8,
    padding: '5px 11px',
    fontSize: 11,
    cursor: 'pointer'
  },
  sub: {
    display: 'flex',
    gap: 2,
    padding: '0 18px',
    background: 'var(--st-surface)',
    borderBottom: '1px solid var(--st-line)',
    overflowX: 'auto'
  },
  subTab: {
    padding: '12px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--st-ink-muted)',
    textDecoration: 'none',
    borderBottom: '2px solid transparent',
    whiteSpace: 'nowrap'
  },
  subTabOn: { color: 'var(--st-brand)', borderBottom: '2px solid var(--st-brand)' },
  main: { padding: '26px 18px', maxWidth: 1240, margin: '0 auto' }
};
