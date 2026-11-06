# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0/es/).

## [2.0.0] - 2026-11-07

> **Justificación del incremento MAYOR (SemVer 2.0.0, §7–§8):** la migración de motor
> convierte a **PostgreSQL 16+ en un requisito obligatorio de despliegue**. Una
> instalación de la v1.1.1 no puede actualizar en el lugar sin: (1) instalar y operar
> un servidor PostgreSQL 16, (2) definir las nuevas variables de entorno obligatorias
> (`DATABASE_URL` de PostgreSQL y `DATA_DIR`; `POSTGRES_PASSWORD` en Docker) y
> (3) ejecutar el script de migración de datos. Dado que el soporte de SQLite como
> motor **se elimina** — una remoción de la interfaz de despliegue —, el cambio no
> puede versionarse como Minor conforme a SemVer. Gestión de cambio documentada y
> verificada conforme a NIST SP 800-53 (CM-3) e ISO/IEC 27001 (A.12.1.2, A.8.6).

### Added

- Soporte nativo para **PostgreSQL 16** como único motor de base de datos
  (Prisma `provider = "postgresql"`; decisión registrada en el **ADR-009**, que
  reemplaza al ADR-001).
- **Script de migración de datos** `scripts/migrar-sqlite-a-postgres.ts`: copia de las
  21 tablas **dentro de una única transacción** (todo-o-nada) en orden topológico
  (FKs respetadas), verificación de conteos por tabla (cero discrepancias o aborta) y
  fail-fast anti-fusión (se niega a correr sobre una base con datos; `--reemplazar`
  explícito para reintentos controlados en pruebas).
- **Prueba de humo integral** `scripts/prueba-humo-postgres.ts`: valida de extremo a
  extremo sobre PostgreSQL la continuidad de los **folios monotónicos** tras la
  migración, la **papelera de tres niveles** (snapshot + restauración con re-vinculación)
  y el **ciclo completo respaldo → restauración en caliente → reversión** (ventana de
  24 h), además de la fidelidad de tipos (booleanos, fechas, decimales String exactos).
- **Healthchecks en Docker**: `pg_isready` en el servicio `postgres:16-alpine` (la app
  espera `condition: service_healthy` antes de aplicar migraciones) y `HEALTHCHECK`
  sobre `GET /api` en la imagen de la aplicación.
- Variable de entorno **`DATA_DIR`** (metodología 12-Factor): raíz explícita de
  respaldos, branding y credenciales; las rutas ya no se infieren desde
  `DATABASE_URL`.
- `deploy.sh`: instalación **idempotente** de PostgreSQL 16 desde el repositorio
  oficial PGDG (keyring firmado, sin `apt-key` deprecado; servidor + cliente
  `pg_dump`/`pg_restore`/`psql`) y unidad systemd con dependencia
  `After/Wants=postgresql.service`.
- Esquema aplicado por **migraciones auditables** (`prisma migrate deploy`): línea
  base única de PostgreSQL registrada en `_prisma_migrations`.
- Documentación de despliegue actualizada (README, README-DEPLOY, docs/01–06) con
  PostgreSQL 16 como requisito, nuevas variables de entorno y guía de migración.

### Changed

- **Motor de base de datos: SQLite → PostgreSQL 16+ (obligatorio).** El cliente Prisma
  queda sin pragmas ni pool forzado: el pool de conexiones lo administra Prisma de
  forma nativa (fin del `connection_limit=1`).
- **Módulo de respaldo** reescrito sobre `pg_dump`/`pg_restore`/`psql`: volcados
  formato *custom* comprimidos (`.dump`), validación de integridad y esquema del
  archivo (`pg_restore --list`) antes de restaurar, restauración en caliente con base
  transitoria de verificación y transacción única, y ventana de reversión de 24 h.
- **Lógica de reintentos** adaptada a los **SQLSTATE** de PostgreSQL (`40001`
  *serialization failure*, `40P01` *deadlock*, `57P03*` *cannot connect now*,
  `53300` *too many connections*), evolución del diseño de reintentos con retroceso
  exponencial (ADR-006).
- `DATABASE_URL` ahora usa el esquema `postgresql://` (antes `file:`).
- CI (`.github/workflows/ci.yml`) y su simulación local (`scripts/simulacion-ci.sh`)
  migradas al servicio `postgres:16` con base de datos efímera por ejecución.

### Fixed

- **Seguridad — fuga de `AUTH_SECRET` en CI/CD:** el pipeline y su simulación local
  ya no dependen de secretos fijos; los secretos de prueba se generan aleatoriamente
  en cada ejecución y no se publican en el repositorio (cierre del hallazgo de la
  auditoría de seguridad).
- **Bug de importación de tipos en `src/lib/reintentos.ts`:** `Prisma` se importaba
  como solo-tipo, por lo que `Prisma.TransactionIsolationLevel.Serializable` fallaba
  en runtime con `ReferenceError` al primer uso sin nivel explícito. Corregido con
  importación de valor (el namespace aporta tipos y constante).
- **Bug de `orderBy` en claves compuestas** (`src/modulos/respaldo/servicios/nucleo.ts`):
  la paginación de la copia usaba `orderBy` en forma de objeto plano, rechazada por el
  validador de Prisma en modelos con llave primaria compuesta (p. ej. `ModeloParte`) —
  toda restauración que involucrara esa tabla fallaba. Corregido con la forma canónica
  de arreglo de objetos (válido para todos los modelos, mismo orden determinista).
- **Sanitización de trazas:** `resumenError` no expone la `DATABASE_URL` — las
  conexiones se registran enmascaradas en los logs de la aplicación.

### Security

- `PGPASSWORD` se inyecta **exclusivamente en el objeto `env`** de `execFile` (nunca
  en la línea de comandos ni en `argv`): invisible en `ps aux` (ref. ISO/IEC 27001
  A.8.6, OWASP ASVS V2.10.3).
- Toda herramienta `pg_*` se ejecuta con **`--no-password`** como primera bandera:
  fail-fast si falta la credencial, sin secretos en `argv` y sin bloqueos interactivos
  en CI/servicios.
- Aprovisionamiento del rol de PostgreSQL con contraseña transmitida por `stdin`
  (`deploy.sh`/`setup.sh`), nunca en consola ni en historiales de shell.

### Removed

- **Soporte para SQLite** como motor de base de datos (provider de Prisma, driver y
  sentencias específicas del motor).
- **Pragmas de SQLite**: `journal_mode=WAL`, `busy_timeout` y el pool forzado
  `connection_limit=1` (fin del endurecimiento de contención del motor de archivo).
- **Sentencias `VACUUM`/`VACUUM INTO`** del módulo de respaldo (sustituidas por
  `pg_dump --format=custom`).
- **Scripts de prueba obsoletos de la era SQLite**: `scripts/test-respaldo.py`,
  `scripts/test-oqc-fix.py`, `scripts/test-oqc-sync.py`, `scripts/test-unidades.py`
  (verificación directa por `sqlite3`) y `scripts/verificar-upgrade.ts` (URL `file:`) —
  inservibles bajo PostgreSQL; las suites E2E vigentes por HTTP (`test-clientes.py`,
  `test-branding.py`, `test-borrado.sh`) y la batería de pruebas de humo
  (`prueba-humo-postgres.ts` y regresión de Fases 1/4/5) las sustituyen.
- **`DESPLIEGUE.md`**: guía de despliegue deprecada de la era SQLite (ya reemplazada
  por `docs/05-DESPLIEGUE-Y-OPERACION.md` y `README-DEPLOY.md`).
- **Migraciones históricas del motor anterior**: el directorio `prisma/migrations`
  arranca desde una línea base única de PostgreSQL (auditada).

[2.0.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v1.1.1...v2.0.0
