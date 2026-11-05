# FASE 13 — Informe de Validación
## Suite de Documentación Arquitectónica y Guía de Desarrollo

**Proyecto:** CIG-MANUFACTURING · **Versión auditada:** 1.0.0 (`main`)
**Fecha de validación:** 2026-11-05
**Método:** validación cruzada automatizada (`scripts/validar-docs-suite.py`, 158
verificaciones) + revisión manual contra el código fuente. Cero alucinaciones: cada
ruta, tabla, permiso, variable y comando citado en la documentación se verificó contra
el repositorio.

---

## 1. Criterios de aceptación (checklist de auditoría)

| # | Criterio | Estado | Evidencia de verificación |
|---|---|---|---|
| 1 | Los 6 archivos existen en `/docs/` con contenido sustancial y técnicamente preciso | **PASS** | Bloque 1 del validador: 6/6. Tamaños: 01 = 10.7 KB · 02 = 17.4 KB · 03 = 32.4 KB · 04 = 19.4 KB · 05 = 18.5 KB · 06 = 15.3 KB. Precisión técnica verificada por los bloques 2–7 (ver §3). |
| 2 | El ejemplo «Proveedores» es coherente de extremo a extremo (Prisma → API → UI → Permisos) | **PASS** | Doc 03 cubre los 6 pasos en orden de dependencia: (1) `model Proveedor` en `prisma/schema.prisma` + `bunx prisma db push`/`generate` (comandos existentes en `package.json`: `db:push`, `db:generate`); (2) permisos `proveedores.ver`/`proveedores.gestionar` añadidos a `prisma/seed.ts` (arreglo `PERMISOS` línea 61) y a `src/modulos/autenticacion/permisos.ts` (`PERMISOS` + `PERMISOS_AGRUPADOS`), con migración puntual `scripts/permiso-proveedores.ts` siguiendo el patrón real de `scripts/permiso-clientes.ts` — necesaria porque la semilla no sobrescribe permisos de roles existentes (verificado: `update: {}` en el upsert de `Rol`, seed.ts); (3) API con guarda `requerirPermiso` (patrón verificado en `src/app/api/clientes/route.ts:18,34` y `[id]/route.ts:22,35,82`); (4) `tipos.ts` + `servicios/{nucleo,api,consultas}.ts` (isomorfos a los reales del módulo clientes); (5) UI con shadcn/ui + React Query + registro en `src/modulos/nucleo/registro.tsx` + claves i18n (patrones de `GestionClientes.tsx`, `clientes/index.tsx`, `diccionario.ts`); (6) `scripts/test-proveedores.py` siguiendo `scripts/test-clientes.py`. Los permisos `proveedores.*` están marcados como NUEVOS en el doc y el validador los excluye de la lista de permisos existentes. |
| 3 | Todas las tablas listadas en `/docs/04` coinciden con `prisma/schema.prisma` | **PASS** | Bloque 2: 21/21. El esquema define exactamente 21 modelos y los 21 están documentados en docs/04; ningún modelo citado como tabla existe solo en el documento. Mapa modelo → línea en §2 de este informe (ej.: **SalidaOQC existe en la línea 375 de schema.prisma**). Nota de precisión: la especificación mencionaba tablas «Partida / Rechazo / Scrap»; en el esquema real las partidas son filas de `Movimiento` agrupadas por `salidaId`, y los modelos se llaman `RegistroRechazo` y `RegistroScrap` — docs/04 documenta los nombres reales y lo aclara explícitamente. |
| 4 | `DESPLIEGUE.md` tiene la advertencia de deprecación claramente visible | **PASS** | Bloque 8: 1/1. Banner `⚠️ DEPRECADO` en las líneas 3–6 (inmediatamente bajo el título), con enlaces a `docs/05-DESPLIEGUE-Y-OPERACION.md` y `README-DEPLOY.md` y la indicación «No utilizar para nuevos despliegues». |
| 5 | `README.md` redirige a la nueva suite de documentación | **PASS** | Bloque 9: 4/4. Sección «Modelo de datos (resumen)» reducida a un resumen breve que enlaza a `docs/04`; sección «Desarrollo» enlaza a `docs/03` (y a `docs/02`); el enlace de despliegue apunta a `docs/05` + `README-DEPLOY.md`; eliminado el enlace a `DESPLIEGUE.md` como guía vigente. |
| 6 | Informe de validación entregado, criterio por criterio, con método de verificación | **PASS** | Este documento (§1 criterios, §2 mapa de tablas con líneas exactas, §3 desglose del validador, §4 precisiones y correcciones aplicadas). |

---

## 2. Mapa de verificación: modelos citados vs `prisma/schema.prisma`

Salida literal del validador (bloque 2) — cada modelo documentado con su línea exacta
en el esquema:

| Modelo | Línea en `schema.prisma` | Módulo |
|---|---|---|
| `Rol` | 23 | Autenticación |
| `Usuario` | 37 | Autenticación |
| `Restablecimiento` | 53 | Autenticación |
| `Configuracion` | 66 | Autenticación |
| `Almacen` | 75 | Almacén |
| `Producto` | 89 | Almacén |
| `Stock` | 115 | Almacén |
| `Movimiento` | 135 | Almacén (ledger) |
| `CorreccionMovimiento` | 199 | Almacén (bitácora) |
| `SecuenciaFolio` | 227 | Almacén (folios) |
| `UnidadMedida` | 248 | Unidades |
| `Modelo` | 272 | Catálogo |
| `NumeroParte` | 284 | Catálogo |
| `ModeloParte` | 298 | Catálogo |
| `Cliente` | 318 | Clientes |
| `Papelera` | 340 | Papelera |
| `SalidaOQC` | 375 | OQC |
| `RegistroScrap` | 412 | OQC |
| `RegistroRechazo` | 450 | OQC |
| `RespaldoBD` | 504 | Respaldo |
| `RestauracionBD` | 523 | Respaldo |

**Resultado: 21/21 documentados, 0 inventados, 0 omitidos.**

---

## 3. Desglose del validador automatizado (158/158)

```
Bloque  1 — Existencia y sustancia de los 6 documentos:        6/6
Bloque  2 — Modelos docs/04 vs prisma/schema.prisma:          21/21
Bloque  3 — Rutas API citadas vs src/app/api/**/route.ts:     46/46
Bloque  4 — Permisos citados vs seed.ts + permisos.ts:        18/18
Bloque  5 — Archivos citados (src/, scripts/, prisma/):       28/28
Bloque  6 — Variables de entorno citadas vs código real:      10/10
Bloque  7 — Comandos/constantes citadas vs repo:              18/18
Bloque  8 — Banner de deprecación en DESPLIEGUE.md:            1/1
Bloque  9 — README.md enlaza a docs/03, 04 y 05:               4/4
Bloque 10 — Nomenclatura cig-manufacturing/CIG-MANUFACTURING:  6/6
──────────────────────────────────────────────────────────────────
TOTAL: 158/158 verificaciones superadas
```

Detalle de coberturas clave:

- **Rutas API (46):** las 46 rutas del mapa de docs/02 §4 se verificaron como archivos
  `route.ts` reales bajo `src/app/api/`, incluidas las anidadas
  (`api/oqc/salidas/[id]/partidas/[partidaId]/route.ts`,
  `api/papelera/[id]/restaurar/route.ts`, las 6 de `api/respaldo/*`).
- **Permisos (18):** los 18 permisos citados como existentes están en
  `prisma/seed.ts` (arreglo `PERMISOS`, líneas 61–80) y en
  `src/modulos/autenticacion/permisos.ts`. Los 2 permisos `proveedores.*` se citan
  exclusivamente como **nuevos** dentro del tutorial y están excluidos por diseño.
- **Archivos (28):** todas las rutas de archivo citadas existen; los 11 archivos que
  el tutorial manda crear (API, módulo, migración y prueba de Proveedores) se
  verificó que **no existen aún** en `main` (coherencia: el tutorial añade un módulo
  que no está en el código actual).
- **Variables de entorno (10):** `DATABASE_URL`, `AUTH_SECRET`,
  `INITIAL_ADMIN_PASSWORD`, `ADMIN_PASSWORD`, `COOKIE_INSEGURA_HTTP`, `NEXTAUTH_URL`,
  `NODE_ENV`, `SSH_PORT`, `USE_DOMAIN`, `CF_API_TOKEN` — presentes en `.env.example`,
  `deploy.sh`, `start.sh` o `prisma/seed.ts` según corresponde.
- **Comandos (18):** `bun install --frozen-lockfile`, `bunx prisma generate/db push/
  db seed`, `openssl rand -base64 48`, directivas systemd (`ProtectSystem=strict`,
  `ProtectHome=read-only`, `ReadWritePaths=`, `SystemCallFilter=@system-service`,
  `CapabilityBoundingSet=`), usuario/rutas de servicio
  (`cig-manufacturing`, `/home/cig-manufacturing/CIG-MANUFACTURING`), atajos
  `db:push`/`db:generate` de `package.json`, `validar_auth_secret` en `start.sh` y
  `bash scripts/simulacion-ci.sh` — todos presentes en los archivos citados.

---

## 4. Precisiones y correcciones aplicadas durante la auditoría

1. **«Middleware de Auth» → guarda `requerirPermiso()`.** El repositorio **no**
   contiene `middleware.ts`. La autenticación se aplica como guarda explícita al
   inicio de cada manejador de ruta (`src/modulos/autenticacion/servicios/auth.ts`).
   docs/02 documenta el flujo real con esta precisión (y el ADR-004 justifica la
   decisión) en lugar de describir un middleware inexistente.
2. **Nombres de tabla de la especificación.** «Partida», «Rechazo» y «Scrap» no son
   modelos: las partidas son filas de `Movimiento` con `salidaId`; los modelos reales
   son `RegistroRechazo` y `RegistroScrap`. docs/04 usa los nombres reales y lo
   aclara (regla de cero alucinaciones).
3. **README.md corregido en un punto heredado:** decía «schema.prisma # Modelo de
   datos (9 tablas)»; el esquema real tiene 21 modelos. Corregido a «21 modelos» al
   actualizar la sección (coherencia con docs/04). También se añadieron a la
   estructura del proyecto los módulos `clientes/` y `oqc/`, presentes en el código.
4. **Semilla y permisos.** docs/03 documenta el matiz crítico verificado en
   `prisma/seed.ts`: el `upsert` de roles **no** sobrescribe permisos existentes
   (`update: {}`), por lo que todo permiso nuevo requiere migración puntual — patrón
   ya usado en el repo (`scripts/permiso-*.ts`). El tutorial lo incluye como paso
   obligatorio (2.3), lo que hace el ejemplo coherente de extremo a extremo también
   para instalaciones existentes.
5. **Puertos del despliegue.** docs/05 documenta los puertos reales de `deploy.sh`:
   dominio → app `127.0.0.1:3000` (Caddy 443); local → app `127.0.0.1:3001` (Caddy
   publica :3000), con la justificación EADDRINUSE del propio script.

---

## 5. Entregables del paquete

| Archivo | Estado |
|---|---|
| `docs/01-INTRODUCCION-Y-PRINCIPIOS.md` | **Nuevo** |
| `docs/02-ARQUITECTURA-DEL-SISTEMA.md` | **Nuevo** |
| `docs/03-GUIA-DESARROLLO-NUEVOS-MODULOS.md` | **Nuevo** |
| `docs/04-REFERENCIA-BASE-DATOS.md` | **Nuevo** |
| `docs/05-DESPLIEGUE-Y-OPERACION.md` | **Nuevo** |
| `docs/06-REGISTRO-DECISIONES-ARQUITECTONICAS (ADR).md` | **Nuevo** |
| `DESPLIEGUE.md` | **Modificado** — banner de deprecación (líneas 3–6) |
| `README.md` | **Modificado** — secciones Modelo de datos / Desarrollo / enlace de despliegue y estructura del proyecto |
| `scripts/validar-docs-suite.py` | **Nuevo (herramienta de auditoría)** — re-ejecutable: `python3 scripts/validar-docs-suite.py <raíz-del-repo>` |
| `DIFF-fase13.patch` | Diff completo de los archivos modificados (los docs nuevos son archivos completos) |

---

## 6. Cómo re-ejecutar la validación

```bash
# Desde la raíz del repositorio con la suite aplicada:
python3 scripts/validar-docs-suite.py .

# Salida esperada: TOTAL: 158/158 verificaciones superadas → exit code 0
```

El validador falla (exit code ≠ 0) ante cualquier: modelo citado que no exista en el
esquema, modelo del esquema sin documentar, ruta API sin archivo `route.ts`, permiso
citado inexistente, archivo/variable/comando citado inexistente, banner de deprecación
ausente, o enlace roto en README.

---

**Veredicto:** los 6 criterios de aceptación se cumplen. La suite de documentación es
concordante con el código fuente de `main` en el 100% de las verificaciones
automatizadas (158/158) y de las revisiones manuales realizadas.
