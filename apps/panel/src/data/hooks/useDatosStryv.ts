import { useCallback, useEffect, useState } from 'react';
import { leer } from '../tabla';
import type { Alumno, Cliente, Herramienta, Inversion, Miembro } from '../entidades';

// ============================================================================
// Todo lo que necesita el motor financiero, en una sola carga.
// ----------------------------------------------------------------------------
// Se piden en paralelo: son 5 tablas independientes y encadenarlas multiplicaba
// la espera sin ninguna razón.
//
// Si UNA falla, falla la carga entera y se dice cuál. Es deliberado: una
// finanza calculada sobre 4 de 5 tablas da un número creíble y equivocado —
// mucho peor que no mostrar nada.
// ============================================================================

export interface DatosStryv {
  clientes: Cliente[];
  equipo: Miembro[];
  herramientas: Herramienta[];
  inversiones: Inversion[];
  alumnos: Alumno[];
}

const VACIO: DatosStryv = {
  clientes: [], equipo: [], herramientas: [], inversiones: [], alumnos: []
};

export function useDatosStryv() {
  const [datos, setDatos] = useState<DatosStryv>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [clientes, equipo, herramientas, inversiones, alumnos] = await Promise.all([
        leer<Cliente>('clients'),
        leer<Miembro>('team'),
        leer<Herramienta>('tools'),
        leer<Inversion>('investments'),
        leer<Alumno>('students')
      ]);
      setDatos({ clientes, equipo, herramientas, inversiones, alumnos });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos');
      setDatos(VACIO);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { datos, cargando, error, recargar: cargar };
}