-- ============================================================================
-- ►► CORRER EN: proyecto Supabase de STRYV — ref `lxpgqhghxfqsahwrdmzo`
-- ----------------------------------------------------------------------------
-- URGENTE — FILTRACIÓN ABIERTA.
--
-- La tabla `tools` se lee HOY sin iniciar sesión, con la clave publishable
-- (que es pública por diseño y va escrita en el HTML del panel). Quedan
-- expuestas 25 filas con `login_email` — con qué cuenta se entra a cada
-- servicio — además de costos, notas y URLs. Incluye correos de terceros.
--
-- El resto de las tablas del proyecto (clients, investments, team, projects,
-- leads, snapshots) sí filtran bien: devuelven vacío al anónimo. `tools` se
-- quedó sin protección, probablemente al migrar los datos desde el proyecto
-- viejo.
--
-- Verificado el 2026-07-20 con:
--   curl "$URL/rest/v1/tools?select=*" -H "apikey: <publishable>"
--   → HTTP 200 con datos reales
-- ============================================================================

-- ── 1. Cerrar la puerta ─────────────────────────────────────────────────────
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

-- Con RLS activa y sin políticas, nadie lee nada (default-deny). Se agrega la
-- única puerta que hace falta: usuarios con sesión iniciada.
--
-- Por qué `authenticated` y no algo más fino: el panel todavía no tiene roles
-- reales (hoy `isA = true` hace admin a cualquiera que entre). Ajustar esto a
-- rol de admin es el paso siguiente, pero cerrar el acceso ANÓNIMO es lo
-- urgente y no puede esperar a esa refactorización.
DROP POLICY IF EXISTS tools_rw_authenticated ON public.tools;
CREATE POLICY tools_rw_authenticated ON public.tools
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Quitar cualquier permiso suelto a nivel de tabla (la RLS no aplica si el rol
-- tiene GRANT directo y la tabla no la tiene activada; con esto no quedan cabos).
REVOKE ALL ON public.tools FROM anon;

-- ============================================================================
-- AUDITORÍA — ¿qué otras tablas están sin protección?
-- Devuelve TABLA. Cualquier fila con rls_activa = false es una puerta abierta.
-- ============================================================================
SELECT
  c.relname                                   AS tabla,
  c.relrowsecurity                            AS rls_activa,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas,
  CASE
    WHEN NOT c.relrowsecurity THEN '*** ABIERTA AL PÚBLICO ***'
    WHEN (SELECT count(*) FROM pg_policies p
           WHERE p.schemaname = 'public' AND p.tablename = c.relname) = 0
      THEN 'cerrada (RLS sin políticas: no lee nadie)'
    ELSE 'ok'
  END                                         AS estado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;