import { useCallback, useEffect, useState } from 'react';
import { tokenDeSesion } from '../../lib/supabase';
import type { EventoEstado, MovimientoDinero, NegocioId } from '../types';

// ============================================================================
// Trae los datos de los cuatro negocios, ya normalizados al contrato.
// ----------------------------------------------------------------------------
// Este hook NO calcula nada. Solo transporta. Las métricas las computa
// `ops/metricas.ts`, que es puro y está testeado — si además se calculara acá,
// habría dos definiciones de "churn" y tarde o temprano darían distinto.
// ============================================================================

export interface DatosNegocio {
  movimientos: MovimientoDinero[];
  eventos: EventoEstado[];
  /** Lo que un negocio puede informar pero no encaja en el contrato todavía
   *  (ej. HSC solo sabe cuántos suscriptores tiene, sin montos). */
  snapshot?: Record<string, unknown>;
  /** Qué NO se pudo medir y por qué. Se muestra tal cual en el panel. */
  huecos: string[];
}

export interface Consolidado {
  desde: string;
  generado_en: string;
  negocios: Record<NegocioId, DatosNegocio>;
}

interface Estado {
  datos: Consolidado | null;
  cargando: boolean;
  error: string | null;
}

export function useConsolidado(desde?: Date) {
  const [estado, setEstado] = useState<Estado>({ datos: null, cargando: true, error: null });

  const cargar = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: null }));
    try {
      const token = await tokenDeSesion();
      if (!token) {
        setEstado({ datos: null, cargando: false, error: 'Iniciá sesión para ver el panel.' });
        return;
      }

      const res = await fetch('/.netlify/functions/consolidado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(desde ? { desde: desde.toISOString() } : {})
      });

      if (!res.ok) {
        // El backend explica por qué (401 sin sesión, 403 sin permiso,
        // 500 sin configurar). Se muestra su mensaje en vez de uno genérico:
        // "algo salió mal" no ayuda a nadie a arreglarlo.
        const cuerpo = await res.json().catch(() => ({}));
        throw new Error(cuerpo.error || `Error ${res.status}`);
      }

      setEstado({ datos: (await res.json()) as Consolidado, cargando: false, error: null });
    } catch (e) {
      setEstado({
        datos: null,
        cargando: false,
        error: e instanceof Error ? e.message : 'No se pudo cargar'
      });
    }
  }, [desde]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { ...estado, recargar: cargar };
}