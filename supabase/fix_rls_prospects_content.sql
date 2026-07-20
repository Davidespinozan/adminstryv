-- ============================================================================
-- ►► CORRER EN: proyecto Supabase de STRYV — ref `lxpgqhghxfqsahwrdmzo`
-- ----------------------------------------------------------------------------
-- URGENTE — DOS FILTRACIONES ABIERTAS (verificadas 2026-07-20 con la clave
-- publishable, que es pública por diseño y va en el HTML del panel):
--
--   prospects → 4,851 filas legibles sin sesión. Incluye DATOS PERSONALES DE
--               TERCEROS: name, email, phone, address, ficha de Google Maps;
--               más los correos que se les enviaron (email_v1/v2/v3) y si los
--               abrieron (email_opened, email_opened_at).
--               Es a la vez una brecha de datos personales y la exposición
--               completa del pipeline comercial.
--
--   content   → 318 filas con la estrategia de contenido.
--
-- Ambas tenían RLS DESACTIVADA (no "sin políticas": apagada), así que la
-- protección ni siquiera se estaba evaluando.
--
-- NO ROMPE NADA: los agentes de prospección escriben con la clave de servicio,
-- que se salta la RLS por definición. El panel lee con la sesión del usuario,
-- que la política de abajo contempla.
-- ============================================================================

-- ── prospects ───────────────────────────────────────────────────────────────
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prospects_rw_authenticated ON public.prospects;
CREATE POLICY prospects_rw_authenticated ON public.prospects
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.prospects FROM anon;

-- ── content ─────────────────────────────────────────────────────────────────
ALTER TABLE public.content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_rw_authenticated ON public.content;
CREATE POLICY content_rw_authenticated ON public.content
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.content FROM anon;

-- ============================================================================
-- VERIFICACIÓN — devuelve TABLA. Las tres tienen que quedar en 'ok'.
-- ============================================================================
SELECT
  c.relname        AS tabla,
  c.relrowsecurity AS rls_activa,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS politicas,
  CASE
    WHEN NOT c.relrowsecurity THEN '*** SIGUE ABIERTA ***'
    ELSE 'ok'
  END AS estado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('prospects', 'content', 'tools')
ORDER BY c.relname;