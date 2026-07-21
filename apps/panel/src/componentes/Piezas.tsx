import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Metrica, Senal, Fila } from '../data/hooks/useGrupo';

/* Piezas que se repiten en todas las pantallas. Viven juntas para que un
   cambio de criterio —cómo se muestra "sin dato", cómo se ve un pendiente—
   se aplique en todo el panel de una sola vez. */

/** Dinero en centavos → texto, SIEMPRE con su moneda al lado. Nunca se asume
 *  una divisa: cada negocio cobra en la suya y sumarlas da un número falso. */
export function dinero(centavos: number | null | undefined, moneda = 'MXN'): string {
  if (centavos == null) return '—';
  return ((Number(centavos) || 0) / 100).toLocaleString('es-MX', {
    style: 'currency',
    currency: moneda,
    maximumFractionDigits: 0
  });
}

export function Head({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <h2 className="st-head" style={{ marginBottom: 0 }}>{children}</h2>
      {accion}
    </div>
  );
}

/** Un número grande con su etiqueta. Si el valor es null muestra "—", que es
 *  distinto de cero: cero es "no vendiste", el guion es "no lo sabemos". */
export function Cifra({ m, moneda }: { m: Metrica; moneda: string }) {
  const sinDato = m.v === null || m.v === undefined || m.v === '—';
  return (
    <div>
      <div className="st-label">{m.l}</div>
      <div
        className={`st-cifra${sinDato ? ' st-sindato' : ''}`}
        style={{ fontSize: 18, marginTop: 4, color: m.alerta ? 'var(--st-danger)' : undefined }}
      >
        {sinDato ? '—' : m.tipo === 'dinero' ? dinero(Number(m.v), moneda) : m.v}
      </div>
    </div>
  );
}

/**
 * Lo que hay que atender, ARRIBA de los números y SIEMPRE como enlace.
 * Es el patrón del CentroPendientes de SALA: el número no te informa, te
 * lleva a la pantalla donde se resuelve, con el filtro ya puesto.
 */
export function Pendientes({ senales, base }: { senales: Senal[]; base: string }) {
  if (senales.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
      {senales.map((s, i) => {
        const destino = s.ir ?? base;
        return (
          <Link key={i} to={destino} className={`st-pendiente st-pendiente--${s.nivel}`}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: s.nivel === 'alta' ? 'var(--st-danger)' : 'var(--st-warn)' }}>
                {s.que}
              </div>
              <div style={{ fontSize: 12, color: 'var(--st-ink-muted)', marginTop: 3, lineHeight: 1.5 }}>
                {s.porque}
              </div>
            </div>
            <span style={{ color: 'var(--st-ink-faint)', fontSize: 18 }}>›</span>
          </Link>
        );
      })}
    </div>
  );
}

/** Barras de los últimos 6 meses. La altura es relativa al mes más alto del
 *  propio negocio — no es comparable entre negocios, y por eso cada barra
 *  lleva su cifra escrita. */
export function Barras({ datos, moneda }: { datos: Record<string, number>; moneda: string }) {
  const meses = Object.keys(datos).sort().slice(-6);
  if (meses.length === 0) return null;
  const valor = (m: string) => Number(datos[m] ?? 0);
  const max = Math.max(...meses.map(valor), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 72, marginTop: 4 }}>
      {meses.map((m) => (
        <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
          <div style={{ fontSize: 9.5, color: 'var(--st-ink-faint)', whiteSpace: 'nowrap' }}>{dinero(valor(m), moneda)}</div>
          <div
            title={`${m}: ${dinero(valor(m), moneda)}`}
            style={{ width: '100%', height: Math.max(3, Math.round((valor(m) / max) * 38)), background: 'var(--st-brand)', opacity: 0.75, borderRadius: 3 }}
          />
          <div style={{ fontSize: 9.5, color: 'var(--st-ink-faint)' }}>{m.substring(5)}</div>
        </div>
      ))}
    </div>
  );
}

export function Desglose({ t, filas, moneda }: { t: string; filas: Fila[]; moneda: string }) {
  const utiles = filas.filter((f) => f && (f.v != null || f.monto));
  if (utiles.length === 0) return null;
  return (
    <div>
      <div className="st-label" style={{ marginBottom: 8 }}>{t}</div>
      <div style={{ display: 'grid', gap: 6 }}>
        {utiles.map((f, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, color: 'var(--st-ink-muted)' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.l}</span>
            <b style={{ color: 'var(--st-ink)', whiteSpace: 'nowrap' }}>
              {f.monto ? dinero(f.monto, moneda) : ''}
              {f.monto && f.v != null ? ' · ' : ''}
              {f.v ?? ''}
            </b>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lo que ese negocio todavía no puede medir. Se declara en vez de esconderse:
 *  un panel que calla lo que no sabe se lee como si lo supiera todo. */
export function Huecos({ huecos }: { huecos: string[] }) {
  if (huecos.length === 0) return null;
  return (
    <details style={{ marginTop: 18 }}>
      <summary style={{ cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: 'var(--st-ink-faint)' }}>
        {huecos.length} {huecos.length === 1 ? 'cosa que todavía no se puede medir' : 'cosas que todavía no se pueden medir'}
      </summary>
      <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--st-ink-muted)', lineHeight: 1.6 }}>
        {huecos.map((h, i) => <li key={i} style={{ marginBottom: 5 }}>{h}</li>)}
      </ul>
    </details>
  );
}

export function Cargando() {
  return <div style={{ padding: 48, textAlign: 'center', color: 'var(--st-ink-faint)', fontSize: 13 }}>Leyendo…</div>;
}

export function Error_({ error, reintentar }: { error: string; reintentar: () => void }) {
  return (
    <div className="st-card">
      <div style={{ color: 'var(--st-danger)', fontWeight: 600, fontSize: 13, marginBottom: 12 }}>{error}</div>
      <button
        onClick={reintentar}
        style={{ background: 'var(--st-brand)', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
      >
        Reintentar
      </button>
    </div>
  );
}
