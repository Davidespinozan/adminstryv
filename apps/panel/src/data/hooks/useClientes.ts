import { useCallback, useEffect, useState } from 'react';
import { actualizar, leer } from '../tabla';
import type { Cliente, EtapaCliente } from '../entidades';

// ============================================================================
// Clientes de implementación. Es donde vive el MRR de Stryv como negocio.
// ============================================================================

export function useClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setClientes(await leer<Cliente>('clients'));
    } catch (e) {
      // El error se MUESTRA. Una lista vacía por fallo de lectura y una lista
      // vacía de verdad no son lo mismo, y en finanzas confundirlas es grave.
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los clientes');
      setClientes([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Mover de etapa. Optimista con reversión: la interfaz responde al instante
   * y si el servidor rechaza, vuelve atrás y avisa — en vez de quedar mostrando
   * un estado que la base nunca aceptó.
   */
  const moverEtapa = useCallback(
    async (id: string, etapa: EtapaCliente) => {
      const previo = clientes.find((c) => c.id === id)?.stage;
      setClientes((cs) => cs.map((c) => (c.id === id ? { ...c, stage: etapa } : c)));
      try {
        await actualizar<Cliente>('clients', id, { stage: etapa });
      } catch (e) {
        setClientes((cs) => cs.map((c) => (c.id === id ? { ...c, stage: previo! } : c)));
        setError(e instanceof Error ? e.message : 'No se pudo mover de etapa');
      }
    },
    [clientes]
  );

  return { clientes, cargando, error, recargar: cargar, moverEtapa };
}