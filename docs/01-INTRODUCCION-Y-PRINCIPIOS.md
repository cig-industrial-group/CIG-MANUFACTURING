# 01 — Introducción y Principios

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 1.0.0 · **Rama:** `main`
> Suite de documentación arquitectónica — Parte 1 de 6.

---

## 1. Visión del proyecto

CIG-MANUFACTURING es el sistema web de gestión de fábrica del grupo: una aplicación bilingüe
(Español / Inglés) para el control operativo del almacén y la calidad de salida en planta.
No es un ERP genérico ni un gestor de inventarios de escritorio: es la **fuente de verdad
operativa y de auditoría** del flujo físico de material.

Dominios funcionales implementados en la versión 1.0.0:

| Dominio | Alcance |
|---|---|
| **Autenticación y administración** | Sesiones JWT, usuarios, 6 roles con permisos granulares, ajustes del sistema. |
| **Almacén** | Catálogo de productos y almacenes, inventario multi-almacén, entradas, recepción de materia prima, salidas, traslados, ajustes, conteo en paquetes, códigos QR. |
| **Catálogo técnico** | Modelos de equipo y números de parte con asociación N:M. |
| **Clientes** | Catálogo de clientes que reciben material de salida. |
| **OQC (Calidad de Salida)** | Liberaciones de material agrupadas bajo folio único, corrección/eliminación de partidas con bitácora, registro de scrap (descuenta stock) y rechazos de inspección. |
| **Unidades de medida** | Catálogo configurable de unidades base y de paquete, con equivalencias por producto. |
| **Gobernanza de datos** | Papelera de 3 niveles con ventana de restauración de 30 días, bitácoras inmutables, respaldo y restauración de BD en caliente con reversión. |

El sistema está diseñado para ejecutarse **en un solo servidor**, sin dependencias de
infraestructura externa (sin servidor de base de datos, sin cola de mensajes, sin SMTP).
Esa restricción no es una limitación accidental: es un requisito de despliegue autónomo
(ver [ADR-001](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md)).

**Convención de nomenclatura obligatoria:** el proyecto se nombra **CIG-MANUFACTURING**
(mayúsculas); el nombre del sistema y del usuario de servicio es **cig-manufacturing**
(minúsculas con guiones). No utilizar otras variantes.

---

## 2. Principios rectores inquebrantables

Toda decisión de diseño, todo código nuevo y toda revisión se juzgan contra estos cuatro
principios. Un cambio que los vulnere es un cambio mal diseñado, sin excepción.

### 2.1 Zero Trust — ninguna petición es de confianza

No existe una "zona interna" de la aplicación donde las peticiones se den por buenas.
La regla operativa:

- **Cada ruta API valida sesión y permisos en su primera línea de ejecución** mediante la
  guarda `requerirPermiso()` de `src/modulos/autenticacion/servicios/auth.ts`. La petición
  sin sesión recibe `401 NO_AUTENTICADO`; la petición con sesión pero sin permiso recibe
  `403 SIN_PERMISO`.
- La única ruta pública es `POST /api/auth/login` (y las banderas de configuración
  `GET /api/auth/banderas`, que no expone datos sensibles). Todo lo demás está cerrado
  por defecto.
- El frontend **no** es la frontera de seguridad: ocultar un botón es UX, no control de
  acceso. El control real vive en el servidor.
- En el perímetro, el proxy inverso (Caddy) publica el servicio y la aplicación escucha
  únicamente en `127.0.0.1` en producción (`deploy.sh` fija `HOSTNAME=127.0.0.1` en la
  unidad systemd): la app jamás queda expuesta directamente a la red.

### 2.2 Inmutabilidad del ledger — la historia no se edita, se corrige con bitácora

El inventario no se guarda como "estado actual": se guarda como una **corriente de
movimientos**. Cada movimiento (`Movimiento`) es un registro autodescriptivo e inmutable
que conserva *snapshots* del producto, almacenes, cliente y usuario en el momento del
registro, con referencias suaves (sin FK) para que la historia sobreviva a la eliminación
de cualquier entidad referenciada.

- Editar o eliminar un movimiento **no sobrescribe nada**: crea una fila en
  `CorreccionMovimiento` con el estado `antes` y `despues` (JSON), el motivo y el usuario
  que corrigió.
- Las eliminaciones lógicas pasan por la **Papelera** (`Papelera`), que es también un log
  inmutable: tras la purga, la fila sobrevive sin datos como bitácora histórica.
- Los folios (`SecuenciaFolio`) son **monotónicos**: un folio emitido jamás se reutiliza,
  aunque se elimine el registro que lo portaba (ver [ADR-003](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md)).

Consecuencia práctica para el desarrollador: **nunca** se escribe un `UPDATE` sobre
`Movimiento`, `CorreccionMovimiento`, `Papelera` o `RestauracionBD` para "arreglar"
datos. Si un dato vivo es incorrecto, se corrige generando la bitácora correspondiente.

### 2.3 Fail-Secure — ante la duda, no arrancar / no dejar pasar

El sistema falla hacia el lado cerrado, nunca hacia el abierto:

- `AUTH_SECRET` es **obligatorio y válido en producción** (mínimo 32 caracteres, sin
  espacios, y no puede coincidir con ningún valor publicado en el repositorio). Si falta
  o es inválido, **la aplicación no inicia**: `src/instrumentation.ts` detiene el proceso
  en el arranque, y la validación perezosa de `seguridad.ts` lo impide como defensa en
  profundidad.
- En desarrollo, sin secreto válido se genera uno **efímero aleatorio por proceso** (las
  sesiones se pierden al reiniciar). Jamás existe un valor por omisión conocido.
- Una sesión JWT firmada con un secreto antiguo deja de validar al rotar el secreto:
  los usuarios vuelven a iniciar sesión. No hay migración de tokens.
- `COOKIE_INSEGURA_HTTP=1` (para LAN sin TLS) **avisa por consola en cada arranque**:
  nunca es una degradación silenciosa.
- Las operaciones de stock son transaccionales *todo-o-nada*: si una liberación OQC no
  puede descontar todas sus partidas, no se descuenta ninguna (`STOCK_INSUFICIENTE`,
  HTTP 400).

### 2.4 Mínimo privilegio — cada proceso ve y toca solo lo suyo

- El servicio de producción corre con el usuario **cig-manufacturing**, sin sudo y sin
  grupos privilegiados; `deploy.sh` aborta el despliegue si lo encuentra en `sudo`,
  `docker`, `wheel` o `admin`.
- La unidad systemd generada aplica `ProtectSystem=strict` (todo el sistema de archivos
  en solo lectura) y `ReadWritePaths` limitados a `db/`, `logs/` y la caché del
  standalone. El proceso ni siquiera puede escribir su propio código.
- En la aplicación: roles con permisos granulares (18 permisos en 6 roles precargados);
  el principio se aplica igual en la BD (ver
  [04-REFERENCIA-BASE-DATOS.md](./04-REFERENCIA-BASE-DATOS.md)) y en la UI (la
  navegación filtra secciones por permiso, pero la autoridad es el servidor).

---

## 3. Justificación técnica del stack

Cada pieza del stack responde a los principios anteriores y al requisito de despliegue
autónomo. Versiones verificadas en `package.json` (rama `main`):

### Next.js 16 (App Router, salida `standalone`)

- **App Router + React 19**: la aplicación es un shell de cliente único
  (`src/app/page.tsx`) que renderiza módulos registrados; las rutas API viven en
  `src/app/api/**/route.ts`. Un solo artefacto sirve UI y API.
- **`output: "standalone"`** (fijado en `next.config.ts`): el build produce
  `.next/standalone/server.js`, un servidor Node autocontenido sin necesidad del
  `node_modules` completo en el servidor. Es la base del despliegue de producción con
  systemd y del aislamiento de `ReadWritePaths`.
- El guardián de calidad (`scripts/simulacion-ci.sh`) verifica que
  `typescript.ignoreBuildErrors` y `eslint.ignoreDuringBuilds` **no** estén activados:
  el build tipa y linta de verdad.

### Prisma ORM + SQLite

- **SQLite**: la base de datos es **un archivo** (`db/custom.db` en instalaciones
  `setup.sh`, `db/production.db` en despliegues `deploy.sh`). Sin servidor de BD que
  administrar, respaldar, parchear o proteger; copiar el archivo (mejor aún: `VACUUM
  INTO`) es un respaldo consistente. Justificación completa y alternativas descartadas
  en [ADR-001](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md).
- **Prisma 6** con `prisma-client-js`: esquema declarativo en `prisma/schema.prisma`
  (fuente única del modelo de datos, ver
  [04-REFERENCIA-BASE-DATOS.md](./04-REFERENCIA-BASE-DATOS.md)), cliente tipado y
  `$transaction` para las operaciones compuestas (folios + stock + bitácoras). En este
  proyecto se usa `prisma db push` (esquema sin historial de migraciones versionadas);
  la siembra de datos vive en `prisma/seed.ts`.

### Bun

- Runtime y gestor de paquetes **preferido** del proyecto: `bun install
  --frozen-lockfile`, `bunx prisma …`, `bun run build`, `bun prisma/seed.ts`. Ejecuta
  TypeScript de la semilla y los scripts de migración sin transpilar.
- `deploy.sh` lo instala en `/home/cig-manufacturing/.bun` para el usuario de servicio y
  el `ExecStart` systemd apunta directo a ese binario. `start.sh` tolera Node.js como
  fallback, pero el flujo probado (CI incluida) es Bun.

### Tailwind CSS 4 + shadcn/ui

- **shadcn/ui** (`src/components/ui/`) aporta componentes Radix accesibles y
  personalizables **cuyo código vive en el repositorio**: no hay dependencia binaria que
  actualizar a ciegas y el look es auditado. Es el vocabulario UI obligatorio de los
  módulos (Dialog, Button, Input, Badge, Table…).
- Sobre esa base, `src/modulos/compartidos/ui/` añade los componentes *del dominio*
  (EncabezadoSeccion, TablaResponsiva, DialogoEliminarRegistro, InterruptorInactivos…)
  que estandarizan todas las pantallas de gestión (ver
  [03-GUIA-DESARROLLO-NUEVOS-MODULOS.md](./03-GUIA-DESARROLLO-NUEVOS-MODULOS.md)).
- **React Query** gestiona el estado de servidor (caché, invalidación por mutación) y
  **Zustand** el estado de UI mínimo (módulo activo).

### Complementos de seguridad

- **jose**: firma/verificación JWT HS256 de las sesiones (sin dependencias de Node
  crypto, funciona en cualquier runtime).
- **bcryptjs**: hash de contraseñas (costo 10).
- **zod** está disponible para validación de esquemas de entrada.

---

## 4. Cómo usar esta suite

| Documento | Contenido |
|---|---|
| [02-ARQUITECTURA-DEL-SISTEMA.md](./02-ARQUITECTURA-DEL-SISTEMA.md) | Flujo de datos, estructura de directorios, modelo de seguridad. |
| [03-GUIA-DESARROLLO-NUEVOS-MODULOS.md](./03-GUIA-DESARROLLO-NUEVOS-MODULOS.md) | Protocolo paso a paso para integrar un módulo nuevo (ejemplo maestro: Proveedores). |
| [04-REFERENCIA-BASE-DATOS.md](./04-REFERENCIA-BASE-DATOS.md) | Diccionario de datos completo y comportamientos especiales. |
| [05-DESPLIEGUE-Y-OPERACION.md](./05-DESPLIEGUE-Y-OPERACION.md) | `deploy.sh`, operaciones diarias, restauración. |
| [06-REGISTRO-DECISIONES-ARQUITECTONICAS (ADR).md](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md) | El «¿por qué?» de las decisiones clave. |

Lectura mínima para un desarrollador nuevo: este documento, el 02 y el 03. Para
operar producción: el 05. Para tocar el esquema de datos: el 04.
