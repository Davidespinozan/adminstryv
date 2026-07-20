import { useMemo } from 'react';
import { useConsolidado } from '../data/hooks/useConsolidado';
import { NEGOCIOS, type NegocioId, type TipoCambio } from '../data/types';
import {
  activos,
  altas,
  bajas,
  ingresos,
  mesDe,
  ticketPromedio
} from '../data/ops/metricas';
import { dinero, dineroOpcional, numeroOpcional, SIN_DATO } from '../lib/format';

// ============================================================================
// TABLERO DE LA MATRIZ — los cuatro negocios en una pantalla.
// ----------------------------------------------------------------------------
// Regla de esta vista: NUNCA inventar un número. Si un negocio no puede medir
// algo, se muestra "—" y se explica por qué abajo. Un cero en un tablero se lee
// como "vendiste nada"; el guion se lee como "no lo sabemos". Confundirlos es
// lo que convierte un panel en una fuente de decisiones equivocadas.
// ============================================================================

// TODO: traer el tipo de cambio real (el panel viejo ya lo consulta a una API y
// lo cachea; se migra junto con el módulo de finanzas). Mientras, valores fijos
// y VISIBLES en pantalla — un tipo de cambio invisible y desactualizado es de
// las formas más silenciosas de mostrar cifras falsas.
const TC: TipoCambio = { MXN: 1, USD: 17, EUR: 19 };

export function Dashboard() {
  const { datos, cargando, error, recargar } = useConsolidado();
  const mes = useMemo(() => mesDe(new Date()), []);

  const filas = useMemo(() => {
    if (!datos) return [];
    return NEGOCIOS.map(({ id, nombre }) => {
      const d = datos.negocios[id as NegocioId];
      if (!d) return { id, nombre, huecos: ['Sin datos'], ing: null, act: null, alt: null, baj: null, tic: null };

      const tieneMovs = d.movimientos.length > 0;
      const tieneEventos = d.eventos.length > 0;

      return {
        id,
        nombre,
        // null = no medible, distinto de 0 = medido y dio cero.
        ing: tieneMovs ? ingresos(d.movimientos, mes, TC) : null,
        tic: tieneMovs ? ticketPromedio(d.movimientos, mes, TC) : null,
        act: tieneEventos ? activos(d.eventos, id as NegocioId) : null,
        alt: tieneEventos ? altas(d.eventos, mes) : null,
        baj: tieneEventos ? bajas(d.eventos, mes) : null,
        snapshot: d.snapshot,
        huecos: d.huecos ?? []
      };
    });
  }, [datos, mes]);

  const totalGrupo = useMemo(
    () => filas.reduce((acc, f) => acc + (f.ing ?? 0), 0),
    [filas]
  );
  const negociosMedibles = filas.filter((f) => f.ing != null).length;

  if (cargando) return <p style={s.info}>Cargando…</p>;

  if (error) {
    return (
      <div style={s.info}>
        <p style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</p>
        <button onClick={() => void recargar()} style={s.boton}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>STRYV · CONSOLIDADO</p>
          <h1 style={s.h1}>
            {dinero(totalGrupo)} <span style={s.h1sub}>este mes</span>
          </h1>
          <p style={s.nota}>
            Suma de {negociosMedibles} de {filas.length} negocios · el resto todavía no puede medir
            sus ingresos (ver abajo) · tipo de cambio USD {TC.USD} / EUR {TC.EUR}
          </p>
        </div>
        <button onClick={() => void recargar()} style={s.boton}>Actualizar</button>
      </header>

      <div style={s.grid}>
        {filas.map((f) => (
          <section key={f.id} style={s.card}>
            <h2 style={s.h2}>{f.nombre}</h2>

            <p style={s.cifra}>{dineroOpcional(f.ing)}</p>
            <p style={s.cifraPie}>ingresos del mes</p>

            <dl style={s.dl}>
              <Dato k="Clientes activos" v={numeroOpcional(f.act)} />
              <Dato k="Altas" v={numeroOpcional(f.alt)} />
              <Dato k="Bajas" v={numeroOpcional(f.baj)} />
              <Dato k="Ticket promedio" v={dineroOpcional(f.tic)} />
            </dl>

            {f.snapshot && (
              <dl style={{ ...s.dl, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                {Object.entries(f.snapshot)
                  .filter(([, v]) => typeof v === 'number')
                  .map(([k, v]) => (
                    <Dato key={k} k={k.replace(/_/g, ' ')} v={String(v)} />
                  ))}
              </dl>
            )}

            {f.huecos.length > 0 && (
              <details style={s.huecos}>
                <summary style={s.huecosTitulo}>
                  {f.huecos.length} {f.huecos.length === 1 ? 'hueco' : 'huecos'} de medición
                </summary>
                <ul style={s.huecosLista}>
                  {f.huecos.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        ))}
      </div>

      <p style={s.pie}>
        {SIN_DATO} significa <strong>no medible todavía</strong>, no cero. Cada hueco se cierra
        instrumentando ese negocio con el contrato de datos.
      </p>
    </div>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt style={s.dt}>{k}</dt>
      <dd style={s.dd}>{v}</dd>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui, sans-serif', color: '#111827' },
  info: { padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 28 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6b7280', margin: '0 0 6px' },
  h1: { fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 },
  h1sub: { fontSize: 16, fontWeight: 500, color: '#6b7280' },
  nota: { fontSize: 12.5, color: '#6b7280', margin: '8px 0 0', maxWidth: 560, lineHeight: 1.5 },
  boton: { padding: '9px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 },
  card: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 18, background: '#fff' },
  h2: { fontSize: 14, fontWeight: 700, margin: '0 0 12px' },
  cifra: { fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 },
  cifraPie: { fontSize: 12, color: '#6b7280', margin: '2px 0 14px' },
  dl: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 12px', margin: 0, fontSize: 13 },
  dt: { color: '#6b7280' },
  dd: { margin: 0, fontWeight: 600, textAlign: 'right' },
  huecos: { marginTop: 14, fontSize: 12 },
  huecosTitulo: { cursor: 'pointer', color: '#b45309', fontWeight: 600 },
  huecosLista: { margin: '8px 0 0', paddingLeft: 18, color: '#6b7280', lineHeight: 1.5 },
  pie: { marginTop: 24, fontSize: 12.5, color: '#6b7280' }
};