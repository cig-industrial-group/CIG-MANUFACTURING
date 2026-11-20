> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-009 — Migración del motor de base de datos a PostgreSQL 16

**Estado:** Aceptado · **Fecha:** v2.0.0 · **Reemplaza a:** [ADR-001](./ADR-001-sqlite-sobre-postgresql.md)

### Contexto

La operación del sistema creció hacia exigencias que el motor embebido (ADR-001) no
cubre de forma nativa: clasificación de errores transitorios por códigos estándar
(SQLSTATE) en lugar de heurísticas propias, herramienta industrial de
respaldo/restauración (`pg_dump`/`pg_restore`), concurrencia real de accesos y
trazabilidad auditables de los cambios de esquema. La migración se ejecutó como
proyecto formal con validación de datos de extremo a extremo (gestión de cambio
documentada y verificada: NIST SP 800-53 CM-3, ISO/IEC 27001 A.12.1.2/A.8.6).

### Decisión

Adoptar **PostgreSQL 16+** como único motor soportado (`datasource db { provider =
"postgresql" }` en `prisma/schema.prisma`), con:

1. **Esquema por migraciones auditables**: `prisma migrate deploy` con línea base
   única registrada en `_prisma_migrations` (fin de `prisma db push` sin historial).
2. **Respaldo/restauración industrial**: `pg_dump --format=custom` (volcados `.dump`
   comprimidos), validación previa con `pg_restore --list`, restauración en caliente
   con base transitoria de verificación y transacción única. `PGPASSWORD` viaja solo
   en el objeto `env` de `execFile` (invisible en `ps aux`) y toda herramienta `pg_*`
   se invoca con `--no-password` (fail-fast, sin credenciales en `argv`).
3. **Reintentos por SQLSTATE** (`40001`, `40P01`, `57P03`, `53300`): evolución del
   diseño de ADR-006.
4. **`DATA_DIR` explícito** (12-Factor): respaldos, branding y credenciales dejan de
   inferirse desde `DATABASE_URL`.
5. **Decimal como String/TEXT conservado** (nota ADR en `prisma/schema.prisma`): el
   contrato de exactitud decimal del dominio (Fase 1, `numerico.ts`) es independiente
   del motor.
6. **Operación**: `deploy.sh` instala PostgreSQL 16 de forma idempotente (PGDG) y la
   unidad systemd declara `After/Wants=postgresql.service`; Docker usa
   `postgres:16-alpine` con `healthcheck` (`pg_isready`).

### Justificación

1. **Errores estándar**: SQLSTATE clasifica los transitorios de forma nativa y
   auditable, sin acoplamiento a códigos numéricos de un motor específico.
2. **Respaldo industrial**: los volcados custom son comprimidos, verificables
   (`pg_restore --list`) y restaurables en caliente; la restauración se verifica en
   una base transitoria antes de tocar la base viva.
3. **Concurrencia real**: múltiples conexiones sin cerrojo de escritura por archivo;
   el pool lo administra Prisma de forma nativa.
4. **Trazabilidad**: `_prisma_migrations` registra qué migraciones aplicó cada
   entorno y cuándo.
5. **Cero pérdida de datos**: la migración desde v1.1.1 es transaccional y verificada
   por conteos (`scripts/migrar-sqlite-a-postgres.ts`); folios monotónicos, papelera
   y snapshots del histórico se conservan íntegros (validado por
   `scripts/prueba-humo-postgres.ts`).

### Consecuencias

- **PostgreSQL 16+ pasa a ser requisito obligatorio de despliegue** — breaking
  change que justifica la versión MAYOR 2.0.0 (SemVer 2.0.0 §7–§8).
- Las instalaciones v1.1.1 actualizan mediante `scripts/migrar-sqlite-a-postgres.ts`
  (guía en `README-DEPLOY.md` §8).
- El costo operativo que ADR-001 buscaba evitar se absorbe con `deploy.sh`
  (aprovisionamiento idempotente) y Docker (`postgres:16-alpine` + healthcheck).
- ADR-001 queda **Reemplazado**; su análisis de contexto se conserva como historial.
- Nuevas variables de entorno obligatorias: `DATABASE_URL` (esquema
  `postgresql://`) y `DATA_DIR`; `POSTGRES_PASSWORD` en despliegues Docker.

---
