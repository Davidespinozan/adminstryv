// ============================================================================
// Acceso genérico a las tablas del hub. Portado de `dSel/dIns/dUpd/dDel` del
// panel viejo, conservando sus convenciones para no romper los datos que ya
// están en la base.
// ----------------------------------------------------------------------------
// CAMBIO PRINCIPAL: el viejo devolvía `[]` cuando la consulta fallaba, sin
// avisar. Una tabla vacía y una tabla que no se pudo leer se veían idénticas —
// y en un panel de finanzas eso significa mostrar $0 cuando en realidad no se
// sabe. Acá el error se propaga y la pantalla lo dice.
// ============================================================================

import { supabase } from '../lib/supabase';

/** Columnas de tipo fecha: Postgres rechaza "" y hay que mandar null. */
const CLAVES_FECHA = new Set([
  'cancel_date', 'renew_date', 'start_date', 'deadline',
  'est_delivery', 'scheduled_date', 'date'
]);

/** Solo estas tablas marcan borrado en vez de borrar. El resto se borra de
 *  verdad — igual que en el viejo. */
const CON_BORRADO_SUAVE = ['clients', 'team', 'tools', 'projects', 'investments'];

/** camelCase → snake_case. No es recursivo a propósito: los objetos anidados
 *  (tasks, payments, costHistory) viajan como JSON con sus claves en camelCase,
 *  que es como ya están guardados. */
export function aSnake(o: Record<string, unknown>): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const k in o) {
    const sk = k.replace(/([A-Z])/g, '_$1').toLowerCase();
    const v = o[k];
    r[sk] = CLAVES_FECHA.has(sk) && v === '' ? null : v;
  }
  return r;
}

/** snake_case → camelCase. */
export function aCamel<T>(o: Record<string, unknown> | null): T {
  if (!o) return o as T;
  const r: Record<string, unknown> = {};
  for (const k in o) r[k.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase())] = o[k];
  return r as T;
}

export async function leer<T>(tabla: string): Promise<T[]> {
  let q = supabase.from(tabla).select('*');
  if (CON_BORRADO_SUAVE.includes(tabla)) q = q.is('deleted_at', null);
  // `prospects` se ordena al revés: lo último capturado primero.
  q = q.order('created_at', { ascending: tabla !== 'prospects' }).limit(5000);

  const { data, error } = await q;
  if (error) throw new Error(`No se pudo leer ${tabla}: ${error.message}`);
  return (data ?? []).map((f) => aCamel<T>(f));
}

export async function insertar<T>(tabla: string, fila: Record<string, unknown>): Promise<T> {
  const payload = aSnake(fila);
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  const { data, error } = await supabase.from(tabla).insert(payload).select().single();
  if (error) throw new Error(`No se pudo crear en ${tabla}: ${error.message}`);
  return aCamel<T>(data);
}

export async function actualizar<T>(
  tabla: string,
  id: string,
  cambios: Record<string, unknown>
): Promise<T> {
  const payload = aSnake(cambios);
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;

  const { data, error } = await supabase.from(tabla).update(payload).eq('id', id).select().single();
  if (error) throw new Error(`No se pudo actualizar ${tabla}: ${error.message}`);
  return aCamel<T>(data);
}

/**
 * Borrado. En las tablas marcadas solo pone `deleted_at`.
 *
 * CAMBIO: el viejo, si el borrado suave fallaba, caía a un borrado FÍSICO sin
 * distinguirlo — y devolvía éxito igual. O sea que un problema de permisos
 * terminaba destruyendo el registro de verdad, en silencio. Acá si falla, falla.
 */
export async function borrar(tabla: string, id: string): Promise<void> {
  if (CON_BORRADO_SUAVE.includes(tabla)) {
    const { data, error } = await supabase
      .from(tabla)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .select();
    if (error) throw new Error(`No se pudo archivar en ${tabla}: ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error(`No se archivó nada en ${tabla}: puede ser un problema de permisos.`);
    }
    return;
  }

  const { error } = await supabase.from(tabla).delete().eq('id', id);
  if (error) throw new Error(`No se pudo borrar de ${tabla}: ${error.message}`);
}