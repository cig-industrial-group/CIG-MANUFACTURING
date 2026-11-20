> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

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
