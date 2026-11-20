# Changelog

> ⚖️ **AVISO LEGAL:** Copyright © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.  
> Tijuana, Baja California, México. Este proyecto es propiedad privada y confidencial. Queda prohibida su reproducción, distribución o uso no autorizado sin permiso explícito por escrito.

Todos los cambios notables de CIG-MANUFACTURING se documentan en este archivo.

El formato se basa en [Keep a Changelog 1.1.0](https://keepachangelog.com/es-ES/1.1.0/)
y el proyecto se adhiere al [Versionado Semántico 2.0.0](https://semver.org/lang/es/).

## [Unreleased]

## [2.2.0] - 2026-11-17

Versión de endurecimiento de seguridad (*security hardening*). Cierra los 9
hallazgos (H1–H9) del pentest de caja gris documentado en
`INFORME-PENTEST-CIG-MANUFACTURING.md` (2026-11-12). Eleva el cumplimiento a
OWASP ASVS Nivel 3, ISO/IEC 27001 A.14.2.5 y NIST SP 800-53 (familias AC, AU, IA
y SC).

### Added

- Campo `Usuario.passwordCambiadaEn` para la revocación de sesiones (migración
  no destructiva con `@default(now())`). Ver H2.
- Campo `RestauracionBD.informeDiferencias` (JSONB, nulable) para persistir el
  informe de diferencias de cuentas de cada restauración (migración no
  destructiva). Las restauraciones anteriores a esta versión quedan con `null`.
  Ver H5.
- `src/middleware.ts`: middleware con nonce criptográfico por petición y
  cabeceras de seguridad globales. Ver H8.
- `src/modulos/ajustes/servicios/svg.ts`: módulo puro (sin `@/lib/db` ni
  `node:fs`; solo `Buffer`/`string`) que contiene el saneador de SVG. Ver H4.
- Suite permanente de 50 pruebas del saneador de SVG en
  `src/lib/__tests__/svg.test.ts` (16 casos originales de TASK-STR-009, 8
  vectores nuevos V-1…V-8 de TASK-STR-012 y prueba de no regresión del logo),
  integrada en `bun run test` con cobertura medida sobre el módulo puro. Junto
  con las 41 pruebas del núcleo numérico, suman 91 pruebas.
- Variable de entorno opcional `PROXY_DE_CONFIANZA`, documentada en
  `.env.example` y `README-DEPLOY.md` (comportamiento *fail-closed* por
  defecto). Ver H3.
- Sección «Acceso a Logs de Recuperación» en `README-DEPLOY.md`, con
  instrucciones de enmascaramiento para SIEM y el procedimiento de entrega
  manual/verbal del código.
- Alerta temprana para SIEM: `console.warn` en el log del servidor cuando una
  restauración introduce cuentas. Ver H5.

### Changed

- **BREAKING (contrato de API):** `POST /api/respaldo/restaurar` exige ahora
  `password` en el cuerpo de la petición. La interfaz (`DialogoRestaurar`) ya
  solicita la contraseña del operador.
- **BREAKING (contrato de API):** `POST /api/respaldo/revertir` exige ahora
  `password` en el cuerpo, con el mismo candado de step-up (`step:cta:{correo}`)
  y los mismos errores (`PASSWORD_REQUERIDA`, `PASSWORD_INCORRECTA`) que
  `restaurar`. La interfaz (`DialogoRevertir`) ya solicita la contraseña.
- **BREAKING (operativo):** la ruta `/` pasa de estática (`○ Static`) a
  dinámica (`ƒ Dynamic`), porque el nonce CSP debe generarse por petición. El
  impacto de rendimiento es despreciable en tráfico interno; conviene vigilarlo
  a escala.
- **BREAKING (operativo):** cuando el despliegue use un proxy inverso que
  sobrescriba `X-Forwarded-For` (p. ej. el Caddy oficial), debe declararse
  `PROXY_DE_CONFIANZA=1`. Sin esta variable, todas las peticiones comparten la
  clave `"local"` del limitador por IP.
- `src/app/layout.tsx` propaga el nonce al elemento `<html>` y fuerza el
  renderizado dinámico.
- `next.config.ts`: el bloque `async headers()` se elimina y su función migra al
  middleware.
- `src/instrumentation.ts`: se añade la guarda `NEXT_RUNTIME !== "nodejs"` para
  evitar que el grafo Prisma → `node:path` falle en el bundle Edge del
  middleware.
- `POST /api/auth/recuperacion` devuelve una respuesta uniforme
  `{"ok":true,"expiraMinutos":15}` (HTTP 200), exista o no el correo.

### Removed

- Bloque de «código de simulación» en `PantallaAutenticacion.tsx`, que leía el
  campo `resp.codigo`, obsoleto desde TASK-STR-004.
- Campo `codigo` del tipo `RespuestaRecuperacion` (deuda técnica diferida de
  TASK-STR-004).
- Entrega del código de recuperación en la respuesta HTTP de
  `POST /api/auth/recuperacion`. Ver H1.

### Fixed

- **H6 — Flujo round-trip de respaldos (CVSS 6.5).** `tablasDelTOC()` no
  excluía `_prisma_migrations` (tabla interna de Prisma), a diferencia de
  `tablasEnBase()`, por lo que todo respaldo generado por el propio sistema era
  rechazado con `RESPALDO_INCOMPATIBLE` (409) al volver a subirse. Se excluye
  explícitamente la tabla en `tablasDelTOC()`, alineando ambos criterios.
  - Archivo: `src/modulos/respaldo/servicios/nucleo.ts`. Tarea: TASK-STR-008.

### Security

- **H1 — Puerta trasera en la recuperación de contraseña (CVSS 9.8).**
  - El código de 6 dígitos ya no viaja en la respuesta HTTP. Se entrega
    exclusivamente por canal fuera de banda: log del servidor con la etiqueta
    `[AUDIT_SENSITIVE]`, para entrega manual/verbal por el operador
    (OWASP ASVS 6.3.1).
  - La clave de bloqueo pasa de `rec:{correo}:{ip}` a `rec:cta:{correo}`,
    eliminando la evasión mediante rotación de `X-Forwarded-For`.
  - Respuesta uniforme anti-enumeración.
  - Archivos: `src/app/api/auth/recuperacion/route.ts`,
    `src/modulos/autenticacion/servicios/limites.ts`. Tarea: TASK-STR-004.
- **H2 — Revocación inmediata de sesiones JWT tras cambio o restablecimiento
  de contraseña (CVSS 7.4).**
  - `obtenerSesion()` compara `payload.iat * 1000` con
    `passwordCambiadaEn.getTime()` y rechaza las sesiones emitidas antes del
    último cambio de credenciales (OWASP ASVS 3.3.1; NIST SP 800-63B §7.1).
  - Complejidad O(1): sin listas de revocación ni consultas adicionales.
  - En `/api/auth/password` la marca usa `new Date()` con milisegundos
    completos (*fail-closed*; no emite token nuevo). En
    `/api/auth/recuperacion/confirmar` se alinea al segundo
    (`setMilliseconds(0)`) para no revocar el token recién emitido por el
    auto-login posterior al restablecimiento.
  - Archivos: `prisma/schema.prisma`,
    `src/modulos/autenticacion/servicios/auth.ts`,
    `src/app/api/auth/password/route.ts`,
    `src/app/api/auth/recuperacion/confirmar/route.ts`, migración
    `20261112214224_add_password_cambiada_en_session_revocation`.
    Tarea: TASK-STR-005.
- **H3 — Protección anti-fuerza bruta con *fail-closed* de proxy (CVSS 7.4).**
  - `ipPeticion()` devuelve `"local"` salvo que `PROXY_DE_CONFIANZA=1`, e
    ignora `X-Forwarded-For` en conexión directa.
  - Clave de bloqueo por cuenta inmutable: `login:cta:{correo}` (sin componente
    IP). El límite por IP (`login:ip:{ip}`) queda como capa secundaria de
    volumen, activable solo con proxy de confianza declarado.
  - `conf:cta:{correo}` aplica la misma lógica en
    `POST /api/auth/recuperacion/confirmar`.
  - Archivos: `src/modulos/autenticacion/servicios/limites.ts`,
    `src/app/api/auth/login/route.ts`,
    `src/app/api/auth/recuperacion/confirmar/route.ts`, `.env.example`.
    Tarea: TASK-STR-006.
- **H4 — Sanitización de SVG en branding (CVSS 6.9).**
  - Saneador de una sola pasada, con máquina de estados (O(n)) y pila de
    descarte acotada a 64 niveles, que sustituye las expresiones regulares
    cuadráticas originales (vulnerables a ReDoS con cargas de 2 MB).
  - Lista blanca estricta de 23 elementos SVG (`ETIQUETAS_SVG_PERMITIDAS`).
  - Se eliminan las etiquetas `script`, `foreignObject`, `iframe`, `a`,
    `animate`, `set` y `handler`; los atributos `on*`, `href`, `xlink:href` y
    `filter`; y se neutraliza `url(https://…)` → `url(#…)`.
  - `sanearSvg()` se ejecuta dentro de `validarArchivoLogo()` antes de
    persistir; una reverificación con `esSvg()` rechaza los SVG no
    recuperables.
  - Archivos: `src/modulos/ajustes/servicios/svg.ts`,
    `src/modulos/ajustes/servicios/branding.ts`,
    `src/lib/__tests__/svg.test.ts`, `vitest.config.ts`.
    Tarea: TASK-STR-009 (Pilar 1).
- **H5 — Step-up authentication y auditoría de diferencias en la restauración
  de respaldos (CVSS 9.1).**
  - `POST /api/respaldo/restaurar` exige reautenticación con la contraseña del
    operador, validada contra su hash bcrypt (OWASP ASVS 6.2.2). Respuesta
    uniforme `401 PASSWORD_INCORRECTA`, sin revelar la existencia del usuario.
  - Paridad de interfaz: `DialogoRestaurar` y `DialogoRevertir`
    (`ModuloRespaldo.tsx`) solicitan la contraseña, con los errores estables
    traducidos (`ID_Y_PASSWORD_REQUERIDOS`, `PASSWORD_REQUERIDA`,
    `PASSWORD_INCORRECTA`, `DEMASIADOS_INTENTOS`) y un candado de step-up
    compartido por cuenta (`step:cta:{correo}`).
  - Informe de diferencias persistente: se captura el plantel de usuarios y
    roles antes y después de la transacción, y el diff de cuentas añadidas y
    eliminadas (formato `"correo (ROL)"` / `"correo (ROL, INACTIVO)"`) se
    guarda en `RestauracionBD.informeDiferencias` y se devuelve en la
    respuesta.
  - `POST /api/respaldo/revertir` comparte `restaurarNucleo` y queda auditado;
    desde TASK-STR-012 (RF-A1/B-2c) exige el mismo step-up.
  - Archivos: `prisma/schema.prisma`, `src/app/api/respaldo/restaurar/route.ts`,
    `src/app/api/respaldo/revertir/route.ts`,
    `src/modulos/respaldo/servicios/nucleo.ts`,
    `src/modulos/respaldo/componentes/ModuloRespaldo.tsx`, migración
    `20261113004239_add_informe_diferencias_restauracion`.
    Tarea: TASK-STR-007.
- **H7 — Enumeración de usuarios por temporización en el login (CVSS 3.7).**
  Se usa la constante `HASH_SENUELO` (bcrypt, coste 10) cuando el correo no
  existe, de modo que `verificarPassword()` se ejecuta siempre con el mismo
  coste computacional (OWASP ASVS 2.5.4). No se introducen retardos
  artificiales.
  - Archivo: `src/app/api/auth/login/route.ts`. Tarea: TASK-STR-010.
- **H8 — CSP con nonce dinámico y cabeceras de seguridad globales
  (transversal).**
  - Nonce criptográfico por petición (`crypto.randomUUID()` en base64),
    propagado a las cabeceras de la petición para que Next.js App Router lo
    aplique a sus scripts internos de hidratación (`getScriptNonceFromHeaders`).
  - CSP global sin `'unsafe-inline'` ni `'unsafe-eval'` en `script-src`:
    `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self'
    'unsafe-inline'; img-src 'self' data: blob:; object-src 'none';
    frame-ancestors 'none'; base-uri 'self'`.
  - CSP específica para `/api/branding/:recurso*`:
    `default-src 'none'; img-src 'self' data:` (defensa en profundidad frente a
    XSS residual del Pilar 1).
  - Cabeceras en todas las respuestas: `X-Content-Type-Options: nosniff`,
    `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - Archivos: `src/middleware.ts`, `src/app/layout.tsx`,
    `src/instrumentation.ts`, `next.config.ts`. Tarea: TASK-STR-009 (Pilar 2).
- **H9 — Fallo explícito ante `AUTH_SECRET` inválido en producción
  (informativa, resuelta).** `src/instrumentation.ts` ejecuta
  `process.exit(1)` tras el rechazo, de modo que los supervisores (systemd
  `Restart=on-failure`, Docker `HEALTHCHECK`, liveness de Kubernetes) detecten
  la caída y reinicien el servicio.
  - Archivo: `src/instrumentation.ts`. Tarea: TASK-STR-011.

#### Notas de despliegue

1. **Orden de migraciones.** Aplicar en orden cronológico:
   `20261106160000_linea_base_postgresql` →
   `20261112214224_add_password_cambiada_en_session_revocation` →
   `20261113004239_add_informe_diferencias_restauracion`. Todas son aditivas y
   no destructivas.
2. **Revocación de sesiones.** Al aplicar la migración, `passwordCambiadaEn`
   se establece en `now()`, lo que **revoca de inmediato todas las sesiones
   JWT existentes** y obliga a iniciar sesión de nuevo.
3. **HSTS.** Sigue siendo una recomendación para el proxy inverso (Caddy).
   `infra/caddy/Caddyfile` no se modifica en esta versión.
4. **Next.js 16.** La convención `middleware.ts` está deprecada en favor de
   `proxy.ts`. Es funcional en 16.4.5; se recomienda migrar al actualizar Next.

#### Verificación posterior al despliegue

```bash
# 1. Health check (SSOT de versión)
curl -s http://localhost:3000/api
# → {"estado":"ok","sistema":"CIG-MANUFACTURING","version":"2.2.0"}

# 2. CSP con nonce
curl -sI http://localhost:3000/ | grep -i content-security-policy
# → script-src 'self' 'nonce-<base64>'

# 3. Sanitización de SVG
curl -s -X POST http://localhost:3000/api/ajustes/branding/logo \
  -H "Cookie: $ADMIN" -F "archivo=@logo-test.svg"
curl -s http://localhost:3000/api/branding/logo | grep -c "<script>"
# → 0

# 4. Step-up en la restauración
curl -s -X POST http://localhost:3000/api/respaldo/restaurar \
  -H "Content-Type: application/json" -H "Cookie: $ADMIN" \
  -d '{"id":"<respaldo-id>"}'
# → HTTP 400 {"error":"ID_Y_PASSWORD_REQUERIDOS"}

# 5. Anti-timing en el login (script de medición)
# → Diferencia media < 20 ms entre correo existente e inexistente
```

## [2.1.0] - 2026-11-11

Incremento MINOR (SemVer 2.0.0, §7): funcionalidad nueva compatible hacia
atrás (módulo centralizado de versión y health check), sin cambios en la
interfaz de despliegue ni en el esquema de base de datos.

### Added

- Módulo `src/lib/version.ts`: la versión del sistema pasa a ser la única
  fuente de verdad (SSOT). Vive exclusivamente en el campo `version` de
  `package.json` y el resto del sistema la lee de ahí, lo que elimina las
  copias manuales que derivaban en versiones desincronizadas entre UI, API y
  scripts.
  - Las rutas API y los Server Components importan `VERSION_DEL_SISTEMA` y
    `ETIQUETA_VERSION_SISTEMA` directamente del módulo.
  - Los Client Components no importan el módulo (para no empaquetar
    `package.json` en el navegador): reciben la versión como *prop* desde el
    Server Component raíz (`src/app/page.tsx`), que la distribuye al shell
    (`SistemaGestionFabrica`), la pantalla de acceso y los pies de página.
  - Se descartó la variable de entorno inyectada en el build
    (`NEXT_PUBLIC_APP_VERSION`), porque replicaría la versión en la
    configuración y en CI, recreando la duplicación que se elimina.
- Health check en `GET /api`: responde `{ estado, sistema, version }` con la
  versión leída de `package.json`. El `HEALTHCHECK` del Dockerfile consume el
  mismo endpoint y sustituye al marcador «Hello, world!» del andamiaje.

### Changed

- Versión del sistema: 2.0.0 → 2.1.0 (campo `version` de `package.json`).
- UI: la clave `app.version` se elimina de los diccionarios ES/EN (la versión no
  es un texto traducible). Los pies de página del shell (escritorio y móvil),
  la barra lateral y la pantalla de acceso muestran la versión recibida por
  *prop*.
- `deploy.sh`: los banners de consola y el encabezado de la unidad systemd leen
  la versión de `package.json` en tiempo de ejecución (`sed`, sin dependencias
  nuevas); el script ya no arrastra una versión duplicada.
- `scripts/empaquetar.sh`: el comentario de cabecera deja de fijar la versión a
  mano.

## [2.0.0] - 2026-11-07

Incremento MAYOR (SemVer 2.0.0, §7–§8). La migración de motor convierte a
**PostgreSQL 16+ en requisito obligatorio de despliegue**. Una instalación de la
v1.1.1 no puede actualizarse en el lugar sin:

1. instalar y operar un servidor PostgreSQL 16;
2. definir las nuevas variables de entorno obligatorias (`DATABASE_URL` de
   PostgreSQL y `DATA_DIR`; `POSTGRES_PASSWORD` en Docker);
3. ejecutar el script de migración de datos.

Dado que se elimina el soporte de SQLite como motor (una remoción de la interfaz
de despliegue), el cambio no puede versionarse como MINOR. Gestión de cambio
documentada y verificada conforme a NIST SP 800-53 (CM-3) e ISO/IEC 27001
(A.12.1.2, A.8.6).

### Added

- Soporte nativo para PostgreSQL 16 como único motor de base de datos (Prisma
  `provider = "postgresql"`). Decisión registrada en el ADR-009, que reemplaza
  al ADR-001.
- Script de migración de datos `scripts/migrar-sqlite-a-postgres.ts`:
  - copia las 21 tablas dentro de una única transacción (todo o nada) en orden
    topológico, respetando las claves foráneas;
  - verifica los conteos por tabla (cero discrepancias o aborta);
  - falla de inmediato si la base destino ya contiene datos (anti-fusión);
    `--reemplazar` permite reintentos controlados en pruebas.
- Prueba de humo integral `scripts/prueba-humo-postgres.ts`, que valida de
  extremo a extremo sobre PostgreSQL la continuidad de los folios monotónicos
  tras la migración, la papelera de tres niveles (snapshot y restauración con
  revinculación), el ciclo completo respaldo → restauración en caliente →
  reversión (ventana de 24 h) y la fidelidad de tipos (booleanos, fechas y
  decimales `String` exactos).
- Healthchecks en Docker: `pg_isready` en el servicio `postgres:16-alpine` (la
  aplicación espera `condition: service_healthy` antes de aplicar migraciones) y
  `HEALTHCHECK` sobre `GET /api` en la imagen de la aplicación.
- Variable de entorno `DATA_DIR` (metodología 12-Factor): raíz explícita de
  respaldos, branding y credenciales. Las rutas ya no se infieren desde
  `DATABASE_URL`.
- `deploy.sh`: instalación idempotente de PostgreSQL 16 desde el repositorio
  oficial PGDG (keyring firmado, sin `apt-key` deprecado; servidor y cliente
  `pg_dump`/`pg_restore`/`psql`) y unidad systemd con dependencia
  `After/Wants=postgresql.service`.
- Esquema aplicado mediante migraciones auditables (`prisma migrate deploy`),
  con una línea base única de PostgreSQL registrada en `_prisma_migrations`.
- Documentación de despliegue actualizada (README, README-DEPLOY, `docs/01–06`)
  con PostgreSQL 16 como requisito, las nuevas variables de entorno y la guía de
  migración.

### Changed

- Motor de base de datos: SQLite → PostgreSQL 16+ (obligatorio). El cliente
  Prisma queda sin pragmas ni pool forzado; el pool de conexiones lo administra
  Prisma de forma nativa (fin de `connection_limit=1`).
- Módulo de respaldo reescrito sobre `pg_dump`/`pg_restore`/`psql`: volcados en
  formato *custom* comprimido (`.dump`), validación de integridad y esquema del
  archivo (`pg_restore --list`) antes de restaurar, restauración en caliente con
  base transitoria de verificación y transacción única, y ventana de reversión
  de 24 h.
- Lógica de reintentos adaptada a los SQLSTATE de PostgreSQL (`40001`
  *serialization failure*, `40P01` *deadlock*, `57P03` *cannot connect now*,
  `53300` *too many connections*), como evolución del diseño de reintentos con
  retroceso exponencial (ADR-006).
- `DATABASE_URL` usa ahora el esquema `postgresql://` (antes `file:`).
- CI (`.github/workflows/ci.yml`) y su simulación local
  (`scripts/simulacion-ci.sh`) migrados al servicio `postgres:16`, con base de
  datos efímera por ejecución.

### Removed

- Soporte para SQLite como motor de base de datos (proveedor de Prisma, driver y
  sentencias específicas del motor).
- Pragmas de SQLite: `journal_mode=WAL`, `busy_timeout` y el pool forzado
  `connection_limit=1`.
- Sentencias `VACUUM` / `VACUUM INTO` del módulo de respaldo (sustituidas por
  `pg_dump --format=custom`).
- Scripts de prueba obsoletos de la era SQLite: `scripts/test-respaldo.py`,
  `scripts/test-oqc-fix.py`, `scripts/test-oqc-sync.py`,
  `scripts/test-unidades.py` y `scripts/verificar-upgrade.ts`. Los sustituyen
  las suites E2E vigentes por HTTP (`test-clientes.py`, `test-branding.py`,
  `test-borrado.sh`) y la batería de pruebas de humo
  (`prueba-humo-postgres.ts` y la regresión de las Fases 1/4/5).
- `DESPLIEGUE.md`, guía de despliegue deprecada de la era SQLite (reemplazada
  por `docs/05-DESPLIEGUE-Y-OPERACION.md` y `README-DEPLOY.md`).
- Migraciones históricas del motor anterior: `prisma/migrations` arranca desde
  una línea base única de PostgreSQL (auditada).

### Fixed

- **Bug de importación de tipos en `src/lib/reintentos.ts`:** `Prisma` se
  importaba como solo-tipo, por lo que
  `Prisma.TransactionIsolationLevel.Serializable` fallaba en ejecución con
  `ReferenceError` en el primer uso sin nivel explícito. Corregido con
  importación de valor.
- **Bug de `orderBy` en claves compuestas**
  (`src/modulos/respaldo/servicios/nucleo.ts`): la paginación de la copia usaba
  un `orderBy` de objeto plano, rechazado por el validador de Prisma en modelos
  con llave primaria compuesta (p. ej. `ModeloParte`), por lo que fallaba toda
  restauración que involucrara esa tabla. Corregido con la forma canónica de
  arreglo de objetos, válida para todos los modelos y con el mismo orden
  determinista.
- **Sanitización de trazas:** `resumenError` ya no expone `DATABASE_URL`; las
  conexiones se registran enmascaradas en los logs de la aplicación.

### Security

- Cierre de la fuga de `AUTH_SECRET` en CI/CD (hallazgo de la auditoría de
  seguridad): el pipeline y su simulación local ya no dependen de secretos
  fijos; los secretos de prueba se generan aleatoriamente en cada ejecución y no
  se publican en el repositorio.
- `PGPASSWORD` se inyecta exclusivamente en el objeto `env` de `execFile` (nunca
  en la línea de comandos ni en `argv`), por lo que es invisible en `ps aux`
  (ISO/IEC 27001 A.8.6; OWASP ASVS V2.10.3).
- Toda herramienta `pg_*` se ejecuta con `--no-password` como primera bandera:
  falla de inmediato si falta la credencial, sin secretos en `argv` y sin
  bloqueos interactivos en CI ni servicios.
- Aprovisionamiento del rol de PostgreSQL con la contraseña transmitida por
  `stdin` (`deploy.sh`/`setup.sh`), nunca por consola ni en historiales de
  shell.

## [1.1.1] - 2026-11-05

Parche de corrección (SemVer 2.0.0, §4): solo `Fixed`; sin cambios de API,
esquema ni requisitos de despliegue respecto de la v1.1.0. Reconstruido a partir
de los mensajes de commit y la evidencia de auditoría interna (ADR-008,
§Consecuencias; evidencia de validación capturada el 2026-11-06 sobre v1.1.1).

### Fixed

- **Calidad de la simulación de CI:** `scripts/simulacion-ci.sh` usaba el patrón
  `cmd && echo "✔"`, que en bash no aborta al fallar (errexit no aplica dentro
  de listas `&&`): el paso de lint fallaba en silencio y la simulación terminaba
  «en orden». Se endurecieron los pasos 3–7 con `|| fallo`, de modo que cada
  paso es ahora una puerta real. El workflow real de GitHub Actions nunca tuvo
  el defecto.
- **Incumplimientos de `eslint-plugin-react-hooks` 7.1.1** (subida transitiva de
  `eslint-config-next` 16.4.5, que convierte `react-hooks/set-state-in-effect`
  en error): `use-mobile.ts` migrado a `useSyncExternalStore` (patrón canónico)
  y `carousel.tsx` a lectura inicial diferida por `requestAnimationFrame`, con
  baja simétrica de eventos. Ambos son componentes de shadcn/ui no tocados por
  las fases previas.
- **Revalidación completa desde instalación limpia:** cadena de build y
  auditoría re-ejecutada desde `node_modules` borrado (instalación limpia de 618
  paquetes con lockfile congelado), CI local endurecido 9/9 y las cinco pruebas
  de humo de fase.

## [1.1.0] - 2026-11-05

Incremento MINOR (SemVer 2.0.0, §7): funcionalidad nueva compatible hacia atrás
(módulo de Branding), sin cambios de esquema más allá del catálogo de permisos.
Reconstruido a partir de los mensajes de commit y el informe de validación de la
Fase 14 (`docs/compliance/INFORME-VALIDACION-FASE14.md`, rama
`feat/branding-ajustes`: 12/12 criterios aprobados, 58/58 verificaciones E2E ×2,
CI simulado 9/9).

### Added

- Módulo de Branding (Identidad Visual): logo y favicon personalizables desde la
  UI (Sistema → Identidad Visual, permiso granular `ajustes.branding`).
  - API de gestión con guarda `requerirPermiso`: `POST/DELETE
    /api/ajustes/branding/logo` y `/favicon` (subida, restauración del
    predeterminado e idempotencia de DELETE).
  - Servicio público de archivos `GET /api/branding/logo` y `/favicon` con
    *streams* (`fs.createReadStream` → `Readable.toWeb`),
    `Cache-Control: public, max-age=3600` y `dynamic = "force-dynamic"` (el
    build nunca congela la respuesta).
  - Validación por contenido (*magic bytes* PNG/JPG/ICO, detección de `<svg`),
    límites de tamaño (logo 2 MB, favicon 500 KB → 413
    `BRANDING_TAMANNO_EXCEDIDO`) y catálogo fijo de nombres (`logo.{png,svg,jpg}`,
    `favicon.{ico,png}`) con `path.basename()` como defensa en profundidad.
  - Almacenamiento en `branding/` (hermana de `db/`, reubicable con
    `BRANDING_DIR`), fuera de `public/` para que los builds no lo regeneren;
    `deploy.sh` la excluye del rsync y la añade a `ReadWritePaths` de systemd.
  - Aplicación inmediata sin recompilar: invalidación de caché mediante
    `?v=<marca de tiempo>` (`useSyncExternalStore` sobre localStorage y eventos,
    que refresca otras pestañas abiertas) y favicon dinámico en
    `generateMetadata` (`<link rel="icon" href="/api/branding/favicon">`).
  - UI bilingüe `SeccionBranding.tsx` (27 claves ES = 27 EN), suite E2E
    `scripts/test-branding.py` (58 verificaciones, autolimpiable) y migración
    puntual de permisos `scripts/permiso-branding.ts` (ADMIN + TI, idempotente).

## [1.0.0] - 2026-11-05

Línea base pública del producto (motor SQLite embebido, ADR-001; sustituido en
la v2.0.0 por PostgreSQL 16, ADR-009). Reconstruido a partir de los mensajes de
commit, el informe de validación de la Fase 13
(`docs/compliance/INFORME-DE-VALIDACION.md`, 158/158 verificaciones
automatizadas) y los registros de procedencia del repositorio. Toda la serie
1.x usaba SQLite: cualquier referencia operativa a ese motor pertenece a esta
línea histórica.

### Added

- Sistema de gestión de fábrica bilingüe (ES/EN) sobre Next.js 16 (App Router,
  *standalone*), React 19, TypeScript, Tailwind CSS 4 y shadcn/ui, con esquema
  Prisma de 21 modelos sobre SQLite (ADR-001): autenticación (`Rol`, `Usuario`,
  `Restablecimiento`, `Configuracion`), almacén (`Almacen`, `Producto`, `Stock`,
  `Movimiento`, `CorreccionMovimiento`, `SecuenciaFolio`), unidades, catálogo
  técnico N:M (`Modelo`, `NumeroParte`, `ModeloParte`), clientes, OQC
  (`SalidaOQC`, `RegistroScrap`, `RegistroRechazo`), papelera y respaldo.
- Autenticación y autorización: sesiones JWT en cookie httpOnly (jose) con hash
  bcryptjs, guarda `requerirPermiso()` por ruta (ADR-004), 6 roles precargados
  con 17 permisos granulares y cookie endurecida (`SameSite=Strict`, `Secure`
  condicional, expiración de 24 h; ADR-007).
- Módulo Almacén: catálogo de productos (SKU, categoría, unidad, stock mínimo,
  costo), almacenes, inventario consolidado y por almacén, alertas de stock
  mínimo, códigos QR y entradas, salidas, traslados, ajustes y scrap con folios
  monotónicos (`SecuenciaFolio`) y *snapshot* de stock por movimiento (ADR-003).
- Historial tipo ledger: movimientos inmutables y autodescriptivos, con
  *snapshots* del producto, almacén y usuario, y referencias suaves que
  sobreviven a eliminaciones (ADR-005); correcciones con bitácora inmutable
  (`CorreccionMovimiento`).
- Papelera de tres niveles (desactivar / papelera con ventana de 30 días /
  purga) en productos, almacenes, modelos, números de parte y usuarios, con
  bitácora de cada operación.
- Módulo OQC (Calidad de Salida): liberaciones bajo folio único con partidas
  corregibles y eliminables, edición de cabecera con propagación, scrap
  (descuenta stock) y rechazos documentales con disposición.
- Reintentos con retroceso exponencial para errores transitorios de la capa de
  datos (`transaccion()`, `conReintentos()`, `esErrorTransitorio()`; ADR-006,
  originalmente para `SQLITE_BUSY` / `SQLITE_BUSY_SNAPSHOT`).
- Auditoría de la cadena de suministro en el build de la imagen
  (`bun audit --audit-level=high`, ADR-008) y dependencias actualizadas para
  cumplir el umbral (next 16.1.3 → 16.4.5, sharp, zod, react-dom, entre otras).
- Suite de documentación arquitectónica `docs/01–06` (principios, arquitectura,
  guía de módulos nuevos, referencia de BD, despliegue y operación, y ADR),
  validada 158/158 contra el código por `scripts/validar-docs-suite.py`;
  `DESPLIEGUE.md` marcado como deprecado en favor de `docs/05` y
  `README-DEPLOY.md`.
- Despliegue: `setup.sh` y `start.sh` (instalación local); instalador de
  producción `deploy.sh` para Ubuntu 22.04 (usuario de servicio confinado, UFW,
  unidad systemd con `ProtectHome=read-only` y `ReadWritePaths` (ADR-002), Caddy
  con TLS DNS-01 vía Cloudflare, rotación de logs con `copytruncate`); y
  `Dockerfile` / `docker-compose.yml` con healthchecks.

[Unreleased]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v1.1.1...v2.0.0
[1.1.1]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/cig-industrial-group/CIG-MANUFACTURING/releases/tag/v1.0.0

