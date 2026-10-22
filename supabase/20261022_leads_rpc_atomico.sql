-- ►► CORRER EN: proyecto Supabase de STRYV — ref lxpgqhghxfqsahwrdmzo
-- ►► YA APLICADO el 2026-10-22 (verificado: security invoker, EXECUTE solo para
--    authenticated, FOR UPDATE, idempotencia, auth.uid()). Se versiona para que
--    el repo describa la base real.
-- ============================================================================
-- LEADS · CAMBIO DE ESTADO Y CONVERSIÓN ATÓMICOS (PS-5B.1)
-- ============================================================================
-- Antes, el panel hacía dos o tres sentencias desde el navegador (update del
-- lead, alta del cliente, evento). Un corte a la mitad dejaba lead y cliente
-- inconsistentes o un cambio de estado sin auditoría. Cada operación es ahora
-- UNA función SQL en una transacción. security invoker: RLS sigue decidiendo
-- con la sesión de quien llama (is_admin()).
-- ============================================================================

create or replace function public.cambiar_estado_lead(p_lead uuid, p_estado text)
returns public.leads language plpgsql security invoker as $$
declare v_de text; v_row public.leads;
begin
  select status into v_de from public.leads where id = p_lead for update;
  if not found then raise exception 'lead no encontrado'; end if;
  if v_de = p_estado then select * into v_row from public.leads where id = p_lead; return v_row; end if;
  update public.leads set status = p_estado, status_changed_at = now() where id = p_lead returning * into v_row;
  insert into public.eventos_estado (negocio, entidad, entidad_id, de_estado, a_estado, motivo, actor, metadata)
  values ('stryv', 'lead', p_lead, v_de, p_estado, 'panel', auth.uid(), jsonb_build_object('email', v_row.email));
  return v_row;
end $$;

create or replace function public.convertir_lead(p_lead uuid)
returns uuid language plpgsql security invoker as $$
declare l public.leads; v_client uuid;
begin
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'lead no encontrado'; end if;
  -- Idempotente: un reintento devuelve el cliente ya creado, nunca uno nuevo.
  if l.converted_client_id is not null then return l.converted_client_id; end if;
  insert into public.clients (name, email, phone, company, source, stage, amount, amount_paid, mrr, solutions, tasks, payments, currency)
  values (trim(coalesce(l.name,'')), coalesce(l.email,''), coalesce(l.phone,''), coalesce(l.company,''), coalesce(l.source,'Web'),
          'Lead', 0, 0, 0, '{}', '[]'::jsonb, '[]'::jsonb, 'USD')
  returning id into v_client;
  update public.leads set converted = true, converted_client_id = v_client, status = 'Convertido', status_changed_at = now() where id = p_lead;
  insert into public.eventos_estado (negocio, entidad, entidad_id, de_estado, a_estado, motivo, actor, metadata)
  values ('stryv', 'lead', p_lead, l.status, 'Convertido', 'panel', auth.uid(), jsonb_build_object('email', l.email, 'client_id', v_client));
  return v_client;
end $$;

revoke all on function public.cambiar_estado_lead(uuid, text) from public, anon;
revoke all on function public.convertir_lead(uuid) from public, anon;
grant execute on function public.cambiar_estado_lead(uuid, text) to authenticated;
grant execute on function public.convertir_lead(uuid) to authenticated;
