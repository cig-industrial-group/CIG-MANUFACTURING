# 06 — Registro de Decisiones Arquitectónicas (ADR)

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 1.1.0 · **Rama:** `main`
> Suite de documentación arquitectónica — Parte 6 de 6.
>
> Formato: cada ADR responde al **«¿por qué?»** de una decisión clave: contexto,
> decisión, alternativas descartadas y consecuencias. Un ADR es histórico: si la
> decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo; nunca se edita
> para maquillar el pasado.

---

## ADR-001 — SQLite sobre PostgreSQL para despliegue autónomo

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

CIG-MANUFACTURING se despliega en **un solo servidor** (frecuentemente una VM sin
equipo de operaciones dedicado) y debe levantar producción en minutos con `deploy.sh`.
El volumen de datos es de planta: miles a cientos de miles de movimientos, no millones
de escrituras por segundo. Las operaciones de inventario son transaccionales y cortas.

### Decisión

Usar **SQLite** accedido mediante **Prisma** (`datasource db { provider = "sqlite" }`
en `prisma/schema.prisma`). La base de datos es un archivo único direccionado por
`DATABASE_URL` con **ruta absoluta** (requisito del modo `standalone`, donde las rutas
relativas no se resuelven correctamente).

### Justificación

1. **Despliegue autónomo y portabilidad**: nada que instalar, versionar, proteger o
   monitorear además de la propia app. Copiar el archivo (mejor: `VACUUM INTO`) es un
   respaldo consistente y transportable; la restauración en caliente del módulo
   Respaldo se apoya en esto.
2. **Costo operativo nulo**: sin credenciales de BD que rotar, sin superficie de
   ataque de un servicio de red adicional, sin firewall interno que configurar —
   coherente con el principio de mínimo privilegio.
3. **Aislamiento systemd limpio**: la unidad `ProtectSystem=strict` +
   `ReadWritePaths=…/db` delimita exactamente qué puede tocar el proceso; con un
   servidor de BD externo esa contención sería imposible desde la unidad de la app.
4. **Suficiencia transaccional**: SQLite garantiza ACID; las operaciones compuestas
   (folio + stock + bitácora) usan `db.$transaction` de Prisma y el
   *todo-o-nada* requerido se cumple (ver `STOCK_INSUFICIENTE` en liberaciones OQC).
5. **Simplicidad de pruebas**: la CI (`scripts/simulacion-ci.sh`) crea una BD efímera
   en un directorio temporal por ejecución.

### Alternativas descartadas

- **PostgreSQL**: robusto y concurrente, pero exige un segundo servicio en producción
  (memoria, parcheo, credenciales, UFW, respaldos propios) que ningún requisito actual
  justifica. Se volvería razonable si el sistema creciera a escrituras concurrentes
  masivas o despliegue multi-servidor.
- **MySQL/MariaDB**: mismo costo operativo que PostgreSQL sin ventaja adicional aquí.

### Consecuencias

- Escrituras serializadas a nivel de archivo: para carga de una sola planta es
  irrelevante; el diseño ya minimiza transacciones largas.
- Administración por archivo: mantenimiento (integridad, respaldo) documentado en
  [05-DESPLIEGUE-Y-OPERACION.md](./05-DESPLIEGUE-Y-OPERACION.md) §4.
- `DATABASE_URL` **debe** ser absoluta en producción (error clásico
  `PrismaClientInitializationError: Unable to open DB file`).

---

## ADR-002 — `ProtectHome=read-only` + `ReadWritePaths` en systemd

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

La especificación original del despliegue pedía `ProtectHome=yes` para la unidad del
servicio. Pero la app vive precisamente bajo `/home`: usuario
`/home/cig-manufacturing`, binario `/home/cig-manufacturing/.bun/bin/bun`, código
`/home/cig-manufacturing/CIG-MANUFACTURING`, `.env` y base de datos incluidos. Además,
se exige que el proceso no pueda reescribir su propio código (compromiso de la app ≠
persistencia).

### Decisión

La unidad `cig-manufacturing.service` que genera `deploy.sh` usa la combinación:

```ini
ProtectSystem=strict          # todo el sistema de archivos: solo lectura
ProtectHome=read-only         # /home legible pero no escribible
ReadWritePaths=/home/cig-manufacturing/CIG-MANUFACTURING/db
ReadWritePaths=/home/cig-manufacturing/CIG-MANUFACTURING/logs
ReadWritePaths=/home/cig-manufacturing/CIG-MANUFACTURING/.next/standalone/.next/cache
CapabilityBoundingSet=        # sin ninguna capacidad
NoNewPrivileges=yes
SystemCallFilter=@system-service
# (bloque completo de endurecimiento en docs/02 §3.2)
```

### Justificación

**Por qué `ProtectHome=yes` rompería el servicio:** `yes` vuelve `/home` **totalmente
inaccesible** para el proceso. El servicio no podría leer ni su binario
(`~/.bun/bin/bun`), ni su código (`.next/standalone/server.js`), ni su `.env`
(EnvironmentFile), ni su base de datos (`db/production.db`): fallaría al arranque y los
criterios de aceptación (servicio activo, app respondiendo, login del admin) serían
imposibles de cumplir.

**Por qué esta combinación logra el objetivo real** (contención sin romper el
servicio):

- `ProtectSystem=strict`: **todo** el sistema de archivos queda en solo lectura para
  el proceso, `/home` incluido.
- `ReadWritePaths` reabre **exactamente** las tres rutas de datos: `db/` (base de
  datos y respaldos), `logs/` y la caché del standalone (necesaria para
  ISR/imágenes de Next.js). Nada más es escribible.
- Resultado: **el proceso no puede modificar su propio código ni su `.env`** (un
  atacante con RCE no persiste cambios), y el resto de la máquina es intocable. Las
  pruebas de aceptación (`sudo -u cig-manufacturing touch …/prueba` → denegado) lo
  verifican.
- El `ExecStart` apunta directo a `bun .next/standalone/server.js` y **no** a
  `bun run start`: el script `start` de `package.json` canaliza salida por `tee
  server.log` dentro del directorio de la app, que con `ProtectSystem=strict` no
  puede escribir (y permitirlo sería permitir reemplazar el código). Los logs van a
  `logs/stdout.log`/`stderr.log` vía `StandardOutput/Error=append:` de systemd.

### Alternativas descartadas

- **`ProtectHome=yes`**: rompe el arranque (arriba).
- **Mover la app a `/opt` o `/srv`**: equivalente funcional, pero exige reprocesar
  rutas de la especificación (`/home/cig-manufacturing`), del instalador y de los
  criterios de aceptación sin ganar contención real frente a esta combinación.
- **`ProtectHome=no`**: perdería el congelamiento de `/home` para el proceso.

### Consecuencias

- Toda escritura de la app fuera de `db/`, `logs/` y la caché fallará con `EROFS`/
  `EPERM`: los módulos deben escribir solo ahí (los respaldos ya van a `db/backups/`).
- La unidad la genera `deploy.sh`; editarla a mano se pierde en la siguiente
  re-ejecución (by design).
- La unidad `caddy.service` **sí** usa `ProtectHome=yes` (Caddy no vive en `/home`) con
  la única capacidad `CAP_NET_BIND_SERVICE` para el 443.

---

## ADR-003 — Folios monotónicos y bitácoras inmutables para auditoría forense

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

En un entorno de fábrica, los folios de movimientos y salidas se **imprimen** (etiquetas,
remisiones, referencias cruzadas en papel) y se citan en auditorías. Reutilizar un folio
— aunque sea tras eliminar el registro que lo portaba — rompe la trazabilidad y puede
hacer parecer que un registro histórico "nunca existió". Por su parte, editar un
movimiento *in place* destruiría la evidencia del error original: exactamente lo que una
auditoría necesita ver.

### Decisión

1. **Series de folios monotónicas** (`SecuenciaFolio`): una fila por serie
   `prefijo-fecha` (p. ej. `SAL-20261103`); `ultimo` es el último número emitido y **el
   contador jamás retrocede**. La emisión es un incremento atómico dentro de la
   transacción del movimiento (`reservarNumeroSerie` en
   `src/modulos/almacen/servicios/nucleo.ts`). La primera emisión de una serie se
   siembra con el mayor número histórico ya emitido (registros vivos **+ bitácora**),
   para que bases de datos existentes conserven su histórico sin reutilizar números.
2. **Ledger inmutable**: `Movimiento` nunca se actualiza ni se borra. Corregir o
   eliminar crea una fila en `CorreccionMovimiento` con `accion` (`EDICION` /
   `ELIMINACION`), el estado `antes` (JSON), el estado `despues` (JSON, `null` en
   eliminaciones), el `motivo` capturado y el usuario (`usuarioId` + snapshot de
   nombre).
3. **Autodescripción**: cada movimiento congela snapshots del producto, almacenes,
   cliente y usuario (`productoSku`, `clienteNombre`, `salidaFolio`…), con referencias
   suaves sin FK, de modo que el histórico sobrevive a la eliminación de cualquier
   entidad y se re-vincula solo si la entidad se restaura desde la papelera con el
   mismo id.
4. **Eliminación en niveles** (Papelera): desactivar / papelera 30 días con snapshot /
   purga irreversible que conserva la fila como bitácora (estado `PURGADO`, `datos`
   null). Ver [04-REFERENCIA-BASE-DATOS.md](./04-REFERENCIA-BASE-DATOS.md) §8.2.

### Alternativas descartadas

- **Folio = máx(id)+1 o contar filas**: recicla números al eliminar registros y
  condiciona la numeración a un conteo vivo (además de condiciones de carrera).
- **UUID como identificador público**: único pero ilegible e imprimible con dificultad;
  el consecutivo por fecha (`SAL-20261103-0004`) es operativo en piso de planta y sigue
  siendo garantizado único por la serie monotónica.
- **Editar movimientos in place con columna `actualizadoPor`**: pierde el estado
  anterior; la auditoría forense requiere el **antes y el después**, no solo el
  último estado.

### Consecuencias

- Eliminar un movimiento **no** libera su folio: puede existir un hueco en la
  numeración viva; el número sigue atribuible vía bitácora. Es el comportamiento
  correcto, no un defecto.
- Costo de almacenamiento: cada corrección duplica el registro en JSON (`antes` /
  `despues`). Aceptable: es el precio de la evidencia.
- Los registros de entidades eliminadas quedan congelados (no editables) y marcados
  con distintivo «Eliminado» en la UI (`clienteExiste=false` y equivalentes).
- Regla de desarrollo derivada: jamás `UPDATE`/`DELETE` sobre `Movimiento`,
  `CorreccionMovimiento`, `Papelera` ni `RestauracionBD` fuera de sus servicios.

---

## ADR-004 — Guarda de autenticación por ruta (`requerirPermiso`) en lugar de `middleware.ts`

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

Next.js App Router ofrece `middleware.ts` para interceptar peticiones antes de las
rutas. La autenticación del sistema es una cookie JWT (`cig_manufacturing_sesion`)
cuya validez depende de que el usuario siga **activo en base de datos**, y la
autorización es por permiso granular declarado en el rol.

### Decisión

No usar `middleware.ts`. La autenticación/autorización es una **guarda explícita** al
inicio de cada manejador de ruta:

```ts
const guardia = await requerirPermiso(request, "clientes.ver");
if (guardia instanceof NextResponse) return guardia; // 401 / 403
const { usuario } = guardia;                          // usuario verificado
```

(`src/modulos/autenticacion/servicios/auth.ts`). Las rutas públicas son la excepción
explícita (`/api/auth/login`, `/api/auth/banderas`, y registro/recuperación si están
habilitados por configuración).

### Justificación

1. **Nada se filtra por coincidencia de patrón**: cada endpoint declara su permiso en
   su propia fuente; una ruta nueva sin guarda es visible en revisión de código (y
   viola la checklist del doc 03), mientras que en un middleware por prefijos una ruta
   fuera del patrón quedaría abierta sin llamar la atención.
2. **Verificación real contra la BD en cada petición**: la guarda recarga el usuario y
   su rol (`obtenerSesion`); desactivar un usuario revoca sus sesiones al instante.
3. **Permisos como dato del rol, no como código**: el permiso exigido es una cadena
   gestionable desde la aplicación (Roles y Permisos), sin redesplegar reglas de
   middleware.
4. **Auditoría simple**: el mapa ruta → permiso (docs/02 §4) se verifica leyendo la
   primera línea de cada `route.ts`.

### Alternativas descartadas

- **`middleware.ts` con matcher de `/api/*`**: redirige/rechaza por patrón, pero el
  modelo de permisos granulares terminaría duplicándose en dos lugares; además el
  middleware corre en un entorno donde consultar Prisma por petición es más frágil.
- **Bearer tokens en cabecera**: la cookie `httpOnly` evita exposición del token a JS
  del cliente (XSS); es deliberada (ADR implícito de sesión).

### Consecuencias

- Disciplina obligatoria: **toda** ruta nueva empieza con la guarda (checklist del
  doc 03, paso 3 y §7).
- El coste por petición es una verificación JWT + un `findUnique` con rol incluido;
  amortiguado por Prisma y aceptable para la carga objetivo.

---

## ADR-005 — Referencias suaves + snapshots en los registros de auditoría (sin FK hacia entidades de negocio)

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

Los movimientos y registros de calidad refieren productos, almacenes, clientes y
usuarios. Si esas entidades se eliminan (papelera → purga), un FK duro con
`onDelete: Cascade` borraría la historia — inaceptable para un sistema de auditoría
(ADR-003) — y con `SetNull`/`Restrict` complicaría la eliminación legítima.

### Decisión

Los registros tipo ledger (`Movimiento`, `CorreccionMovimiento`, `SalidaOQC`,
`RegistroScrap`, `RegistroRechazo`, `Papelera`, `RestauracionBD`) guardan
**referencias suaves** (`productoId`, `clienteId`, `usuarioId`, `salidaId`… como
`String` sin `@relation`) junto con **snapshots** de los datos vivos al momento del
registro (`productoSku`, `clienteNombre`, `usuarioNombre`, `salidaFolio`…). Las FK
duras quedan reservadas a relaciones estructurales (`Usuario→Rol`,
`Stock→Producto/Almacen`, `ModeloParte→…`, `Restablecimiento→Usuario`).

### Justificación

1. La historia sobrevive intacta a la eliminación de cualquier entidad referenciada, y
   se **re-vincula sola** si la entidad se restaura desde la papelera con el mismo id.
2. El snapshot describe el mundo *como era al registrarse* (razón social de entonces,
   unidad de entonces), que es lo que la auditoría forense exige.
3. La eliminación de entidades sigue siendo operativa (papelera) sin bloqueos de
   integridad referencial.

### Consecuencias

- Los listados deben complementar la referencia suave con el snapshot para mostrar
  datos fiables (patrón `clienteExiste` en el historial).
- No hay `onDelete` que proteja la consistencia: es responsabilidad de los servicios
  (transacciones) mantener coherencia entre ledger y estado vivo.
- Un módulo nuevo que participe en movimientos debe adoptar este patrón (doc 03, regla
  previa 7).

---

## Índice de decisiones

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](#adr-001--sqlite-sobre-postgresql-para-despliegue-autónomo) | SQLite sobre PostgreSQL para despliegue autónomo | Aceptado |
| [ADR-002](#adr-002--protecthomeread-only--readwritepaths-en-systemd) | `ProtectHome=read-only` + `ReadWritePaths` en systemd | Aceptado |
| [ADR-003](#adr-003--folios-monotónicos-y-bitácoras-inmutables-para-auditoría-forense) | Folios monotónicos y bitácoras inmutables para auditoría forense | Aceptado |
| [ADR-004](#adr-004--guarda-de-autenticación-por-ruta-requerirpermiso-en-lugar-de-middlewarets) | Guarda de autenticación por ruta en lugar de `middleware.ts` | Aceptado |
| [ADR-005](#adr-005--referencias-suaves--snapshots-en-los-registros-de-auditoría-sin-fk-hacia-entidades-de-negocio) | Referencias suaves + snapshots en los registros de auditoría | Aceptado |
