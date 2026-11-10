# AUDITORIA_EVIDENCIA — Migración de motor SQLite → PostgreSQL
## CIG-MANUFACTURING v1.1.1

**Fecha de la captura:** 2026-11-06 16:33 UTC
**Entorno de validación:** sandbox Linux (Debian 13) · Bun 1.3.14 (versión fijada en el Dockerfile) ·
servidor PostgreSQL **16.4** (x86_64, escucha local) · cliente pg_dump/pg_restore/psql **16.14**
(PGDG; cliente ≥ servidor, requisito documentado del módulo Respaldo).

---

## 1. Resumen ejecutivo

La migración de motor se completó y validó de extremo a extremo sobre una instancia real de
PostgreSQL 16.4:

1. **Migración de datos (Fase 6, punto 1).** `scripts/migrar-sqlite-a-postgres.ts` copió un
   archivo legacy `.db` (21 tablas, 16 con datos, construido con el esquema derivado del DMMF de
   Prisma) hacia PostgreSQL **dentro de una única transacción**, con verificación de conteos por
   tabla: **cero discrepancias** (31 filas migradas). Fail-fast anti-fusión: el script se niega a
   correr sobre una base con datos salvo confirmación explícita (`--reemplazar`).
2. **Fidelidad de tipos.** Booleanos (INTEGER 0/1 → bool), fechas (ISO del legado → Date) y
   decimales String exactos («70», «2.5», «12.50», «0.5») verificados tras la migración; la
   columna `Stock.cantidad` persiste como `text` (ADR «Decimales como String/TEXT»).
3. **Folios monotónicos (garantía de negocio intacta).** Tras la migración, la serie del día
   CONTINÚA donde la dejó el legado (`ENT-20261106-0004` tras `...-0003`); el número de un
   movimiento ELIMINADO no se reutiliza (el siguiente es `...-0005`); una serie nueva del día
   arranca en `0001`. La serie migrada `SAL-20261105.ultimo = 2` conserva el folio eliminado que
   solo existe en la bitácora.
4. **Papelera (3 niveles).** Producto → papelera (borrado + snapshot JSON con stock exacto «25») →
   restauración con el MISMO id y recreación exacta del stock; la entrada queda `RESTAURADO`.
   La entrada migrada del legado conserva su ventana de 30 días.
5. **Ciclo completo de respaldo/restauración.** `pg_dump --format=custom` produjo el archivo
   `.dump` (cabecera `PGDMP` verificada); tras una mutación post-respaldo, la **restauración en
   caliente** (base transitoria de verificación + transacción única) devolvió la base al estado
   del respaldo (38 registros, la mutación desapareció); la **reversión** dentro de la ventana de
   24 h restauró el snapshot pre-restauración (la mutación regresó). Bitácora con
   RESTAURACIÓN + REVERSIÓN ambas `COMPLETADA`.
6. **Criterios de aceptación.** `bun run build` → **0 errores** (exit 0); `bun run lint` →
   **0 errores** (exit 0); búsqueda residual `rg -i "sqlite|vacuum|journal_mode|busy_timeout"`
   sobre `src/ docker-compose.yml Dockerfile setup.sh deploy.sh` → **0 coincidencias**.
7. **Regresión de fases previas.** Las pruebas de humo de la Fase 1 (integridad numérica
   Decimal), Fase 4 (sesiones/cookies/JWT) y Fase 5 (auditoría de cadena de suministro) se
   re-ejecutaron contra PostgreSQL: todas completas.

### Hallazgos y correcciones durante la validación (transparencia)

La prueba de humo ejercita el código REAL y por eso **descubrió dos defectos latentes** de las
fases anteriores, corregidos en esta entrega:

| # | Defecto | Corrección |
|---|---------|------------|
| 1 | `src/lib/reintentos.ts` importaba `Prisma` como **solo-tipo**; `transaccion()` usaba `Prisma.TransactionIsolationLevel.Serializable` en runtime → `ReferenceError` al primer uso sin nivel explícito. | Import de valor (el namespace aporta tipos y constante). |
| 2 | `src/modulos/respaldo/servicios/nucleo.ts` paginaba la copia con `orderBy` en **forma de objeto plano**; el validador de Prisma la rechaza en modelos con llave primaria COMPUESTA (p. ej. `ModeloParte`) → toda restauración con esa tabla fallaba. | Forma canónica de **array de objetos** (válido para todos los modelos, mismo orden determinista). |

Además, el pipeline de CI (`.github/workflows/ci.yml`) y su simulación local
(`scripts/simulacion-ci.sh`) quedaban anclados al motor anterior: se migraron al servicio
`postgres:16` y sus secretos de prueba pasaron a **generarse aleatoriamente en cada ejecución**
(sin valores fijos publicados en el repositorio).

---

## 2. Salida de consola — `bun run build`

```text
['$ next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/', '▲ Next.js 16.4.5 (Turbopack)', '✓ Running next.config.ts took 32ms', '  Creating an optimized production build ...', '✓ Compiled successfully in 4.5s', '  Running TypeScript ...', '  Finished TypeScript in 3.1s ...', '  Collecting page data using 1 worker ...', '  Generating static pages using 1 worker (0/37) ...', '  Generating static pages using 1 worker (9/37) ', '  Generating static pages using 1 worker (18/37) ', '  Generating static pages using 1 worker (27/37) ', '✓ Generating static pages using 1 worker (37/37) in 208ms', '  Finalizing page optimization ...']
```

**Código de salida: `0` (0 errores).** Nota: Turbopack emite 4 *warnings* informativos por el
uso de `process.cwd()` en `src/lib/db.ts` (resolución por defecto de `DATA_DIR`) trazado hacia el
chunk de instrumentación Edge; no son errores, el build completa y las 37 páginas se generan.

## 3. Salida de consola — `bun run lint`

```text
$ eslint .
```

**Código de salida: `0` (0 errores).** `eslint .` sobre todo el proyecto.

## 4. Búsqueda residual — ausencia de restos del motor anterior

Comando ejecutado (idéntico al criterio de aceptación):

```text
rg -i "sqlite|vacuum|journal_mode|busy_timeout" src/ docker-compose.yml Dockerfile setup.sh deploy.sh
```

Resultado (código de salida 1 = **cero coincidencias**):

```text
(sin salida: 0 coincidencias en código activo)
```

## 5. Prueba de humo — Fase 6 completa (migración + PostgreSQL end-to-end)

`bun scripts/prueba-humo-postgres.ts` — código de salida `0`:

```text
PRUEBA DE HUMO — FASE 6: migración de motor + PostgreSQL end-to-end

A) Precondiciones del entorno:
  ✔ — PostgreSQL acepta conexiones (SELECT 1 al arranque — fail-fast de instrumentation)
  ✔ — pg_dump disponible: pg_dump (PostgreSQL) 16.14 (Debian 16.14-1.pgdg+1)
  ✔ — cliente pg_dump 16 >= servidor 16 (requisito del módulo Respaldo)
  ✔ — columna Stock.cantidad persiste como text (ADR decimales String/TEXT)

B) Construyendo el fixture legado (.db de la era anterior):
  ✔ — fixture creado: /tmp/cig-fase6-ranRpg/production.db
  · 21 tablas (16 con datos: Rol=2, Usuario=1, Configuracion=2, Almacen=2, Producto=3, Stock=3, Movimiento=6, CorreccionMovimiento=1, SecuenciaFolio=3, UnidadMedida=2, Modelo=1, NumeroParte=1, ModeloParte=1, Cliente=1, Papelera=1, SalidaOQC=1)

C) Migración real (scripts/migrar-sqlite-a-postgres.ts --reemplazar):
    │ MIGRACIÓN DE DATOS: archivo legacy → PostgreSQL
    │   Origen : /tmp/cig-fase6-ranRpg/production.db
    │   Destino: postgresql://***@127.0.0.1:5433/cig_manufacturing?schema=public
    │   Tablas en el legado: 21
    │ ⚠ --reemplazar: se vaciarán 18 tablas de destino antes de migrar
    │ ✔ Destino vaciado (--reemplazar)
    │ ✔ Copia transaccional completada en 0.0 s
    │ Verificación de conteos (legado → PostgreSQL):
    │   ✔ — Rol: 2 → 2
    │   ✔ — Usuario: 1 → 1
    │   ✔ — Restablecimiento: 0 → 0
    │   ✔ — Configuracion: 2 → 2
    │   ✔ — Almacen: 2 → 2
    │   ✔ — Producto: 3 → 3
    │   ✔ — Stock: 3 → 3
    │   ✔ — Movimiento: 6 → 6
    │   ✔ — CorreccionMovimiento: 1 → 1
    │   ✔ — SecuenciaFolio: 3 → 3
    │   ✔ — UnidadMedida: 2 → 2
    │   ✔ — Modelo: 1 → 1
    │   ✔ — NumeroParte: 1 → 1
    │   ✔ — ModeloParte: 1 → 1
    │   ✔ — Cliente: 1 → 1
    │   ✔ — Papelera: 1 → 1
    │   ✔ — SalidaOQC: 1 → 1
    │   ✔ — RegistroScrap: 0 → 0
    │   ✔ — RegistroRechazo: 0 → 0
    │   ✔ — RespaldoBD: 0 → 0
    │   ✔ — RestauracionBD: 0 → 0
    │   Total de filas migradas: 31
    │ ✔ MIGRACIÓN COMPLETA Y VERIFICADA (cero discrepancias de conteos).
    │   Post-condiciones de negocio ya válidas:
    │   · SecuenciaFolio conservada: los folios NUEVOS continúan la serie
    │     histórica (jamás se reutilizan los números ya emitidos).
    │   · Papelera: entradas EN_PAPELERA conservan su ventana de 30 días.
    │   · Movimientos: snapshots y bitácora íntegros (ledger).
    │   · Recuerda copiar los .dump legacy a DATA_DIR/backups si quieres
    │     que los respaldos históricos sigan siendo restaurables.
  ✔ — migrador terminó con código 0 (obtenido: 0)

D) Fidelidad de los datos migrados:
  ✔ — conteos por tabla idénticos al fixture (0 discrepancias)
  ✔ — Booleano migrado: Rol.ADMIN.sistema === true (INTEGER 1 → bool)
  ✔ — DateTime migrado: Rol.createdAt es Date (ISO del legado → Date)
  ✔ — decimal String exacto: Stock.cantidad === "70" (obtenido: 70)
  ✔ — decimal String exacto: Producto.stockMinimo === "2.5" (obtenido: 2.5)
  ✔ — folio textual exacto: ENT-20261106-0002
  ✔ — decimales del ledger exactos (0.5 / 70.5)
  ✔ — SecuenciaFolio migrada: ENT-20261106.ultimo === 3 (obtenido: 3)
  ✔ — Serie SAL-20261105.ultimo === 2 (incluye el folio eliminado en bitácora)
  ✔ — papelera migrada: snapshot JSON legible + estado EN_PAPELERA
  ✔ — ventana de restauración de 30 días conservada (expiraEn > hoy)

E) Folios monotónicos (continuidad post-migración):
  ✔ — la serie de HOY CONTINÚA tras la migración: ENT-20261106-0004 (esperado ENT-20261106-0004)
  ✔ — snapshot del ledger exacto: 70 + 10 = "80"
  ✔ — movimiento eliminado (bitácora de corrección creada)
  ✔ — el folio ELIMINADO no se reutiliza: ENT-20261106-0005 (esperado ENT-20261106-0005)
  ✔ — serie NUEVA del día arranca en 0001: SAL-20261106-0001

F) Papelera: producto → papelera → restauración (mismo id + stock):
  ✔ — el producto desaparece de la tabla viva
  ✔ — entrada EN_PAPELERA con snapshot completo (datos JSON)
  ✔ — el snapshot conserva el stock («25» exacto)
  ✔ — restauración declarada: PRODUCTO SMOKE-F6-0009
  ✔ — el producto REGRESA con el MISMO id (re-vinculación)
  ✔ — el stock se recrea exacto («25»)
  ✔ — la entrada queda RESTAURADO (bitácora)

G) Respaldo: pg_dump → restauración en caliente → reversión:
  ✔ — archivo .dump creado: respaldo-20261106-163302-man.dump
  ✔ — cabecera PGDMP presente (volcado custom de pg_dump)
  ✔ — total de registros volcados: 38
  ✔ — mutación post-respaldo aplicada (producto smoke-f6-p10 existe)
  ✔ — restauración en caliente COMPLETADA (38 registros, 51 ms)
  ✔ — ventana de reversión de 24 h registrada
  ✔ — la mutación DESAPARECE: la base volvió al estado del respaldo
  ✔ — los datos del fixture siguen íntegros tras la restauración
  ✔ — reversión COMPLETADA (snapshot pre-restauración)
  ✔ — la mutación REGRESA: la base volvió al estado pre-restauración
  ✔ — bitácora de respaldo: 2 operaciones COMPLETADAS (RESTAURACIÓN + REVERSIÓN)

✔ PRUEBA DE HUMO COMPLETA: migración de datos verificada (cero discrepancias), folios monotónicos continúan la serie migrada, papelera restaurable y ciclo respaldo → restauración en caliente → reversión operativos sobre PostgreSQL
  Duración total: 0.9 s
```

## 6. Estado final de la base de datos tras la validación

```text
Rol=2 Usuario=1 Producto=5 Movimiento=8 Papelera=2 SecuenciaFolio=5 RespaldoBD=3 RestauracionBD=2
```

(Instalación migrada del fixture + datos de prueba de la propia batería; los archivos `.dump`
del ciclo de respaldo quedaron en `DATA_DIR/backups` como evidencia operativa.)

## 7. Regresión — pruebas de humo de fases previas

| Prueba | Resultado | Código de salida |
|--------|-----------|------------------|
| Fase 1 — integridad numérica Decimal | ✔ COMPLETA | 0 |
| Fase 4 — sesiones/cookies/JWT (hardening ADR-007) | ✔ COMPLETA | 0 |
| Fase 5 — auditoría de cadena de suministro (ADR-008) | ✔ COMPLETA | 0 |

## 8. Verificación de seguridad previa al empaquetado

Barrido automático sobre el contenido del paquete antes de comprimir:

- **AUTH_SECRET con valor literal:** sin coincidencias (el CI y la simulación local ahora los
  generan aleatorios por ejecución; el `.env` real queda EXCLUIDO del paquete).
- **Contraseñas reales / tokens:** sin coincidencias. Los únicos literales de contraseña que
  existen son (a) *placeholders* de documentación (`TuClave123`, `ClaveSegura2026!`,
  `usuario:clave@host`) y (b) contraseñas de usuarios efímeros de pruebas que crean y eliminan
  los propios scripts de test (inertes fuera de una ejecución de pruebas).
- **Cadenas de conexión con credenciales:** solo la del contenedor efímero de CI
  (`postgres:16-alpine` del runner, localhost, destruido al terminar el job — no protege nada
  real) y placeholders de `.env.example`/documentación.
- **La contraseña y el AUTH_SECRET reales del entorno de validación:** verificado que NO
  aparecen en ningún archivo del proyecto (solo en `.env`, excluido del `.zip`).
- **Exclusiones del paquete:** `.env`, `db/` (respaldos `.dump` y credenciales de runtime),
  `node_modules/`, `.next/`, archivos `*.log`.

---

*Evidencia generada automáticamente por la batería de validación final de la Fase 6.*

---

# AUDITORIA_EVIDENCIA — Entrega de versión 2.0.0 (post-migración)

## CIG-MANUFACTURING v2.0.0

**Fecha de la captura:** 2026-11-07 · **Tarea:** ACTUALIZACIÓN DE VERSIÓN, CHANGELOG Y
DOCUMENTACIÓN (Post-Migración). **Alcance declarado:** exclusivamente archivos de
versión, documentación y metadatos — **cero cambios de lógica de negocio o código de
la aplicación** (`src/` permanece byte a byte idéntico al entregable auditado de la
migración).

## A. Decisión de versión — incremento MAYOR 2.0.0 (SemVer 2.0.0)

Se seleccionó **2.0.0** (no 1.2.0) porque el cambio de requisito de despliegue es un
**Breaking Change para el usuario final**, conforme a SemVer 2.0.0 §7–§8:

1. **PostgreSQL 16 pasa a ser requisito obligatorio**: una instalación v1.1.1 no puede
   actualizar en el lugar sin instalar y operar un servidor de base de datos externo.
2. **Variables de entorno obligatorias nuevas**: `DATABASE_URL` de PostgreSQL y
   `DATA_DIR` (y `POSTGRES_PASSWORD` en Docker).
3. **Migración de datos obligatoria** (`scripts/migrar-sqlite-a-postgres.ts`) para
   conservar los datos de la v1.1.1.
4. **Se elimina el soporte de SQLite como motor** (documentado en `Removed` del
   CHANGELOG): una remoción de la interfaz de despliegue no puede versionarse como
   Minor.

La justificación completa viaja en el cuerpo del commit de release, en el preámbulo
del `CHANGELOG.md` y en el **ADR-009** (que reemplaza al ADR-001).

## B. Archivos modificados, creados y retirados

| Acción | Archivo | Detalle |
|---|---|---|
| Modificado | `package.json` | `version` 1.1.1 → **2.0.0** |
| Creado | `CHANGELOG.md` | Estándar Keep a Changelog 1.1.0; sección `[2.0.0] - 2026-11-07`; categorías Added / Changed / Fixed / Security / Removed; enlace de comparación v1.1.1…v2.0.0 |
| Modificado | `README.md` | Versión 2.0.0, pila tecnológica (PostgreSQL 16+), sección Respaldo (pg_dump/pg_restore), estructura (`DATA_DIR`), requisitos de `setup.sh`, **Guía de Migración desde v1.1.1** (única sección con SQLite) |
| Modificado | `README-DEPLOY.md` | Nota de motor obligatorio (PGDG/systemd/variables de entorno), §8 formalizada como «Migración de una instalación desde v1.1.1 (SQLite)» con el comando directo `bun run scripts/migrar-sqlite-a-postgres.ts` |
| Modificado | `docs/01–06` | «Versión documentada» → 2.0.0; motor PostgreSQL 16+ (docs/01, 04); diagrama de flujo y árbol de directorios (docs/02); `prisma migrate deploy` (docs/01, 03, 04); §4 respaldo con pg_dump y solución de problemas por SQLSTATE/P1001 (docs/05); Docker con `POSTGRES_PASSWORD`/`DATA_DIR` (docs/05 §6) |
| Modificado | `docs/06 (ADR)` | **ADR-009 nuevo** (migración del motor, reemplaza ADR-001); ADR-001 → estado «Reemplazado»; nota de actualización v2.0.0 (SQLSTATE) en ADR-006; índice actualizado |
| Modificado | `deploy.sh` | Banners de versión (líneas de comentario y salida de consola) v1.1.1 → v2.0.0 — metadato de versión, sin cambio de lógica |
| Modificado | `scripts/empaquetar.sh` | Comentario de versión v1.1.1 → v2.0.0 — metadato, sin cambio de lógica |
| Retirado | `DESPLIEGUE.md` | Guía de despliegue **deprecada** de la era SQLite (ya reemplazada por docs/05 + README-DEPLOY.md; su contenido instruía respaldos `sqlite3` y URLs `file:`) |
| Retirados | `scripts/test-respaldo.py`, `scripts/test-oqc-fix.py`, `scripts/test-oqc-sync.py`, `scripts/test-unidades.py`, `scripts/verificar-upgrade.ts` | **Scripts de prueba muertos de la era SQLite** (verificación directa por `sqlite3`/URL `file:` — inservibles bajo PostgreSQL). Retirada exigida por la entrada `Removed` del CHANGELOG; verificado que nada los invoca (`simulacion-ci.sh`, CI, README y docs no los referencian). Sin efecto funcional; recuperables desde el historial Git |

## C. Verificaciones ejecutadas (criterios de aceptación)

```text
1) Sin regresión de la migración (criterio original de la Fase 6):
   rg -i "sqlite|vacuum|journal_mode|busy_timeout" src/ docker-compose.yml Dockerfile setup.sh deploy.sh
   → 0 coincidencias (código de salida 1)

2) Documentación de despliegue sin SQLite como opción nueva:
   README.md / README-DEPLOY.md / docs/01–05 → las únicas coincidencias de "sqlite"
   son (a) la Guía de Migración desde v1.1.1 y su enlace en el índice (permitidas
   expresamente) y (b) el nombre de archivo del script de migración
   (scripts/migrar-sqlite-a-postgres.ts). docs/06 (ADR) y PROCEDENCIA conservan sus
   referencias como registros históricos de decisiones.

3) Versión:
   package.json → 2.0.0 · docs/01–06 → "Versión documentada: 2.0.0" ·
   banners de deploy.sh y scripts/empaquetar.sh → v2.0.0.
   Las referencias "1.1.1" restantes son legítimas: guía de migración,
   registros históricos ADR y la dependencia "cmdk": "^1.1.1" (paquete npm,
   no la versión del proyecto).

4) CHANGELOG.md: existe en la raíz, formato Keep a Changelog, sección
   [2.0.0] - 2026-11-07, con las categorías Added/Changed/Fixed/Removed exigidas
   más Security, y detalla los hallazgos de seguridad corregidos (fuga de
   AUTH_SECRET en CI/CD, PGPASSWORD vía env, --no-password, sanitización de URLs).
```

## D. Release Git (estado del repositorio entregado)

El paquete incluye el repositorio Git (`.git`) con la historia mínima auditable:

1. **Commit base** — importa el estado auditado de la migración (entregable
   v1.1.1-postgresql, idéntico al paquete validado en la Fase 6).
2. **Commit de release** — `chore(release): bump version to 2.0.0, update changelog
   and deployment docs for PostgreSQL migration`, con la justificación SemVer en el
   cuerpo. El diff entre ambos commits documenta EXACTAMENTE el alcance de esta tarea.

El hash exacto del HEAD se consulta con `git log -1 --format=%H`.

**Comandos que el AUDITOR debe ejecutar para publicar el release** (no ejecutados por
el agente, conforme a la instrucción):

```bash
# 0) Verificar el estado entregado
git log --oneline -5          # debe mostrar el commit de release como HEAD de main
git status                    # árbol de trabajo limpio

# 1) Crear el tag anotado del release
git tag -a v2.0.0 -m "v2.0.0 — Migración del motor de base de datos a PostgreSQL 16 (breaking change de despliegue, ADR-009)"

# 2) Publicar la rama y el tag
git push origin main
git push origin v2.0.0

# 3) (Opcional, GitHub) crear el Release con las notas del changelog
gh release create v2.0.0 --title "v2.0.0 — Migración a PostgreSQL 16" \
  --notes-file CHANGELOG.md
```

## E. Escaneo de seguridad previo al empaquetado (v2.0.0)

Barrido repetido sobre el paquete final (sin regresión respecto de la Fase 6):

- **`AUTH_SECRET` con valor literal:** 0 coincidencias.
- **Cadenas de conexión con credenciales:** solo placeholders de documentación
  (`usuario:clave@host`, `CONTRASENA` en `.env.example`), variables de entorno/runtime
  (`${POSTGRES_PASSWORD}`, `${CLAVE_BD}`, generadas con `openssl rand` en
  `setup.sh`/`deploy.sh`/`simulacion-ci.sh`) y la credencial efímera del contenedor de
  CI (`cig_ci` en `.github/workflows/ci.yml`, localhost, destruido al terminar el job
  — evaluada y aceptada en la auditoría de la Fase 6; no protege nada real).
- **Credenciales históricas/secretos de desarrollo:** solo presentes en las **listas
  negras** que los RECHAZAN (`seguridad.ts`, `validar-auth-secret.sh`, `deploy.sh`) y
  en documentación que describe el bloqueo — por diseño.
- **Tokens de API:** únicamente placeholders de documentación (`CF_API_TOKEN=xxxxx`).
- **Exclusiones del paquete:** `.env`, `db/`, `node_modules/`, `.next/`, `*.log`
  (respetadas por `.gitignore` y por el empaquetado).

**Resultado: APTO PARA EMPAQUETAR.**

---

*Evidencia de la entrega de versión 2.0.0 — tarea adicional post-migración (versión, changelog y documentación).*
