# 06 — Registro de Decisiones Arquitectónicas (ADR)

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 2.0.0 · **Rama:** `main`
> Suite de documentación arquitectónica — Parte 6 de 6.
>
> Formato: cada ADR responde al **«¿por qué?»** de una decisión clave: contexto,
> decisión, alternativas descartadas y consecuencias. Un ADR es histórico: si la
> decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo; nunca se edita
> para maquillar el pasado.

---

## ADR-001 — SQLite sobre PostgreSQL para despliegue autónomo

**Estado:** Reemplazado por [ADR-009](#adr-009--migración-del-motor-de-base-de-datos-a-postgresql-16) · **Fecha:** v1.0.0 · **Retirado en:** v2.0.0

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

> **Nota (v2.0.0):** esta decisión quedó **reemplazada por ADR-009** (migración del
> motor a PostgreSQL 16). El texto se conserva íntegro como registro histórico del
> razonamiento original y de las condiciones que motivaron el motor embebido.

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

## ADR-006 — Reintentos con retroceso exponencial para errores transitorios de la capa de datos

**Estado:** Aceptado · **Fecha:** v1.4.0 (Fase 3)

### Contexto

Las Fases 1–2 endurecieron la capa de datos (Decimal exacto; pool de 1 conexión,
WAL y `busy_timeout=5000`). Queda un hueco: un proceso EXTERNO que mantenga un
cerrojo de escritura por MÁS de 5 s (mantenimiento con `sqlite3` CLI, respaldo en
frío, despliegue) hace que la operación en curso falle con `SQLITE_BUSY` aunque el
cerrojo se libere un instante después. En WAL también existe `SQLITE_BUSY_SNAPSHOT`:
una transacción que leyó bajo una instantánea no puede ascender a escritura si otro
proceso escribió entremedio; la transacción está condenada y debe re-empezarse.

### Decisión

Envolver las escrituras compuestas en `src/lib/reintentos.ts`:

1. **`transaccion(fn, opciones?)`** — reemplaza a `db.$transaction(fn)` en TODOS los
   call sites (24 en 8 archivos: almacén, OQC, papelería, respaldo, catálogo y
   confirmación de restablecimiento). Ante un error transitorio, el CALLBACK SE
   RE-EJECUTA COMPLETO sobre una transacción nueva: el rollback del intento fallido
   garantiza que la re-ejecución parte del estado original.
2. **`conReintentos(operacion)`** — reintento genérico con retroceso exponencial
   (200 ms base, techo 1 500 ms) y *jitter* completo; 3 intentos por defecto.
3. **`esErrorTransitorio(error)`** — clasificación precisa: SOLO `SQLITE_BUSY` (5),
   `SQLITE_LOCKED` (6), `SQLITE_BUSY_SNAPSHOT` (517), Prisma `P2034` (conflicto de
   escritura), `P2024` (timeout del pool: la operación nunca empezó, re-ejecutar es
   seguro) y `P1008` (socket timeout: forma REAL y dominante en que el driver
   superficie el `SQLITE_BUSY` agotado — verificado empíricamente: cerrojo externo
   de 8 s → P1008 a los ~5 s en query simple y en transacción interactiva; el
   reintento posterior sale bien en cuanto el cerrojo se libera). Todo lo demás
   falla en el primer intento, incluido `P2028` (la transacción excedió su propio
   timeout de trabajo: no es un cerrojo y re-ejecutarla triplica el coste).

### Justificación

- **Complementa, no sustituye**, a la Fase 2: `busy_timeout` absorbe bloqueos ≤ 5 s
  DENTRO del motor; el envoltorio absorbe los más largos (y los no esperables)
  re-ejecutando. Con pool=1 no hay contienda interna que reintentar: el blanco son
  los procesos externos.
- **Idempotencia estructural**: re-ejecutar una transacción que terminó en rollback
  es repetir el mismo trabajo sobre el mismo estado inicial. Los callbacks actuales
  solo tocan la base de datos (requisito documentado como contrato de `transaccion`).
- **Fallo rápido conservado**: los errores de negocio (`ErrorNegocio`), de integridad
  (P2002/P2003) y de validación jamás se reintentan; el envoltorio no puede
  convertir un error real en un duplicado.
- **Techo acotado**: peor caso ≈ busy_timeout + retrocesos por intento; la petición
  HTTP nunca queda reintentando indefinidamente.

### Alternativas descartadas

- **Extensión de cliente (`db.$extends` con hook `query`)**: reintenta queries
  INDIVIDUALES, incluidas las de dentro de una transacción viva — exactamente el
  anti-patrón en BUSY_SNAPSHOT — y cambia el tipo del cliente en toda la app.
- **Reintentos ilimitados / sin jitter**: una petición colgada para siempre y
  sincronización de reintentos si algún día hay varias instancias.
- **Subir `busy_timeout` a 30–60 s**: degrada el tiempo de respuesta percibido
  (todas las peticiones esperan en silencio) y no resuelve BUSY_SNAPSHOT.

### Consecuencias

- La forma de arreglo de `db.$transaction([...])` dejó de usarse: sus promesas ya
  creadas no pueden re-ejecutarse; el único call site (confirmación de
  restablecimiento) se convirtió a forma de callback, semánticamente idéntica.
- Nuevos módulos DEBEN usar `transaccion()` (doc 03 actualizado en consecuencia).
- Los avisos `[bd] error transitorio en intento n/N` en `logs/stdout.log` son
  operativamente informativos: indican contención externa, no fallos del sistema.

> **Actualización (v2.0.0, migración a PostgreSQL):** el diseño se conserva íntegro
> (envoltorio `transaccion()`, retroceso exponencial con *jitter*, clasificación
> precisa de transitorios), pero `esErrorTransitorio` pasó de los códigos del motor
> embebido (`SQLITE_BUSY`/`SQLITE_LOCKED`/`SQLITE_BUSY_SNAPSHOT`) a los **SQLSTATE
> de PostgreSQL** (`40001` *serialization failure*, `40P01` *deadlock detected*,
> `57P03*` *cannot connect now*, `53300` *too many connections*), conservando los
> códigos de Prisma `P2034`/`P2024`. El contexto original (WAL, `busy_timeout`,
> pool=1) desapareció con el motor embebido: ver ADR-009.

---

## ADR-007 — Endurecimiento de la cookie de sesión: `SameSite=Strict`, `Secure` condicional y expiración de 24 h

**Estado:** Aceptado · **Fecha:** v1.5.0 (Fase 4)

### Contexto

La autenticación vive en una única cookie (`cig_manufacturing_sesion`) que
transporta un JWT HS256 (`jose`) y se emite/elimina desde dos funciones
centralizadas de `src/modulos/autenticacion/servicios/auth.ts`
(`conCookieSesion`/`sinCookieSesion`), invocadas por tres rutas que crean
sesión (`login`, `registro`, `recuperacion/confirmar`) y una que la cierra
(`logout`). No existe `middleware.ts` (ADR-004) ni ninguna otra cookie de
sesión en el sistema (la única otra cookie es `sidebar_state`, de estado de
UI emitida por el componente shadcn, sin valor de seguridad).

Auditoría empírica del estado previo: `HttpOnly` ✓, `Path=/` ✓ y `Secure`
condicional ✓ (`NODE_ENV=production` Y `COOKIE_INSEGURA_HTTP !== "1"`) ya se
cumplían; quedaban dos huecos — `SameSite=Lax` (la cookie SÍ viajaba en
navegación cruzada de primer nivel) y una expiración de **7 días** sin token
de refresco (ventana de exposición de una cookie expropiada excesiva).

### Decisión

1. **`SameSite=Strict`** en emisión Y eliminación de la cookie. La cookie no
   se envía en ninguna petición iniciada desde otro sitio: neutraliza el
   CSRF en origen sin depender de tokens anti-CSRF adicionales.
2. **`Secure` condicional intacto** (`cookieSegura()`): `true` solo con
   `NODE_ENV=production` Y `COOKIE_INSEGURA_HTTP !== "1"`. El escape para LAN
   sin TLS queda documentado y avisa por consola en cada arranque; nunca es
   silencioso.
3. **Expiración de 24 h** (`DURACION_SESION_SEG = 60 * 60 * 24`), aplicada a
   la vez al `exp` del JWT y al `maxAge` de la cookie: caducan juntos. No se
   introduce token de refresco: cada petición autenticada ya recarga el
   usuario desde la BD (`obtenerSesion`), de modo que desactivar/eliminar el
   usuario revoca la sesión al instante — la expiración es el límite de la
   ventana de exposición de una cookie expropiada, no el mecanismo de
   revocación.

### Justificación

- **`Strict` vs `Lax`**: `Lax` permite que un enlace externo (correo, chat,
  ERP ajeno) llegue YA autenticado a la app; `Strict` exige que la primera
   petición sea misma-sitio. Para una aplicación interna de manufactura a la
  que se entra tecleando la URL (no siguiendo enlaces de terceros), el coste
  de UX es marginal y la superficie CSRF queda cerrada en el propio atributo
  (defensa en el navegador, no en código de aplicación).
- **24 h vs 7 días**: reduce la ventana de una cookie robada de 168 h a 24 h
  (−85,7 %). El coste (re-autenticación diaria) es aceptable en una fábrica
  con turnos: el login es rápido y está protegido contra fuerza bruta
  (5 fallos/IP+cuenta y 20/IP en 15 min, con `Retry-After`).
- **Sin token de refresco**: añadirlo duplicaría la superficie (rotación,
  revocación del refresh, almacenamiento) para ganar solo comodidad. La
  recarga por BD en cada petición ya ofrece la revocación inmediata que un
  refresh token suele aportar.
- **Atributos en la eliminación**: `sinCookieSesion` usa los mismos atributos
  que la emisión — el borrado no depende de diferencias de atributos para
  emparejar la cookie, y la política queda declarada en un solo lugar por
  función.

### Alternativas descartadas

- **Tokens anti-CSRF sincronizados**: exigirían tocar cada formulario y cada
  ruta API; `SameSite=Strict` logra la protección CSRF en el atributo de la
  cookie, sin estado adicional.
- **`SameSite=None; Secure`**: sería necesario solo para casos cruzados
  (SSO de terceros, iframes); la app no tiene ninguno.
- **Sesión deslizante (renovar `exp` en cada petición)**: alarga
  indefinidamente la vida de una cookie expropiada mientras el atacante la
  use; contradice el objetivo del endurecimiento.
- **Token de refresco de 7 días**: ver Justificación — superficie nueva sin
  beneficio de seguridad real en esta arquitectura.

### Consecuencias

- Los usuarios deben iniciar sesión una vez al día (o tras 24 h de emisión
  de la cookie). Las sesiones activas al desplegar el cambio caducan antes:
  el `exp` de los tokens de 7 días ya emitidos sigue siendo válido hasta su
  vencimiento, pero la cookie se re-emite con `maxAge` de 24 h en el
  siguiente login.
- La navegación desde un enlace externo llega como NO autenticada (el
  usuario ve el login y entra); dentro del sitio todo funciona igual.
- Las verificaciones E2E (Python/urllib con cookie jar) no se ven afectadas:
  `urllib` no aplica la política SameSite, que es del navegador.
- `scripts/prueba-humo-fase4.ts` verifica empíricamente la matriz completa
  de atributos tras un login real (producción con/sin `COOKIE_INSEGURA_HTTP`,
  desarrollo, logout) y la coherencia `exp − iat = 86400`.

---

## ADR-008 — Auditoría de cadena de suministro en el build de la imagen: `bun audit --audit-level=high`

**Estado:** Aceptado · **Fecha:** v1.6.0 (Fase 5)

### Contexto

La imagen Docker de producción compila con las dependencias de
`bun.lock`, pero nada verificaba su integridad frente a avisos de
seguridad publicados: una vulnerabilidad crítica en una dependencia
(transitiva o directa) llegaría a producción sin ninguna barrera.

Verificación empírica previa (bun 1.3.14, el fijado en el Dockerfile):

- `bun audit` **existe** y consulta los advisories en tiempo real; con el
  árbol heredado reportaba **98 vulnerabilidades (4 críticas, 56 altas)**,
  incluida una **crítica en el propio `next` 16.1.3** (corregida a partir
  de 16.4.1).
- `bun audit` **no tiene bandera `--severity`**: su umbral nativo es
  `--audit-level=<low|moderate|high|critical>` (misma semántica que
  `npm audit --audit-level`).
- El comando **sale con código 1** cuando existen avisos ≥ el umbral y con
  **0** cuando el árbol está limpio (verificado en ambos sentidos).

### Decisión

1. **Etapa de auditoría en el Dockerfile**, situada inmediatamente después
   de `bun install --frozen-lockfile` y antes de copiar el código y
   compilar:

   ```dockerfile
   RUN bun audit --audit-level=high
   ```

   El build de la imagen **se detiene** (código de salida 1) si hay
   vulnerabilidades de severidad Alta o Crítica en el árbol que está a
   punto de compilar. La capa se cachea junto a la de dependencias: solo
   se re-audita cuando cambian `package.json` o `bun.lock`.

2. **Se usa `bun audit`, no `npm audit`**: `npm audit` tampoco tiene
   `--severity` (su bandera es igualmente `--audit-level`) y exigiría un
   `package-lock.json` que este proyecto no tiene (usa `bun.lock`);
   generarlo duplicaría la gestión de dependencias y desincronizaría el
   lockfile del runtime real.

3. **Dependencias actualizadas para que el umbral pase** (de lo contrario
   la nueva etapa habría dejado la imagen incompilable desde el primer
   día): `bun update` dentro de rangos semver (`next` 16.1.3 → 16.4.5,
   `zod` → 4.6.7, `react-dom` → 19.3.1, …), `sharp` subida explícita de
   rango (`^0.34.3` → `^0.35.5`, corrección de 3 avisos high en
   libvips/libheif/librsvg), **regeneración completa de `bun.lock`** para
   purgar resoluciones transitivas obsoletas anidadas, y un
   **`overrides` de `deepmerge-ts` a `8.0.2`** porque `@prisma/config`
   6.19.3 (última 6.x; Prisma 7 exige migrar a `prisma.config.ts`, fuera
   de alcance) fija exactamente la 7.1.5, vulnerable (GHSA-ggr8-5vv4-36mx).
   Resultado: **0 críticas, 0 altas** (antes: 4 y 56).

4. **1 moderate aceptado y documentado**: `minimatch` ≥7 <11.0.1
   (GHSA-g3hv-m249, DoS por amplificación de glob) en la cadena de
   `devDependencies` de ESLint/TypeScript-ESTree. Corregirlo exige un
   override a la 11.x (mayor, con cambio de API de minimatch) sobre la
   herramienta de lint; el umbral de la etapa de auditoría es High/Crítica
   y este aviso está por debajo. Se reevaluará cuando typescript-eslint
   publique el salto.

### Justificación

- **Puerta en el lugar correcto**: auditar justo después de instalar (con
  el lockfile congelado que usará el build) y antes de compilar falla
  rápido y sin coste adicional de caché; auditar después de compilar
  desperdiciaría el trabajo.
- **Umbral High/Crítica**: son las severidades con explotación realista
  (RCE, ejecución en build, exposición de datos). Bajarlo a moderate/low
  en una cadena de herramientas de desarrollo (ESLint, Babel) genera
  ruido que entrena al equipo a ignorar la puerta.
- **El exit code es la barrera**: no hace falta parsear la salida; el
  contrato del comando (0 limpio / 1 con avisos ≥ umbral) es la interfaz
  estable que Docker traduce en fallo de build. `scripts/prueba-humo-fase5.ts`
  verifica ambos sentidos de ese contrato.
- **`sharp` como dependencia directa**: la subida de rango fue deliberada
  (no hay forma compatible de llegar a 0.35.x desde `^0.34.3`, que en
  versiones 0.x no cruza el menor); sharp también la consume `next` para
  optimización de imágenes en runtime.

### Alternativas descartadas

- **`npm audit` como alternativa**: sin `--severity` tampoco, requiere
  `package-lock.json` (el proyecto usa `bun.lock`) y duplicaría lockfiles.
- **`bun audit --json` + script que parsea severidades**: re-implementa
  la semántica que `--audit-level` ya da de forma nativa y estable.
- **Umbral `critical` solamente**: dejaría pasar las 56 high (Next incl.)
  que esta fase precisamente vino a cerrar.
- **`bun update --latest`**: actualiza con cambios de rotura fuera de los
  rangos declarados; el arreglo debía ser mínimo y verificable.
- **Migrar a Prisma 7** para resolver el pin de `deepmerge-ts`: migración
  de configuración (`prisma.config.ts`) fuera del alcance y riesgo de la
  fase; el override es quirúrgico y validado por CI.

### Consecuencias

- Un aviso High/Crítica nuevo publicado contra cualquier dependencia
  **bloquea el siguiente build de la imagen** hasta actualizar: es el
  comportamiento buscado (la puerta es un compromiso visible, no una
  sugerencia).
- `bun.lock` quedó regenerado: los cambios de dependencias viajan en el
  DIFF de la fase y todo el sistema se revalidó (CI: build, tipos, BD
  efímera, semilla, servidor real, login y rate-limit).
- **Corrección en v1.1.1 (transparencia):** la actualización de rangos
  también subió `eslint-config-next` a 16.4.5, cuyo
  `eslint-plugin-react-hooks` 7.1.1 convierte
  `react-hooks/set-state-in-effect` en error; `carousel.tsx` y
  `use-mobile.ts` (componentes shadcn sin tocar por las fases) la
  incumplían. La simulación de CI local NO lo detectó: sus pasos de
  calidad usaban el patrón `cmd && echo "✔"`, que en bash **no aborta**
  (errexit no aplica dentro de listas `&&`), así que el paso de lint
  fallaba en silencio y la simulación terminaba "en orden". Corregido:
  `use-mobile.ts` migrado a `useSyncExternalStore` (patrón canónico),
  `carousel.tsx` a lectura inicial diferida por `requestAnimationFrame`
  con baja simétrica de eventos, y `scripts/simulacion-ci.sh` endurecido
  con `|| fallo` en los pasos 3–7 (cada paso es ahora una puerta real).
  El workflow real de GitHub Actions nunca tuvo el defecto: sus pasos
  `run:` sí abortan con código de salida distinto de cero.
- El `overrides` de `deepmerge-ts` debe retirarse cuando Prisma publique
  una 6.x/7.x que dependa de la 8.x o superior.
- Docker no está disponible en el entorno de desarrollo de esta fase: la
  cadena del Dockerfile se validó ejecutando sus mismos pasos
  (`bun install --frozen-lockfile` → `bun audit --audit-level=high` →
  `bunx prisma generate && bun run build`) y el orden de las etapas lo
  verifica `scripts/prueba-humo-fase5.ts`. En v1.1.1 la cadena completa
  se reejecutó desde `node_modules` borrado (instalación limpia de 618
  paquetes con lockfile congelado) más CI endurecido 9/9 y las cinco
  pruebas de humo de fase.

---

## ADR-009 — Migración del motor de base de datos a PostgreSQL 16

**Estado:** Aceptado · **Fecha:** v2.0.0 · **Reemplaza a:** [ADR-001](#adr-001--sqlite-sobre-postgresql-para-despliegue-autónomo)

### Contexto

La operación del sistema creció hacia exigencias que el motor embebido (ADR-001) no
cubre de forma nativa: clasificación de errores transitorios por códigos estándar
(SQLSTATE) en lugar de heurísticas propias, herramienta industrial de
respaldo/restauración (`pg_dump`/`pg_restore`), concurrencia real de accesos y
trazabilidad auditables de los cambios de esquema. La migración se ejecutó como
proyecto formal con validación de datos de extremo a extremo (gestión de cambio
documentada y verificada: NIST SP 800-53 CM-3, ISO/IEC 27001 A.12.1.2/A.8.6).

### Decisión

Adoptar **PostgreSQL 16+** como único motor soportado (`datasource db { provider =
"postgresql" }` en `prisma/schema.prisma`), con:

1. **Esquema por migraciones auditables**: `prisma migrate deploy` con línea base
   única registrada en `_prisma_migrations` (fin de `prisma db push` sin historial).
2. **Respaldo/restauración industrial**: `pg_dump --format=custom` (volcados `.dump`
   comprimidos), validación previa con `pg_restore --list`, restauración en caliente
   con base transitoria de verificación y transacción única. `PGPASSWORD` viaja solo
   en el objeto `env` de `execFile` (invisible en `ps aux`) y toda herramienta `pg_*`
   se invoca con `--no-password` (fail-fast, sin credenciales en `argv`).
3. **Reintentos por SQLSTATE** (`40001`, `40P01`, `57P03`, `53300`): evolución del
   diseño de ADR-006.
4. **`DATA_DIR` explícito** (12-Factor): respaldos, branding y credenciales dejan de
   inferirse desde `DATABASE_URL`.
5. **Decimal como String/TEXT conservado** (nota ADR en `prisma/schema.prisma`): el
   contrato de exactitud decimal del dominio (Fase 1, `numerico.ts`) es independiente
   del motor.
6. **Operación**: `deploy.sh` instala PostgreSQL 16 de forma idempotente (PGDG) y la
   unidad systemd declara `After/Wants=postgresql.service`; Docker usa
   `postgres:16-alpine` con `healthcheck` (`pg_isready`).

### Justificación

1. **Errores estándar**: SQLSTATE clasifica los transitorios de forma nativa y
   auditable, sin acoplamiento a códigos numéricos de un motor específico.
2. **Respaldo industrial**: los volcados custom son comprimidos, verificables
   (`pg_restore --list`) y restaurables en caliente; la restauración se verifica en
   una base transitoria antes de tocar la base viva.
3. **Concurrencia real**: múltiples conexiones sin cerrojo de escritura por archivo;
   el pool lo administra Prisma de forma nativa.
4. **Trazabilidad**: `_prisma_migrations` registra qué migraciones aplicó cada
   entorno y cuándo.
5. **Cero pérdida de datos**: la migración desde v1.1.1 es transaccional y verificada
   por conteos (`scripts/migrar-sqlite-a-postgres.ts`); folios monotónicos, papelera
   y snapshots del histórico se conservan íntegros (validado por
   `scripts/prueba-humo-postgres.ts`).

### Consecuencias

- **PostgreSQL 16+ pasa a ser requisito obligatorio de despliegue** — breaking
  change que justifica la versión MAYOR 2.0.0 (SemVer 2.0.0 §7–§8).
- Las instalaciones v1.1.1 actualizan mediante `scripts/migrar-sqlite-a-postgres.ts`
  (guía en `README-DEPLOY.md` §8).
- El costo operativo que ADR-001 buscaba evitar se absorbe con `deploy.sh`
  (aprovisionamiento idempotente) y Docker (`postgres:16-alpine` + healthcheck).
- ADR-001 queda **Reemplazado**; su análisis de contexto se conserva como historial.
- Nuevas variables de entorno obligatorias: `DATABASE_URL` (esquema
  `postgresql://`) y `DATA_DIR`; `POSTGRES_PASSWORD` en despliegues Docker.

---

## Índice de decisiones

| ADR | Título | Estado |
|---|---|---|
| [ADR-001](#adr-001--sqlite-sobre-postgresql-para-despliegue-autónomo) | SQLite sobre PostgreSQL para despliegue autónomo | Reemplazado por ADR-009 |
| [ADR-002](#adr-002--protecthomeread-only--readwritepaths-en-systemd) | `ProtectHome=read-only` + `ReadWritePaths` en systemd | Aceptado |
| [ADR-003](#adr-003--folios-monotónicos-y-bitácoras-inmutables-para-auditoría-forense) | Folios monotónicos y bitácoras inmutables para auditoría forense | Aceptado |
| [ADR-004](#adr-004--guarda-de-autenticación-por-ruta-requerirpermiso-en-lugar-de-middlewarets) | Guarda de autenticación por ruta en lugar de `middleware.ts` | Aceptado |
| [ADR-005](#adr-005--referencias-suaves--snapshots-en-los-registros-de-auditoría-sin-fk-hacia-entidades-de-negocio) | Referencias suaves + snapshots en los registros de auditoría | Aceptado |
| [ADR-006](#adr-006--reintentos-con-retroceso-exponencial-para-errores-transitorios-de-la-capa-de-datos) | Reintentos con retroceso exponencial para errores transitorios | Aceptado |
| [ADR-007](#adr-007--endurecimiento-de-la-cookie-de-sesión-samesitestrict-secure-condicional-y-expiración-de-24-h) | Endurecimiento de la cookie de sesión: `SameSite=Strict`, `Secure` condicional y expiración de 24 h | Aceptado |
| [ADR-008](#adr-008--auditoría-de-cadena-de-suministro-en-el-build-de-la-imagen-bun-audit---audit-levelhigh) | Auditoría de cadena de suministro en el build de la imagen: `bun audit --audit-level=high` | Aceptado |
| [ADR-009](#adr-009--migración-del-motor-de-base-de-datos-a-postgresql-16) | Migración del motor de base de datos a PostgreSQL 16 | Aceptado |
