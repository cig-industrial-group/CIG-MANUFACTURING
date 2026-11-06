# CIG-MANUFACTURING — Sistema de Gestión de Fábrica

> ⚖️ **AVISO LEGAL:** Copyright © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.  
> Tijuana, Baja California, México. Este proyecto es propiedad privada y confidencial. Queda prohibida su reproducción, distribución o uso no autorizado sin permiso explícito por escrito.

**Versión:** 2.0.0 — migración del motor de base de datos a **PostgreSQL 16** (requisito obligatorio; decisión ADR-009). Registro de cambios: [CHANGELOG.md](./CHANGELOG.md). Si actualizas desde la v1.1.1, sigue la [Guía de Migración](#guía-de-migración-desde-v111-sqlite).

Sistema web bilingüe (Español / Inglés) para el control y la gestión de almacén de fábrica:
inventario multi-almacén, entradas, recepción de materia prima, salidas, traslados, ajustes,
historial de movimientos con bitácora de correcciones, códigos QR, y administración de
usuarios, roles y permisos.

---

## Funcionalidades

| Módulo | Descripción |
|---|---|
| **Autenticación** | Inicio de sesión con correo/contraseña, sesiones JWT en cookie httpOnly (24 h), recuperación de contraseña por código, autoregistro configurable, cambio de contraseña. |
| **Almacén** | Catálogo de productos (SKU, categoría, unidad, stock mínimo, costo), gestión de almacenes, inventario consolidado y por almacén, alertas de stock mínimo. |
| **Movimientos** | Entradas, recepción de materia prima, salidas, traslados entre almacenes, ajustes y scrap; folio automático por tipo (ENT/REC/SAL/TRA/AJU/SCR) con snapshot de stock resultante. Series **monotónicas** (`SecuenciaFolio`): un folio emitido jamás se reutiliza, aunque se elimine el registro que lo portaba. |
| **Correcciones** | Edición y eliminación de movimientos con bitácora inmutable (`CorreccionMovimiento`) que conserva el estado anterior y el motivo. Contrato explícito: un campo no enviado se conserva y una cadena vacía lo limpia — ninguna corrección parcial puede borrar por accidente la remisión (PL) o el responsable. |
| **Eliminación de registros (papelera)** | Tres niveles en productos, almacenes, modelos, números de parte y usuarios: **desactivar / reactivar** (reversible, queda oculto de las nuevas operaciones), **eliminar** (el registro sale de la base y va a la **Papelera** con un snapshot completo: restaurable durante 30 días, con cuenta regresiva) y **purga** (manual o automática al expirar: definitiva e irrecuperable). Cada eliminación, restauración y purga queda en una **bitácora inmutable** para siempre. |
| **Historial tipo ledger** | Los movimientos son registros inmutables autodescriptivos: conservan snapshots del producto (SKU/nombre/unidad), almacenes y usuario al momento del registro, con referencias suaves que sobreviven a cualquier eliminación. Si un producto se restaura desde la papelera, su historial se re-vincula solo. Los movimientos de entidades eliminadas quedan congelados (no editables) y se marcan con un distintivo «Eliminado». |
| **Catálogo** | Modelos de equipo/producto y números de parte con asociación muchos-a-muchos: una parte puede pertenecer a varios modelos y un modelo agrupa varias partes. Búsqueda, asociación desde ambas vistas y filtro «Mostrar inactivos». |
| **Clientes** | Catálogo de clientes de la empresa (código, razón social, contacto, correo, teléfono, dirección, notas) con activación/desactivación y eliminación en dos etapas (papelera). |
| **Códigos QR** | Generación de etiquetas QR por producto/almacén para consulta rápida de inventario. |
| **OQC (Calidad de Salida)** | Liberación de material a clientes: toda la operación se agrupa bajo **un folio de salida único** (OQC-…) con una partida (movimiento SALIDA) por producto. El inspector puede **corregir una partida individual** (la remisión/PL y el responsable siempre reflejan la cabecera de la salida) o **eliminarla** (devuelve el material con bitácora), **editar la cabecera** de la salida — la remisión y el responsable se propagan a todas las partidas y quedan en la bitácora como «Edición de cabecera» — y **eliminar la salida completa** (revierte todo el stock, con bitácora por partida). La bitácora se liga a la salida por `salidaId` (clave estable): las correcciones de partidas eliminadas siguen siendo visibles y una liberación nueva jamás hereda correcciones ajenas. Registro de **scrap** (descuenta stock mediante movimiento SCRAP con el mismo folio, corregible/eliminable con bitácora) y de **rechazos** de inspección (documental, sin efecto en stock, con disposición: pendiente/retrabajo/scrap/liberado). |
| **Usuarios y roles** | 6 roles precargados (ADMIN, TI, JEFE_ALMACEN, ALMACENERO, OPERADOR, OQC) con permisos granulares editables desde la app. |
| **Ajustes** | Habilitar/deshabilitar registro público y recuperación de contraseña; rol asignado al autoregistro. |
| **Respaldo y Restauración** | Copias de seguridad completas de la base de datos (`pg_dump --format=custom`: instantánea consistente sin detener la planta) y **restauración EN CALIENTE**: una única transacción reemplaza todos los datos sin reiniciar el servidor. Si la restauración falla a mitad de operación, PostgreSQL revierte todo y la base queda **exactamente como estaba** (rollback automático). Cada restauración exitosa crea un **snapshot pre-restauración** y abre una **ventana de 24 horas** para revertirla desde la UI (la reversión es a su vez una restauración con su propia ventana). Incluye respaldo **automático diario** (al abrir el módulo, conserva los últimos 7), rotación/limpieza de snapshots, detección de archivos copiados manualmente a `DATA_DIR/backups/`, descarga de respaldos, validación de integridad y compatibilidad de esquema del volcado (`pg_restore --list`) antes de restaurar, y bitácora completa de intentos (`RestauracionBD`). |
| **Bilingüe** | Interfaz completa ES/EN con selector de idioma. |

## Permisos del sistema

`almacen.ver` · `almacen.gestionar` · `movimientos.crear` · `movimientos.corregir` ·
`inventario.ajustar` · `catalogo.ver` · `catalogo.gestionar` · `clientes.ver` ·
`clientes.gestionar` · `oqc.ver` · `oqc.liberar` · `oqc.gestionar` · `usuarios.gestionar` ·
`ajustes.gestionar` · `respaldo.gestionar` · `papelera.ver` · `papelera.gestionar`

## Usuarios iniciales

La instalación crea **una única cuenta administradora** (`admin@cig-manufacturing.com`)
la primera vez que se siembra una base de datos vacía. Su contraseña **nunca está
fijada en el repositorio**:

- Si ejecutas la instalación con `ADMIN_PASSWORD='TuClave123' ./setup.sh`, esa es la
  contraseña inicial del administrador.
- Si no la defines, se genera una **aleatoria** y queda escrita (una sola vez,
  permisos 600) en `DATA_DIR/credenciales-iniciales.txt`.

> ⚠️ **Cambia la contraseña en el primer inicio de sesión** (el sistema te lo
> pedirá) y elimina `credenciales-iniciales.txt` después. Las cuentas adicionales
> (TI, almaceneros, operadores) se crean desde la aplicación una vez entras como
> administrador.

## Pila tecnológica

- **Next.js 16** (App Router, salida `standalone`) + **React 19** + **TypeScript**
- **Prisma ORM** con **PostgreSQL 16+** (servidor de base de datos obligatorio; `deploy.sh`, `setup.sh` y `docker-compose.yml` lo aprovisionan)
- **Tailwind CSS 4** + componentes **shadcn/ui**
- **jose** (JWT) + **bcryptjs** (hash de contraseñas)
- **React Query**, **React Table**, **Recharts**, **react-qr-code**

## Estructura del proyecto

```
cig-manufacturing/
├── prisma/
│   ├── schema.prisma        # Modelo de datos (21 modelos)
│   └── seed.ts              # Semilla: roles, configuración y admin inicial
├── db/                      # DATA_DIR por omisión: respaldos, branding y credenciales
│   └── backups/             #   volcados pg_dump (.dump); la BD vive en el servidor PostgreSQL
├── src/
│   ├── app/                 # Páginas y rutas API (App Router)
│   │   └── api/             # auth/, usuarios/, roles/, almacen/, ajustes/
│   ├── components/ui/       # Componentes shadcn/ui
│   ├── modulos/             # Lógica por módulo de negocio
│   │   ├── autenticacion/   # Sesión, permisos, pantalla de acceso
│   │   ├── almacen/         # Productos, almacenes, inventario, movimientos, QR
│   │   ├── catalogo/        # Modelos y números de parte (asociación N:M)
│   │   ├── clientes/        # Catálogo de clientes
│   │   ├── oqc/             # Calidad de salida: liberaciones, scrap, rechazos
│   │   ├── usuarios/        # Gestión de usuarios y roles
│   │   ├── ajustes/         # Ajustes del sistema
│   │   ├── nucleo/          # Registro de módulos y panel principal
│   │   └── compartidos/     # Idioma ES/EN, errores, UI compartida
│   ├── hooks/               # use-toast, use-mobile
│   └── lib/                 # Cliente Prisma, utilidades
├── scripts/
│   └── posbuild.mjs         # Copia static/ y public/ al standalone tras compilar
├── setup.sh                 # Instalación completa en un paso
├── start.sh                 # Arranque en producción
├── Dockerfile               # Despliegue con Docker (opcional)
└── docker-compose.yml       # Orquestación con Docker (opcional)
```

## Inicio rápido

> **Requisito obligatorio:** PostgreSQL 16+ accesible en local. `setup.sh` aprovisiona
> el rol y la base de datos (si no puede, escribe `instrucciones-postgres.txt` con el
> SQL exacto para ejecutar como administrador).

```bash
./setup.sh     # configura .env (AUTH_SECRET aleatorio + DATABASE_URL + DATA_DIR), instala, crea BD, siembra y compila
./start.sh     # levanta el servidor en producción (puerto 3000)
```

> Para fijar la contraseña del administrador inicial:
> `ADMIN_PASSWORD='TuClave123' ./setup.sh` (solo tiene efecto la primera vez,
> con la base de datos vacía).

**Seguridad del arranque:** `AUTH_SECRET` es obligatorio en producción (mínimo
32 caracteres, generado por `setup.sh`). Si falta o es inválido, la aplicación
**no inicia**. Ver [`.env.example`](./.env.example).

La guía completa de despliegue de producción (Ubuntu 22.04 con `deploy.sh`, TLS vía
Cloudflare DNS-01, systemd, Caddy, Docker, respaldos y solución de problemas) está en
**[docs/05-DESPLIEGUE-Y-OPERACION.md](./docs/05-DESPLIEGUE-Y-OPERACION.md)** y
**[README-DEPLOY.md](./README-DEPLOY.md)**.

## Desarrollo

```bash
bun install        # o npm install
bun run dev        # o npm run dev  → http://localhost:3000
```

En desarrollo, si no defines `AUTH_SECRET`, se usa un secreto efímero aleatorio
por proceso (las sesiones se pierden al reiniciar; nunca un valor conocido).

Variables de entorno: ver [`.env.example`](./.env.example).

**Para desarrollar e integrar un módulo nuevo** (base de datos, permisos, API,
lógica, UI y pruebas, paso a paso con código de referencia), sigue la guía
**[docs/03-GUIA-DESARROLLO-NUEVOS-MODULOS.md](./docs/03-GUIA-DESARROLLO-NUEVOS-MODULOS.md)**.
La arquitectura general del sistema está documentada en
[docs/02-ARQUITECTURA-DEL-SISTEMA.md](./docs/02-ARQUITECTURA-DEL-SISTEMA.md).

### Pruebas

```bash
bash scripts/simulacion-ci.sh                     # réplica local del pipeline de CI
ADMIN_PASSWORD='...' python3 scripts/test-clientes.py   # E2E del módulo Clientes
# (los demás scripts de scripts/ aceptan igualmente ADMIN_PASSWORD)
```

## Modelo de datos (resumen)

La base de datos vive en un **servidor PostgreSQL 16** y tiene **21 modelos** definidos en
[`prisma/schema.prisma`](./prisma/schema.prisma): autenticación (`Rol`, `Usuario`,
`Restablecimiento`, `Configuracion`), almacén (`Almacen`, `Producto`, `Stock`,
`Movimiento`, `CorreccionMovimiento`, `SecuenciaFolio`), unidades (`UnidadMedida`),
catálogo técnico (`Modelo`, `NumeroParte`, `ModeloParte`), clientes (`Cliente`),
calidad de salida (`SalidaOQC`, `RegistroScrap`, `RegistroRechazo`), papelera
(`Papelera`) y respaldo (`RespaldoBD`, `RestauracionBD`).

**El diccionario de datos completo** — campo por campo, con los comportamientos
especiales (folios monotónicos, papelera de 3 niveles, snapshots inmutables,
restauración en caliente) — está en
**[docs/04-REFERENCIA-BASE-DATOS.md](./docs/04-REFERENCIA-BASE-DATOS.md)**.

## Guía de Migración desde v1.1.1 (SQLite)

> Esta es la **única sección** de la documentación vigente que referencia el motor
> anterior: la serie 1.x usaba SQLite embebido; desde la 2.0.0 el requisito
> obligatorio es **PostgreSQL 16+** (ADR-009).

Si actualizas una instalación existente de la v1.1.1:

1. Instala y arranca **PostgreSQL 16** (en despliegues con `deploy.sh` el propio
   instalador lo aprovisiona desde PGDG; con Docker, usa el servicio
   `postgres:16-alpine` del `docker-compose.yml`).
2. Despliega la v2.0.0: `deploy.sh` crea rol, base y esquema (migraciones
   auditables) y conserva tu `.env` en re-ejecuciones.
3. Migra los datos del archivo de la instalación anterior:

   ```bash
   bun run scripts/migrar-sqlite-a-postgres.ts /ruta/a/production.db
   ```

   La copia es **transaccional y verificada** (21 tablas, conteos por tabla, cero
   discrepancias o aborta) y conserva folios monotónicos, papelera con su ventana
   de 30 días, snapshots del histórico y bitácoras.

4. Verifica el resultado con la prueba de humo:
   `bun run scripts/prueba-humo-postgres.ts`.

La guía operativa completa para instalaciones de producción está en
[README-DEPLOY.md § 8](./README-DEPLOY.md#8-migración-de-una-instalación-desde-v111-sqlite).

## Licencia

Uso interno — CIG-MANUFACTURING. Todos los derechos reservados.
