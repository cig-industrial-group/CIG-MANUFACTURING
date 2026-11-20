> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

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
