# CIG-MANUFACTURING — Sistema de Gestión de Fábrica

Sistema web bilingüe (Español / Inglés) para el control y la gestión de almacén de fábrica:
inventario multi-almacén, entradas, recepción de materia prima, salidas, traslados, ajustes,
historial de movimientos con bitácora de correcciones, códigos QR, y administración de
usuarios, roles y permisos.

---

## Funcionalidades

| Módulo | Descripción |
|---|---|
| **Autenticación** | Inicio de sesión con correo/contraseña, sesiones JWT en cookie httpOnly (7 días), recuperación de contraseña por código, autoregistro configurable, cambio de contraseña. |
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
| **Respaldo y Restauración** | Copias de seguridad completas de la base de datos (instantánea consistente con `VACUUM INTO`, sin detener la planta) y **restauración EN CALIENTE**: una única transacción reemplaza todos los datos sin reiniciar el servidor. Si la restauración falla a mitad de operación, SQLite revierte todo y la base queda **exactamente como estaba** (rollback automático). Cada restauración exitosa crea un **snapshot pre-restauración** y abre una **ventana de 24 horas** para revertirla desde la UI (la reversión es a su vez una restauración con su propia ventana). Incluye respaldo **automático diario** (al abrir el módulo, conserva los últimos 7), rotación/limpieza de snapshots, detección de archivos copiados manualmente a `db/backups/`, descarga de respaldos, validación de integridad y compatibilidad de esquema antes de restaurar, y bitácora completa de intentos (`RestauracionBD`). |
| **Bilingüe** | Interfaz completa ES/EN con selector de idioma. |

## Permisos del sistema

`almacen.ver` · `almacen.gestionar` · `movimientos.crear` · `movimientos.corregir` ·
`inventario.ajustar` · `catalogo.ver` · `catalogo.gestionar` · `clientes.ver` ·
`clientes.gestionar` · `oqc.ver` · `oqc.liberar` · `oqc.gestionar` · `usuarios.gestionar` ·
`ajustes.gestionar` · `respaldo.gestionar` · `papelera.ver` · `papelera.gestionar`

## Usuarios iniciales

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@cig-manufacturing.com` | `Admin*2024` | Administrador |
| `ti@cig-manufacturing.com` | `Ti*2024` | TI |

> ⚠️ **Cambia estas contraseñas inmediatamente después del primer inicio de sesión.**

## Pila tecnológica

- **Next.js 16** (App Router, salida `standalone`) + **React 19** + **TypeScript**
- **Prisma ORM** con **SQLite** (archivo único, sin servidor de BD externo)
- **Tailwind CSS 4** + componentes **shadcn/ui**
- **jose** (JWT) + **bcryptjs** (hash de contraseñas)
- **React Query**, **React Table**, **Recharts**, **react-qr-code**

## Estructura del proyecto

```
cig-manufacturing/
├── prisma/
│   ├── schema.prisma        # Modelo de datos (9 tablas)
│   └── seed.ts              # Semilla: roles, usuarios y configuración
├── db/
│   └── custom.db            # Base de datos SQLite (se crea con setup.sh)
├── src/
│   ├── app/                 # Páginas y rutas API (App Router)
│   │   └── api/             # auth/, usuarios/, roles/, almacen/, ajustes/
│   ├── components/ui/       # Componentes shadcn/ui
│   ├── modulos/             # Lógica por módulo de negocio
│   │   ├── autenticacion/   # Sesión, permisos, pantalla de acceso
│   │   ├── almacen/         # Productos, almacenes, inventario, movimientos, QR
│   │   ├── catalogo/        # Modelos y números de parte (asociación N:M)
│   │   ├── usuarios/        # Gestión de usuarios y roles
│   │   ├── ajustes/         # Ajustes del sistema
│   │   ├── nucleo/          # Panel principal
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

```bash
./setup.sh     # configura .env, instala, crea BD, siembra usuarios y compila
./start.sh     # levanta el servidor en producción (puerto 3000)
```

La guía completa (PM2, systemd, Nginx, Docker, respaldos, actualizaciones y solución de
problemas) está en **[DESPLIEGUE.md](./DESPLIEGUE.md)**.

## Desarrollo

```bash
bun install        # o npm install
bun run dev        # o npm run dev  → http://localhost:3000
```

Variables de entorno: ver [`.env.example`](./.env.example).

## Modelo de datos (resumen)

- `Rol` — clave, nombre ES/EN, permisos (JSON), bandera de sistema
- `Usuario` — nombre, correo, hash de contraseña, rol, estado, bandera de cambio de password
- `Restablecimiento` — códigos de recuperación de contraseña con expiración
- `Configuracion` — ajustes clave/valor (banderas de auth, rol de autoregistro)
- `Almacen` — código, nombre, ubicación, tipo, responsable
- `Producto` — SKU, nombre, categoría, unidad, stock mínimo, costo
- `Stock` — existencias por producto × almacén (único por combinación)
- `Movimiento` — folio, tipo, origen/destino, cantidad, snapshot, referencia, responsable
- `CorreccionMovimiento` — bitácora inmutable de ediciones/eliminaciones de movimientos
- `Modelo` — código, nombre, descripción (catálogo técnico)
- `NumeroParte` — número, nombre, descripción (refacciones/componentes)
- `ModeloParte` — tabla de unión N:M entre modelos y números de parte

## Licencia

Uso interno — CIG-MANUFACTURING. Todos los derechos reservados.
