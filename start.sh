#!/usr/bin/env bash
# ============================================================
# CIG-MANUFACTURING — Arranque en producción (servidor standalone)
#
# Uso:   ./start.sh           (puerto 3000)
#        PORT=8080 ./start.sh (otro puerto)
#
# Requiere haber ejecutado antes ./setup.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "✖ No existe .env — ejecuta primero ./setup.sh (o copia .env.example a .env)"
  exit 1
fi
if [ ! -d .next/standalone ]; then
  echo "✖ Falta la compilación de producción — ejecuta ./setup.sh o npm run build"
  exit 1
fi

# Cargar variables del .env (DATABASE_URL y AUTH_SECRET)
set -a; source .env; set +a

# Localizar server.js dentro del standalone (su ubicación puede variar según
# la estructura del workspace donde se compiló)
SERVER_JS="$(find .next/standalone -maxdepth 5 -name server.js -not -path "*node_modules*" | head -1)"
if [ -z "$SERVER_JS" ]; then
  echo "✖ No se encontró server.js dentro de .next/standalone — ejecuta ./setup.sh o npm run build"
  exit 1
fi

# El servidor standalone de Next.js usa la variable HOSTNAME como dirección
# de escucha. Problema: bash ya define HOSTNAME con el nombre de la máquina,
# lo que rompe el enlace. Por eso se FUERZA 0.0.0.0 (todas las interfaces).
# Para escuchar solo en localhost o en una IP concreta, define BIND_HOST:
#     BIND_HOST=127.0.0.1 ./start.sh
export HOSTNAME="${BIND_HOST:-0.0.0.0}"
export PORT="${PORT:-3000}"
export NODE_ENV=production

echo "▶ CIG-MANUFACTURING escuchando en http://$HOSTNAME:$PORT"
exec node "$SERVER_JS"
