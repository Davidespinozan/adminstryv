import { useMemo } from 'react';
import { useDatosStryv } from '../data/hooks/useDatosStryv';
import { useTipoCambio } from '../data/hooks/useTipoCambio';
import {
  capitalInyectado,
  cobradoPorMes,
  mesActual,
  resultadoDelMes,
  type ResultadoMes
} from '../data/ops/finanzas';

// ============================================================================
// FINANZAS — mes a mes, calculado SIEMPRE desde el origen.
// ----------------------------------------------------------------------------
// El panel viejo guardaba "cierres" mensuales, pero congelaba en ellos los
// valores de HOY (MRR, clientes activos, cobrado total). Como además rellenaba
// los meses viejos automáticamente, todos terminaron con las mismas cifras: las
// de hoy, no las de ese mes.
//
// Acá no hay cierre que valga: cada mes se recalcula desde los pagos, las
// herramientas y el equipo. Un histórico que cambia solo no es un histórico.
// ============================================================================

const fmt = (usd: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    .format(usd);

/** Meses con actividad, del más reciente al más viejo. */
function mesesConDatos(cobrado: Record<string, number>): string[] {
  const meses = new Set<string>(Object.keys(cobrado));
  meses.add(mesActual());
  return [...meses].sort().reverse();
}

export function Finanzas() {
  const { datos, cargando, error, recargar } = useDatosStryv();
  const { tc, actualizado, esRespaldo } = useTipoCambio();

  const filas: ResultadoMes[] = useMemo(() => {
    const cobrado = cobradoPorMes(datos.clientes, tc);
    return mesesConDatos(cobrado).map((m) => resultadoDelMes(m, datos, tc));
  }, [datos, tc]);

  const capital = useMemo(() => capitalInyectado(datos.inversiones, tc), [datos, tc]);
  const mesEnCurso = filas[0];

  if (cargando) return <p style={s.info}>Calculando…</p>;

  if (error) {
    return (
      <div style={s.info}>
        <p style={{ color: '#b91c1c', fontWeight: 600 }}>{error}</p>
        {/* Sin TODAS las tablas no se muestran finanzas a medias: un número
            creíble y equivocado es peor que ninguno. */}
        <p style={{ fontSize: 13, color: '#6b7280' }}>
          No se muestran cifras parciales: se calculan con las cinco tablas o con ninguna.
        </p>
        <button style={s.boton} onClick={() => void recargar()}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <div>
          <p style={s.eyebrow}>STRYV · FINANZAS</p>
          {mesEnCurso && (
            <h1 style={s.h1}>
              {fmt(mesEnCurso.utilidadCaja)}{' '}
              <span style={s.h1sub}>de utilidad este mes</span>
            </h1>
          )}
          <p style={s.nota}>
            Capital inyectado: {fmt(capital)} · USD a {tc.mxn} MXN{' '}
            {esRespaldo ? '(respaldo)' : actualizado ? `(al ${actualizado})` : ''}
          </p>
        </div>
        <button style={s.boton} onClick={() => void recargar()}>Actualizar</button>
      </header>

      <div style={s.aviso}>
        <strong>Dos utilidades, dos preguntas.</strong> <em>Caja</em> es lo que entró menos lo que
        gastaste — lo que pasó de verdad. <em>Run-rate</em> es lo que daría el mes si se repitiera,
        usando los retainers vigentes. El panel viejo las mezclaba sin nombre y por eso daban
        distinto según dónde miraras.
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Mes</th>
              <th style={s.thNum}>Cobrado</th>
              <th style={s.thNum}>MRR</th>
              <th style={s.thNum}>Equipo</th>
              <th style={s.thNum}>Stack</th>
              <th style={s.thNum}>Ads</th>
              <th style={s.thNum}>Costos</th>
              <th style={s.thNum}>Utilidad caja</th>
              <th style={s.thNum}>Utilidad run-rate</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.mes}>
                <td style={s.td}>{f.mes}</td>
                <td style={s.tdNum}>{fmt(f.cobrado)}</td>
                <td style={s.tdNum}>{fmt(f.mrr)}</td>
                <td style={s.tdNum}>{fmt(f.costoEquipo)}</td>
                <td style={s.tdNum}>
                  {fmt(f.costoStackPropio)}
                  {f.stackCubiertoPorTerceros > 0 && (
                    // Se informa aparte, nunca sumado: lo pagan clientes o
                    // inversores, no Stryv.
                    <span style={s.terceros}> +{fmt(f.stackCubiertoPorTerceros)} de terceros</span>
                  )}
                </td>
                <td style={s.tdNum}>{fmt(f.costoAds)}</td>
                <td style={s.tdNum}>{fmt(f.costoTotal)}</td>
                <td style={{ ...s.tdNum, ...signo(f.utilidadCaja) }}>{fmt(f.utilidadCaja)}</td>
                <td style={{ ...s.tdNum, ...signo(f.utilidadRunRate) }}>{fmt(f.utilidadRunRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={s.pie}>
        Cada mes se recalcula desde los pagos, el equipo y las herramientas de ese momento — no hay
        cierres congelados. Una herramienta cancelada sigue contando en los meses en que se pagó.
      </p>
    </div>
  );
}

const signo = (n: number): React.CSSProperties =>
  n < 0 ? { color: '#b91c1c', fontWeight: 700 } : { color: '#047857', fontWeight: 700 };

const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 1200, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif', color: '#111827' },
  info: { padding: 48, textAlign: 'center', fontFamily: 'system-ui, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 },
  eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#6b7280', margin: '0 0 6px' },
  h1: { fontSize: 32, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 },
  h1sub: { fontSize: 15, fontWeight: 500, color: '#6b7280' },
  nota: { fontSize: 12.5, color: '#6b7280', margin: '6px 0 0' },
  boton: { padding: '9px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  aviso: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 9, padding: '11px 14px', fontSize: 12.5, color: '#374151', lineHeight: 1.55, marginBottom: 16 },
  tabla: { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 900 },
  th: { textAlign: 'left', padding: '9px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 11.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' },
  thNum: { textAlign: 'right', padding: '9px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 11.5, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' },
  td: { padding: '9px 10px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 },
  tdNum: { padding: '9px 10px', borderBottom: '1px solid #f3f4f6', textAlign: 'right' },
  terceros: { display: 'block', fontSize: 10.5, color: '#9ca3af', fontWeight: 400 },
  pie: { marginTop: 18, fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }
};