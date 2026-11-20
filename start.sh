#!/usr/bin/env bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# ============================================================
# CIG-MANUFACTURING — Arranque en producción (servidor standalone)
#
# Uso:   ./start.sh           (puerto 3000)
#        PORT=8080 ./start.sh (otro puerto)
#
# Requiere haber ejecutado antes ./setup.sh
#
# El proceso se DETIENE con error si falta: .env, compilación,
# DATABASE_URL o un AUTH_SECRET válido. Runtime preferido: bun
# (mismo que compila y prueba la CI); fallback: node.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

ROJO='\033[0;31m'; SIN='\033[0m'
fallo(){ echo -e "${ROJO}✖ $1${SIN}" >&2; exit 1; }

if [ ! -f .env ]; then
  fallo "No existe .env — ejecuta primero ./setup.sh (o copia .env.example a .env)"
fi
if [ ! -d .next/standalone ]; then
  fallo "Falta la compilación de producción — ejecuta ./setup.sh o bun run build"
fi

# Cargar variables del .env (DATABASE_URL y AUTH_SECRET)
set -a; source .env; set +a

# Validador compartido (mismo criterio que la aplicación)
# shellcheck source=scripts/validar-auth-secret.sh
source scripts/validar-auth-secret.sh
validar_auth_secret "${AUTH_SECRET:-}" \
  || fallo "El servidor NO puede iniciar con un AUTH_SECRET inválido. Corrígelo en .env"

[ -n "${DATABASE_URL:-}" ] || fallo "DATABASE_URL no está definida en .env"

# Localizar server.js dentro del standalone (su ubicación puede variar según
# la estructura del workspace donde se compiló)
SERVER_JS="$(find .next/standalone -maxdepth 5 -name server.js -not -path "*node_modules*" | head -1)"
if [ -z "$SERVER_JS" ]; then
  fallo "No se encontró server.js dentro de .next/standalone — ejecuta ./setup.sh o bun run build"
fi

# El servidor standalone de Next.js usa la variable HOSTNAME como dirección
# de escucha. Problema: bash ya define HOSTNAME con el nombre de la máquina,
# lo que rompe el enlace. Por eso se FUERZA 0.0.0.0 (todas las interfaces).
# Para escuchar solo en localhost o en una IP concreta, define BIND_HOST:
#     BIND_HOST=127.0.0.1 ./start.sh
export HOSTNAME="${BIND_HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export NODE_ENV=production

# Aviso si se desactiva la cookie Secure (solo LAN sin TLS)
if [ "${COOKIE_INSEGURA_HTTP:-}" = "1" ]; then
  echo "⚠ COOKIE_INSEGURA_HTTP=1: la cookie de sesión viajará por HTTP claro (solo redes internas de confianza)."
fi

# Runtime: preferir bun (el de la CI); si no existe, node
if command -v bun >/dev/null 2>&1; then
  echo "▶ CIG-MANUFACTURING escuchando en http://$HOSTNAME:$PORT (runtime: bun)"
  exec bun "$SERVER_JS"
else
  command -v node >/dev/null 2>&1 \
    || fallo "No se encontró bun ni node — instala Bun (recomendado) o Node.js"
  echo "▶ CIG-MANUFACTURING escuchando en http://$HOSTNAME:$PORT (runtime: node)"
  exec node "$SERVER_JS"
fi
