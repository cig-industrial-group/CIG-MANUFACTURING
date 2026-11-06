#!/usr/bin/env bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# ============================================================
# CIG-MANUFACTURING v2.0.0 — Instalador automatizado de despliegue
# para producción con aislamiento de seguridad extremo.
#
# QUÉ HACE (Ubuntu 22.04 LTS virgen → producción):
#   1. Endurece el sistema (actualización + firewall UFW).
#   2. Crea el usuario de servicio confinado cig-manufacturing
#      (sin sudo ni ningún grupo privilegiado).
#   3. Instala Bun en el home del usuario de servicio.
#   4. Instala Caddy:
#        · Con dominio  → compilado con el plugin de Cloudflare
#          (DNS-01, no requiere puerto 80) usando xcaddy + Go.
#        · Sin dominio  → binario estándar del repositorio oficial.
#   5. Instala PostgreSQL 16 (repositorio oficial PGDG, idempotente) +
#      postgresql-client-16 (pg_dump/pg_restore/psql para el módulo de
#      Respaldo) y aprovisiona rol CREATEDB + base de datos.
#   6. Sincroniza el código (rsync, excluye .git/node_modules/...)
#      hacia /home/cig-manufacturing/CIG-MANUFACTURING.
#   7. Genera .env (AUTH_SECRET aleatorio, DATABASE_URL de PostgreSQL
#      con contraseña aleatoria, DATA_DIR, password del admin inicial).
#      Nunca sobrescribe un .env existente (y rechaza URLs file:
#      del motor de archivo anterior con instrucciones de migración).
#   8. Compila: bun install → prisma generate/migrate deploy/db seed →
#      build.
#   9. Instala el servicio systemd cig-manufacturing.service — con
#      After/Wants=postgresql.service — con directivas de aislamiento
#      (ProtectSystem=strict, SystemCallFilter, NoNewPrivileges, ...)
#      y Caddy como proxy inverso con TLS automático y cabeceras de
#      seguridad.
#
# REQUISITOS:
#   · Ejecutarse como root en el servidor Ubuntu 22.04 LTS.
#   · Ejecutarse DESDE la raíz del repositorio clonado
#     (el script copia el código del directorio actual).
#   · Con dominio: registro A/AAAA del dominio apuntando al
#     servidor + API Token de Cloudflare con permiso
#     «Zone · DNS · Edit» (ver README-DEPLOY.md).
#
# USO:
#   chmod +x deploy.sh && sudo ./deploy.sh
#
# IDEMPOTENCIA:
#   Puede ejecutarse las veces que haga falta: no duplica usuarios,
#   no borra la base de datos, no regenera secretos existentes y
#   no recompila Caddy si ya tiene el plugin de Cloudflare.
#
# NO INTERACTIVO (re-ejecuciones automatizadas):
#   Las variables USE_DOMAIN, DOMAIN, ADMIN_EMAIL, CF_API_TOKEN e
#   INITIAL_ADMIN_PASSWORD pueden pre-fijarse en el entorno para
#   saltar las preguntas (se validan igual). SSH_PORT permite
#   indicar un puerto SSH distinto de 22 antes de activar UFW.
#
# VERIFICACIÓN POSTERIOR: ver criterios en README-DEPLOY.md.
# ============================================================

set -Eeuo pipefail

# ------------------------------------------------------------ CONFIGURACIÓN
readonly SERVICE_USER="cig-manufacturing"
readonly SERVICE_GROUP="cig-manufacturing"
readonly SERVICE_HOME="/home/cig-manufacturing"
readonly APP_DIR="${SERVICE_HOME}/CIG-MANUFACTURING"
readonly APP_SERVICE="cig-manufacturing"
readonly BUN_BIN="${SERVICE_HOME}/.bun/bin/bun"
readonly BUN_DIR="${SERVICE_HOME}/.bun"
readonly CADDY_SERVICE="caddy"
readonly CADDY_CONF_DIR="/etc/caddy"
readonly CADDY_ENV_FILE="${CADDY_CONF_DIR}/caddy.env"
readonly CADDY_DATA_DIR="/var/lib/caddy"
readonly SSH_PORT="${SSH_PORT:-22}"     # export SSH_PORT=2222 si el SSH no está en 22
readonly PATH_ESTANDAR="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# PostgreSQL 16 local (repositorio oficial PGDG): la app habla con el
# servidor por TCP en 127.0.0.1 (solo escucha local; el 5432 jamás se
# publica en UFW). El rol de aplicación lleva CREATEDB: la restauración
# en caliente del módulo Respaldo crea bases transitorias de verificación.
readonly PG_HOST="127.0.0.1"
readonly PG_PUERTO="5432"
readonly PG_USUARIO="cig_manufacturing"
readonly PG_BASE="cig_manufacturing"
readonly PG_VERSION="16"
readonly PGDG_KEYRING="/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc"

# Variables de sesión (interactivas o heredadas del entorno)
USE_DOMAIN="${USE_DOMAIN:-}"
DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
CF_API_TOKEN="${CF_API_TOKEN:-}"
INITIAL_ADMIN_PASSWORD="${INITIAL_ADMIN_PASSWORD:-}"

# Puerto interno de la aplicación:
#   · Con dominio : 3000 en 127.0.0.1 (Caddy publica 443 y lo pasa a 3000).
#   · Sin dominio : 3001 en 127.0.0.1 (Caddy publica :3000 y lo pasa a 3001;
#     dos sockets no pueden convivir en el mismo puerto — EADDRINUSE —).
APP_PORT="3000"

# Directorio de origen (repositorio clonado donde vive este script)
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
readonly SCRIPT_DIR

# ------------------------------------------------------------------ ESTILO
if [[ -t 1 ]]; then
  readonly C_VERDE='\033[0;32m' C_AMAR='\033[1;33m' C_ROJO='\033[0;31m'
  readonly C_AZUL='\033[1;34m' C_NEGRIS='\033[1m' C_FIN='\033[0m'
else
  readonly C_VERDE='' C_AMAR='' C_ROJO='' C_AZUL='' C_NEGRIS='' C_FIN=''
fi

paso() { printf '\n%s▸ %s%s\n' "${C_AZUL}" "$*" "${C_FIN}"; }
ok()   { printf '%s✔ %s%s\n' "${C_VERDE}" "$*" "${C_FIN}"; }
warn() { printf '%s⚠ %s%s\n' "${C_AMAR}" "$*" "${C_FIN}" >&2; }
err()  { printf '%s✖ %s%s\n' "${C_ROJO}" "$*" "${C_FIN}" >&2; }

on_error() {
  local rc=$? linea="$1"
  err "Fallo en la línea ${linea} del script (código ${rc})."
  err "Revisa el mensaje de error anterior; corrige y vuelve a ejecutar ./deploy.sh (es idempotente)."
  exit "$rc"
}
trap 'on_error $LINENO' ERR

# --------------------------------------------------------------- UTILIDADES
# Ejecuta un comando como usuario de servicio con un entorno LIMPIO y
# controlado (env -i). Esto garantiza que la configuración de la app
# provenga ÚNICAMENTE de su .env y no de variables heredadas de root
# (DATABASE_URL/AUTH_SECRET/NODE_ENV del entorno podrían pisar el .env,
# ya que las variables de entorno tienen prioridad sobre los archivos).
como_usuario() {
  runuser -u "${SERVICE_USER}" -- \
    env -i \
      HOME="${SERVICE_HOME}" \
      USER="${SERVICE_USER}" \
      LOGNAME="${SERVICE_USER}" \
      TERM="${TERM:-dumb}" \
      LANG=C.UTF-8 \
      BUN_INSTALL="${BUN_DIR}" \
      PATH="${BUN_DIR}/bin:${PATH_ESTANDAR}" \
      "$@"
}

# Lectura interactiva con cancelación limpia ante EOF (Ctrl-D).
leer() { # leer "prompt" nombre_variable
  local prompt="$1" var="$2" resp
  printf '%s' "$prompt" >&2
  if ! read -r resp; then
    err "Entrada cerrada (EOF). Despliegue cancelado — no se modificó nada."
    exit 1
  fi
  printf -v "$var" '%s' "$resp"
}

# Lectura de secreto sin eco.
leer_secreto() { # leer_secreto "prompt" nombre_variable
  local prompt="$1" var="$2" resp
  printf '%s' "$prompt" >&2
  if ! read -rs resp; then
    printf '\n' >&2
    err "Entrada cerrada (EOF). Despliegue cancelado — no se modificó nada."
    exit 1
  fi
  printf '\n' >&2
  printf -v "$var" '%s' "$resp"
}

# ------------------------------------------------------------ VALIDACIONES
# Formato DNS básico: etiquetas FQDN (rechaza IPs y nombres sin punto).
dominio_valido() {
  [[ "$1" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]]
}

email_valido() {
  [[ "$1" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]
}

# Contraseña del admin: mínimo 12 caracteres (especificación), con al menos
# una letra y un número (política de la aplicación en prisma/seed.ts).
# Se excluyen " ` $ \ porque romperían los parsers de .env (bash/dotenv/systemd).
password_valida() {
  local p="$1"
  (( ${#p} >= 12 )) || return 1
  [[ "$p" =~ [A-Za-z] ]] || return 1
  [[ "$p" =~ [0-9] ]] || return 1
  # En patrones case los caracteres son literales: $ va sin backslash.
  # Espacios y " ` $ \ quedan excluidos: romperían los parsers de .env
  # (bash source / dotenv / systemd EnvironmentFile) o la confirmación oculta.
  case "$p" in
    *'"'*|*'$'*|*'`'*|*'\'*|*[[:space:]]*) return 1 ;;
  esac
  return 0
}

# Token de Cloudflare: opaco, pero sin espacios ni comillas (caddy.env/Caddyfile).
token_valido() {
  local t="$1"
  [[ -n "$t" ]] || return 1
  case "$t" in *[[:space:]]*|*'"'*|*"'"*|*'\'*) return 1 ;; esac
  return 0
}

# AUTH_SECRET: mismo criterio que scripts/validar-auth-secret.sh del proyecto
# (mínimo 32 caracteres, sin espacios, sin valores publicados).
auth_secret_valido() {
  local v="${1:-}" prohibido
  [[ -n "$v" ]] || return 1
  [[ "$v" != "${v//[[:space:]]/}" ]] && return 1
  (( ${#v} >= 32 )) || return 1
  for prohibido in \
    "cig-manufacturing-secreto-desarrollo-2024-cambiar-en-produccion" \
    "fabriflow-secreto-desarrollo-2024-cambiar-en-produccion" \
    "cambia-esta-clave-por-una-aleatoria-de-64-caracteres" \
    "cambia-esta-clave-con-openssl-rand-hex-32" \
    "pega-aqui-tu-clave-aleatoria" \
    "ci-clave-efimera-solo-pruebas" \
    "clave-local-solo-pruebas"; do
    [[ "$v" == "$prohibido" ]] && return 1
  done
  return 0
}

# ---------------------------------------------------------------- PREGUNTAS
interpretar_si_no() { # "s"/"n"/"si"/"no"/"y"/"1"/"0"/"" → 0=sí 1=no
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    s|si|sí|y|yes|1) return 0 ;;
    *) return 1 ;;
  esac
}

solicitar_datos() {
  paso "Recopilando datos de despliegue"

  # --- ¿Dominio con SSL? (por defecto: No) -----------------------------
  if [[ -z "${USE_DOMAIN}" ]]; then
    leer "¿Desplegar con dominio propio y SSL (Cloudflare DNS-01)? (s/N): " USE_DOMAIN
  fi
  if interpretar_si_no "${USE_DOMAIN:-n}"; then
    USE_DOMAIN="s"
  else
    USE_DOMAIN="n"
  fi

  if [[ "${USE_DOMAIN}" == "s" ]]; then
    # --- Dominio ---------------------------------------------------------
    while :; do
      [[ -n "${DOMAIN}" ]] || leer "Nombre de dominio (ej. preprod.cig.com): " DOMAIN
      if dominio_valido "${DOMAIN}"; then break; fi
      warn "«${DOMAIN}» no es un FQDN válido (ej. app.empresa.com; no se aceptan IPs)."
      DOMAIN=""
    done

    # --- Correo administrativo (registros Let's Encrypt) ----------------
    while :; do
      [[ -n "${ADMIN_EMAIL}" ]] || leer "Correo del administrador (Let's Encrypt): " ADMIN_EMAIL
      if email_valido "${ADMIN_EMAIL}"; then break; fi
      warn "«${ADMIN_EMAIL}» no tiene formato de correo válido."
      ADMIN_EMAIL=""
    done

    # --- API Token de Cloudflare (secreto, sin eco) ---------------------
    while :; do
      [[ -n "${CF_API_TOKEN}" ]] || leer_secreto "API Token de Cloudflare (Zone·DNS·Edit): " CF_API_TOKEN
      if token_valido "${CF_API_TOKEN}"; then break; fi
      warn "El token no puede estar vacío ni contener espacios o comillas."
      CF_API_TOKEN=""
    done
  else
    ok "Modo local: sin dominio, sin TLS (HTTP en el puerto 3000)."
  fi

  # --- Contraseña del administrador inicial ----------------------------
  while :; do
    if [[ -z "${INITIAL_ADMIN_PASSWORD}" ]]; then
      leer_secreto "Contraseña del usuario admin inicial (mín. 12, con letras y números): " INITIAL_ADMIN_PASSWORD
      if ! password_valida "${INITIAL_ADMIN_PASSWORD}"; then
        warn "Debe tener ≥12 caracteres, al menos una letra y un número; sin \" \` \$ \\ ni espacios."
        INITIAL_ADMIN_PASSWORD=""
        continue
      fi
      local confirma=""
      leer_secreto "Confirmar contraseña: " confirma
      if [[ "${INITIAL_ADMIN_PASSWORD}" != "${confirma}" ]]; then
        warn "Las contraseñas no coinciden; inténtalo de nuevo."
        INITIAL_ADMIN_PASSWORD=""
        continue
      fi
      unset confirma
    else
      password_valida "${INITIAL_ADMIN_PASSWORD}" || {
        err "INITIAL_ADMIN_PASSWORD del entorno no cumple la política (≥12, letra y número, sin \" \` \$ \\)."
        exit 1
      }
    fi
    break
  done

  # Puerto interno de la app según el modo (ver cabecera de CONFIGURACIÓN)
  if [[ "${USE_DOMAIN}" == "s" ]]; then APP_PORT="3000"; else APP_PORT="3001"; fi

  printf '\n'
  if [[ "${USE_DOMAIN}" == "s" ]]; then
    printf '  %sModo:%s dominio %s · HTTPS 443 (DNS-01 Cloudflare)\n' "${C_NEGRIS}" "${C_FIN}" "${DOMAIN}"
  else
    printf '  %sModo:%s local · HTTP :3000 (Caddy) → 127.0.0.1:3001 (app)\n' "${C_NEGRIS}" "${C_FIN}"
  fi
}

# -------------------------------------------------------------- PRE-FLIGHT
verificar_precondiciones() {
  paso "Verificando precondiciones"

  if [[ ${EUID} -ne 0 ]]; then
    err "Este script debe ejecutarse como root: sudo ./deploy.sh"
    exit 1
  fi

  if [[ ! -f "${SCRIPT_DIR}/package.json" || ! -f "${SCRIPT_DIR}/prisma/seed.ts" ]]; then
    err "No se encontró package.json/prisma/seed.ts en ${SCRIPT_DIR}."
    err "Ejecuta el script desde la raíz del repositorio clonado (ver README-DEPLOY.md)."
    exit 1
  fi

  # Compatibilidad de la semilla con la variable de entorno del instalador.
  if ! grep -q "INITIAL_ADMIN_PASSWORD" "${SCRIPT_DIR}/prisma/seed.ts"; then
    err "prisma/seed.ts no lee la variable INITIAL_ADMIN_PASSWORD."
    err "Modifica el archivo para que el administrador inicial tome"
    err "process.env.INITIAL_ADMIN_PASSWORD y vuelve a ejecutar el despliegue."
    exit 1
  fi
  ok "prisma/seed.ts compatible con INITIAL_ADMIN_PASSWORD"

  # El origen no puede ser (ni estar dentro de) el directorio de destino.
  if [[ "${SCRIPT_DIR}" == "${APP_DIR}" || "${SCRIPT_DIR}" == "${APP_DIR}"/* ]]; then
    err "El script se está ejecutando desde el propio directorio de destino (${APP_DIR})."
    err "Clona el repositorio en otro directorio (ej. /root) y ejecuta desde allí."
    exit 1
  fi

  if ! command -v runuser >/dev/null 2>&1; then
    err "Falta runuser (paquete util-linux) — no es un Ubuntu estándar."
    exit 1
  fi

  if ! [[ "${SSH_PORT}" =~ ^[0-9]+$ ]] || (( SSH_PORT < 1 || SSH_PORT > 65535 )); then
    err "SSH_PORT inválido: «${SSH_PORT}» (debe ser un puerto TCP 1-65535)."
    exit 1
  fi

  # Aviso de sistema operativo distinto de Ubuntu 22.04 (no bloquea).
  if [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    if [[ "${ID:-unknown}" != "ubuntu" || "${VERSION_ID:-}" != "22.04" ]]; then
      warn "Sistema detectado: ${PRETTY_NAME:-desconocido}. El script está probado en Ubuntu 22.04 LTS."
    fi
  fi

  if [[ "${SSH_PORT}" != "22" ]]; then
    ok "Puerto SSH personalizado: ${SSH_PORT}/tcp (se abrirá en UFW)."
  fi
}

# ------------------------------------------------- ENDURECIMIENTO DEL S.O.
endurecer_sistema() {
  paso "Actualizando sistema e instalando paquetes base"

  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
  apt-get update
  apt-get upgrade -y
  # curl/git/ufw/build-essential según especificación + rsync (sincronización
  # idempotente) + openssl (AUTH_SECRET y contraseña de BD) + gnupg/
  # ca-certificates (repositorios de Caddy y PGDG) + python3 (extracción de
  # credenciales del .env para el aprovisionamiento del rol/base).
  apt-get install -y curl git ufw build-essential rsync openssl gnupg ca-certificates python3
  ok "Paquetes base instalados"
}

configurar_firewall() {
  paso "Configurando firewall UFW (denegar entrantes por defecto)"

  ufw default deny incoming
  ufw default allow outgoing
  ufw allow "${SSH_PORT}/tcp" comment 'SSH'
  if [[ "${USE_DOMAIN}" == "s" ]]; then
    ufw allow 443/tcp comment 'HTTPS (Caddy)'
  else
    ufw allow 3000/tcp comment 'CIG-MANUFACTURING (HTTP local)'
  fi
  ufw --force enable
  ok "UFW activo: SSH ${SSH_PORT}/tcp + $([[ "${USE_DOMAIN}" == "s" ]] && echo '443/tcp' || echo '3000/tcp')"
}

# -------------------------------------------------- USUARIO DE SERVICIO
crear_usuario_servicio() {
  paso "Asegurando usuario de servicio confinado: ${SERVICE_USER}"

  if id "${SERVICE_USER}" >/dev/null 2>&1; then
    ok "El usuario ${SERVICE_USER} ya existe"
    # Corregir shell/home si difieren de la especificación.
    usermod -d "${SERVICE_HOME}" -s /bin/bash "${SERVICE_USER}"
  else
    useradd --create-home --home-dir "${SERVICE_HOME}" --shell /bin/bash "${SERVICE_USER}"
    ok "Usuario ${SERVICE_USER} creado (home ${SERVICE_HOME}, shell /bin/bash)"
  fi

  mkdir -p "${SERVICE_HOME}"
  chown "${SERVICE_USER}:${SERVICE_GROUP}" "${SERVICE_HOME}"
  chmod 750 "${SERVICE_HOME}"

  # Verificación de mínimo privilegio: fuera de sudo/docker y sin grupos extra.
  local grupos
  grupos="$(id -nG "${SERVICE_USER}")"
  if [[ "${grupos}" != "${SERVICE_GROUP}" ]]; then
    warn "El usuario pertenece a varios grupos: ${grupos}."
    warn "Revisa con: groups ${SERVICE_USER} — la especificación exige SOLO ${SERVICE_GROUP}."
    for g in sudo docker wheel admin; do
      if id -nG "${SERVICE_USER}" | grep -qw "${g}"; then
        err "El usuario ${SERVICE_USER} está en el grupo privilegiado «${g}»."
        err "Ejecuta: gpasswd -d ${SERVICE_USER} ${g}  y vuelve a correr el despliegue."
        exit 1
      fi
    done
  else
    ok "Grupos de ${SERVICE_USER}: ${SERVICE_GROUP} (sin privilegios)"
  fi
}

# ------------------------------------------------------------------- BUN
instalar_bun() {
  paso "Instalando Bun en ${BUN_DIR} (usuario ${SERVICE_USER})"

  if [[ -x "${BUN_BIN}" ]] && "${BUN_BIN}" --version >/dev/null 2>&1; then
    ok "Bun ya está instalado: $("${BUN_BIN}" --version)"
    return
  fi

  como_usuario bash -c 'curl -fsSL https://bun.sh/install | bash'
  [[ -x "${BUN_BIN}" ]] || { err "El instalador de Bun no produjo ${BUN_BIN}."; exit 1; }
  ok "Bun instalado: $("${BUN_BIN}" --version)"
}

# ----------------------------------------------------------------- CADDY
# ¿El binario de Caddy ya incluye el módulo DNS de Cloudflare?
caddy_tiene_cloudflare() {
  command -v caddy >/dev/null 2>&1 || return 1
  caddy list-modules 2>/dev/null | grep -q 'dns\.providers\.cloudflare'
}

# Instala Go (toolchain oficial) para compilar con xcaddy.
instalar_go() {
  if [[ -x /usr/local/go/bin/go ]]; then
    ok "Go ya instalado: $(/usr/local/go/bin/go version | awk '{print $3}')"
    return
  fi
  local arch version
  arch="$(dpkg --print-architecture)"   # amd64 | arm64
  version="$(curl -fsSL --retry 3 'https://go.dev/VERSION?m=text' | head -n1)"
  [[ -n "${version}" ]] || { err "No se pudo consultar la versión estable de Go."; exit 1; }
  ok "Descargando ${version} (linux/${arch})…"
  curl -fsSL --retry 3 "https://go.dev/dl/${version}.linux-${arch}.tar.gz" -o /tmp/go.tgz
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tgz
  rm -f /tmp/go.tgz
  ok "$( /usr/local/go/bin/go version )"
}

instalar_caddy() {
  if [[ "${USE_DOMAIN}" == "s" ]]; then
    paso "Instalando Caddy con plugin Cloudflare (DNS-01) vía xcaddy"

    if caddy_tiene_cloudflare; then
      ok "Caddy ya compilado con dns.providers.cloudflare — se reutiliza"
    else
      instalar_go
      export PATH="/usr/local/go/bin:${PATH}"
      export GOCACHE=/var/tmp/xcaddy-gocache GOMODCACHE=/var/tmp/xcaddy-gomodcache
      export GOPATH=/var/tmp/xcaddy-gopath GOBIN=/usr/local/bin
      mkdir -p /var/tmp/xcaddy-build
      (
        cd /var/tmp/xcaddy-build
        go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
        /usr/local/bin/xcaddy build --with github.com/caddy-dns/cloudflare --output /usr/local/bin/caddy
      )
      # Minimizar superficie: se eliminan el toolchain y las cachés de build.
      rm -rf /usr/local/go /usr/local/bin/xcaddy /var/tmp/xcaddy-build \
             /var/tmp/xcaddy-gocache /var/tmp/xcaddy-gomodcache /var/tmp/xcaddy-gopath
    fi
    command -v caddy >/dev/null 2>&1 || { err "Caddy no quedó instalado."; exit 1; }
    caddy_tiene_cloudflare || { err "El binario de Caddy no tiene el plugin de Cloudflare."; exit 1; }
    ok "Caddy listo: $(caddy version)"
  else
    paso "Instalando Caddy estándar (repositorio oficial)"
    if command -v caddy >/dev/null 2>&1; then
      ok "Caddy ya presente: $(caddy version)"
    else
      apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
        | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/config.deb.txt?distro=debian&version=any-version' \
        -o /etc/apt/sources.list.d/caddy-stable.list
      apt-get update
      apt-get install -y caddy
    fi
    ok "Caddy listo: $(caddy version)"
  fi

  # Usuario/infraestructura de Caddy (el paquete apt los crea; xcaddy no).
  id caddy >/dev/null 2>&1 || \
    useradd --system --home-dir "${CADDY_DATA_DIR}" --create-home --shell /usr/sbin/nologin caddy
  mkdir -p "${CADDY_DATA_DIR}" "${CADDY_CONF_DIR}"
  chown caddy:caddy "${CADDY_DATA_DIR}"
  chmod 750 "${CADDY_DATA_DIR}"
}

# ----------------------------------------------------------- POSTGRESQL
# Instala PostgreSQL 16 desde el repositorio oficial PGDG (idempotente).
#
# ¿Por qué PGDG? Ubuntu 22.04 (jammy) empaqueta PostgreSQL 14 y el sistema
# exige 16+ (docker-compose usa postgres:16 y las migraciones de Prisma
# están generadas para ese motor). El keyring firmado sustituye al método
# apt-key (deprecado); la fuente se declara con [signed-by=] sin claves
# globales en el anillo de apt.
#
# postgresql-client-16 se instala JUNTO al servidor: el módulo de Respaldo
# invoca pg_dump/pg_restore/psql (la restauración en caliente lo exige) y
# la versión del cliente debe ser >= la del servidor.
instalar_postgresql() {
  paso "Instalando PostgreSQL ${PG_VERSION} (repositorio PGDG)"

  # Codename de Ubuntu (jammy, noble, ...) para la fuente PGDG.
  . /etc/os-release
  local codename="${VERSION_CODENAME:-}"
  [[ -n "${codename}" ]] || { err "No se pudo determinar el codename de Ubuntu (/etc/os-release)."; exit 1; }

  # 1) Keyring + fuente PGDG (idempotente: reescribir igual es inofensivo).
  if [[ ! -f "${PGDG_KEYRING}" || ! -f /etc/apt/sources.list.d/pgdg.list ]]; then
    install -d "$(dirname "${PGDG_KEYRING}")"
    curl -fsSL --retry 3 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "${PGDG_KEYRING}"
    echo "deb [signed-by=${PGDG_KEYRING}] https://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list
    ok "Repositorio PGDG configurado (${codename}-pgdg, keyring firmado)"
  else
    ok "Repositorio PGDG ya configurado"
  fi

  # 2) Servidor + cliente (apt es idempotente: ya instalado → sin cambios).
  if [[ -x "/usr/lib/postgresql/${PG_VERSION}/bin/postgres" ]]; then
    ok "PostgreSQL ${PG_VERSION} ya instalado ($(psql --version 2>/dev/null || echo presente))"
  else
    apt-get update
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      postgresql-${PG_VERSION} postgresql-client-${PG_VERSION}
    ok "PostgreSQL ${PG_VERSION} instalado (servidor + cliente pg_dump/pg_restore/psql)"
  fi

  # 3) Servicio activo. Sin restart innecesario si ya acepta conexiones:
  #    un reinicio en cada re-despliegue tiraría de las conexiones activas.
  systemctl enable postgresql >/dev/null
  if ! pg_isready -q -h "${PG_HOST}" -p "${PG_PUERTO}"; then
    systemctl restart postgresql
  fi
  local intentos=0
  until pg_isready -q -h "${PG_HOST}" -p "${PG_PUERTO}"; do
    intentos=$((intentos + 1))
    (( intentos >= 30 )) && { err "PostgreSQL no acepta conexiones en ${PG_HOST}:${PG_PUERTO}."; exit 1; }
    sleep 1
  done
  ok "Servicio postgresql activo (${PG_HOST}:${PG_PUERTO}, solo escucha local — el 5432 no se publica en UFW)"
}

# -------------------------------------------------------- CÓDIGO FUENTE
sincronizar_codigo() {
  paso "Sincronizando código: ${SCRIPT_DIR} → ${APP_DIR}"

  command -v rsync >/dev/null 2>&1 || { err "rsync no está instalado."; exit 1; }

  mkdir -p "${APP_DIR}"
  # --delete mantiene el destino espejo del origen, pero las exclusiones
  # protegen el estado de producción (BD, respaldos, logs, .env, builds).
  rsync -a --delete \
    --exclude='.git/' \
    --exclude='node_modules/' \
    --exclude='.next/' \
    --exclude='download/' \
    --exclude='upload/' \
    --exclude='db/' \
    --exclude='logs/' \
    --exclude='backups/' \
    --exclude='/branding/'  \
    --exclude='.env' \
    --exclude='server.log' \
    --exclude='dev.log' \
    --exclude='credenciales-iniciales.txt' \
    "${SCRIPT_DIR}/" "${APP_DIR}/"

  chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "${APP_DIR}"
  chmod 750 "${APP_DIR}"
  ok "Código sincronizado (excluidos .git, node_modules, .next, download, upload, branding y estado de producción)"
}

# ------------------------------------------------------------------ .ENV
generar_env() {
  paso "Configurando entorno (.env)"

  if [[ -f "${APP_DIR}/.env" ]]; then
    ok ".env existente — se conserva (los secretos nunca se sobrescriben)"
    local secreto_actual
    secreto_actual="$(grep -E '^AUTH_SECRET=' "${APP_DIR}/.env" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
    if ! auth_secret_valido "${secreto_actual}"; then
      err "El AUTH_SECRET del .env existente no es apto para producción (mín. 32 caracteres, sin espacios)."
      err "Corrígelo manualmente en ${APP_DIR}/.env o elimina ese archivo y vuelve a desplegar."
      exit 1
    fi
    ok "AUTH_SECRET del .env existente validado"
    # DATABASE_URL debe ser una URL de PostgreSQL: una instalación previa
    # del motor de archivo anterior debe migrar sus DATOS primero (script
    # de migración de scripts/ + README-DEPLOY.md). Nunca se reescribe en
    # silencio la configuración de producción.
    local url_actual
    url_actual="$(grep -E '^DATABASE_URL=' "${APP_DIR}/.env" | head -n1 | cut -d= -f2- | tr -d '"' || true)"
    case "${url_actual}" in
      postgresql://*|postgres://*)
        ok "DATABASE_URL del .env existente es de PostgreSQL (se conserva)" ;;
      *)
        err "El .env existente no define una DATABASE_URL de PostgreSQL."
        err "Instalación previa del motor de archivo: migra los datos con el script"
        err "de migración de scripts/ (ver README-DEPLOY.md) y actualiza"
        err "DATABASE_URL/DATA_DIR desde .env.example antes de re-desplegar."
        exit 1 ;;
    esac
    if grep -qE '^(HOSTNAME|PORT)=' "${APP_DIR}/.env"; then
      warn "El .env define HOSTNAME/PORT: pueden interferir con el bind 127.0.0.1 del servicio."
      warn "Considera eliminar esas líneas (el servicio systemd ya fija ambos valores)."
    fi
  else
    local auth_secret clave_bd
    auth_secret="$(openssl rand -base64 48)"
    auth_secret_valido "${auth_secret}" || { err "No se pudo generar un AUTH_SECRET válido."; exit 1; }
    # Contraseña de la base: hex de 192 bits (openssl rand -hex 24). Solo
    # caracteres [0-9a-f]: viaja segura por el literal SQL del
    # aprovisionamiento y por la URL del .env sin escapados.
    clave_bd="$(openssl rand -hex 24)"

    {
      printf 'NODE_ENV=production\n'
      printf 'AUTH_SECRET=%s\n' "${auth_secret}"
      printf 'DATABASE_URL="postgresql://%s:%s@%s:%s/%s?schema=public"\n' \
        "${PG_USUARIO}" "${clave_bd}" "${PG_HOST}" "${PG_PUERTO}" "${PG_BASE}"
      printf 'DATA_DIR=%s/db\n' "${APP_DIR}"
      printf 'INITIAL_ADMIN_PASSWORD="%s"\n' "${INITIAL_ADMIN_PASSWORD}"
      if [[ "${USE_DOMAIN}" == "s" ]]; then
        printf 'NEXTAUTH_URL="https://%s"\n' "${DOMAIN}"
      else
        # HTTP sin TLS en modo local: sin esta bandera la cookie Secure
        # impediría iniciar sesión (ver README-DEPLOY.md).
        printf 'COOKIE_INSEGURA_HTTP=1\n'
      fi
    } > "${APP_DIR}/.env"

    ok ".env generado (AUTH_SECRET aleatorio de 64 caracteres + DATABASE_URL de PostgreSQL y DATA_DIR)"
    unset clave_bd
  fi

  chown "${SERVICE_USER}:${SERVICE_GROUP}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  ok "Permisos del .env: 600 ${SERVICE_USER}:${SERVICE_GROUP}"
}

# ------------------------------------------------- APROVISIONAMIENTO PG
# Crea el rol de aplicación (LOGIN + CREATEDB — la restauración en caliente
# del módulo Respaldo crea bases transitorias de verificación) y su base de
# datos. Idempotente por construcción (DO block + verificación de existencia).
#
# SEGURIDAD de la contraseña (reglas del dictamen de auditoría):
#   · Se extrae del .env con python3 (urllib): jamás se hace eco por consola.
#   · Viaja al psql administrador por STDIN (heredoc del SQL), no en argv:
#     invisible para `ps aux`. Es hex de 192 bits: sin comillas ni
#     metacaracteres que romper el literal SQL (inyección imposible).
#   · La verificación de credenciales usa PGPASSWORD en el ENTORNO del
#     proceso + `--no-password` (fail-fast si faltara: sin colgar esperando
#     una entrada interactiva que nunca llegaría).
aprovisionar_postgresql() {
  paso "Aprovisionando PostgreSQL (rol ${PG_USUARIO} CREATEDB + base ${PG_BASE})"

  # Contraseña de DATABASE_URL desde el .env de la aplicación (sin eco).
  local clave_bd
  clave_bd="$(python3 - "${APP_DIR}/.env" <<'PYEOF'
import sys
from urllib.parse import urlparse
for linea in open(sys.argv[1], encoding="utf-8"):
    if linea.startswith("DATABASE_URL="):
        u = urlparse(linea.strip().split("=", 1)[1].strip().strip('"'))
        print(u.password or "")
        break
PYEOF
)"
  [[ -n "${clave_bd}" ]] || { err "No se pudo extraer la contraseña de DATABASE_URL en ${APP_DIR}/.env"; exit 1; }

  # Administración vía socket unix como usuario postgres (peer auth de
  # Ubuntu; deploy.sh corre como root → runuser, sin sudo).
  local psql_admin=(runuser -u postgres -- psql -v ON_ERROR_STOP=1)

  # Rol (idempotente): CREATEDB para las bases transitorias de verificación.
  "${psql_admin[@]}" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${PG_USUARIO}') THEN
    CREATE ROLE ${PG_USUARIO} LOGIN CREATEDB PASSWORD '${clave_bd}';
  ELSE
    ALTER ROLE ${PG_USUARIO} LOGIN CREATEDB PASSWORD '${clave_bd}';
  END IF;
END
\$\$;
SQL

  # Base de datos (CREATE DATABASE no puede vivir dentro de un DO block).
  "${psql_admin[@]}" -tAc "SELECT 1 FROM pg_database WHERE datname = '${PG_BASE}'" | grep -q 1 \
    || "${psql_admin[@]}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PG_BASE}\" OWNER \"${PG_USUARIO}\""
  ok "Rol ${PG_USUARIO} (LOGIN + CREATEDB) y base ${PG_BASE} listos (idempotente)"

  # Verificación con las credenciales REALES de la aplicación (SCRAM por
  # TCP): PGPASSWORD solo en el entorno del proceso + --no-password.
  local salida_pg
  if ! salida_pg="$(PGPASSWORD="${clave_bd}" psql --no-password -h "${PG_HOST}" -p "${PG_PUERTO}" \
        -U "${PG_USUARIO}" -d "${PG_BASE}" -tAc 'SELECT 1' 2>&1)"; then
    err "El rol ${PG_USUARIO} no pudo autenticarse contra ${PG_BASE}."
    err "Detalle: ${salida_pg}"
    exit 1
  fi
  ok "Autenticación SCRAM verificada con las credenciales de la aplicación"
  unset clave_bd
}

# ------------------------------------------------------------ COMPILACIÓN
compilar_aplicacion() {
  paso "Compilando la aplicación (como ${SERVICE_USER}, con Bun)"

  como_usuario bash -c "cd '${APP_DIR}' && bun install --frozen-lockfile"
  ok "Dependencias instaladas (bun install --frozen-lockfile)"

  como_usuario bash -c "cd '${APP_DIR}' && bunx prisma generate"
  ok "Cliente de Prisma generado"

  # Directorios de datos ANTES de tocar la BD (la app no crea directorios:
  # DATA_DIR/backups para los volcados, logs para el servicio).
  # Logs con umask 077: systemd conservará estos permisos al hacer append.
  como_usuario bash -c "cd '${APP_DIR}' && umask 077 && mkdir -p db logs && touch logs/stdout.log logs/stderr.log"

  # Branding (identidad visual): logo y favicon subidos desde la app.
  # Se excluye del rsync para no sobrescribir lo subido; 755 porque los
  # archivos se sirven al público vía /api/branding (ver ReadWritePaths).
  como_usuario bash -c "cd '${APP_DIR}' && mkdir -p branding && chmod 755 branding"

  # Esquema por MIGRACIONES (no db push): cada migración queda registrada
  # en _prisma_migrations de la base — despliegues auditables e
  # idempotentes, idéntico a docker-entrypoint.sh y setup.sh.
  como_usuario bash -c "cd '${APP_DIR}' && bunx prisma migrate deploy"
  ok "Migraciones aplicadas (prisma migrate deploy — auditable e idempotente)"

  # bun/prisma cargan .env automáticamente (DATABASE_URL e
  # INITIAL_ADMIN_PASSWORD llegan al proceso sin exponerlos en argv/ps).
  como_usuario bash -c "cd '${APP_DIR}' && bunx prisma db seed"
  ok "Semilla aplicada (roles, configuración y admin solo si la BD está vacía)"

  como_usuario bash -c "cd '${APP_DIR}' && NEXT_TELEMETRY_DISABLED=1 bun run build"
  ok "Build de producción completado (standalone)"

  # Caché del servidor standalone: única ruta escribible bajo .next
  # (la necesita Next para ISR/imágenes — ver ReadWritePaths del servicio).
  como_usuario bash -c "cd '${APP_DIR}' && mkdir -p .next/standalone/.next/cache"
  ok "Directorios de datos listos (db, logs, caché del standalone)"
}

# --------------------------------------------------------- SYSTEMD (APP)
# Genera la unidad del servicio. $1 = directorio de salida (para pruebas).
escribir_unit_app() {
  local destino="$1/${APP_SERVICE}.service"

  if [[ ! -f "${APP_DIR}/.next/standalone/server.js" ]]; then
    err "No se encontró ${APP_DIR}/.next/standalone/server.js tras la compilación."
    exit 1
  fi

  cat > "${destino}" <<EOF
# ============================================================
# CIG-MANUFACTURING v2.0.0 — Servicio de producción (systemd)
# Generado por deploy.sh — NO editar a mano (se regenera).
#
# AISLAMIENTO: el proceso solo puede escribir en db/ (DATA_DIR: respaldos
# y credenciales), logs/, branding/ y .next/standalone/.next/cache/
# (ReadWritePaths). El resto del sistema de archivos es de SOLO LECTURA
# (ProtectSystem=strict) y /home se expone en modo solo-lectura.
#
# NOTA sobre ProtectHome: la especificación original pedía
# «yes», pero eso vuelve /home INACCESIBLE y el servicio no
# podría leer ni su propio binario (.bun/bin/bun) ni su código.
# «read-only» + WritePaths logra el objetivo real: la app no
# puede modificar su propio código ni leer/escribir fuera de
# lo estrictamente permitido.
# ============================================================
[Unit]
Description=CIG Manufacturing Production Service
# La app valida la conexión a la base al arrancar (fail-fast): PostgreSQL
# debe estar listo ANTES. After ordena el arranque tras el servicio del
# motor; Wants lo levanta si estuviera detenido. Sin esto, un arranque
# simultáneo en frío provocaría reinicios en bucle mientras el motor de
# BD termina de aceptar conexiones.
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
# El servidor standalone de Next.js usa HOSTNAME/PORT como dirección y
# puerto de escucha. 127.0.0.1 deja la exposición pública a Caddy.
Environment=HOSTNAME=127.0.0.1
Environment=PORT=${APP_PORT}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${BUN_BIN} ${APP_DIR}/.next/standalone/server.js
Restart=always
RestartSec=10
StandardOutput=append:${APP_DIR}/logs/stdout.log
StandardError=append:${APP_DIR}/logs/stderr.log
UMask=0077

# === DIRECTIVAS DE AISLAMIENTO (CRÍTICAS) ===
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelLogs=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
RestrictSUIDSGID=yes
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
RemoveIPC=yes
CapabilityBoundingSet=
ReadWritePaths=${APP_DIR}/db
ReadWritePaths=${APP_DIR}/logs
ReadWritePaths=${APP_DIR}/branding
ReadWritePaths=${APP_DIR}/.next/standalone/.next/cache
# Endurecimiento adicional opcional (descomentar tras validar en producción):
# IPAddressDeny=any
# IPAddressAllow=localhost

[Install]
WantedBy=multi-user.target
EOF

  chmod 644 "${destino}"
}

# ------------------------------------------------------- SYSTEMD (CADDY)
# Genera la unidad endurecida de Caddy. $1 = directorio de salida.
escribir_unit_caddy() {
  local destino="$1/${CADDY_SERVICE}.service"
  local caddy_bin
  caddy_bin="$(command -v caddy)"

  cat > "${destino}" <<EOF
# ============================================================
# Caddy — Proxy inverso de CIG-MANUFACTURING (systemd)
# Generado por deploy.sh — NO editar a mano (se regenera).
# Basado en la unidad oficial, endurecida con las mismas
# directivas de aislamiento que el servicio de la aplicación.
# ============================================================
[Unit]
Description=Caddy (CIG-MANUFACTURING reverse proxy)
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=${caddy_bin} run --config ${CADDY_CONF_DIR}/Caddyfile
ExecReload=${caddy_bin} reload --config ${CADDY_CONF_DIR}/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
# TLS 443 sin root: capacidad mínima para bind de puertos bajos.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
# Token de Cloudflare (solo modo dominio; el fichero es opcional).
EnvironmentFile=-${CADDY_ENV_FILE}

# === DIRECTIVAS DE AISLAMIENTO (CRÍTICAS) ===
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelLogs=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictSUIDSGID=yes
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
ReadWritePaths=${CADDY_DATA_DIR}

[Install]
WantedBy=multi-user.target
EOF

  chmod 644 "${destino}"
}

# ------------------------------------------------------------- CADDYFILE
# Genera el Caddyfile. $1 = directorio de salida.
escribir_caddyfile() {
  local destino="$1/Caddyfile"

  if [[ "${USE_DOMAIN}" == "s" ]]; then
    # El token NO se escribe en el Caddyfile (legible por más usuarios):
    # viaja por {$CLOUDFLARE_API_TOKEN} desde /etc/caddy/caddy.env (600).
    cat > "${destino}" <<EOF
# ============================================================
# CIG-MANUFACTURING — Proxy inverso con TLS automático (DNS-01)
# Generado por deploy.sh — NO editar a mano (se regenera).
# Reto DNS-01: no requiere abrir el puerto 80.
# ============================================================
${DOMAIN} {
    tls {
        dns cloudflare {\$CLOUDFLARE_API_TOKEN}
    }

    header {
        Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self';"
        -Server
        -X-Powered-By
    }

    reverse_proxy 127.0.0.1:${APP_PORT} {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }
}
EOF
    # caddy.env con el token (root-only: lo lee systemd, no el usuario caddy).
    printf 'CLOUDFLARE_API_TOKEN=%s\n' "${CF_API_TOKEN}" > "${CADDY_ENV_FILE}"
    chmod 600 "${CADDY_ENV_FILE}"
    chown root:root "${CADDY_ENV_FILE}"
  else
    cat > "${destino}" <<EOF
# ============================================================
# CIG-MANUFACTURING — Proxy inverso local (sin TLS)
# Generado por deploy.sh — NO editar a mano (se regenera).
# Caddy publica :3000 y lo pasa a la app en 127.0.0.1:${APP_PORT}
# (dos sockets no pueden convivir en el mismo puerto).
# ============================================================
:3000 {
    reverse_proxy 127.0.0.1:${APP_PORT}

    header {
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
        Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self';"
        -Server
        -X-Powered-By
    }
}
EOF
    # Sin dominio no hace falta token: se elimina si quedara de otra instalación.
    rm -f "${CADDY_ENV_FILE}"
  fi

  chown root:caddy "${destino}"
  chmod 640 "${destino}"
}

# ------------------------------------------------------------ LOGROTATE
escribir_logrotate() {
  cat > "/etc/logrotate.d/${APP_SERVICE}" <<EOF
# Rotación de logs de CIG-MANUFACTURING (generado por deploy.sh)
# copytruncate: systemd mantiene abierto el descriptor de archivo.
${APP_DIR}/logs/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
  chmod 644 "/etc/logrotate.d/${APP_SERVICE}"
}

# ----------------------------------------------------------- ARRANQUE
arrancar_servicios() {
  paso "Instalando y arrancando servicios systemd"

  escribir_unit_app /etc/systemd/system
  escribir_unit_caddy /etc/systemd/system
  escribir_caddyfile "${CADDY_CONF_DIR}"
  escribir_logrotate

  # Validar el Caddyfile antes de reiniciar (con el token inyectado en un
  # subshell para no dejarlo en el entorno del script).
  (
    if [[ "${USE_DOMAIN}" == "s" && -f "${CADDY_ENV_FILE}" ]]; then
      set -a; . "${CADDY_ENV_FILE}"; set +a
    fi
    caddy validate --config "${CADDY_CONF_DIR}/Caddyfile" --adapter caddyfile >/dev/null
  )
  ok "Caddyfile validado (caddy validate)"

  systemctl daemon-reload
  systemctl enable "${APP_SERVICE}" >/dev/null
  systemctl restart "${APP_SERVICE}"
  ok "Servicio ${APP_SERVICE} habilitado y reiniciado"

  systemctl enable "${CADDY_SERVICE}" >/dev/null
  systemctl restart "${CADDY_SERVICE}"
  ok "Servicio ${CADDY_SERVICE} habilitado y reiniciado"
}

# ------------------------------------------------------- VERIFICACIONES
esperar_http() { # esperar_http <url> [segundos=30] [descripción]
  local url="$1" segundos="${2:-30}" desc="${3:-}"
  local intentos=$((segundos / 3)) i
  for ((i = 1; i <= intentos; i++)); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then
      ok "${desc} responde (${url})"
      return 0
    fi
    sleep 3
  done
  return 1
}

verificar_despliegue() {
  paso "Verificando el despliegue"

  # Motor de base de datos primero: sin él la app no puede ni arrancar
  # (fail-fast de instrumentation.ts).
  local estado_pg
  estado_pg="$(systemctl is-active postgresql || true)"
  [[ "${estado_pg}" == "active" ]] || {
    err "El servicio postgresql NO está activo (estado: ${estado_pg})."
    err "Diagnóstico: systemctl status postgresql@${PG_VERSION}-main"
    exit 1
  }
  ok "systemctl is-active postgresql → active"
  pg_isready -q -h "${PG_HOST}" -p "${PG_PUERTO}" -d "${PG_BASE}" \
    && ok "pg_isready ${PG_HOST}:${PG_PUERTO}/${PG_BASE} → aceptando conexiones" \
    || { err "pg_isready no pudo confirmar ${PG_BASE} en ${PG_HOST}:${PG_PUERTO}."; exit 1; }

  local estado_app estado_caddy
  estado_app="$(systemctl is-active "${APP_SERVICE}" || true)"
  estado_caddy="$(systemctl is-active "${CADDY_SERVICE}" || true)"
  [[ "${estado_app}" == "active" ]] || {
    err "El servicio ${APP_SERVICE} NO está activo (estado: ${estado_app})."
    err "Diagnóstico: journalctl -u ${APP_SERVICE} -n 50 --no-pager"
    err "            tail -n 50 ${APP_DIR}/logs/stderr.log"
    exit 1
  }
  ok "systemctl is-active ${APP_SERVICE} → active"

  [[ "${estado_caddy}" == "active" ]] || {
    err "El servicio ${CADDY_SERVICE} NO está activo (estado: ${estado_caddy})."
    err "Diagnóstico: journalctl -u ${CADDY_SERVICE} -n 50 --no-pager"
    exit 1
  }
  ok "systemctl is-active ${CADDY_SERVICE} → active"

  ss -tln | grep -q ":${APP_PORT} " && ok "La app escucha en 127.0.0.1:${APP_PORT}" \
    || warn "No se detectó socket :${APP_PORT} (¿tardó en arrancar?)"

  if ! esperar_http "http://127.0.0.1:${APP_PORT}/api" 90 "La aplicación"; then
    err "La aplicación no respondió en http://127.0.0.1:${APP_PORT}/api tras 90 s."
    err "Diagnóstico: journalctl -u ${APP_SERVICE} -n 50 --no-pager"
    exit 1
  fi

  if [[ "${USE_DOMAIN}" == "s" ]]; then
    if esperar_http "https://${DOMAIN}/api" 120 "HTTPS (${DOMAIN})"; then
      if curl -fsSI "https://${DOMAIN}" 2>/dev/null | grep -qi '^strict-transport-security:'; then
        ok "Cabecera Strict-Transport-Security presente"
      else
        warn "HTTPS responde pero sin cabecera Strict-Transport-Security (revisa /etc/caddy/Caddyfile)."
      fi
    else
      warn "HTTPS aún no responde en https://${DOMAIN}."
      warn "En el primer arranque el certificado DNS-01 puede tardar 1-3 minutos."
      warn "Verifica: systemctl status ${CADDY_SERVICE} y que el registro A del dominio apunte a este servidor."
    fi
  else
    if ! esperar_http "http://127.0.0.1:3000/api" 60 "Caddy (:3000)"; then
      err "Caddy no respondió en el puerto 3000."
      err "Diagnóstico: journalctl -u ${CADDY_SERVICE} -n 50 --no-pager"
      exit 1
    fi
  fi
}

# --------------------------------------------------------------- RESUMEN
resumen_final() {
  local url estado_app estado_caddy estado_pg
  if [[ "${USE_DOMAIN}" == "s" ]]; then url="https://${DOMAIN}"; else url="http://<IP-del-servidor>:3000"; fi
  estado_app="$(systemctl is-active "${APP_SERVICE}" || true)"
  estado_caddy="$(systemctl is-active "${CADDY_SERVICE}" || true)"
  estado_pg="$(systemctl is-active postgresql || true)"

  printf '\n%s============================================================%s\n' "${C_VERDE}" "${C_FIN}"
  printf '%s   DESPLIEGUE DE CIG-MANUFACTURING COMPLETADO%s\n' "${C_VERDE}" "${C_FIN}"
  printf '%s============================================================%s\n\n' "${C_VERDE}" "${C_FIN}"

  printf '  Dominio configurado ......... %s\n' "$([[ "${USE_DOMAIN}" == "s" ]] && echo "${DOMAIN}" || echo 'Local (HTTP :3000)')"
  printf '  URL de acceso ............... %s\n' "${url}"
  printf '  Usuario del sistema ......... %s (grupos: %s)\n' "${SERVICE_USER}" "$(id -nG "${SERVICE_USER}")"
  printf '  Usuario de la aplicación .... admin@cig-manufacturing.com\n'
  printf '  Contraseña del admin ........ %s\n' "${INITIAL_ADMIN_PASSWORD}"
  printf '  Servicio %-18s ......... %s\n' "${APP_SERVICE}" "${estado_app}"
  printf '  Servicio %-18s ......... %s\n' "postgresql" "${estado_pg}"
  printf '  Servicio %-18s ......... %s\n' "${CADDY_SERVICE}" "${estado_caddy}"
  printf '  Base de datos ............... PostgreSQL %s · %s@%s:%s/%s (escucha solo local)\n' \
    "${PG_VERSION}" "${PG_USUARIO}" "${PG_HOST}" "${PG_PUERTO}" "${PG_BASE}"
  printf '  Aislamiento systemd ........ ProtectSystem=strict · SystemCallFilter=@system-service\n'
  printf '  Firewall (UFW) ............. SSH %s/tcp + %s\n' "${SSH_PORT}" "$([[ "${USE_DOMAIN}" == "s" ]] && echo '443/tcp' || echo '3000/tcp')"

  printf '\n%s⚠  IMPORTANTE: cambia la contraseña del admin en el primer inicio de sesión.%s\n' "${C_AMAR}" "${C_FIN}"
  printf '%s   El sistema forzará el cambio (debeCambiarPassword=true).%s\n\n' "${C_AMAR}" "${C_FIN}"

  printf '  Comandos útiles:\n'
  printf '    systemctl status %s         # estado del servicio\n' "${APP_SERVICE}"
  printf '    journalctl -u %s -f         # logs en vivo\n' "${APP_SERVICE}"
  printf '    tail -f %s/logs/stderr.log  # errores de la app\n' "${APP_DIR}"
  printf '    systemctl status postgresql      # estado del motor de BD\n'
  printf '    sudo -u %s bash             # shell de depuración (sin sudo)\n' "${SERVICE_USER}"
  printf '\n  Documentación completa: README-DEPLOY.md\n\n'
}

# ------------------------------------------------------------------ MAIN
main() {
  printf '%s\n' "=============================================================="
  printf '%s\n' "  CIG-MANUFACTURING v2.0.0 — Despliegue de producción seguro"
  printf '%s\n\n' "=============================================================="

  verificar_precondiciones
  solicitar_datos
  endurecer_sistema
  configurar_firewall
  crear_usuario_servicio
  instalar_bun
  instalar_caddy
  instalar_postgresql
  sincronizar_codigo
  generar_env
  aprovisionar_postgresql
  compilar_aplicacion
  arrancar_servicios
  verificar_despliegue
  resumen_final
}

# Permite ejecutar directamente; al hacer `source` (pruebas) solo define funciones.
if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
