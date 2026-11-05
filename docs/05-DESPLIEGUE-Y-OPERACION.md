# 05 — Despliegue y Operación

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 1.1.0 · **Rama:** `main`
> Suite de documentación arquitectónica — Parte 5 de 6.
>
> Este documento consolida y actualiza `README-DEPLOY.md` (que mantiene vigencia como
> guía detallada del instalador) y **reemplaza** al deprecado `DESPLIEGUE.md`. Para
> instalaciones locales de desarrollo/evaluación con `setup.sh`/`start.sh`, ver §6.

---

## 1. Rutas y artefactos de una instalación de producción

`deploy.sh` instala y opera sobre estas rutas (constantes del script):

| Ruta | Contenido |
|---|---|
| `/home/cig-manufacturing` | Home del usuario de servicio **cig-manufacturing** (sin sudo, sin grupos privilegiados) |
| `/home/cig-manufacturing/CIG-MANUFACTURING` | Código de la aplicación (`APP_DIR`); propiedad recursiva del usuario de servicio |
| `/home/cig-manufacturing/.bun/bin/bun` | Runtime Bun del usuario de servicio |
| `…/CIG-MANUFACTURING/db/production.db` | Base de datos SQLite (`DATABASE_URL`) |
| `…/CIG-MANUFACTURING/db/backups/` | Respaldos del módulo Respaldo (incluye los automáticos, últimos 7) |
| `…/CIG-MANUFACTURING/logs/stdout.log` · `stderr.log` | Logs del servicio (systemd `append:`) |
| `…/CIG-MANUFACTURING/.env` | Entorno (600, propietario del servicio): `NODE_ENV`, `AUTH_SECRET`, `DATABASE_URL`, `INITIAL_ADMIN_PASSWORD` y `NEXTAUTH_URL` (dominio) o `COOKIE_INSEGURA_HTTP=1` (local) |
| `/etc/systemd/system/cig-manufacturing.service` | Servicio de la app (lo genera `deploy.sh`; NO editar a mano: se regenera) |
| `/etc/systemd/system/caddy.service` | Proxy inverso endurecido |
| `/etc/caddy/Caddyfile` | Configuración del proxy (640, root:caddy) |
| `/etc/caddy/caddy.env` | Token de Cloudflare (600, root; solo modo dominio) |
| `/etc/logrotate.d/cig-manufacturing` | Rotación de logs (semanal, 8 rotaciones, compress+delaycompress, copytruncate) |

---

## 2. Despliegue con `deploy.sh`

### 2.1 Requisitos previos

| Requisito | Detalle |
|---|---|
| Sistema | Ubuntu **22.04 LTS** recién instalado (otras versiones avisan, sin garantía) |
| Acceso | Sesión `root` o `sudo` (el script verifica ser root) |
| Recursos | 2 vCPU, **2 GB de RAM mínimo** (el build de Next.js falla con menos), ~5 GB de disco (más con dominio: Go + Caddy temporales) |
| Red | Salida a Internet (apt, bun.sh, prisma, nextjs.org). El puerto **80 no es necesario**: el reto TLS es DNS-01 |
| Código | Repositorio clonado en el servidor (p. ej. `/root/CIG-MANUFACTURING`); el script se ejecuta **desde la raíz del repositorio** y sincroniza a `/home/cig-manufacturing/CIG-MANUFACTURING` |
| SSH | Puerto 22 por omisión; si difiere, exportar `SSH_PORT` **antes** de que el script active UFW |
| Con dominio | Registro **A/AAAA** del dominio apuntando a la IP pública **antes** de desplegar + API Token de Cloudflare con `Zone · DNS · Edit` |

### 2.2 Token de Cloudflare (solo modo dominio)

El token alimenta el reto **DNS-01** de Let's Encrypt: Caddy crea un registro TXT
`_acme-challenge.<dominio>` para demostrar propiedad y emitir el certificado **sin
abrir el puerto 80**; renovación automática cada ~60 días. Obtención:
<https://dash.cloudflare.com/profile/api-tokens> → **Create Token → Edit zone DNS (Use
template)** → Permissions `Zone · DNS · Edit` → Zone Resources `Include · Specific zone
· <tu-dominio>` → (recomendado) limitar por IP del servidor → Create Token. El token se
solicita **oculto**, no se imprime en logs, no se escribe en el Caddyfile y vive solo en
`/etc/caddy/caddy.env` (600, root), inyectado al proceso como `{$CLOUDFLARE_API_TOKEN}`.

### 2.3 Ejecución interactiva

```bash
git clone https://github.com/cig-industrial-group/CIG-MANUFACTURING.git
cd CIG-MANUFACTURING
chmod +x deploy.sh
sudo ./deploy.sh
```

Preguntas validadas una a una:

| Pregunta | Validación |
|---|---|
| ¿Usar dominio con SSL? (s/N) | Por defecto **N** (modo local HTTP :3000) |
| Nombre de dominio | FQDN válido (rechaza IPs; p. ej. `preprod.cig.com`) |
| Correo del administrador | Formato email (registros Let's Encrypt) |
| API Token de Cloudflare | No vacío, sin espacios/comillas (secreto oculto) |
| Contraseña del admin inicial | **Mín. 12 caracteres**, al menos una letra y un número; sin espacios ni `"` `` ` `` `$` `\` (romperían los parsers de `.env`); se pide dos veces sin eco |

### 2.4 Modo no interactivo (re-ejecuciones automatizadas)

```bash
sudo USE_DOMAIN=s \
     DOMAIN=preprod.cig.com \
     ADMIN_EMAIL=admin@cig.com \
     CF_API_TOKEN=xxxxx \
     INITIAL_ADMIN_PASSWORD='ClaveSegura2026!' \
     ./deploy.sh
```

Todas las variables se validan igual que en modo interactivo. `SSH_PORT=2222` evita
quedarse fuera si el SSH no está en el 22.

### 2.5 Los dos modos de despliegue

| | **Modo local** | **Modo dominio** |
|---|---|---|
| URL final | `http://<IP>:3000` | `https://<dominio>` |
| TLS | Ninguno (HTTP plano) | Let's Encrypt vía **Cloudflare DNS-01** (sin puerto 80) |
| Caddy | Binario del repositorio apt oficial | **Compilado con xcaddy + Go** con el plugin `github.com/caddy-dns/cloudflare` (Go y cachés se eliminan al terminar) |
| Puertos | Caddy publica `:3000` → proxy a la app en `127.0.0.1:3001` | Caddy publica `:443` → proxy a la app en `127.0.0.1:3000` |
| UFW | SSH + `3000/tcp` | SSH + `443/tcp` |
| `.env` extra | `COOKIE_INSEGURA_HTTP=1` (sin ella, la cookie `Secure` haría imposible el login) | `NEXTAUTH_URL="https://<dominio>"` |
| Cabeceras | Seguridad estándar (X-Frame-Options DENY, nosniff, CSP…) | Las mismas **+ HSTS** `max-age=63072000; includeSubDomains; preload` |

En ambos modos la app escucha **solo en `127.0.0.1`**; la interfaz pública siempre
pertenece a Caddy. El puerto interno de la app (3000/3001) se elige por modo porque dos
sockets no pueden convivir en el mismo puerto (`EADDRINUSE`).

### 2.6 Qué hace el script, en orden

1. **Precondiciones**: root, raíz del repositorio, `prisma/seed.ts` compatible con
   `INITIAL_ADMIN_PASSWORD` (si no, falla con instrucciones), origen ≠ destino,
   `SSH_PORT` válido.
2. **Endurecimiento del S.O.**: `apt update && apt upgrade -y`; instala `curl git ufw
   build-essential rsync openssl gnupg ca-certificates`.
3. **Firewall UFW**: denegar entrantes por defecto, permitir salientes, SSH
   (`$SSH_PORT`) y 443 (dominio) o 3000 (local); `ufw --force enable`.
4. **Usuario de servicio** `cig-manufacturing`: home `/home/cig-manufacturing`, shell
   `/bin/bash`, sin sudo ni grupos privilegiados (aborta si está en `sudo`/`docker`/
   `wheel`/`admin`).
5. **Bun** instalado en `/home/cig-manufacturing/.bun` con el instalador oficial, como
   usuario de servicio.
6. **Caddy** (según modo, ver §2.5) + usuario `caddy` + `/var/lib/caddy` (750).
7. **Código**: `rsync -a --delete` del repositorio a `APP_DIR`, excluyendo `.git`,
   `node_modules`, `.next`, `download`, `upload` **y el estado de producción** (`db/`,
   `logs/`, `.env`, respaldos, logs sueltos, `credenciales-iniciales.txt`); propiedad
   recursiva del servicio; `APP_DIR` con permisos 750.
8. **`.env`**: solo si no existe (re-ejecuciones: se conserva y se valida su
   `AUTH_SECRET`); `AUTH_SECRET` generado con `openssl rand -base64 48`;
   `DATABASE_URL` absoluta; permisos 600.
9. **Compilación** como usuario de servicio con entorno limpio (`env -i`, para que
   variables de root no pisen el `.env`): `bun install --frozen-lockfile` →
   `bunx prisma generate` → `mkdir db logs` (umask 077) → `bunx prisma db push
   --skip-generate` → `bunx prisma db seed` → `NEXT_TELEMETRY_DISABLED=1 bun run
   build` → `mkdir .next/standalone/.next/cache`.
10. **systemd + Caddy**: escribe `cig-manufacturing.service` (aislamiento extremo, ver
    [02-ARQUITECTURA-DEL-SISTEMA.md](./02-ARQUITECTURA-DEL-SISTEMA.md) §3.2),
    `caddy.service`, el `Caddyfile` con cabeceras de seguridad, la rotación de logs;
    valida el Caddyfile (`caddy validate`) y habilita + reinicia ambos servicios.
11. **Verificación**: espera a que la app responda en `127.0.0.1:<puerto>/api`
    (hasta 90 s), comprueba ambos servicios `active` y (con dominio) HTTPS + cabecera
    `Strict-Transport-Security` (el primer certificado DNS-01 puede tardar 1-3 min).
12. **Resumen final** con URL, usuarios, estado de servicios y la advertencia de cambio
    de contraseña obligatorio.

**Idempotencia:** puede re-ejecutarse sin riesgo: no duplica el usuario, no regenera
secretos existentes, no toca `db/`, `logs/`, `.env` ni respaldos, no recompila Caddy si
ya tiene el plugin, `prisma db push` sincroniza esquema y la semilla solo crea el admin
si la base está vacía. **Los datos y usuarios sobreviven.**

### 2.7 Desplegar una nueva versión del código

```bash
cd /ruta/al/repositorio/clonado
git pull origin main
sudo ./deploy.sh        # recompila y reinicia; conserva datos
```

Si la versión añade **permisos nuevos** para bases existentes, ejecuta además la
migración puntual correspondiente como usuario de servicio, p. ej.:

```bash
sudo -u cig-manufacturing bash -c 'cd /home/cig-manufacturing/CIG-MANUFACTURING && \
  /home/cig-manufacturing/.bun/bin/bun scripts/permiso-<modulo>.ts'
```

(Los scripts existentes en `main`: `permiso-catalogo.ts`, `permiso-clientes.ts`,
`permiso-correccion.ts`, `permiso-oqc.ts`, `permiso-respaldo.ts`, `permiso-unidades.ts`;
el histórico `migrar-papelera.ts` rellena snapshots de instalaciones previas.)

### 2.8 Criterios de aceptación post-instalación

| # | Criterio | Comando | Esperado |
|---|---|---|---|
| 1 | Script ejecutable | `ls -l deploy.sh` | `-rwxr-xr-x` |
| 2 | Usuario sin privilegios | `id cig-manufacturing` · `groups cig-manufacturing` | UID válido; grupos: solo `cig-manufacturing` |
| 3 | Propiedad del código | `ls -ld /home/cig-manufacturing/CIG-MANUFACTURING` | `cig-manufacturing cig-manufacturing` |
| 4 | `.env` restringido | `ls -l …/CIG-MANUFACTURING/.env` | `-rw-------` |
| 5 | Servicio activo | `systemctl is-active cig-manufacturing` · `ss -tlnp \| grep 3000` | `active` y socket LISTEN |
| 6 | Caddy + HTTPS (dominio) | `systemctl is-active caddy` · `curl -I https://<DOMAIN>` | `active` y `HTTP/2 200` |
| 7 | HSTS (dominio) | `curl -sI https://<DOMAIN> \| grep -i strict-transport` | `strict-transport-security: max-age=63072000; includeSubDomains; preload` |
| 8 | La app responde | `curl http://127.0.0.1:3000` (dominio) o `curl http://<IP>:3000` (local) | HTML de la página de acceso |
| 9 | Login del admin | Navegador con `admin@cig-manufacturing.com` | Acceso + cambio forzado de contraseña |
| 10 | Aislamiento | `sudo su - cig-manufacturing` y `sudo ls /` | `sudo` rechazado |

Comprobaciones extra de aislamiento (deben fallar con permiso denegado):

```bash
sudo -u cig-manufacturing touch /home/cig-manufacturing/CIG-MANUFACTURING/prueba  # → denegado (ProtectHome=read-only)
sudo -u cig-manufacturing touch /tmp/prueba_sistema                               # → denegado (PrivateTmp)
sudo -u cig-manufacturing sudo id                                                 # → rechazado (no está en sudoers)
```

---

## 3. Operación diaria

### 3.1 Servicios

```bash
systemctl status cig-manufacturing            # estado del servicio de la app
systemctl restart cig-manufacturing           # reinicio (unidades y .env se recargan)
systemctl stop cig-manufacturing              # detención
systemctl is-active caddy                     # estado del proxy
journalctl -u cig-manufacturing -f            # log systemd en vivo
journalctl -u cig-manufacturing -n 50 --no-pager   # últimas 50 líneas (diagnóstico de fallos)
```

### 3.2 Logs de la aplicación

```bash
tail -f /home/cig-manufacturing/CIG-MANUFACTURING/logs/stderr.log   # errores de la app
tail -f /home/cig-manufacturing/CIG-MANUFACTURING/logs/stdout.log   # salida estándar
journalctl -u caddy -f                                              # accesos y certificados TLS
journalctl -u caddy | grep -i certificate                           # renovaciones
```

**Rotación:** `/etc/logrotate.d/cig-manufacturing` rota `logs/*.log` **semanal**,
conserva **8 rotaciones**, comprime con `delaycompress` y usa `copytruncate` (systemd
mantiene el descriptor abierto; sin `copytruncate` la rotación cortaría el log).
Verificar que está activa: `systemctl list-timers | grep -i logrotate`.

### 3.3 Mantenimiento rutinario

- **Contraseña del admin**: el sistema exige el cambio en el primer inicio de sesión
  (`debeCambiarPassword=true`). Si aparece `db/credenciales-iniciales.txt` (solo lo crea
  la semilla sin `INITIAL_ADMIN_PASSWORD`), leer, cambiar la contraseña y **borrar el
  archivo**.
- **Respaldo externo recomendado**: el módulo Respaldo gestiona `db/backups/` en el
  propio disco; copie periódicamente esos archivos (o descárguelos desde la UI:
  Sistema → Respaldo) a almacenamiento fuera del servidor. La BD es un solo archivo:
  `sqlite3 …/db/production.db ".backup '/ruta/segura/cig-$(date +%F).db'"` también
  produce una copia consistente en caliente.
- **Forzar recompilación de Caddy** (p. ej. al cambiar de modo local a dominio en la
  misma máquina): `sudo rm /usr/local/bin/caddy && sudo ./deploy.sh`.
- **Cambios de `.env`**: editar el archivo y `systemctl restart cig-manufacturing`.
  Cuidado con `HOSTNAME`/`PORT` heredados: el servicio ya fija ambos; elimínelos del
  `.env` si los tiene (rompen el bind).

---

## 4. Respaldo y restauración de la base de datos

### 4.1 Vía aplicación (recomendada): módulo Respaldo

Permisos necesarios: `respaldo.gestionar` (Sistema → Respaldo).

- **Crear respaldo**: instantánea consistente `VACUUM INTO` hacia `db/backups/` sin
  detener la planta. Registro en la tabla `RespaldoBD` con tamaño, total de registros y
  compatibilidad de esquema.
- **Respaldo automático**: al abrir el módulo, respaldo diario `AUTOMATICO` conservando
  los últimos 7.
- **Restauración EN CALIENTE** (procedimiento operativo):
  1. Sistema → Respaldo → seleccionar archivo (se valida `PRAGMA quick_check` y
     compatibilidad de esquema antes de tocar nada).
  2. Confirmar. La restauración **no reinicia el servidor**: una única transacción
     reemplaza todos los datos. Si falla a mitad, SQLite revierte todo y la base queda
     exactamente como estaba (rollback automático; el intento queda `FALLIDA` en la
     bitácora `RestauracionBD`).
  3. Al completar se crea automáticamente un **snapshot pre-restauración**
     (`PRE_RESTAURACION`) y se abre una **ventana de 24 horas** para revertir.
  4. Para revertir dentro de la ventana: botón de reversión (restaura el snapshot
     pre-restauración; es una restauración más, con su propia bitácora y ventana).
  5. Los respaldos pueden descargarse desde la UI o **subirse** (quedan como tipo
     `SUBIDO`) y los archivos copiados manualmente a `db/backups/` se detectan como
     `DETECTADO`.
- **Bitácora**: cada intento (incluidas reversiones) queda en `RestauracionBD` con
  estado, duración, registros y ejecutor.

### 4.2 Vía consola (cold backup / emergencias)

```bash
# Copia consistente EN CALIENTE (la base sigue operando):
sqlite3 /home/cig-manufacturing/CIG-MANUFACTURING/db/production.db \
  ".backup '/backups/cig-manufacturing-$(date +%F).db'"

# Copia EN FRÍO (servidor detenido): simplemente copiar el archivo
sudo systemctl stop cig-manufacturing
cp …/db/production.db /backups/cig-manufacturing-$(date +%F).db
sudo systemctl start cig-manufacturing
```

Restauración de emergencia en frío: detener el servicio, reemplazar
`db/production.db` por el archivo de respaldo (conservando propietario
`cig-manufacturing` y permisos) y arrancar de nuevo. Para operaciones normales,
**prefiera siempre la restauración en caliente del módulo**: es transaccional, audita
el intento y deja punto de reversión.

---

## 5. Solución de problemas (referencia rápida)

| Síntoma | Causa / solución |
|---|---|
| `✖ Este script debe ejecutarse como root` | `sudo ./deploy.sh`. |
| `✖ No se encontró package.json/prisma/seed.ts` | Ejecutar desde la raíz del repositorio clonado. |
| Servicio `failed` / en bucle | `journalctl -u cig-manufacturing -n 50` y `tail -50 …/logs/stderr.log`. Causas típicas: `AUTH_SECRET` inválido, o `HOSTNAME`/`PORT` heredados en `.env` que rompen el bind (eliminar esas líneas). |
| `PrismaClientInitializationError: Unable to open DB file` | `DATABASE_URL` relativa o sin permisos: usar ruta absoluta y verificar escritura del usuario de servicio en `db/`. |
| `SQLITE_BUSY` / `database is locked` en `logs/stdout.log` | Contención por un proceso externo (p. ej. `sqlite3` CLI de mantenimiento). La app ya la absorbe en dos capas: espera interna de 5 s (`busy_timeout`, Fase 2) y re-ejecución con retroceso (Fase 3). Avisos `[bd] error transitorio en intento n/N` ocasionales = normal. Si son frecuentes: mover el mantenimiento pesado a horas sin operación o usar `VACUUM INTO`/`.backup` (nunca escrituras largas sobre el archivo en caliente). |
| HTTPS no responde (dominio) | 1) ¿Registro A apunta a esta IP? 2) ¿El token tiene `Zone·DNS·Edit` sobre esa zona? Ver `journalctl -u caddy -n 50`. El primer certificado tarda 1-3 min. |
| `caddy validate` falla con token vacío | Revisar `/etc/caddy/caddy.env` (debe existir en modo dominio con `CLOUDFLARE_API_TOKEN=…`). |
| No se puede entrar tras desplegar en local | HTTP sin TLS: la cookie requiere `COOKIE_INSEGURA_HTTP=1` — el `.env` en modo local ya la incluye; si se desplegó antes con otro `.env`, agregarla y reiniciar. |
| Sesiones se pierden al reiniciar | `AUTH_SECRET` cambia entre arranques: fijar uno estable en `.env`. |
| Build sin memoria | Servidor necesita ≥2 GB; swap temporal: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`. |
| `SystemCallFilter` bloquea algo inesperado | El filtro `@system-service` es el exigido. Diagnóstico: `sudo systemd-analyze syscall-filter @system-service` y buscar `EPERM` en `journalctl`. |
| `EADDRINUSE: port in use` | Otro proceso usa el puerto; en despliegues con dominio la app usa 3000 y en local 3001 (Caddy posee la interfaz pública). |

---

## 6. Instalación local de desarrollo / evaluación

Para desarrollo o evaluación sin `deploy.sh`, el repositorio incluye el flujo en un paso:

```bash
./setup.sh     # genera .env (AUTH_SECRET aleatorio), instala, crea BD, siembra y compila
./start.sh     # levanta el servidor standalone (puerto 3000; runtime bun con fallback node)
```

- `ADMIN_PASSWORD='TuClave123' ./setup.sh` fija la contraseña del admin inicial (solo
  la primera vez, base vacía); sin ella se genera una aleatoria en
  `db/credenciales-iniciales.txt` (600).
- `start.sh` valida `.env`, compilación, `DATABASE_URL` y `AUTH_SECRET` antes de
  arrancar, y fuerza `HOSTNAME=0.0.0.0` (`BIND_HOST=127.0.0.1` para solo local,
  `PORT=8080` para otro puerto).
- Docker opcional: `docker compose up -d --build` con
  `AUTH_SECRET="$(openssl rand -hex 32)"` (el compose se niega a arrancar sin él); BD
  en volumen `cig-manufacturing-data`, contenedor sin privilegios (`cap_drop: ALL`,
  `no-new-privileges`) y `HEALTHCHECK` sobre `GET /api`.

Detalles de Docker y del entorno de desarrollo (incluidas las pruebas E2E de
`scripts/`) en el `README.md` del repositorio y en
[03-GUIA-DESARROLLO-NUEVOS-MODULOS.md](./03-GUIA-DESARROLLO-NUEVOS-MODULOS.md).
