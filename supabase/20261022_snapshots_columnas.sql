-- ►► CORRER EN: proyecto Supabase de STRYV — ref lxpgqhghxfqsahwrdmzo
-- ►► NO EJECUTADO. Requiere autorización (FIX-01).
-- ============================================================================
-- SNAPSHOTS · COLUMNAS QUE buildSnap ENVÍA DESDE EL 2026-07-20
-- ============================================================================
-- El commit 18f170f ("las finanzas se contradecían entre sí") añadió al cierre
-- de mes el costo de herramientas pagadas por terceros y la utilidad de caja,
-- sin crear las columnas. Todo INSERT en snapshots falla desde entonces.
-- Numéricas y opcionales: los 4 cierres existentes (2026-03 a 2026-06) quedan
-- con NULL en ambas. Sin backfill: no hay cifras históricas con que llenarlas.
-- ============================================================================

alter table public.snapshots
  add column if not exists stack_terceros numeric,
  add column if not exists utilidad_caja  numeric;

comment on column public.snapshots.stack_terceros is
  'Costo mensual de herramientas pagadas por terceros. Desde fix finanzas 2026-07-20.';
comment on column public.snapshots.utilidad_caja is
  'Utilidad de caja del mes: cobrado menos costo total. Desde fix finanzas 2026-07-20.';
