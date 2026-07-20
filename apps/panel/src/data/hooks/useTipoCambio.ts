import { useEffect, useState } from 'react';
import type { TipoCambioUSD } from '../ops/finanzas';

// ============================================================================
// Tipo de cambio USD→MXN. Portado del panel viejo: se consulta una vez al día
// y se cachea; si la consulta falla, se conserva el último valor conocido.
// ----------------------------------------------------------------------------
// CAMBIO: el viejo no exponía si el valor era fresco o de respaldo. Un tipo de
// cambio viejo y silencioso deforma TODOS los importes del panel sin que nadie
// lo note, así que acá se informa la fecha y la pantalla la muestra.
// ============================================================================

const CLAVE_VALOR = 'stryv_tc';
const CLAVE_FECHA = 'stryv_tc_date';
const RESPALDO = 20.5;

const hoy = () => new Date().toISOString().split('T')[0]!;

export interface EstadoTipoCambio {
  tc: TipoCambioUSD;
  /** Día en que se obtuvo. null = nunca se pudo consultar, se usa el respaldo. */
  actualizado: string | null;
  esRespaldo: boolean;
}

function leerCache(): EstadoTipoCambio {
  try {
    const v = Number(localStorage.getItem(CLAVE_VALOR));
    const f = localStorage.getItem(CLAVE_FECHA);
    if (Number.isFinite(v) && v > 0) {
      return { tc: { mxn: v }, actualizado: f, esRespaldo: false };
    }
  } catch {
    // localStorage bloqueado (modo privado): se sigue con el respaldo.
  }
  return { tc: { mxn: RESPALDO }, actualizado: null, esRespaldo: true };
}

export function useTipoCambio(): EstadoTipoCambio {
  const [estado, setEstado] = useState<EstadoTipoCambio>(leerCache);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        if (estado.actualizado === hoy()) return; // ya se consultó hoy
        const r = await fetch('https://open.er-api.com/v6/latest/USD');
        const d = (await r.json()) as { result?: string; rates?: Record<string, number> };
        const mxn = d.rates?.['MXN'];
        if (d.result !== 'success' || !mxn) return;

        const v = Math.round(mxn * 100) / 100;
        if (cancelado) return;
        setEstado({ tc: { mxn: v }, actualizado: hoy(), esRespaldo: false });
        try {
          localStorage.setItem(CLAVE_VALOR, String(v));
          localStorage.setItem(CLAVE_FECHA, hoy());
        } catch {
          // sin cache, se vuelve a consultar mañana: no es un error fatal
        }
      } catch {
        // Sin red: se conserva el valor previo. Nunca se pisa con el respaldo
        // un valor que ya teníamos.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [estado.actualizado]);

  return estado;
}