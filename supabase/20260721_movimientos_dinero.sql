-- ►► CORRER EN: proyecto Supabase de STRYV — ref lxpgqhghxfqsahwrdmzo
-- ============================================================================
-- MOVIMIENTOS_DINERO — sacar los pagos de adentro del cliente
-- ============================================================================
-- POR QUÉ EXISTE: hoy los pagos de Stryv viven como un array `jsonb` dentro de
-- la fila del cliente (`clients.payments`). Eso trae tres problemas que ya
-- están costando números equivocados:
--
--   1. EL SOFT DELETE BORRA LA HISTORIA FINANCIERA. El panel filtra
--      `deleted_at is null`, así que al "eliminar" un cliente sus pagos
--      desaparecen de TODOS los meses pasados: el cobrado histórico baja solo
--      y la utilidad de meses ya cerrados cambia. Es el mismo bug que ya se
--      corrigió para las herramientas, sin corregir para los clientes.
--
--   2. DOS FUENTES DE VERDAD. El dashboard suma `amount_paid` (un campo
--      denormalizado que solo se recalcula desde el navegador); el historial
--      suma `payments[]`. Cuando se desalinean, el panel muestra dos totales
--      distintos sin avisar cuál es el bueno.
--
--   3. NO SE PUEDE AUDITAR. Un array editable no deja rastro: no se sabe
--      quién cambió un monto ni cuándo.
--
-- QUÉ HACE: crea el libro y copia los pagos existentes. NO borra `payments`
-- ni `amount_paid` — el panel los sigue usando hasta que se migre la interfaz.
-- Primero los datos, después el código.
--
-- LA MONEDA: cada cliente tiene UNA moneda que aplica a todos sus pagos
-- (`clients.currency`). No hay moneda por pago, así que eso es lo que hay. Se
-- guarda tal cual, SIN convertir: convertir al tipo de cambio de hoy un pago
-- de hace un año es inventar. La conversión es un problema de presentación.
-- ============================================================================

CREATE TABLE IF NOT EXISTS movimientos_dinero (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  negocio         text NOT NULL DEFAULT 'stryv',
  ocurrido_en     timestamptz NOT NULL DEFAULT now(),

  -- Centavos enteros. `payments[].amount` viene como texto o número con
  -- decimales; acá se normaliza de una vez.
  -- PUEDE SER NEGATIVO: una devolución es otra fila, no un UPDATE.
  monto_centavos  bigint NOT NULL,
  moneda          text NOT NULL CHECK (moneda IN ('MXN', 'USD', 'EUR')),

  concepto        text NOT NULL CHECK (concepto IN ('retainer', 'proyecto', 'academia', 'reembolso', 'ajuste')),
  metodo          text NOT NULL DEFAULT 'transferencia',

  -- El id que traía el pago dentro del jsonb, o el folio del comprobante.
  -- Llave de idempotencia: permite correr el backfill dos veces sin duplicar.
  referencia_externa text,

  cliente_id      uuid,
  actor           uuid REFERENCES auth.users(id),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_dinero_ref_unica
  ON movimientos_dinero (negocio, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

CREATE INDEX IF NOT EXISTS movimientos_dinero_fecha
  ON movimientos_dinero (negocio, ocurrido_en DESC);

CREATE INDEX IF NOT EXISTS movimientos_dinero_cliente
  ON movimientos_dinero (cliente_id, ocurrido_en DESC);

-- ── Append-only ─────────────────────────────────────────────────────────────
-- Esto es exactamente lo que hoy falta: que borrar un cliente no borre lo que
-- ese cliente pagó. Un ingreso registrado es un hecho histórico.
CREATE OR REPLACE FUNCTION trg_movimientos_dinero_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('stryv.purga_movimientos', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'MOVIMIENTOS_APPEND_ONLY: un movimiento de dinero no se edita ni se borra; registra un asiento de correccion (monto negativo)';
END; $$;

DROP TRIGGER IF EXISTS movimientos_dinero_no_update ON movimientos_dinero;
CREATE TRIGGER movimientos_dinero_no_update
  BEFORE UPDATE OR DELETE ON movimientos_dinero
  FOR EACH ROW EXECUTE FUNCTION trg_movimientos_dinero_append_only();

-- ── Seguridad ───────────────────────────────────────────────────────────────
-- A diferencia de `tools`/`prospects`/`content`, que quedaron con políticas
-- `USING(true)` para cualquier autenticado, este libro se lee solo con rol
-- admin. Es el registro del dinero de la empresa.
ALTER TABLE movimientos_dinero ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON movimientos_dinero FROM PUBLIC;
REVOKE ALL ON movimientos_dinero FROM anon;
REVOKE ALL ON movimientos_dinero FROM authenticated;

-- El panel corre en el navegador con sesión de usuario, así que necesita poder
-- leer y registrar. Escribir sí; editar y borrar los frena el trigger.
GRANT SELECT, INSERT ON movimientos_dinero TO authenticated;

DROP POLICY IF EXISTS movimientos_admin_lee ON movimientos_dinero;
CREATE POLICY movimientos_admin_lee ON movimientos_dinero
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS movimientos_admin_registra ON movimientos_dinero;
CREATE POLICY movimientos_admin_registra ON movimientos_dinero
  FOR INSERT TO authenticated WITH CHECK (is_admin());

COMMENT ON TABLE movimientos_dinero IS
  'Libro contable de STRYV. Append-only, centavos enteros. Reemplaza a clients.payments (jsonb), que queda como legacy hasta migrar el panel.';

-- ============================================================================
-- BACKFILL — copiar los pagos que ya existen
-- ============================================================================
-- NO se filtra `deleted_at`: los pagos de un cliente borrado son justamente
-- los que hoy se pierden. Ese es el bug que esto arregla.
INSERT INTO movimientos_dinero
  (negocio, ocurrido_en, monto_centavos, moneda, concepto, metodo, referencia_externa, cliente_id, metadata)
SELECT
  'stryv',
  (p->>'date')::timestamptz,
  round((p->>'amount')::numeric * 100)::bigint,
  upper(coalesce(c.currency, 'USD')),
  'proyecto',
  'transferencia',
  -- El id que el panel genera por pago. Si faltara, se arma uno estable con
  -- cliente+fecha+monto para que un segundo pase no duplique.
  coalesce(nullif(p->>'id', ''), c.id::text || '_' || (p->>'date') || '_' || (p->>'amount')),
  c.id,
  jsonb_build_object(
    'backfill', true,
    'cliente_nombre', c.name,
    'nota', p->>'note',
    'cliente_borrado', (c.deleted_at IS NOT NULL)
  )
FROM clients c, jsonb_array_elements(coalesce(c.payments, '[]'::jsonb)) p
WHERE coalesce(p->>'date', '') <> ''
  AND coalesce(p->>'amount', '') <> ''
  AND (p->>'amount') ~ '^-?[0-9]+\.?[0-9]*$'
  AND (p->>'amount')::numeric <> 0
ON CONFLICT DO NOTHING;

-- ============================================================================
-- REPORTE — qué entró, y qué dinero quedó fuera
-- ============================================================================
-- Lo segundo importa tanto como lo primero: hay clientes con `amount_paid > 0`
-- pero sin pagos cargados. Ese dinero NO se migra, porque no tiene fecha y
-- ponerle una inventada contamina el histórico en silencio. Se reporta para
-- que vos decidas caso por caso.
SELECT * FROM (
  SELECT 1 AS orden, 'Pagos migrados al libro' AS concepto,
         count(*)::text AS cantidad,
         to_char(coalesce(sum(monto_centavos), 0) / 100.0, 'FM999,999,990.00') AS monto
  FROM movimientos_dinero WHERE negocio = 'stryv'

  UNION ALL
  SELECT 2, '  ...de clientes borrados (antes se perdian)',
         count(*)::text,
         to_char(coalesce(sum(monto_centavos), 0) / 100.0, 'FM999,999,990.00')
  FROM movimientos_dinero
  WHERE negocio = 'stryv' AND (metadata->>'cliente_borrado')::boolean IS TRUE

  UNION ALL
  SELECT 3, 'Clientes con amount_paid pero SIN pagos cargados',
         count(*)::text,
         to_char(coalesce(sum(amount_paid), 0), 'FM999,999,990.00')
  FROM clients
  WHERE coalesce(amount_paid, 0) > 0
    AND jsonb_array_length(coalesce(payments, '[]'::jsonb)) = 0

  UNION ALL
  SELECT 4, 'Pagos sin fecha o con monto ilegible (no migrables)',
         count(*)::text, ''
  FROM clients c, jsonb_array_elements(coalesce(c.payments, '[]'::jsonb)) p
  WHERE coalesce(p->>'date', '') = ''
     OR NOT ((p->>'amount') ~ '^-?[0-9]+\.?[0-9]*$')
) t ORDER BY orden;