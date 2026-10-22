-- ►► CORRER EN: proyecto Supabase de STRYV — ref lxpgqhghxfqsahwrdmzo
-- ►► NO EJECUTADO. Requiere autorización (PS-5B).
-- ============================================================================
-- LEADS · ESTADO COMERCIAL MÍNIMO
-- ============================================================================
-- Hoy un lead solo distingue `converted` true/false: un lead leído y uno nuevo
-- son indistinguibles. Esta columna da el ciclo mínimo que necesita quien
-- atiende la captación: Nuevo → Visto → Contactado → Descartado | Convertido.
--
-- capture-lead no la envía: nace en 'Nuevo' por defecto. El panel la cambia y
-- registra cada cambio en eventos_estado (contrato 1.2 del grupo).
-- ============================================================================

alter table public.leads
  add column if not exists status text not null default 'Nuevo'
    check (status in ('Nuevo', 'Visto', 'Contactado', 'Descartado', 'Convertido')),
  add column if not exists status_changed_at timestamptz;

-- Coherencia con lo que ya existe: lo convertido queda Convertido.
update public.leads set status = 'Convertido'
 where converted is true and status = 'Nuevo';

create index if not exists leads_status_created
  on public.leads (status, created_at desc);

comment on column public.leads.status is
  'Ciclo comercial mínimo del lead. Cambios registrados en eventos_estado (entidad=lead).';
