# CIG-MANUFACTURING — Guía de Despliegue Automatizado (`deploy.sh`)

Instalador de producción para **Ubuntu 22.04 LTS** con aislamiento de seguridad
extremo: transforma un servidor virgen en un entorno de producción seguro y
operativo en menos de 5 minutos (más el tiempo de `apt upgrade` y, con dominio,
el de compilar Caddy con Go).

> **Motor de datos obligatorio: PostgreSQL 16.** El instalador lo aprovisiona de forma
> idempotente desde el repositorio oficial PGDG (paso 6), junto con el cliente que
> exige el módulo de Respaldo (`postgresql-client-16`: `pg_dump`/`pg_restore`/`psql`)
> y la dependencia de servicio `After/Wants=postgresql.service` (paso 11). Variables
> de entorno obligatorias: `DATABASE_URL` de PostgreSQL, `DATA_DIR` y `AUTH_SECRET`
> (generadas por el paso 9; ver [`.env.example`](./.env.example)); en el despliegue
> Docker se añade `POSTGRES_PASSWORD` (ver `docker-compose.yml` y
> [docs/05 §6](./docs/05-DESPLIEGUE-Y-OPERACION.md)). Si actualizas desde la v1.1.1,
> sigue la [guía de migración §8](#8-migración-de-una-instalación-desde-v111-sqlite).

---

## Tabla de contenidos

1. [Requisitos previos](#1-requisitos-previos)
2. [Cómo obtener el API Token de Cloudflare](#2-cómo-obtener-el-api-token-de-cloudflare)
3. [Uso del script](#3-uso-del-script)
4. [Qué hace el script, paso a paso](#4-qué-hace-el-script-paso-a-paso)
5. [Verificación post-instalación (criterios de aceptación)](#5-verificación-post-instalación-criterios-de-aceptación)
6. [Decisiones técnicas y desviaciones documentadas](#6-decisiones-técnicas-y-desviaciones-documentadas)
7. [Re-ejecución, actualizaciones e idempotencia](#7-re-ejecución-actualizaciones-e-idempotencia)
8. [Migración de una instalación desde v1.1.1 (SQLite)](#8-migración-de-una-instalación-desde-v111-sqlite)
9. [Operación: logs, respaldos y mantenimiento](#9-operación-logs-respaldos-y-mantenimiento)
10. [Solución de problemas](#10-solución-de-problemas)
11. [Limitaciones y supuestos](#11-limitaciones-y-supuestos)

---

## 1. Requisitos previos

| Requisito | Detalle |
|---|---|
| Sistema | Ubuntu **22.04 LTS** recién instalado (en VM o cloud). Se admiten otras versiones de Ubuntu/Debian sin garantía (el script avisa). |
| Acceso | Sesión `root` o `sudo` (el script verifica ser root). |
| Recursos | 2 vCPU, **2 GB de RAM mínimo** (el build de Next.js puede fallar con menos) y ~5 GB de disco (más si se usa dominio: Go+Caddy temporales). |
| Red | Salida a Internet (apt, bun.sh, prisma, nextjs.org). El puerto **80 NO es necesario** (el reto TLS es DNS-01). |
| Código | El repositorio ya clonado en el servidor, p. ej. `git clone … && cd CIG-MANUFACTURING`. **El script se ejecuta desde la raíz del repositorio** y copia ese código a `/home/cig-manufacturing/CIG-MANUFACTURING`. |
| Puerto SSH | Si el SSH no está en el 22, indícalo antes de activar UFW: `sudo SSH_PORT=2222 ./deploy.sh` (evita quedarte fuera). |
| Con dominio | Registro **A/AAAA** del dominio apuntando a la IP pública del servidor **antes** de desplegar, y un API Token de Cloudflare (siguiente sección). |

## 2. Cómo obtener el API Token de Cloudflare

El token se usa para el reto **DNS-01** de Let's Encrypt: Caddy crea un
registro TXT ` _acme-challenge.<dominio>` para demostrar propiedad y obtener el
certificado **sin abrir el puerto 80**. Renovación automática cada ~60 días.

1. Inicia sesión en <https://dash.cloudflare.com/profile/api-tokens>.
2. **Create Token → Edit zone DNS (Use template)**.
3. En *Permissions*: `Zone · DNS · Edit`.
4. En *Zone Resources*: `Include · Specific zone · <tu-dominio>` (o `All zones`
   si vas a desplegar varios entornos).
5. *(Opcional, recomendado)* En *Client IP Address Filtering* limita a la IP
   del servidor.
6. **Continue to summary → Create Token** y copia el token (solo se muestra una vez).

> El token se solicita de forma **oculta** (sin eco), no se imprime en ningún
> log, no se escribe en el Caddyfile y vive únicamente en
> `/etc/caddy/caddy.env` (permisos `600`, solo root). Bórralo o revócalo en
> Cloudflare si sospechas compromiso.

## 3. Uso del script

```bash
git clone https://github.com/cig-industrial-group/CIG-MANUFACTURING.git
cd CIG-MANUFACTURING

chmod +x deploy.sh
sudo ./deploy.sh
```

El script pregunta de forma interactiva (con validación en cada campo):

| Pregunta | Validación |
|---|---|
| ¿Usar dominio con SSL? (s/N) | Por defecto **N** (modo local HTTP :3000). |
| Nombre de dominio | FQDN válido (rechaza IPs; p. ej. `preprod.cig.com`). |
| Correo del administrador | Formato email — se usa en los registros de Let's Encrypt. |
| API Token de Cloudflare | No vacío, sin espacios (secreto oculto). |
| Contraseña del usuario admin inicial | **Mín. 12 caracteres**, con al menos una letra y un número. Sin espacios ni `"` `` ` `` `$` `\` (romperían los parsers de `.env`). Se pide dos veces y no se muestra. |

**Modo no interactivo** (re-ejecuciones automatizadas): exporta las variables
y el script las usa sin preguntar (se validan igual):

```bash
sudo USE_DOMAIN=s \
     DOMAIN=preprod.cig.com \
     ADMIN_EMAIL=admin@cig.com \
     CF_API_TOKEN=xxxxx \
     INITIAL_ADMIN_PASSWORD='ClaveSegura2026!' \
     ./deploy.sh
```

## 4. Qué hace el script, paso a paso

1. **Pre-condiciones**: root, ejecutado desde la raíz del repositorio,
   `prisma/seed.ts` compatible con `INITIAL_ADMIN_PASSWORD` (si no lo es,
   **falla** con instrucciones claras).
2. **Endurecimiento del S.O.**: `apt update && apt upgrade -y` + instalación de
   `curl git ufw build-essential` (y `rsync openssl gnupg ca-certificates`,
   necesarios para el propio flujo).
3. **Firewall UFW**: `default deny incoming`, `default allow outgoing`,
   `allow 22/tcp` (o `$SSH_PORT`), `allow 443/tcp` (con dominio) o
   `allow 3000/tcp` (local). `ufw --force enable`.
4. **Usuario de servicio confinado**: `cig-manufacturing` con home
   `/home/cig-manufacturing`, shell `/bin/bash`, **sin sudo ni ningún grupo
   privilegiado** (el script lo verifica y aborta si está en `sudo`/`docker`).
5. **Bun**: instalado en `/home/cig-manufacturing/.bun` con el instalador
   oficial de bun.sh, como usuario de servicio.
6. **PostgreSQL 16 (PGDG)**: instalación idempotente desde el repositorio
   oficial (keyring firmado con `[signed-by=]`, sin apt-key deprecado) de
   `postgresql-16` **+ `postgresql-client-16`** (pg_dump/pg_restore/psql que
   exige el módulo de Respaldo; cliente ≥ servidor). El servicio queda
   habilitado y aceptando conexiones **solo en 127.0.0.1:5432** (el puerto
   jamás se publica en UFW). Después se aprovisionan el rol de aplicación
   (`LOGIN` + `CREATEDB`, requerido por la restauración en caliente) y su
   base de datos, de forma idempotente, con la contraseña viajando por
   stdin (nunca en `argv` ni en consola).
7. **Caddy**:
   - Con dominio: se instala Go (toolchain oficial) + `xcaddy` y se **compila
     Caddy con el plugin `github.com/caddy-dns/cloudflare`**. Al terminar se
     eliminan Go y las cachés de compilación (menor superficie de ataque).
   - Local: binario estándar del repositorio apt oficial de Caddy.
   - En ambos casos queda una unidad systemd endurecida propia.
7. **Código**: `rsync -a --delete` del directorio actual a
   `/home/cig-manufacturing/CIG-MANUFACTURING`, excluyendo `.git`,
   `node_modules`, `.next`, `download`, `upload` **y el estado de producción**
   (`db/`, `logs/`, `.env`, respaldos). Propiedad recursiva
   `cig-manufacturing:cig-manufacturing`.
9. **Entorno `.env`** (solo si no existe; en re-ejecuciones se conserva y se
   valida su `AUTH_SECRET` **y que su `DATABASE_URL` sea de PostgreSQL** —
   una instalación previa del motor de archivo debe migrar primero, ver §8):
   `NODE_ENV`, `AUTH_SECRET` (generado con `openssl rand -base64 48`),
   `DATABASE_URL` de PostgreSQL con contraseña aleatoria de 192 bits,
   `DATA_DIR` (respaldos/branding/credenciales), `INITIAL_ADMIN_PASSWORD`,
   `NEXTAUTH_URL` (dominio) o `COOKIE_INSEGURA_HTTP=1` (local). Permisos `600`.
10. **Compilación** (como usuario de servicio, con entorno limpio `env -i`):
   `bun install --frozen-lockfile` → `bunx prisma generate` → `mkdir db logs`
   → `bunx prisma migrate deploy` (**esquema por migraciones auditables**,
   registradas en `_prisma_migrations`) → `bunx prisma db seed` →
   `bun run build` → `mkdir .next/standalone/.next/cache`.
11. **systemd**: escribe `cig-manufacturing.service` (aislamiento extremo, ver
    §6; **depende del motor de BD**: `After/Wants=postgresql.service`) y
    `caddy.service`, el `Caddyfile` con todas las cabeceras de seguridad
    y la rotación de logs; valida el Caddyfile (`caddy validate`) y habilita +
    reinicia ambos servicios.
12. **Verificación**: comprueba `postgresql` activo y `pg_isready` contra la
    base de la app, espera a que la app responda en `127.0.0.1:<puerto>/api`,
    comprueba los servicios activos y (con dominio) el HTTPS y la cabecera
    `Strict-Transport-Security`.
13. **Resumen final** con dominio/URL, usuarios, contraseña del admin, estado
    de los tres servicios (app, postgresql, caddy) y advertencia de cambio de
    contraseña obligatorio.

## 5. Verificación post-instalación (criterios de aceptación)

| # | Criterio | Comando | Resultado esperado |
|---|---|---|---|
| 1 | Script ejecutable | `ls -l deploy.sh` | `-rwxr-xr-x` |
| 2 | Usuario sin privilegios | `id cig-manufacturing` y `groups cig-manufacturing` | UID válido; grupos: **solo** `cig-manufacturing` |
| 3 | Propiedad del directorio | `ls -ld /home/cig-manufacturing/CIG-MANUFACTURING` | `cig-manufacturing cig-manufacturing` |
| 4 | `.env` restringido | `ls -l /home/cig-manufacturing/CIG-MANUFACTURING/.env` | `-rw-------` |
| 5 | Servicio activo y escuchando | `systemctl is-active cig-manufacturing` y `ss -tlnp \| grep 3000` | `active` y socket LISTEN (app en `127.0.0.1:3000`; con dominio el público es Caddy en 443; en local Caddy escucha `0.0.0.0:3000`) |
| 6 | Caddy activo con HTTPS (dominio) | `systemctl is-active caddy` y `curl -I https://<DOMAIN>` | `active` y `HTTP/2 200` |
| 7 | Cabeceras de seguridad | `curl -sI https://<DOMAIN> \| grep -i strict-transport` | `strict-transport-security: max-age=63072000; includeSubDomains; preload` |
| 8 | La app responde | `curl http://127.0.0.1:3000` (dominio) o `curl http://<IP>:3000` (local) | HTML de la página de acceso |
| 9 | Login del admin | Navegador con `admin@cig-manufacturing.com` + contraseña ingresada | Acceso exitoso + cambio forzado de contraseña |
| 10 | Aislamiento | `sudo su - cig-manufacturing` y dentro `sudo ls /` | `sudo` rechazado (no está en sudoers) |

Comprobaciones adicionales de aislamiento (opcionales):

```bash
# El proceso no ve el sistema de archivos como escribible fuera de lo permitido:
sudo -u cig-manufacturing touch /home/cig-manufacturing/CIG-MANUFACTURING/prueba  # → Permiso denegado
sudo -u cig-manufacturing touch /tmp/prueba_sistema                                # → Permiso denegado (PrivateTmp aparte)
# El usuario de servicio no puede escalar privilegios:
sudo -u cig-manufacturing sudo id                                                  # → rechazado
```

## 6. Decisiones técnicas y desviaciones documentadas

La especificación se siguió en su totalidad; estas son las decisiones
justificadas donde había incompatibilidades técnicas o mejoras de seguridad:

1. **`ProtectHome=read-only` en el servicio de la app (la especificación pedía `yes`).**
   Con la app viviendo en `/home/cig-manufacturing`, `ProtectHome=yes` vuelve
   `/home` **totalmente inaccesible**: el servicio no podría leer ni su binario
   (`~/.bun/bin/bun`), ni su código, ni su `.env`, ni su base de datos —
   fallaría al arranque y los criterios 5/8/9 serían imposibles. `read-only`
   junto con `ProtectSystem=strict` + `ReadWritePaths` logra el objetivo real
   de contención: **el proceso solo puede escribir en `db/`, `logs/` y la
   caché del standalone**; todo su propio código es inmutable para él y el
   resto del sistema de archivos es de solo lectura. Se añadieron además
   `PrivateDevices`, `ProtectKernelLogs`, `ProtectKernelModules`, `ProtectClock`,
   `ProtectHostname`, `ProtectProc=invisible`, `RestrictRealtime`,
   `SystemCallArchitectures=native`, `RemoveIPC` y `CapabilityBoundingSet=` (vacío).
2. **`ExecStart` directo a `bun .next/standalone/server.js`** en lugar de
   `bun run start`. El script `start` de `package.json` canaliza la salida por
   `tee server.log` dentro del directorio de la app: con `ProtectSystem=strict`
   ese `tee` no puede escribir (el directorio es de solo lectura) y, además,
   permitir escribir en la raíz de la app permitiría que un atacante
   reemplazara el propio código. Los logs del servicio ya van a
   `logs/stdout.log` y `logs/stderr.log` vía systemd (`StandardOutput/Error=append:`).
3. **Puerto interno de la app en modo local = 3001** (con dominio = 3000, como
   especifica la sección 2.9). En modo local la especificación pedía Caddy en
   `:3000` y la app en `127.0.0.1:3000`, pero dos sockets no pueden convivir
   en el mismo puerto (`EADDRINUSE`, verificado en pruebas): Caddy publica
   `:3000` y hace proxy a `127.0.0.1:3001`. Comportamiento observable
   idéntico: `ss -tlnp | grep 3000` muestra LISTEN en 0.0.0.0:3000 (Caddy) y
   `curl http://127.0.0.1:3000` entrega la app.
4. **La app escucha en `127.0.0.1` (HOSTNAME) y Caddy posee la interfaz pública.**
   El servidor standalone de Next.js usa `HOSTNAME`/`PORT` como dirección de
   escucha (confirmado en `start.sh` del propio proyecto y en pruebas E2E).
   Así la app jamás queda expuesta directamente a la red.
5. **Token de Cloudflare en `/etc/caddy/caddy.env` (600, root) y referenciado
   como `{$CLOUDFLARE_API_TOKEN}` en el Caddyfile**, en lugar de incrustarlo en
   el Caddyfile (que es legible por más usuarios). systemd lo inyecta al
   proceso. El reto DNS-01 funciona igual y el secreto queda mejor protegido.
6. **`package.json`**: se añadió el bloque `"prisma": { "seed": "bun prisma/seed.ts" }`
   para que `bunx prisma db seed` (mandatario en la especificación) funcione;
   antes ese comando fallaba porque no había semilla configurada.
7. **`prisma/seed.ts`**: ahora lee `process.env.INITIAL_ADMIN_PASSWORD` (con
   `ADMIN_PASSWORD` como alias retrocompatible). `deploy.sh` verifica esta
   compatibilidad antes de empezar y falla con mensaje claro si no existe
   (requisito 3.4 de la especificación).
8. **Entorno limpio (`env -i`) para los comandos de compilación/semilla**:
   evita que variables del entorno de root (`DATABASE_URL`, `AUTH_SECRET`,
   `NODE_ENV`…) pisen el `.env` de la aplicación, ya que las variables de
   entorno tienen prioridad sobre los archivos `.env`.
9. **`COOKIE_INSEGURA_HTTP=1` automático en modo local**: en producción la
   cookie de sesión se marca `Secure`; sin TLS el navegador jamás la enviaría
   y **el login sería imposible** (criterio 9). La propia app lo avisa en el
   arranque. Con dominio no se define.
10. **`NEXTAUTH_URL`** se escribe en el `.env` con dominio por exigencia de la
    especificación; la aplicación (autenticación JWT propia con `jose`) hoy no
    la consume — se mantiene por cumplimiento y compatibilidad futura.
11. **Rotación de logs** (`/etc/logrotate.d/cig-manufacturing`, semanal, 8
    rotaciones, `copytruncate` para no cortar los descriptores de systemd).
12. **HSTS solo en modo dominio**: la cabecera no tiene efecto sobre HTTP
    plano; en modo local se envían el resto de cabeceras de seguridad.

## 7. Re-ejecución, actualizaciones e idempotencia

`deploy.sh` puede ejecutarse todas las veces que haga falta:

- No duplica el usuario de servicio ni vuelve a compilar Caddy si ya tiene el
  plugin de Cloudflare.
- `rsync` mantiene el código espejo del repositorio **sin tocar** `db/`, `logs/`,
  `.env` ni respaldos (`--delete` con exclusiones protectoras).
- Un `.env` existente **nunca se sobrescribe** (los secretos se conservan);
  solo se valida su `AUTH_SECRET` y se re-establecen permisos `600`.
- `prisma migrate deploy` aplica las migraciones pendientes (idempotente y
  auditable); la semilla solo crea el admin si la base está vacía.
  **Tus datos y usuarios sobreviven.**
- El rol y la base de PostgreSQL se reaprovisionan sin destruir datos
  (DO block idempotente + verificación de existencia de la base).
- Los servicios se regeneran (unidad + Caddyfile) y se reinician.

**Desplegar una nueva versión del código**:

```bash
cd /ruta/al/repositorio/clonado
git pull origin main
sudo ./deploy.sh        # recompila y reinicia; conserva datos
```

## 8. Migración de una instalación desde v1.1.1 (SQLite)

Si actualizas desde la **v1.1.1** — cuyo motor era SQLite embebido (un
`production.db`) —, la migración de DATOS es un paso explícito y auditable: nunca
se hace en silencio ni se fusiona:

```bash
# 1) Despliega normalmente (crea PostgreSQL, el rol y la base, aplica
#    migraciones y siembra la configuración inicial):
sudo ./deploy.sh

# 2) Copia el archivo .db de tu instalación anterior al servidor (legible
#    por el usuario de servicio) y migra con el bun del propio usuario:
sudo runuser -u cig-manufacturing -- \
  /home/cig-manufacturing/.bun/bin/bun \
  /home/cig-manufacturing/CIG-MANUFACTURING/scripts/migrar-sqlite-a-postgres.ts \
  /ruta/a/production.db
```

En entornos de desarrollo/evaluación (con PostgreSQL 16 local ya aprovisionado por
`setup.sh`), el comando directo equivalente es:

```bash
bun run scripts/migrar-sqlite-a-postgres.ts /ruta/a/production.db
```

El script:

- Copia las 21 tablas **dentro de una única transacción** (o entra todo, o no
  entra nada) y en orden topológico (FKs respetadas).
- Convierte los tipos por campo según el esquema (booleanos 0/1, fechas ISO,
  enteros) y conserva **los decimales como texto exacto** y las series de
  folios (`SecuenciaFolio`): los folios nuevos continúan la serie histórica.
- **Verifica conteos por tabla al final** (cero discrepancias o aborta).
- Se **niega** a correr si la base ya tiene datos (fail-fast anti-fusión);
  `--reemplazar` la vacía explícitamente si necesitas reintentar en pruebas.
- Te recuerda copiar los respaldos `.dump` antiguos a `DATA_DIR/backups` si
  quieres que sigan siendo restaurables.

## 9. Operación: logs, respaldos y mantenimiento

```bash
systemctl status cig-manufacturing          # estado del servicio
journalctl -u cig-manufacturing -f          # log systemd en vivo
tail -f /home/cig-manufacturing/CIG-MANUFACTURING/logs/stderr.log   # errores de la app
journalctl -u caddy -f                      # accesos y certificados TLS

ls -l /home/cig-manufacturing/CIG-MANUFACTURING/db/backups/         # respaldos del módulo Respaldo
systemctl list-timers | grep -i logrotate  # rotación de logs activa
```

- **Certificados**: Caddy los gestiona y renueva solo (DNS-01). Vigila
  `journalctl -u caddy | grep -i certificate`.
- **Cambiar la contraseña del admin**: el sistema la exige en el primer inicio
  de sesión (`debeCambiarPassword=true`).
- **Forzar recompilación de Caddy** (p. ej. tras cambiar de modo local a
  dominio en la misma máquina): `sudo rm /usr/local/bin/caddy && sudo ./deploy.sh`.

### Acceso a Logs de Recuperación

El sistema no usa SMTP: cuando un usuario solicita un código de
recuperación (flujo habilitado en Ajustes), el código de 6 dígitos se
entrega por un **canal fuera de banda** — el log auditado del servidor —
y un operador lo comunica de forma **manual/verbal** al usuario. La
respuesta HTTP nunca contiene el código (anti-enumeración, OWASP ASVS
6.3.1).

```bash
# Código recién emitido (systemd + deploy.sh; también en journalctl):
grep '\[AUDIT_SENSITIVE\]' /home/cig-manufacturing/CIG-MANUFACTURING/logs/stdout.log | tail

# En vivo, mientras atiendes la solicitud del usuario:
tail -f /home/cig-manufacturing/CIG-MANUFACTURING/logs/stdout.log | grep --line-buffered AUDIT_SENSITIVE
```

- Cada línea etiquetada **`[AUDIT_SENSITIVE]`** contiene el código en
  claro (`codigo=NNNNNN`) y el correo de la cuenta: es material tan
  sensible como una contraseña temporal. El acceso a `logs/` ya está
  restringido al usuario de servicio; mantén el resto de rutas de
  acceso (respaldos de logs, terminal compartida, capturas) igual de
  restringido.
- **El operador debe enmascarar o descartar el código** en cuanto lo
  haya leído para entregarlo verbalmente: nunca lo copie a tickets,
  chats, correo o capturas de pantalla, y cierre la sesión de terminal
  donde lo mostró.
- **El SIEM / recolector de logs centralizado debe filtrar o enmascarar**
  las líneas `[AUDIT_SENSITIVE]` antes de almacenarlas a largo plazo.
  Regla de enmascaramiento sugerida (regex):
  `\[AUDIT_SENSITIVE\] codigo=\d{6}` → `[AUDIT_SENSITIVE] codigo=******`.
  Si el SIEM no enmascara, excluya la línea completa del almacenamiento
  persistente y conserve solo el evento (correo + marca de tiempo).
- Mitigación ante exposición: los códigos expiran a los **15 minutos**,
  son de un solo uso y **cada nueva solicitud invalida los anteriores**.
  Si un código queda expuesto, pide a la cuenta afectada que solicite
  uno nuevo (el anterior queda inservible) o espera la expiración.

### Confianza del proxy y límites por IP (`PROXY_DE_CONFIANZA`)

Los límites anti-fuerza bruta usan como clave principal la **cuenta**
(`login:cta:{correo}`), no la IP: rotar direcciones no evade el bloqueo.
La IP solo alimenta el límite secundario de volumen (`login:ip:{ip}`,
20 fallos/15 min) y, desde TASK-STR-006, se lee en modo **fail-closed**:
la cabecera `X-Forwarded-For` se ignora salvo que se declare
`PROXY_DE_CONFIANZA=1` en `.env`.

- El despliegue oficial (Caddy como proxy inverso que **sobrescribe**
  `X-Forwarded-For` con la IP real del cliente) debe fijar
  `PROXY_DE_CONFIANZA=1`; de lo contrario todas las peticiones cuentan
  como `local`, el límite secundario agrupa a todos los clientes y
  bloqueos legítimos pueden ocurrir si el volumen de fallos compartido
  supera 20/15 min. Es un **requisito operativo** del despliegue tras
  proxy, documentado también en `.env.example`.
- NUNCA fijes `PROXY_DE_CONFIANZA=1` si la app es alcanzable directamente
  (sin proxy) o el proxy reenvía la cabecera sin sobrescribirla: un
  atacante podría fabricar IPs para inflar el mapa de limitación o
  incriminar a terceros en el límite secundario.

## 10. Solución de problemas

| Síntoma | Causa probable / solución |
|---|---|
| `✖ Este script debe ejecutarse como root` | Usa `sudo ./deploy.sh`. |
| `✖ No se encontró package.json/prisma/seed.ts` | Ejecuta desde la raíz del repositorio clonado. |
| `✖ prisma/seed.ts no lee INITIAL_ADMIN_PASSWORD` | Tu copia del repositorio es anterior a este cambio; haz `git pull` o aplica la modificación documentada en §6.7. |
| El servicio queda `failed` / en bucle | `journalctl -u cig-manufacturing -n 50` y `tail -50 …/logs/stderr.log`. Causa típica: `AUTH_SECRET` inválido o `.env` con `HOSTNAME`/`PORT` heredados que rompen el bind (elimina esas líneas). |
| `bun install` falla tras un proxy corporativo | El script compila con entorno limpio; configura el proxy en `/etc/apt/apt.conf.d/95proxy` para apt y reinstala Bun manualmente: `sudo -u cig-manufacturing bash -c 'export HTTPS_PROXY=…; curl -fsSL https://bun.sh/install \| bash'`. |
| HTTPS no responde tras el despliegue (dominio) | 1) ¿El registro A del dominio apunta a esta IP? 2) ¿El token tiene `Zone·DNS·Edit` sobre esa zona? Ver `journalctl -u caddy -n 50`. El primer certificado puede tardar 1-3 min. |
| `caddy validate` falla con token vacío | Revisa `/etc/caddy/caddy.env` (debe existir en modo dominio y contener `CLOUDFLARE_API_TOKEN=…`). |
| No puedes entrar tras desplegar en local | Es HTTP sin TLS: la cookie necesita `COOKIE_INSEGURA_HTTP=1` — el `.env` generado en modo local ya la incluye; si desplegaste antes con otro `.env`, agrégala y reinicia el servicio. |
| El build se queda sin memoria | El servidor necesita ≥2 GB RAM; añade swap temporal (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`). |
| `SystemCallFilter` bloquea algo inesperado | El filtro `@system-service` es el exigido por la especificación. Diagnostica con `sudo systemd-analyze syscall-filter @system-service` y revisa `journalctl` buscando `EPERM`. |

## 11. Limitaciones y supuestos

- El script asume que **el repositorio ya está clonado** en el directorio
  actual del servidor (no clona por sí mismo).
- Asume SSH en el puerto 22 salvo que se exporte `SSH_PORT`.
- `apt upgrade -y` puede reiniciar servicios del sistema; ejecútalo en ventana
  de mantenimiento la primera vez.
- Con dominio, la compilación de Caddy con Go añade ~3-6 minutos y ~1.5 GB
  temporales al despliegue (se limpian al final). El objetivo de «<5 min» se
  cumple en modo local y, con dominio, en el primer despliegue depende del
  hardware.
- El script no configura: SMTP (la app no lo requiere), backups externos
  (el módulo Respaldo de la app gestiona `db/backups/`), ni monitorización.
- Un solo dominio por servidor (el flujo está diseñado para un despliegue por
  máquina). Para varios entornos, usa varias máquinas/VMs.
- Las pruebas de systemd/UFW/Caddy se documentaron para Ubuntu 22.04 LTS tal
  como pide la especificación; la lógica bash, la semilla, el build standalone
  y los artefactos generados se validaron de forma automatizada (ver §6).

---

*Contacto: Emmanuel Caballero De La Rosa — caballeroemanuel966@gmail.com ·
Repositorio: https://github.com/cig-industrial-group/CIG-MANUFACTURING*
