# 04 — Referencia de Base de Datos

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 1.1.0 · **Rama:** `main`
> Suite de documentación arquitectónica — Parte 4 de 6.
>
> Fuente única de verdad: `prisma/schema.prisma` (motor **SQLite**, generador
> `prisma-client-js`, URL por `DATABASE_URL`). Este documento es un espejo del esquema;
> ante cualquier discrepancia, el esquema manda y este documento debe corregirse.

---

## 0. Generalidades

- **Motor:** SQLite (archivo único). Instalaciones `setup.sh`: `db/custom.db`;
  despliegues `deploy.sh`: `/home/cig-manufacturing/CIG-MANUFACTURING/db/production.db`.
- **Identificadores:** `cuid()` por omisión; `createdAt`/`updatedAt` automáticos.
- **Convención del sistema:** la auditoría y el histórico **no usan FK duras** hacia
  entidades de negocio. `Movimiento`, `CorreccionMovimiento`, `Papelera`, `SalidaOQC`,
  `RegistroScrap`, `RegistroRechazo`, `RespaldoBD` y `RestauracionBD` usan
  **referencias suaves (id sin FK) + snapshots** de los datos vivos, de modo que la
  historia sobreviva a la eliminación de cualquier entidad referenciada y se re-vincule
  sola si la entidad se restaura desde la papelera con el mismo id.
- **Las únicas FK duras** son las estructurales: `Usuario→Rol`,
  `Restablecimiento→Usuario` (cascade), `Stock→Producto/Almacen` (cascade),
  `ModeloParte→Modelo/NumeroParte` (cascade).
- **Catálogo de modelos (21):** Autenticación (4): `Rol`, `Usuario`, `Restablecimiento`,
  `Configuracion` · Almacén (6): `Almacen`, `Producto`, `Stock`, `Movimiento`,
  `CorreccionMovimiento`, `SecuenciaFolio` · Unidades (1): `UnidadMedida` · Catálogo
  técnico (3): `Modelo`, `NumeroParte`, `ModeloParte` · Clientes (1): `Cliente` ·
  OQC (3): `SalidaOQC`, `RegistroScrap`, `RegistroRechazo` · Papelera (1): `Papelera` ·
  Respaldo (2): `RespaldoBD`, `RestauracionBD`.

> **Nota sobre nombres:** no existen modelos llamados «Partida», «Rechazo» ni «Scrap».
  Las *partidas* de una salida OQC son filas de `Movimiento` (tipo `SALIDA`) agrupadas
  por `salidaId`; los rechazos y el scrap son `RegistroRechazo` y `RegistroScrap`
  respectivamente.

### Comandos de esquema

```bash
bunx prisma db push        # aplica el esquema a la BD (atajo: bun run db:push)
bunx prisma generate       # regenera el cliente (atajo: bun run db:generate)
bunx prisma db seed        # semilla (package.json → bun prisma/seed.ts)
bunx prisma studio         # explorador visual (solo desarrollo)
```

---

## 1. Módulo Autenticación

### 1.1 `Rol`

| Campo | Tipo | Restricciones / Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `clave` | String | **única**. `ADMIN` · `TI` · `JEFE_ALMACEN` · `ALMACENERO` · `OPERADOR` · `OQC` |
| `nombre` | String | Nombre visible (ES) |
| `nombreEn` | String | Nombre visible (EN) |
| `descripcion` | String? | — |
| `permisos` | String | JSON: `["almacen.ver", "usuarios.gestionar", …]` (18 permisos, ver §9) |
| `sistema` | Boolean | `false` por omisión; los roles de sistema no se pueden eliminar |
| `createdAt` / `updatedAt` | DateTime | automáticos |

Relación: `usuarios Usuario[]`. Los roles `ADMIN` y `TI` se siembran con `sistema: true`
y todos los permisos.

### 1.2 `Usuario`

| Campo | Tipo | Restricciones / Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `nombre` | String | — |
| `correo` | String | **único**; se normaliza a minúsculas en login |
| `passwordHash` | String | bcrypt (costo 10, `bcryptjs`) |
| `rolId` | String | FK dura → `Rol.id` |
| `activo` | Boolean | `true` por omisión; una sesión de usuario inactivo deja de validar |
| `debeCambiarPassword` | Boolean | `false` por omisión; `true` en el admin sembrado (cambio forzado) |
| `ultimoAcceso` | DateTime? | actualizado en cada login |
| `createdAt` / `updatedAt` | DateTime | automáticos |

Relaciones: `rol Rol`, `restablecimientos Restablecimiento[]`. La eliminación es lógica
a través de la Papelera (entidad `USUARIO`).

### 1.3 `Restablecimiento`

Códigos de recuperación de contraseña. `codigoHash` guarda el hash del código (nunca el
código); `expiraEn` la vigencia; `usadoEn` marca uso único. FK dura a `Usuario` con
`onDelete: Cascade`; índice en `usuarioId`.

### 1.4 `Configuracion`

Ajustes clave/valor de la aplicación. PK = `clave` (p. ej. `auth.registroHabilitado`,
`auth.recuperacionHabilitada`, `auth.rolRegistro`); `valor` es JSON en texto. Sembrada
con `false`/`false`/`"OPERADOR"`.

---

## 2. Módulo Almacén

### 2.1 `Almacen`

| Campo | Tipo | Restricciones / Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `codigo` | String | **único** |
| `nombre` | String | — |
| `ubicacion` | String? | — |
| `tipo` | String | `GENERAL` por omisión · `MATERIA_PRIMA` · `PRODUCTO_TERMINADO` |
| `responsable` | String? | — |
| `activo` | Boolean | `true` por omisión |
| `createdAt` / `updatedAt` | DateTime | automáticos |

### 2.2 `Producto`

| Campo | Tipo | Restricciones / Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `sku` | String | **único** |
| `nombre` | String | — |
| `descripcion` | String? | — |
| `categoria` | String | `MATERIA_PRIMA` por omisión · `PRODUCTO_TERMINADO` · `MATERIAL` · `INSUMO` |
| `unidad` | String | código de la unidad BASE del catálogo (`PZA`, `KG`, `M`, `L`…) |
| `unidadPaquete` | String? | código de la unidad de paquete (`PAQ`, `CJA`…) para conteo |
| `contenidoPaquete` | String? | unidades base por paquete, **texto decimal exacto** ("10", "2.5"; varía POR PRODUCTO; el stock siempre vive en la unidad base) |
| `stockMinimo` | String | `"0"` por omisión (alertas); **texto decimal exacto** |
| `costoUnitario` | String? | valorización; **texto decimal exacto** (nunca float) |
| `activo` | Boolean | `true` por omisión |
| `createdAt` / `updatedAt` | DateTime | automáticos |

### 2.3 `Stock`

Existencias por combinación producto × almacén. Campos: `id`, `productoId`, `almacenId`
(FK duras con cascade), `cantidad String` (texto decimal exacto; `"0"` por omisión),
`updatedAt`. Restricción
`@@unique([productoId, almacenId])` (una fila por combinación) e índice en `almacenId`.

### 2.4 `Movimiento` — registro inmutable tipo ledger

El corazón del sistema. **No se actualiza ni se borra**: las correcciones crean filas en
`CorreccionMovimiento`.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `folio` | String | **único**; `ENT-`/`REC-`/`SAL-`/`TRA-`/`AJU-`/`SCR-` + fecha + consecutivo (ver §8.1) |
| `tipo` | String | `ENTRADA` · `RECEPCION` · `SALIDA` · `TRASLADO` · `AJUSTE` · `SCRAP` |
| `productoId` | String | referencia suave (sin FK) |
| `almacenOrigenId` / `almacenDestinoId` | String? | referencias suaves |
| `cantidad` | String | **siempre en la unidad base del producto**; texto decimal exacto (máx. 6 decimales) |
| `cantidadDespues` | String? | snapshot del stock resultante (texto decimal exacto) |
| `motivo` / `referencia` / `responsable` | String? | causa; factura/OC/remisión; quien firma |
| `usuarioId` | String? | referencia suave |
| `usuarioNombre` | String? | snapshot del usuario que registró |
| `editado` | Boolean | `true` si fue corregido desde la sección de origen |
| `createdAt` | DateTime | — |
| `productoSku` / `productoNombre` / `productoUnidad` | String | snapshots del producto (`""` por omisión) |
| `almacenOrigenCodigo` / `almacenOrigenNombre` | String? | snapshots del almacén origen |
| `almacenDestinoCodigo` / `almacenDestinoNombre` | String? | snapshots del almacén destino |
| `clienteId` / `clienteCodigo` / `clienteNombre` | String? | salida a cliente (referencia suave + snapshots) |
| `salidaId` / `salidaFolio` | String? | agrupador `SalidaOQC` (referencia suave + folio snapshot) |
| `conteoDetalle` | String? | snapshot JSON del conteo en paquetes: `[{ "u": "CJA", "n": "Caja", "f": 12, "c": 2 }, …]` |

Índices: `tipo`, `createdAt`, `productoId`, `clienteId`, `salidaId`.

### 2.5 `CorreccionMovimiento` — bitácora inmutable de correcciones

Una fila por cada edición o eliminación de un movimiento. Campos: `id`; `movimientoId`
(informativo, sin FK); `folio` (se conserva siempre); `salidaId` / `salidaFolio` (clave
estable de enlace con la salida OQC); `accion` (`EDICION` | `ELIMINACION`); `antes`
(JSON del estado previo); `despues` (JSON del estado corregido; `null` en
eliminaciones); `motivo` (capturado por el usuario); `usuarioId` / `usuarioNombre`;
`createdAt`. Índices: `movimientoId`, `salidaId`, `salidaFolio`, `createdAt`.

### 2.6 `SecuenciaFolio` — series monotónicas

Una fila por serie (`clave` **única** = `prefijo-fecha`, p. ej. `SAL-20261103`);
`ultimo Int` = último número emitido; `updatedAt`. Es la **única autoridad** de folios:
el contador jamás retrocede (ver §8.1 y
[ADR-003](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md)).

---

## 3. Módulo Unidades de Medida

### `UnidadMedida`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `codigo` | String | **único**; mayúsculas (`PZA`, `CJA`, `KG`…) |
| `nombre` / `nombreEn` | String | nombres visibles ES/EN |
| `tipo` | String | `CONTEO` · `PESO` · `LONGITUD` · `VOLUMEN` · `OTRO` · `PAQUETE` |
| `unidadBase` | String? | código de la unidad base que agrupa (solo `PAQUETE`) |
| `notas` | String? | — |
| `activo` | Boolean | `true` por omisión |
| `esSistema` | Boolean | sembrada por el sistema: no eliminable |
| `createdAt` / `updatedAt` | DateTime | automáticos |

Índices: `tipo`, `unidadBase`. Naturalezas: unidades **base** (la magnitud del stock) y
unidades de **paquete** (múltiplo para contar; la equivalencia por producto vive en
`Producto.contenidoPaquete`, no aquí).

---

## 4. Módulo Catálogo técnico

### 4.1 `Modelo`

`id`, `codigo` **único** (ej. `LW-2000`), `nombre`, `descripcion?`, `activo` (true),
`createdAt`/`updatedAt`; relación `partes ModeloParte[]`.

### 4.2 `NumeroParte`

`id`, `numero` **único** (ej. `MOT-0500-A`), `nombre` (descripción corta),
`descripcion?`, `activo` (true), `createdAt`/`updatedAt`; relación `modelos ModeloParte[]`.

### 4.3 `ModeloParte` — unión N:M explícita

PK compuesta `@@id([modeloId, numeroParteId])`; `createdAt`; FK duras a `Modelo` y
`NumeroParte` con `onDelete: Cascade`; índice en `numeroParteId`. Es explícita (y no una
tabla implícita de Prisma) para poder extenderla (cantidades por unidad, criticidad…).

---

## 5. Módulo Clientes

### `Cliente`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `codigo` | String | **único** (ej. `CLI-0001`) |
| `nombre` | String | razón social o nombre visible |
| `contacto` / `correo` / `telefono` / `direccion` / `notas` | String? | datos de contacto |
| `activo` | Boolean | `true` por omisión; liberar material a un cliente inactivo se rechaza (`CLIENTE_INACTIVO`, 409) |
| `createdAt` / `updatedAt` | DateTime | automáticos |

Las salidas a cliente se vinculan desde `Movimiento` (`clienteId` + snapshots) y desde
`SalidaOQC` — sin FK, para que el historial sobreviva a la papelera.

---

## 6. Módulo OQC (Calidad de Salida)

### 6.1 `SalidaOQC` — agrupador de una liberación

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `folio` | String | **único**; formato `OQC-20261103-0001` |
| `clienteId` / `clienteCodigo` / `clienteNombre` | String? | referencia suave + snapshots |
| `almacenOrigenId` / `almacenOrigenCodigo` / `almacenOrigenNombre` | String? | referencia suave + snapshots |
| `referencia` | String? | remisión / pedido / folio de embarque |
| `responsable` | String? | quien firma la liberación |
| `notas` | String? | — |
| `usuarioId` / `usuarioNombre` | String? | quien liberó (referencia suave + snapshot) |
| `estado` | String | `EMITIDA` por omisión · `ELIMINADA` (la fila sobrevive como bitácora) |
| `eliminadaEn` / `eliminadaPor` | DateTime? / String? | auditoría de la eliminación |
| `createdAt` / `updatedAt` | DateTime | automáticos |

Índices: `createdAt`, `clienteId`, `estado`. Cada *partida* es un `Movimiento` tipo
`SALIDA` con `salidaId`/`salidaFolio` apuntando aquí; al eliminar la salida se revierte
todo el stock y cada partida queda documentada en `CorreccionMovimiento`.

### 6.2 `RegistroScrap`

Scrap: material desechado tras inspección; **descuenta stock** mediante un `Movimiento`
tipo `SCRAP` (mismo folio, referencia suave en `movimientoId`). Campos: `id`; `folio`
**único** `SCR-20261103-0001`; `productoId` + snapshots `productoSku`/`productoNombre`/
`productoUnidad`; `almacenId` + snapshots `almacenCodigo`/`almacenNombre`; `cantidad
String` (texto decimal exacto); `motivo` (defecto, daño, no conforme…); `notas?`; `responsable?`; `usuarioId?`/
`usuarioNombre?`; `movimientoId?`; `conteoDetalle?` (snapshot del conteo en paquetes);
`createdAt`/`updatedAt`. Índices: `createdAt`, `productoId`. Corregible/eliminable con
bitácora como cualquier movimiento.

### 6.3 `RegistroRechazo`

Rechazo de inspección: **documental, no toca stock**. Campos: `id`; `folio` **único**
`RECH-20261103-0001`; `productoId` + snapshots; `clienteId`/`clienteCodigo`/
`clienteNombre?` (destino previsto); `salidaId?`/`salidaFolio?` (salida de origen);
`cantidad String` (texto decimal exacto); `motivo`; `disposicion` (`PENDIENTE` por omisión · `RETRABAJO` ·
`SCRAP` · `LIBERADO`); `notas?`; `responsable?`; `usuarioId?`/`usuarioNombre?`;
`createdAt`/`updatedAt`. Índices: `createdAt`, `productoId`, `clienteId`, `salidaId`.
Editable/eliminable directo (no es ledger).

---

## 7. Módulo Papelera

### `Papelera`

Log inmutable de eliminaciones. Sin FK: debe sobrevivir a todo.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | String | PK, `cuid()` |
| `entidad` | String | `PRODUCTO` · `ALMACEN` · `MODELO` · `NUMERO_PARTE` · `USUARIO` · `CLIENTE` |
| `entidadId` | String | id original (re-vincula al restaurar) |
| `identificador` | String | SKU / código / número / correo — **sobrevive a la purga** |
| `nombre` | String | nombre visible |
| `datos` | String? | JSON con el registro y sus relaciones; **`null` tras la purga** |
| `estado` | String | `EN_PAPELERA` por omisión · `RESTAURADO` · `PURGADO` |
| `usuarioId` / `usuarioNombre` | String? | quién envió a la papelera (referencia suave + snapshot) |
| `eliminadoEn` | DateTime | `now()` por omisión |
| `expiraEn` | DateTime | `eliminadoEn` + 30 días (`DIAS_RESTAURACION`) |
| `restauradoEn` / `restauradoPor` | DateTime? / String? | auditoría de restauración |
| `purgadoEn` / `purgadoPor` | DateTime? / String? | purgadoPor `null` si fue purga automática |

Índices: `[estado, expiraEn]`, `entidad`, `eliminadoEn`.

---

## 8. Comportamientos especiales

### 8.1 Folios monotónicos (series por prefijo + fecha)

- Formato: `<PREFIJO>-<AAAAMMDD>-<NNNN>`. Prefijos de movimiento (definidos en
  `src/modulos/almacen/servicios/nucleo.ts`): `ENT` (ENTRADA), `REC` (RECEPCION), `SAL`
  (SALIDA), `TRA` (TRASLADO), `AJU` (AJUSTE), `SCR` (SCRAP). Agrupadores OQC: `OQC-…`,
  scrap `SCR-…`, rechazos `RECH-…` (ejemplos literales del esquema:
  `OQC-20261103-0001`, `SCR-20261103-0001`, `RECH-20261103-0001`).
- Autoridad única: `SecuenciaFolio` con `clave = prefijo-fecha`. La emisión es un
  incremento atómico dentro de la transacción del movimiento
  (`reservarNumeroSerie`); si la serie no existe, se **siembra con el mayor número
  histórico ya emitido** (registros vivos + bitácora) para respetar bases existentes.
- **El contador jamás retrocede.** Eliminar el registro que portaba un folio NO libera
  su número: en planta, un folio impreso en etiqueta o referenciado en auditoría debe
  identificar un único registro para siempre.
- Motivo completo en [ADR-003](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md).

### 8.2 Papelera de 3 niveles

Aplica a productos, almacenes, modelos, números de parte, usuarios y clientes:

| Nivel | Acción | Efecto | Reversibilidad |
|---|---|---|---|
| **1 — Desactivar** | `PATCH … { "activo": false }` | El registro queda oculto de nuevas operaciones; conserva historial | Total: reactivar |
| **2 — Eliminar** | `DELETE /api/<coleccion>/[id]` | El registro **sale de la BD** y entra a `Papelera` con snapshot completo (`datos` JSON); el DELETE responde `restaurableDuranteDias: 30` | 30 días (cuenta regresiva visible); restaurar re-vincula el historial por `entidadId`; si el identificador único ya está ocupado → `409 IDENTIFICADOR_EN_USO` |
| **3 — Purga** | `DELETE /api/papelera/[id]` (manual) o expiración automática | `datos` → `null`; la fila sobrevive como **bitácora histórica permanente** (`estado: PURGADO`) | Ninguna: definitiva e irrecuperable |

Cada eliminación, restauración y purga queda registrada en la propia `Papelera`
(inmutable). El historial de movimientos de entidades eliminadas se congela (no
editable) y se marca con distintivo «Eliminado» (`clienteExiste=false` y equivalentes).

### 8.3 Snapshots inmutables (ledger autodescriptivo)

Cada `Movimiento`, `SalidaOQC`, `RegistroScrap` y `RegistroRechazo` congela los datos
vivos al momento del registro (SKU, nombre, unidad, códigos/nombres de almacén, código/
nombre de cliente, nombre de usuario, folios de agrupación). Beneficios: (a) la
eliminación de un producto/almacén/cliente no corrompe el histórico; (b) al restaurar
desde la papelera con el mismo id, la re-vinculación es automática; (c) la auditoría
describe el mundo **tal como era**, no tal como es ahora.

### 8.4 Respaldo y restauración en caliente (módulo Respaldo)

- **Respaldo:** instantánea consistente con `VACUUM INTO` (SQL directo sobre el archivo)
  hacia `db/backups/`, sin detener la planta. Registro en `RespaldoBD` con `tipo`
  `MANUAL` · `AUTOMATICO` (diario al abrir el módulo, conserva los últimos 7) ·
  `PRE_RESTAURACION` · `DETECTADO` (copiado a mano a la carpeta) · `SUBIDO`.
- **Restauración en caliente:** una única transacción (`db.$transaction`) borra e
  inserta todas las tablas en orden seguro. Si falla a mitad, SQLite revierte TODO: la
  base queda intacta. Antes de restaurar se valida integridad (`PRAGMA quick_check`) y
  compatibilidad de esquema del archivo.
- **Ventana de reversión de 24 h:** cada restauración exitosa crea un snapshot
  pre-restauración y queda registrada en `RestauracionBD`
  (`estado: COMPLETADA`, `ventanaReversaHasta = completadaEn + 24 h`); revertir es a su
  vez una restauración (`tipo: REVERSION`) con su propia ventana. Los intentos
  interrumpidos se marcan `FALLIDA` al reabrir el módulo.
- `RespaldoBD` y `RestauracionBD` son **registros de la máquina** (describen archivos en
  `db/backups/`) y se excluyen de la copia al restaurar, para que el inventario de
  respaldos siempre coincida con el disco.

---

## 9. Catálogo de permisos (sembrado)

Definidos en `prisma/seed.ts` y `src/modulos/autenticacion/permisos.ts` (fuente dual
sincronizada):

```
almacen.ver · almacen.gestionar · movimientos.crear · movimientos.corregir ·
inventario.ajustar · unidades.gestionar · catalogo.ver · catalogo.gestionar ·
clientes.ver · clientes.gestionar · oqc.ver · oqc.liberar · oqc.gestionar ·
usuarios.gestionar · ajustes.gestionar · respaldo.gestionar · papelera.ver ·
papelera.gestionar
```

Asignación precargada (semilla v1.0.0): `ADMIN` y `TI` = todos; `JEFE_ALMACEN` =
almacén + movimientos + ajustes + unidades + catálogo + clientes (ver/gestionar) +
`oqc.ver`/`oqc.liberar`; `ALMACENERO` = `almacen.ver`, `movimientos.crear`,
`catalogo.ver`, `clientes.ver`, `oqc.ver`, `oqc.liberar`; `OQC` = `almacen.ver`,
`movimientos.crear`, `catalogo.ver`, `clientes.ver`, `oqc.ver`, `oqc.liberar`,
`oqc.gestionar`; `OPERADOR` = `almacen.ver`, `catalogo.ver`.

Los permisos se editan en caliente desde la aplicación (Sistema → Roles y Permisos); la
semilla **no** sobrescribe permisos de roles existentes (ver
[03-GUIA-DESARROLLO-NUEVOS-MODULOS.md](./03-GUIA-DESARROLLO-NUEVOS-MODULOS.md), paso 2).
