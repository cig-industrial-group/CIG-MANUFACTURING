# Changelog

Todos los cambios notables de este proyecto se documentarán en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/),
y este proyecto se adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0/es/).

## [2.2.0] — 2026-11-13

> **Hito: Security Hardening Milestone** — Cierre integral de los 9 hallazgos del pentest de caja gris (INFORME-PENTEST-CIG-MANUFACTURING.md, 2026-11-12). 
> Elevación del cumplimiento a OWASP ASVS Nivel 3, ISO 27001 A.14.2.5 y NIST SP 800-53 (familias AC, AU, IA, SC).

### 🔒 Seguridad (Security Hardening) — Cierre de hallazgos H1–H9

#### H1 — Eliminación de puerta trasera en recuperación de contraseña (CVSS 9.8 → 0)
- **Vector cerrado**: el código de 6 dígitos de recuperación ya **nunca viaja en la respuesta HTTP** (`POST /api/auth/recuperacion`). Se entrega exclusivamente por canal fuera de banda: log del servidor con etiqueta `[AUDIT_SENSITIVE]` para entrega manual/verbal por el operador (OWASP ASVS 6.3.1).
- **Límite por cuenta inmutable**: la clave de bloqueo pasó de `rec:{correo}:{ip}` a `rec:cta:{correo}`, eliminando la evasión por rotación de `X-Forwarded-For`.
- **Respuesta uniforme anti-enumeración**: `{"ok":true,"expiraMinutos":15}` idéntica exista o no el correo (HTTP 200).
- **Archivos**: `src/app/api/auth/recuperacion/route.ts`, `src/modulos/autenticacion/servicios/limites.ts`.
- **Tarea**: TASK-STR-004.

#### H2 — Revocación inmediata de sesiones JWT tras cambio/restablecimiento de contraseña (CVSS 7.4 → 0)
- **Mecanismo**: nuevo campo `Usuario.passwordCambiadaEn` (migración no destructiva con `@default(now())`). La función `obtenerSesion()` compara `payload.iat * 1000` contra `passwordCambiadaEn.getTime()` y rechaza sesiones emitidas antes del último cambio de credenciales (OWASP ASVS 3.3.1 / NIST SP 800-63B §7.1).
- **Complejidad O(1)**: sin listas de revocación ni consultas adicionales.
- **Alineación temporal quirúrgica**: en `/api/auth/password` la marca usa `new Date()` con milisegundos completos (fail-closed, no emite token nuevo); en `/api/auth/recuperacion/confirmar` se alinea al segundo (`setMilliseconds(0)`) para no revocar el token recién emitido por el auto-login post-restablecimiento.
- **Archivos**: `prisma/schema.prisma`, `src/modulos/autenticacion/servicios/auth.ts`, `src/app/api/auth/password/route.ts`, `src/app/api/auth/recuperacion/confirmar/route.ts`, migración `20261112214224_add_password_cambiada_en_session_revocation`.
- **Tarea**: TASK-STR-005.

#### H3 — Anti-fuerza bruta robusto con fail-closed de proxy (CVSS 7.4 → 0)
- **`ipPeticion()` fail-closed**: devuelve `"local"` salvo `PROXY_DE_CONFIANZA=1`, ignorando `X-Forwarded-For` en conexión directa (OWASP — no confiar en cabeceras controladas por el cliente).
- **Clave de bloqueo por cuenta inmutable**: `login:cta:{correo}` (sin componente IP). El límite por IP (`login:ip:{ip}`) queda relegado a capa secundaria de volumen, activable solo con proxy de confianza declarado.
- **Unificación en confirmación**: `conf:cta:{correo}` aplica la misma lógica en `POST /api/auth/recuperacion/confirmar`.
- **Archivos**: `src/modulos/autenticacion/servicios/limites.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/recuperacion/confirmar/route.ts`, `.env.example`.
- **Tarea**: TASK-STR-006.

#### H4 — Sanitización lineal de SVG en branding (CVSS 6.9 → 0)
- **Saneador artesanal con máquina de estados en una pasada (O(n))**: reemplaza las regex cuadráticas originales (vulnerables a ReDoS con payloads de 2 MB) por un parser lineal con pila de descarte acotada a 64 niveles.
- **Lista blanca estricta de 24 elementos SVG seguros** (`svg`, `g`, `path`, `rect`, `circle`, `text`, `linearGradient`, etc.).
- **Eliminación de**: etiquetas `script`, `foreignObject`, `iframe`, `a`, `animate`, `set`, `handler`; atributos `on*`, `href`, `xlink:href`, `filter`; neutralización de `url(https://…)` → `url(#…)`.
- **Integración**: `sanearSvg()` se ejecuta dentro de `validarArchivoLogo()` antes de persistir; re-verificación `esSvg()` post-saneado rechaza SVGs no recuperables.
- **Archivos**: `src/modulos/ajustes/servicios/branding.ts`.
- **Tarea**: TASK-STR-009 (Pilar 1).

#### H5 — Step-up authentication y auditoría de diferencias en restauración de respaldos (CVSS 9.1 → 0)
- **Re-autenticación obligatoria**: `POST /api/respaldo/restaurar` exige `password` en el cuerpo además de la sesión. Se valida contra el hash bcrypt del operador solicitante (OWASP ASVS 6.2.2). Respuesta uniforme `401 PASSWORD_INCORRECTA` sin revelar existencia del usuario.
- **Informe de diferencias persistente**: captura del plantel de usuarios/roles ANTES y DESPUÉS de la transacción; diff de cuentas añadidas/eliminadas (formato `"correo (ROL)"` / `"correo (ROL, INACTIVO)"`) persistido en nuevo campo `RestauracionBD.informeDiferencias` (JSONB) y devuelto en la respuesta.
- **Alerta temprana para SIEM**: `console.warn` en el log del servidor cuando la restauración INTRODUJO cuentas.
- **Cobertura automática de reversión**: al compartir `restaurarNucleo`, el endpoint `/api/respaldo/revertir` queda auditado sin cambios adicionales.
- **Archivos**: `prisma/schema.prisma`, `src/app/api/respaldo/restaurar/route.ts`, `src/modulos/respaldo/servicios/nucleo.ts`, migración `20261113004239_add_informe_diferencias_restauracion`.
- **Tarea**: TASK-STR-007.

#### H6 — Restauración del flujo round-trip de respaldos (CVSS 6.5 → 0)
- **Causa raíz**: `tablasDelTOC()` no excluía `_prisma_migrations` (tabla interna de Prisma), mientras que `tablasEnBase()` sí lo hacía. Todo respaldo generado por el propio sistema era rechazado con `RESPALDO_INCOMPATIBLE` (409) al re-subirse.
- **Corrección**: exclusión explícita de `_prisma_migrations` en `tablasDelTOC()`, alineando simétricamente ambos criterios (DRY).
- **Archivos**: `src/modulos/respaldo/servicios/nucleo.ts`.
- **Tarea**: TASK-STR-008.

#### H7 — Mitigación de enumeración por timing en login (CVSS 3.7 → 0)
- **Hash señuelo constante**: constante `HASH_SENUELO` (bcrypt coste 10) utilizada cuando el correo no existe, garantizando que `verificarPassword()` se ejecute siempre con el mismo coste computacional (OWASP ASVS 2.5.4).
- **Sin retardos artificiales**: el coste es puramente criptográfico, indistinguible de un hash real.
- **Archivos**: `src/app/api/auth/login/route.ts`.
- **Tarea**: TASK-STR-010.

#### H8 — CSP con nonce dinámico y cabeceras de seguridad globales (transversal)
- **Middleware con nonce criptográfico por petición**: `src/middleware.ts` (NUEVO) genera `crypto.randomUUID()` en base64, inyecta `Content-Security-Policy: script-src 'self' 'nonce-<NONCE>'` y propaga el nonce a las cabeceras de la petición para que Next.js App Router lo aplique automáticamente a sus scripts internos de hidratación (`getScriptNonceFromHeaders`).
- **CSP global estricta sin `'unsafe-inline'` ni `'unsafe-eval'`**: `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`.
- **CSP específica para branding**: `/api/branding/:recurso*` sobrescribe a `default-src 'none'; img-src 'self' data:` (defensa en profundidad contra XSS residual del Pilar 1).
- **Cabeceras transversales**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` en todas las respuestas.
- **Renderizado dinámico de `/`**: `src/app/layout.tsx` propaga el nonce al `<html>` y fuerza render dinámico (un HTML prerenderizado no puede portar nonce por petición).
- **Guard de instrumentación**: `src/instrumentation.ts` añade `NEXT_RUNTIME !== "nodejs"` para evitar que el grafo Prisma → `node:path` explote en el bundle Edge del middleware.
- **Archivos**: `src/middleware.ts` (NUEVO), `src/app/layout.tsx`, `src/instrumentation.ts`, `next.config.ts` (bloque `async headers()` eliminado, migrado al middleware).
- **Tarea**: TASK-STR-009 (Pilar 2).

#### H9 — Fail-fast explícito ante `AUTH_SECRET` inválido en producción (informativa → resuelta)
- **Terminación explícita del proceso**: `process.exit(1)` en `src/instrumentation.ts` tras el rechazo, garantizando que supervisores (systemd `Restart=on-failure`, Docker HEALTHCHECK, k8s liveness) detecten la caída y reinicien.
- **Archivos**: `src/instrumentation.ts`.
- **Tarea**: TASK-STR-011.

### 🧹 Limpieza de deuda técnica
- **Eliminación de UI muerta**: removido el bloque de "código de simulación" en `PantallaAutenticacion.tsx` que leía `resp.codigo` (campo obsoleto desde TASK-STR-004).
- **Limpieza de tipos**: `RespuestaRecuperacion` ya no declara el campo `codigo` (deuda diferida de TASK-STR-004).
- **Documentación operativa**: nueva sección "Acceso a Logs de Recuperación" en `README-DEPLOY.md` con instrucciones de enmascaramiento para SIEM y procedimiento de entrega manual/verbal.
- **Variable `PROXY_DE_CONFIANZA`**: documentada en `.env.example` y `README-DEPLOY.md` (fail-closed por defecto).

### ⚠️ Breaking Changes (operativos)
- **`/` pasa de estática a dinámica**: el layout raíz ahora es `ƒ Dynamic` (antes `○ Static`) para portar el nonce CSP por petición. Impacto de rendimiento despreciable en tráfico interno; vigilar en escala.
- **Nueva variable de entorno opcional**: `PROXY_DE_CONFIANZA=1` debe declararse explícitamente cuando el despliegue use un proxy inverso que sobrescriba `X-Forwarded-For` (Caddy oficial). Sin ella, todas las peticiones comparten la clave `"local"` del limitador por IP.
- **Nueva columna en `RestauracionBD`**: `informeDiferencias JSONB` (nulable, migración no destructiva). Las restauraciones previas a esta versión quedan con `null`.
- **Contrato de `POST /api/respaldo/restaurar`**: ahora exige `password` en el cuerpo. La UI debe actualizarse para solicitar la contraseña del operador antes de invocar el endpoint (deuda de frontend pendiente).

### 📋 Notas de despliegue
1. **Orden de migración**: aplicar migraciones en orden cronológico (`20261106160000_linea_base_postgresql` → `20261112214224_add_password_cambiada_en_session_revocation` → `20261113004239_add_informe_diferencias_restauracion`). Todas son aditivas y no destructivas.
2. **Post-despliegue**: los usuarios existentes recibirán `passwordCambiadaEn = now()`; sus sesiones actuales seguirán válidas hasta expiración natural (24 h) o próximo cambio de contraseña.
3. **HSTS**: sigue siendo recomendación del proxy inverso (Caddy). No se modifica `infra/caddy/Caddyfile` en esta versión; el endurecimiento se aplica en la capa de aplicación.
4. **Aviso de Next.js 16**: el convenio `middleware.ts` está deprecado en favor de `proxy.ts`. Funcional en 16.4.5; migrar al actualizar Next.

### 🧪 Verificación post-despliegue
```bash
# 1. Health check SSOT
curl -s http://localhost:3000/api
# → {"estado":"ok","sistema":"CIG-MANUFACTURING","version":"2.2.0"}

# 2. CSP con nonce
curl -sI http://localhost:3000/ | grep -i content-security-policy
# → script-src 'self' 'nonce-<base64>'

# 3. Sanitización SVG
curl -s -X POST http://localhost:3000/api/ajustes/branding/logo \
  -H "Cookie: $ADMIN" -F "archivo=@logo-test.svg"
curl -s http://localhost:3000/api/branding/logo | grep -c "<script>"
# → 0

# 4. Step-up en restauración
curl -s -X POST http://localhost:3000/api/respaldo/restaurar \
  -H "Content-Type: application/json" -H "Cookie: $ADMIN" \
  -d '{"id":"<respaldo-id>"}'
# → HTTP 400 {"error":"ID_Y_PASSWORD_REQUERIDOS"}

# 5. Anti-timing en login (script de medición)
# → Diferencia media < 20 ms entre correo existente e inexistente

## [2.1.0] - 2026-11-11

> **Incremento MINOR (SemVer 2.0.0, §7):** nueva funcionalidad compatible hacia
> atrás (módulo de versión centralizado y health check); sin cambios de interfaz
> de despliegue ni de esquema de base de datos.

### Added

- **Versión del sistema como Única Fuente de Verdad (SSOT): nuevo módulo
  `src/lib/version.ts`.** La versión vive exclusivamente en el campo `version`
  de `package.json` y el resto del sistema la lee de ahí, eliminando las
  copias a mano que obligaban a editar múltiples archivos por liberación y
  derivaban en versiones desincronizadas entre UI, API y scripts.
  - **Rutas API y Server Components** importan `VERSION_DEL_SISTEMA` /
    `ETIQUETA_VERSION_SISTEMA` directamente del módulo.
  - **Client Components** NO importan el módulo (evita empaquetar
    `package.json` en el navegador): reciben la versión como **prop** desde
    el Server Component raíz (`src/app/page.tsx`), que la distribuye al
    shell (`SistemaGestionFabrica`) y de ahí a la pantalla de acceso y los
    pies de página. La alternativa de variable de entorno inyectada en el
    build (`NEXT_PUBLIC_APP_VERSION`) se descartó: replicaría la versión en
    la configuración/CI, recreando la duplicación que se elimina.
- **Health check en `GET /api`**: responde `{ estado, sistema, version }` con
  la versión leída de `package.json` (el `HEALTHCHECK` del Dockerfile consume
  el mismo endpoint; sustituye al marcador «Hello, world!» del andamiaje).

### Changed

- **Versión del sistema: v2.0.0 → v2.1.0** (campo `version` de `package.json`,
  única fuente de verdad).
- **UI**: la clave `app.version` se eliminó de los diccionarios ES/EN (la
  versión no es un texto traducible); los pies de página del shell (escritorio
  y móvil), la barra lateral y la pantalla de acceso muestran la versión
  recibida por prop.
- **`deploy.sh`**: los banners de consola y el encabezado de la unidad
  systemd leen la versión de `package.json` en tiempo de ejecución (`sed`,
  sin dependencias nuevas); el script ya no arrastra una versión duplicada.
- **`scripts/empaquetar.sh`**: el comentario de cabecera deja de fijar la
  versión a mano.

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

[2.2.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v1.1.1...v2.0.0
