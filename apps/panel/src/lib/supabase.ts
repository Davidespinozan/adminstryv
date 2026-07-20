import { createClient } from '@supabase/supabase-js';

// ============================================================================
// Cliente de SESIÓN. Solo sirve para saber QUIÉN sos.
// ----------------------------------------------------------------------------
// El panel NUNCA lee los negocios desde el navegador: eso lo hace la función
// `consolidado`, del lado del servidor, con las claves de servicio. Acá abajo
// va únicamente la clave publishable, que es pública por diseño.
//
// Va por variable de entorno y no escrita a mano como en el panel viejo, para
// que apuntar a otro proyecto sea cambiar una variable y no editar código —
// que fue exactamente el problema que dejó al panel viejo leyendo la base
// equivocada durante quién sabe cuánto tiempo.
// ============================================================================

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Falla ruidosa y temprana: mejor una pantalla en blanco con un error claro
  // en consola que un panel que carga y muestra ceros sin explicar por qué.
  throw new Error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copiá .env.example a .env.local'
  );
}

export const supabase = createClient(url, key);

/** El token de la sesión actual, para autenticar las llamadas al backend.
 *  null = no hay sesión. */
export async function tokenDeSesion(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}