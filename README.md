# CIG-MANUFACTURING — Sistema de Gestión de Fábrica

> ⚖️ **AVISO LEGAL:** Copyright © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.  
> Tijuana, Baja California, México. Este proyecto es propiedad privada y confidencial. Queda prohibida su reproducción, distribución o uso no autorizado sin permiso explícito por escrito.

---

## Descripción ejecutiva

CIG-MANUFACTURING es un sistema web bilingüe (Español / Inglés) para el control y la
gestión de almacén de fábrica: inventario multi-almacén, entradas, recepción de materia
prima, salidas, traslados, ajustes y scrap, historial de movimientos tipo ledger con
bitácora de correcciones inmutable, folios monotónicos, calidad de salida (OQC) con
liberaciones agrupadas a clientes, y administración de usuarios, roles y permisos
granulares.

El sistema está diseñado con mentalidad de planta: **resiliencia operativa**
(restauración en caliente con ventana de reversión, respaldos automáticos), **auditabilidad
forense** (toda corrección y eliminación queda registrada de forma inmutable, con
snapshots que sobreviven a la eliminación de las entidades) e **integridad de datos
exacta** (las cantidades y costos viven en `NUMERIC` nativo de PostgreSQL — jamás
punto flotante). La arquitectura de seguridad se rige por Fail-Fast, Defensa en
Profundidad y minimización de superficie de ataque.

**Versión:** 2.3.0 — la versión vive únicamente en `package.json`
([Única Fuente de Verdad](#arquitectura-de-la-versión-única-fuente-de-verdad)).
Registro de cambios: [CHANGELOG.md](./CHANGELOG.md).

---

## Funcionalidades

| Módulo | Descripción |
|---|---|
| **Autenticación** | Sesión con correo/contraseña, JWT en cookie httpOnly (24 h), recuperación por código, autoregistro configurable, cambio de contraseña con revocación de sesiones. |
| **Almacén** | Catálogo de productos (SKU, categoría, unidad, empaque de conteo, stock mínimo, costo), almacenes, inventario consolidado y por almacén, alertas de stock mínimo, códigos QR. |
| **Movimientos** | Entradas, recepciones, salidas, traslados, ajustes y scrap con folio por tipo (ENT/REC/SAL/TRA/AJU/SCR) y snapshot del stock resultante. Series **monotónicas** (`SecuenciaFolio`): un folio jamás se reutiliza. |
| **Correcciones** | Edición y eliminación de movimientos con bitácora inmutable (`CorreccionMovimiento`): estado anterior, corregido y motivo. Contrato explícito: campo no enviado se conserva; cadena vacía limpia. |
| **Papelera (3 niveles)** | Desactivar/reactivar (reversible) → eliminar (snapshot completo, restaurable 30 días) → purgar (definitivo, bitácorado). Cada operación queda en bitácora inmutable. |
| **Historial tipo ledger** | Movimientos autodescriptivos con snapshots de producto/almacenes/usuario; referencias suaves que sobreviven a cualquier eliminación. Los movimientos de entidades eliminadas quedan congelados y marcados. |
| **OQC (Calidad de Salida)** | Liberación agrupada bajo un folio único (OQC-…) con una partida por producto; corrección/eliminación de partidas individuales o de la salida completa con reversión de stock y bitácora. Registro de **scrap** (descuenta stock con el mismo folio) y de **rechazos** (documental, con disposición). |
| **Clientes / Catálogo** | Catálogo de clientes y de modelos/números de parte con asociación N:M. |
| **Usuarios y roles** | 6 roles precargados con 19 permisos granulares editables. |
| **Respaldo y restauración** | `pg_dump --format=custom`, restauración **en caliente** transaccional (una transacción o nada), snapshot pre-restauración con ventana de reversión de 24 h, respaldo automático diario (rota 7), bitácora de intentos. |
| **Bilingüe** | Interfaz completa ES/EN con selector de idioma. |

## Arquitectura de seguridad y cumplimiento

El diseño se alinea con controles de referencia de seguridad industrial y se documenta
en la suite de [Decisiones Arquitectónicas (ADR)](./docs/adr/00-INDICE.md):

| Marco | Aplicación en este sistema |
|---|---|
| **ISO/IEC 27001:2022** (A.8.15, A.8.28, A.8.29) | Integridad de datos en reposo: dominio numérico impuesto por el motor (`NUMERIC(15,6)/(15,4)`, [ADR-010](./docs/adr/ADR-010-migracion-directa-a-numeric.md)). Bitácoras inmutables de corrección y eliminación. Secretos solo por entorno (12-Factor: `AUTH_SECRET`, `DATABASE_URL`, `DATA_DIR`). |
| **NIST SP 800-53** (SI-10, SC-28, AU, AC) | Validación estricta de entrada en toda frontera HTTP, fail-closed (`aDecimal`, tipos nominales de `tipos-dominio.ts`). Dominio numérico en reposo. Eventos auditados (bitácoras, respaldo/restauración). Control de acceso por permiso granular en cada ruta (`requerirPermiso`, ADR-004). |
| **OWASP ASVS** | Sesiones JWT en cookie `httpOnly`/`SameSite=Strict` (ADR-007) con revocación por cambio de contraseña. Hash bcrypt. Límite de intentos de login anti-fuerza bruta con confianza de proxy explícita (fail-closed). Cabeceras de seguridad globales con nonce por petición. |
| **Resistencia operativa** | Reintentos ante SQLSTATE transitorios con retroceso acotado (ADR-006). Transacciones Serializable para la autoridad de folios. Restauración en caliente transaccional con ventana de reversión. |

**Invariantes estructurales** (no negociables, documentadas en sus ADRs):

- **Folios monotónicos** (ADR-003): la serie jamás reutiliza un número.
- **Ledger inmutable**: los movimientos no se editan «en sitio»; toda corrección crea bitácora con antes/después/motivo.
- **Papelera de tres niveles**: desactivar → eliminar (30 días restaurable) → purgar (bitácorado, definitivo).
- **Integridad numérica exacta** (ADR-010): `Decimal` de Prisma sobre `NUMERIC` de PostgreSQL; `Float`/`Real` prohibidos para cantidades, costos o medidas.

---

## Pila tecnológica

- **Next.js 16** (App Router, salida `standalone`) · **React 19** · **TypeScript**
- **Prisma ORM** sobre **PostgreSQL 16+** (obligatorio; `deploy.sh`/`setup.sh`/`docker-compose.yml` lo aprovisionan) — campos numéricos nativos `NUMERIC` (ADR-010)
- **Tailwind CSS 4** + componentes **shadcn/ui**
- **jose** (JWT) · **bcryptjs** (hash de contraseñas)
- **React Query** · **React Table** · **Recharts** · **react-qr-code**
- Pruebas: **Vitest** (núcleo numérico y saneadores) · scripts E2E por módulo
- Runtime: **Bun** (build, pruebas y operación; Node 24 también soportado)

---

## Integridad de datos: `NUMERIC` nativo (ADR-010)

Desde la v2.3.0 las cantidades, costos y medidas persisten como **`Decimal` de Prisma
sobre `NUMERIC` de PostgreSQL** — la era «decimal como texto» quedó cerrada:

| Modelo | Columnas | Tipo |
|---|---|---|
| `Stock` | `cantidad` | `NUMERIC(15,6)` |
| `Movimiento` | `cantidad`, `cantidadDespues` | `NUMERIC(15,6)` (firmado para ajustes) |
| `Producto` | `stockMinimo`, `contenidoPaquete` | `NUMERIC(15,6)` |
| `Producto` | `costoUnitario` | `NUMERIC(15,4)` (práctica contable) |
| `RegistroScrap`, `RegistroRechazo` | `cantidad` | `NUMERIC(15,6)` |

La decisión ([ADR-010](./docs/adr/ADR-010-migracion-directa-a-numeric.md)) descansa
sobre tres pilares: la **base —no solo la aplicación— impone el dominio** (una escritura
externa fuera de dominio es rechazada por el motor: NIST SI-10/SC-28, ISO A.8.15); la
**agregación nativa** (`SUM` y rangos operan en SQL sin arrastrar filas a la app); y la
**frontera única** (15 enteros / 6 decimales, replicada por `aDecimal` en la entrada
HTTP). `src/lib/numerico.ts` sigue siendo la única fuente de aritmética — exacta, sin
épsilon — y el contrato JSON es estable: `Prisma.Decimal` se serializa a `string`, de
modo que **el frontend no requiere cambio alguno**.

---

## Estructura del proyecto

```
cig-manufacturing/
├── prisma/
│   ├── schema.prisma        # Modelo de datos (21 modelos; numéricos NUMERIC)
│   ├── migrations/          # Historial auditable de esquema
│   └── seed.ts              # Semilla: roles, configuración y admin inicial
├── docs/
│   ├── adr/                 # Decisiones Arquitectónicas (ADR-001…010 + índice)
│   ├── 01…05                # Introducción, arquitectura, guía de módulos,
│   │                        # referencia de BD y despliegue/operación
│   └── compliance/          # Informes de validación y evidencia de auditoría
├── db/                       # DATA_DIR por omisión: respaldos, branding, credenciales
├── src/
│   ├── app/                  # Páginas y rutas API (App Router)
│   ├── modulos/              # Lógica por módulo (autenticación, almacén, catálogo,
│   │                         # clientes, oqc, usuarios, ajustes, unidades, papelera,
│   │                         # respaldo, compartidos, nucleo)
│   ├── components/ui/        # Componentes shadcn/ui
│   ├── hooks/                # use-toast, use-mobile
│   └── lib/                  # numerico.ts (integridad numérica), db, reintentos,
│                             # tipos-dominio, version
├── scripts/                  # Siembra, migraciones auxiliares, pruebas de humo y E2E
├── setup.sh                  # Instalación completa en un paso
├── deploy.sh                 # Despliegue de producción (Ubuntu 22.04)
├── start.sh                  # Arranque en producción
├── Dockerfile                # Despliegue con Docker (opcional)
└── docker-compose.yml        # Orquestación con Docker (opcional)
```

---

## Despliegue rápido

> **Requisito obligatorio:** PostgreSQL 16+ accesible. `deploy.sh` y `setup.sh` lo
> aprovisionan (PGDG); si no pueden, escriben el SQL exacto para ejecutar como
> administrador (`instrucciones-postgres.txt`).

**Producción (Ubuntu 22.04, una máquina):**

```bash
sudo ./deploy.sh    # PostgreSQL 16 + rol + BD + migraciones + build + systemd + Caddy
```

**Primera instalación local / VM de prueba:**

```bash
./setup.sh     # .env (AUTH_SECRET aleatorio + DATABASE_URL + DATA_DIR), instala, crea BD, siembra y compila
./start.sh     # servidor en producción (puerto 3000)
```

> Para fijar la contraseña del administrador inicial:
> `ADMIN_PASSWORD='TuClave123' ./setup.sh` (solo la primera vez, con la base vacía).
> Sin ella, se genera una aleatoria (144 bits) y queda escrita UNA VEZ con permisos
> 600 en `DATA_DIR/credenciales-iniciales.txt`; el sistema exige cambiarla en el
> primer acceso.

**Seguridad del arranque (Fail-Fast):** `AUTH_SECRET` es obligatorio en producción
(mínimo 32 caracteres). Si falta o es inválido, la aplicación **no inicia**:
`src/instrumentation.ts` registra la causa (nunca el valor del secreto) y el proceso
termina con `process.exit(1)` — el servidor jamás queda «vivo» en estado degradado;
systemd/Docker ven el código 1 y escalan. En desarrollo solo se advierte y se genera
un secreto efímero.

La guía operativa completa (systemd, TLS vía Cloudflare DNS-01, Caddy, Docker,
respaldo/restauración, solución de problemas) está en
[docs/05-DESPLIEGUE-Y-OPERACION.md](./docs/05-DESPLIEGUE-Y-OPERACION.md) y
[README-DEPLOY.md](./README-DEPLOY.md).

---

## Desarrollo

```bash
bun install        # o npm install
bun run dev        # http://localhost:3000
```

Variables de entorno: [`.env.example`](./.env.example).

Para desarrollar un módulo nuevo (base de datos, permisos, API, lógica, UI y pruebas,
paso a paso): [docs/03-GUIA-DESARROLLO-NUEVOS-MODULOS.md](./docs/03-GUIA-DESARROLLO-NUEVOS-MODULOS.md).
Arquitectura general: [docs/02-ARQUITECTURA-DEL-SISTEMA.md](./docs/02-ARQUITECTURA-DEL-SISTEMA.md).

### Pruebas

```bash
bash scripts/simulacion-ci.sh                           # réplica local del pipeline de CI
bun run test                                            # unitarias (Vitest)
ADMIN_PASSWORD='...' python3 scripts/test-clientes.py   # E2E del módulo Clientes
```

---

## Arquitectura de la versión (Única Fuente de Verdad)

La versión vive **exclusivamente** en el campo `version` de
[`package.json`](./package.json). El resto del sistema la lee de ahí — nunca se
escribe a mano en componentes, rutas, scripts o documentación vigente:

| Consumidor | Cómo obtiene la versión |
|---|---|
| Rutas API / Server Components | `VERSION_DEL_SISTEMA` / `ETIQUETA_VERSION_SISTEMA` de [`src/lib/version.ts`](./src/lib/version.ts). |
| Client Components | Prop `versionDelSistema` desde el Server Component raíz (no se empaqueta `package.json` en el navegador). |
| `deploy.sh` | Lee `package.json` en tiempo de ejecución (`sed`) para banners y la unidad systemd. |

**Para liberar una versión**: cambia `version` en `package.json`, añade la entrada en
`CHANGELOG.md`; UI, health check y banners se actualizan solos.

---

## Modelo de datos (resumen)

21 modelos en [`prisma/schema.prisma`](./prisma/schema.prisma): autenticación
(`Rol`, `Usuario`, `Restablecimiento`, `Configuracion`), almacén (`Almacen`,
`Producto`, `Stock`, `Movimiento`, `CorreccionMovimiento`, `SecuenciaFolio`),
unidades (`UnidadMedida`), catálogo técnico (`Modelo`, `NumeroParte`, `ModeloParte`),
clientes (`Cliente`), calidad de salida (`SalidaOQC`, `RegistroScrap`,
`RegistroRechazo`), papelera (`Papelera`) y respaldo (`RespaldoBD`, `RestauracionBD`).

El diccionario completo (campo por campo y comportamientos especiales) está en
[docs/04-REFERENCIA-BASE-DATOS.md](./docs/04-REFERENCIA-BASE-DATOS.md).

---

## Gestión de versiones (SemVer 2.0.0)

- **2.3.0** — migración directa del esquema numérico a `NUMERIC` (ADR-010) y
  reestructuración de la documentación ADR. Aditivo a nivel de contrato JSON;
  refactorización estructural de la base de datos.
- Serie **2.x** — PostgreSQL 16 obligatorio (ADR-009); endurecimiento acumulado de
  autenticación y arranque.
- Serie **1.x** — era SQLite (retirada; ver [ADR-001](./docs/adr/ADR-001-sqlite-sobre-postgresql.md)).

## Licencia

Uso interno — CIG-MANUFACTURING. Todos los derechos reservados.
