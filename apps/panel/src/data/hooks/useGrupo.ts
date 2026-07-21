import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

/* ══════════════════════════════════════════════════════════════════════════
   LOS DATOS DE LOS CUATRO NEGOCIOS
   ──────────────────────────────────────────────────────────────────────────
   Se piden UNA vez y se comparten entre todas las pantallas. Si cada pantalla
   hiciera su propio pedido, moverse entre negocios golpearía los tres Supabase
   otra vez sin necesidad.

   Los datos NO se leen desde el navegador: los trae la función `consolidado`
   del servidor, que es la única con las claves de servicio de cada negocio. Si
   esas claves vivieran acá, cualquiera que abra el panel se llevaría las
   llaves maestras de los tres proyectos.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Senal {
  nivel: 'alta' | 'media';
  que: string;
  porque: string;
  /** A dónde se resuelve. Un pendiente sin destino es una notificación, no una
   *  herramienta: te dice que algo pasa y te deja solo. */
  ir?: string;
}

export interface Metrica {
  l: string;
  v: number | string;
  tipo?: 'dinero' | 'num' | 'texto';
  alerta?: boolean;
}

export interface Fila {
  l: string;
  v?: number | string | null;
  monto?: number | null;
}

export interface ListaFicha {
  t: string;
  columnas: string[];
  filas: FilaTabla[];
}

export interface Ficha {
  titulo: string;
  campos: { l: string; v: string }[];
  listas?: ListaFicha[];
}

export interface FilaTabla {
  celdas: string[];
  /** Presente = la fila se puede abrir. Ausente = es solo un dato. */
  id?: string;
  detalle?: Ficha;
  /** Rojo: hay que atender. Ámbar: conviene mirar. Lo decide el servidor,
   *  junto al dato — si la regla viviera también en la pantalla, las dos
   *  versiones se separarían sin que nadie lo note. */
  alerta?: boolean;
  aviso?: boolean;
}

export interface TablaNegocio {
  titulo: string;
  columnas: string[];
  filas: FilaTabla[];
}

export interface DatosNegocio {
  moneda?: string;
  ingresoPorMes?: Record<string, number>;
  metricas?: Metrica[];
  desgloses?: { t: string; filas: Fila[] }[];
  senales?: Senal[];
  tablas?: Record<string, TablaNegocio>;
  huecos?: string[];
}

export interface Grupo {
  desde: string;
  generado_en: string;
  negocios: Record<string, DatosNegocio>;
}

/** Cache a nivel módulo: sobrevive a los cambios de pantalla, no a un refresh. */
let cache: Grupo | null = null;
let enVuelo: Promise<Grupo> | null = null;

async function pedir(): Promise<Grupo> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Sesión vencida. Volvé a entrar.');

  const r = await fetch('/.netlify/functions/consolidado', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`
    },
    body: '{}'
  });
  const j = await r.json().catch(() => ({}));
  // Se muestra el motivo real del servidor (falta configurar, sin permiso,
  // sesión vencida) y no un "algo salió mal" que no ayuda a arreglarlo.
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j as Grupo;
}

export function useGrupo() {
  const [datos, setDatos] = useState<Grupo | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(!cache);

  const cargar = useCallback(async (forzar = false) => {
    if (cache && !forzar) {
      setDatos(cache);
      setCargando(false);
      return;
    }
    setCargando(true);
    setError(null);
    try {
      // Si dos pantallas montan a la vez, comparten el mismo pedido en vuelo
      // en lugar de disparar dos.
      if (!enVuelo || forzar) enVuelo = pedir();
      const j = await enVuelo;
      cache = j;
      setDatos(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      enVuelo = null;
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar(false);
  }, [cargar]);

  return { datos, error, cargando, recargar: () => cargar(true) };
}

/** Los datos de UN negocio, con sus valores por defecto ya puestos para que
 *  las pantallas no tengan que defenderse de `undefined` en cada línea. */
export function useNegocio(id: string) {
  const { datos, error, cargando, recargar } = useGrupo();
  const d: DatosNegocio = datos?.negocios?.[id] ?? {};
  return {
    d: {
      moneda: d.moneda ?? 'MXN',
      ingresoPorMes: d.ingresoPorMes ?? {},
      metricas: d.metricas ?? [],
      desgloses: d.desgloses ?? [],
      senales: d.senales ?? [],
      tablas: d.tablas ?? {},
      huecos: d.huecos ?? []
    },
    error,
    cargando,
    recargar
  };
}