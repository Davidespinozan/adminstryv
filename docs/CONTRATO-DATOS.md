# Contrato de datos — Stryv y sus negocios

Qué tiene que registrar **cada** negocio para que el panel de la empresa madre
pueda medirlos a todos con las mismas reglas.

> **Por qué ahora:** ningún negocio ha lanzado. Este es el único momento en que
> instrumentar es barato. Lo que no se guarde desde el primer cliente **no se
> recupera nunca** — y el histórico de los primeros meses es justo el que dice
> si el negocio funciona.

Origen del estándar: la estructura, la seguridad y el estilo salen de
`renovacell-sistema`; el libro contable sale de `sala-studio`. Los dos huecos que
**ninguno** de los dos resolvió —historial de estados y ledger de dinero
unificado— se cierran acá.

---

## 1. Los dos registros obligatorios

Los cuatro negocios son distintos (SaaS B2B, suscripción B2C, food trucks,
retainers), pero todos producen lo mismo: **dinero que entra** y **clientes que
cambian de estado**. Si los cuatro registran esas dos cosas igual, el panel es
trivial y todas las métricas salen solas. Si cada uno lo inventa, el panel se
vuelve un traductor eterno.

### 1.1 `movimientos_dinero` — el libro contable

```sql
CREATE TABLE IF NOT EXISTS movimientos_dinero (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qué negocio lo generó. Necesario porque hay bases compartidas
  -- (HSC y healthyspace viven en el mismo proyecto Supabase).
  negocio         text NOT NULL,

  ocurrido_en     timestamptz NOT NULL DEFAULT now(),

  -- SIEMPRE centavos enteros, nunca decimales. Un float en dinero termina
  -- en descuadres de un centavo que nadie encuentra.
  -- PUEDE SER NEGATIVO: un reembolso o una corrección es otra fila, no un
  -- UPDATE. Esto es lo que hace que el saldo sea la suma y nada más.
  monto_centavos  bigint NOT NULL,
  moneda          text NOT NULL,              -- 'MXN' | 'USD' | 'EUR'

  concepto        text NOT NULL,              -- 'suscripcion' | 'venta' | 'inscripcion' | 'reembolso' | 'retainer'
  metodo          text NOT NULL,              -- 'stripe' | 'efectivo' | 'transferencia' | 'terminal' | 'cortesia'

  -- Id de Stripe (invoice/payment_intent) o folio del comprobante.
  -- Doble función: rastro hacia afuera Y llave de idempotencia (ver índice).
  referencia_externa text,

  cliente_id      uuid,                       -- a quién se le cobró (si aplica)
  actor           uuid REFERENCES auth.users(id),  -- quién cobró. NULL = cobro automático
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- IDEMPOTENCIA: el webhook de Stripe reintenta. Sin esto, un reintento
-- duplica el ingreso y todos los números quedan inflados en silencio.
CREATE UNIQUE INDEX IF NOT EXISTS movimientos_dinero_ref_unica
  ON movimientos_dinero (negocio, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

CREATE INDEX IF NOT EXISTS movimientos_dinero_negocio_fecha
  ON movimientos_dinero (negocio, ocurrido_en DESC);
```

**Append-only, con candado real** (patrón tomado de `sala-studio`):

```sql
CREATE OR REPLACE FUNCTION trg_movimientos_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MOVIMIENTOS_APPEND_ONLY: un movimiento de dinero no se edita ni se borra; registrá un asiento de corrección (monto negativo)';
END; $$;

DROP TRIGGER IF EXISTS movimientos_no_update ON movimientos_dinero;
CREATE TRIGGER movimientos_no_update
  BEFORE UPDATE OR DELETE ON movimientos_dinero
  FOR EACH ROW EXECUTE FUNCTION trg_movimientos_append_only();
```

> El candado no es burocracia: es lo que hace que el número de ingresos del mes
> pasado sea el mismo hoy que dentro de un año. Sin él, cualquier `UPDATE`
> reescribe la historia y ningún cierre cuadra dos veces.

### 1.2 `eventos_estado` — el historial

Este es el que **no existe en ninguno** de los sistemas actuales, y sin él no
hay churn real, ni cohortes, ni LTV, ni conversión de prueba. Hoy todos guardan
solo el estado *actual*: cuando un cliente cancela, se pierde para siempre el
dato de que antes estuvo activo.

```sql
CREATE TABLE IF NOT EXISTS eventos_estado (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  negocio       text NOT NULL,
  entidad       text NOT NULL,   -- 'suscripcion' | 'cliente' | 'pedido' | 'membresia'
  entidad_id    uuid NOT NULL,

  de_estado     text,            -- NULL = nace (alta)
  a_estado      text NOT NULL,   -- NULL nunca; usar 'cancelada', 'baja', etc.
  motivo        text,            -- 'pago_fallido' | 'cancelacion_voluntaria' | 'fin_trial' | ...

  actor         uuid REFERENCES auth.users(id),  -- NULL = automático (webhook, cron)
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,

  ocurrido_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eventos_estado_entidad
  ON eventos_estado (negocio, entidad, entidad_id, ocurrido_en DESC);
```

Mismo candado append-only que el anterior.

**Regla:** cada vez que una entidad cambia de estado se escribe una fila **en la
misma transacción** que el cambio. No es opcional ni "cuando haya tiempo": si se
escribe después, se pierden justo los casos raros, que son los que importan.

---

## 2. Lo que esto habilita

Con esas dos tablas, del glosario salen directo:

| Métrica | Cómo sale |
|---|---|
| MRR / ARR | suma de `movimientos_dinero` recurrentes del período |
| GMV | suma total por negocio, sin filtrar concepto |
| ARPU | MRR ÷ clientes activos |
| Churn | `eventos_estado` con `a_estado='cancelada'` en el período |
| Cohortes / retención | agrupar por mes del evento de alta |
| Trial conversion | altas con `de_estado='trial' → a_estado='activa'` |
| LTV | suma de movimientos por `cliente_id` hasta su evento de baja |
| Ingresos por método | `group by metodo` |

Ninguna requiere tocar el negocio: todas son consultas sobre las mismas dos
tablas, iguales en los cuatro.

---

## 3. Qué le falta a cada negocio

| Negocio | `movimientos_dinero` | `eventos_estado` |
|---|---|---|
| **sala-studio** | ✅ Ya existe como `pagos` (append-only, con `referencia`). Solo falta permitir montos negativos y agregar `negocio`. | ❌ Falta entero |
| **healthyspaceclub** | ❌ **No guarda ni un monto.** El webhook ignora `checkout.session.completed` y `charge.*`; de `invoice.paid` solo saca un booleano. Los ingresos existen solo en Stripe. | ❌ Falta entero. Además sobrescribe `subscription_status` sin dejar rastro |
| **healthyspace** | ✅ `truck_orders` tiene monto, método y canal. Falta normalizar al formato común. | ❌ No aplica del todo: no hay entidad cliente (pedidos anónimos) |
| **adminstryv** (retainers) | ⚠️ `clients.payments[]` es un jsonb dentro del cliente, no un libro. Hay que extraerlo. | ⚠️ `stage` es columna mutable; el pipeline Lead→Mantenimiento no deja historia |

**El más crítico es HSC**: sin montos en la base, cualquier número del panel es
una estimación cruzando `plan_id` contra una tabla de precios hardcodeada. Se
rompe en cuanto cambie un precio en Stripe.

---

## 4. Convenciones (de `renovacell-sistema`)

**Migraciones**
- Nombre `YYYYMMDDHHMMSS_slug_en_snake_case.sql`; el slug describe **el cambio**.
- Cada una **abre explicando el PROBLEMA que resuelve**, no lo que hace.
- Siempre idempotentes: `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`.
- `COMMENT ON COLUMN` para toda semántica no obvia.

**Nombres**
- Tablas y columnas en inglés o español, pero **una sola decisión por repo** y sostenida.
- PK `id uuid DEFAULT gen_random_uuid()`. FK `<entidad>_id`.
- Toda tabla: `created_at timestamptz DEFAULT now()` + `metadata jsonb` de extensión.
- **Dinero siempre en centavos enteros** (`bigint`), nunca `numeric` sin precisión ni float.

**Seguridad (RLS)**
- Default-deny en todas las tablas. `anon` sin acceso a nada salvo excepción explícita y comentada.
- Helper `SECURITY DEFINER` para el rol, y policies escritas contra él:
  ```sql
  CREATE OR REPLACE FUNCTION auth_role() RETURNS text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT role_id FROM profiles WHERE id = auth.uid();
  $$;
  REVOKE ALL ON FUNCTION auth_role() FROM public;
  GRANT EXECUTE ON FUNCTION auth_role() TO authenticated;
  ```
- **Barreras por tabla, no por columna**: lo que un rol no debe ver, va en otra
  tabla. Así una columna nueva no filtra nada por olvido.
- Cuando un rol necesite escribir algo que su policy no permite: **RPC
  `SECURITY DEFINER` que valida a mano**, nunca aflojar la policy.

**Operaciones**
- RPC **idempotentes**: reintentar no debe romper nada (`IF ya_esta THEN RETURN`).
- Guardas de transición **en el `WHERE`**: `UPDATE ... WHERE id=$1 AND status='previo'`.
- **No enmascarar errores.** `RAISE EXCEPTION` con mensaje que diga qué pasó, en
  vez de un `GREATEST(0, ...)` que esconde el problema.

**Calidad**
- CI de 3 pasos: `typecheck → tests → build`, antes del deploy.
- Lógica de negocio **pura y sin red**, con sus tests al lado del archivo.
- Commits: `tipo(ámbito): efecto para el usuario` — describir el efecto, no el diff.

---

## 5. Lo que NO copiar

Detectado en el análisis; no propagar:

- **Dinero como columnas mutables** sobre la entidad (renovacell lo hace sobre
  `orders`, HSC sobre `user_profiles`). Un `UPDATE` borra el pago anterior.
- **`numeric` sin precisión** para importes.
- **Estados sin historial**: reconstruirlos desde fotos de auditoría es posible
  pero no consultable. Mejor la tabla explícita.
- **`const isA = true`** (adminstryv): todo usuario autenticado es admin total.
  Innegociable arreglarlo antes de que el hub custodie llaves de tres negocios.
- **Funciones serverless sin autenticar** (adminstryv): endpoints públicos que
  queman créditos de API o aceptan webhooks sin validar firma.
- **Columnas legacy vivas**: el `remind_trial` de HSC filtra por `user_plan` y
  `trial_ends_at`, que el webhook de Stripe ya no escribe. La notificación de
  fin de prueba lleva tiempo disparando cero correos, en silencio.

---

## 6. Orden sugerido

1. **Aprobar este contrato** (decisión, sin código).
2. **Instrumentar cada negocio**: las dos tablas + escribir en ellas. Barato hoy,
   caro con clientes adentro.
3. **Cerrar la seguridad de adminstryv** antes de que guarde una sola llave más.
4. **Construir el panel**, que con lo anterior es la parte fácil: leer dos tablas
   iguales en cuatro lugares.

El panel nace mostrando datos reales desde el primer cliente de cada negocio, en
vez de estimaciones con huecos.