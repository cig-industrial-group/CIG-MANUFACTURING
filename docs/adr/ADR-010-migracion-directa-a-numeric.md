# ADR-010 — Migración directa de los campos numéricos a NUMERIC nativo (fin de la era «Decimal como String»)

> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-010 — Migración directa de los campos numéricos a NUMERIC nativo

**Estado:** Aceptado · **Fecha:** v2.3.0 · **Complementa a:** [ADR-009](./ADR-009-migracion-postgresql-16.md) · **Reemplaza la nota «Decimales como String/TEXT» heredada de la Fase 1**

### Contexto

Desde la remediación de integridad numérica de la serie 1.x, las cantidades, costos y
medidas persisten como **texto decimal exacto** (`String` en Prisma, `TEXT` en
PostgreSQL). La aritmética vive en `src/lib/numerico.ts` (`Prisma.Decimal`/decimal.js):
toda entrada pasa por `aDecimal` (fail-closed) y toda comparación y suma es exacta.
Ese diseño resolvió un defecto real del motor anterior — el mapeo Decimal de Prisma
sobre SQLite persistía `REAL`/float64 (0.1 × 3 → `0.30000000000000004`) — y el ADR de
la era SQLite lo documentó como decisión consciente.

Con PostgreSQL 16 como motor obligatorio ([ADR-009](./ADR-009-migracion-postgresql-16.md)),
ese esquema dejó de ser una protección para convertirse en **deuda técnica con costo
de seguridad**:

1. **El dominio numérico lo impone solo la aplicación.** La base acepta cualquier
   texto en esas columnas: una escritura externa (SQL manual, restauración parcial,
   inyección lógica) puede persistir `cantidad = 'abc'` y el incidente solo se
   detecta al leer — y lanza `VALOR_DECIMAL_CORRUPTO` en producción. Violación de
   NIST SP 800-53 SI-10 (validación de información) y SC-28 (protección en reposo);
   ISO/IEC 27001:2022 A.8.15 (integridad de los datos de la información).
2. **Cero capacidad de agregación y comparación en el motor.** Los agregados SQL
   (`SUM`), los índices de rango y los `CHECK` de dominio no operan sobre texto
   decimal: cada consulta de valoración, filtrado «con stock» y alerta de mínimo
   debe **traer todas las filas a la capa de aplicación** y recomputarla con
   Decimal. Es una penalización de latencia y memoria que crece con el inventario.
3. **Frontera duplicada.** El contrato numérico (15 dígitos enteros, 6 decimales)
   se re-implementa en el patrón de `numerico.ts`, en el patrón frontend-safe de
   `modulos/unidades/tipos.ts` y en las revisiones de código. Cada capa es una
   oportunidad de desviación; el motor no colabora en hacerla imposible.

**Condición decisiva:** el sistema se despliega hoy en un entorno **limpio**
(greenfield) — no existen instalaciones con datos legacy en las columnas `String`.
La semilla (`scripts/seed.ts`) es la única fuente de datos iniciales y el sistema se
instala desde cero con `deploy.sh`/`setup.sh`. No hay historial que preservar en
esas columnas.

### Decisión

Ejecutar una **migración total y directa** del esquema — sin patrón
Expand-and-Contract, sin columnas espejo, sin dual-write — reemplazando en
`prisma/schema.prisma` cada columna `String` numérica por su tipo `Decimal` nativo:

| Modelo | Columna | Antes | Ahora |
|---|---|---|---|
| `Stock` | `cantidad` | `String @default("0")` | `Decimal @default(0) @db.Decimal(15, 6)` |
| `Movimiento` | `cantidad` | `String` | `Decimal @db.Decimal(15, 6)` |
| `Movimiento` | `cantidadDespues` | `String?` | `Decimal? @db.Decimal(15, 6)` |
| `Producto` | `stockMinimo` | `String @default("0")` | `Decimal @default(0) @db.Decimal(15, 6)` |
| `Producto` | `costoUnitario` | `String?` | `Decimal? @db.Decimal(15, 4)` |
| `Producto` | `contenidoPaquete` | `String?` | `Decimal? @db.Decimal(15, 6)` |
| `RegistroScrap` | `cantidad` | `String` | `Decimal @db.Decimal(15, 6)` |
| `RegistroRechazo` | `cantidad` | `String` | `Decimal @db.Decimal(15, 6)` |

**Precisión.** `DECIMAL(15, 6)` para cantidades y medidas replica la frontera que
`numerico.ts` ya imponía (15 dígitos enteros, 6 decimales): la base exige el mismo
contrato que la aplicación, ni más laxo (que aceptaría corrupción) ni más estricto
(que rechazaría valores históricamente válidos). `DECIMAL(15, 4)` para el costo
unitario: magnitud monetaria con práctica contable estándar (subcentavos); la
valoración `cantidad(15,6) × costo(15,4)` produce a lo sumo 19+10 dígitos y cabe en
`NUMERIC` agregable sin desbordamiento. **Prohibido `Float`/`Real`** — invariante
intacta de la política de integridad numérica.

**Capa de lógica.** `src/lib/numerico.ts` queda como la ÚNICA fuente de aritmética y
de validación de frontera (SRP): `aDecimal` sigue validando toda entrada HTTP con la
misma regla fail-closed; `desdeBD` ahora tipa exclusivamente `Prisma.Decimal` (lo que
la base devuelve) y pierde su manejo de texto; `texto()` persiste la forma canónica
cuando la respuesta de la API exige un string. Toda operación `create`/`update`
escribe el `Decimal` ya validado directamente en su columna — sin empaquetadores
intermedios.

**Contrato de serialización.** `Prisma.Decimal` se serializa a **string** en JSON
(Next.js lo hace de forma nativa): el frontend sigue recibiendo exactamente la misma
forma `"12.345"` que recibía de la columna String. **Cero cambios en los componentes
de React.**

**Migración.** Una sola migración de esquema, transaccional (`ALTER TABLE …
ALTER COLUMN … TYPE DECIMAL(…)` con `USING` idempotente). En un entorno greenfield se
aplica antes de la primera siembra; no existe ventana de doble representación porque
no existen datos que migrar.

### Alternativas descartadas

1. **Conservar `String` indefinidamente.** Rechazada: perpetúa la violación SI-10/SC-28
   (el dominio depende de la app) y el costo de agregación crece con el inventario.
   Era la decisión correcta *para SQLite* (ADR-001): sin `NUMERIC` confiable en ese
   motor, el texto exacto era la única vía; con PostgreSQL, es anacronismo.
2. **Expand-and-Contract (columnas espejo + dual-write + backfill + contracción en
   cuatro fases).** Rechazada por **innecesaria**: está diseñada para proteger datos
   legacy durante migraciones sin tiempo de inactividad. En greenfield no hay datos
   que proteger: el patrón añadiría 4 despliegues, una fase de doble escritura con
   riesgo de divergencia, un script de backfill que mantener y auditoría de
   inconsistencia String↔Decimal — todo para llegar al mismo esquema final. Costo sin
   beneficio. (Se descartó formalmente cuando el análisis del entorno confirmó la
   ausencia de instalaciones con datos.)
3. **`Float`/`Double`.** Rechazada de raíz: reintroduce los defectos IEEE-754 que la
   remediación Fase 1 eliminó (0.1+0.2 ≠ 0.3). Política del sistema: prohibido para
   cantidades, costos o medidas.
4. **Migración vía tabla nueva + renombrado.** Rechazada: reescribe la tabla completa
   (bloqueos prolongados) y rompe la continuidad de las claves foráneas y snapshots
   del ledger. `ALTER COLUMN … TYPE` con `USING` es la vía canónica y transaccional.

### Consecuencias

**Positivas**

- **La base impone el dominio** (defensa en profundidad real): PostgreSQL rechaza en
  escritura todo valor fuera de `NUMERIC(15,6)/(15,4)` — la corrupción externa
  prácticamente desaparece como clase de incidente (OWASP ASVS 5.1: la frontera de
  validación incluye el reposo; NIST SI-10/SC-28).
- **Agregación nativa**: `SUM`, comparaciones de rango y `CHECK`s operan en el motor
  — las rutas de inventario/estadísticas pueden agregarse en SQL sin arrastrar filas
  (la app conserva su Decimal exacto para la aritmética de negocio).
- **Menos superficie de código**: sin empaquetadores dual, sin scripts de backfill,
  sin contador de columnas pendientes; `numerico.ts` reduce su responsabilidad a
  validar-entrada/aritmética-exacta/serializar-salida.
- **Frontera única**: el contrato 15/6 vive en el motor y `aDecimal` lo espejea para
  la entrada HTTP; el frontend ya no puede enviar nada que la base no pueda guardar.

**Negativas / costos aceptados**

- La precisión queda fijada por el esquema: ampliar `DECIMAL(15,6)` en el futuro
  exige una migración `ALTER TYPE` (rápida en PostgreSQL mientras no cruce el límite
  de precisión, pero es una decisión versionada, no un cambio de app).
- Todo valor fuera de dominio en la entrada HTTP debe rechazarse *antes* de llegar a
  Prisma (`aDecimal` fail-closed) — una omisión en la validación ya no se «corrige»
  silenciosamente en la capa de persistencia: falla ruidosamente. Ese es el
  comportamiento deseado (Fail-Fast), pero exige disciplina en las rutas nuevas.
- El contract de types de Prisma cambia (`string` → `Decimal` en los tipos
  generados): cualquier consumidor directo del cliente fuera del dominio auditado
  (scripts externos, reportes SQL manuales) debe re-tiparse. El frente de la app
  está cubierto: la auditoría TASK-STR-013 identificó y refactorizó todos los
  consumidores internos.

### Verificación

`bunx prisma validate` (esquema válido), `bunx tsc --noEmit` (cero errores), la suite
Vitest del núcleo numérico (adaptada: ya no ejerce el empaquetador dual, sí la
validación fail-closed y la aritmética exacta) y la prueba de integración sobre
PostgreSQL efímero: migración + siembra + lectura/escritura Decimal + serialización
a string (contrato de la API intacto).

---

**Referencias normativas:** OWASP ASVS 5.1 (validación de entrada) y 5.4 (integridad de
datos); NIST SP 800-53 SI-10, SC-28; ISO/IEC 27001:2022 A.8.15. **Relacionados:**
[ADR-001](./ADR-001-sqlite-sobre-postgresql.md) (el texto exacto era correcto para
SQLite), [ADR-009](./ADR-009-migracion-postgresql-16.md) (el motor que hace posible
esta decisión).
