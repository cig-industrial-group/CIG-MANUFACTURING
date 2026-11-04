#!/usr/bin/env bash
# ============================================================
# CIG-MANUFACTURING — Entrypoint del contenedor de producción
#
# Orden de operaciones (cualquier fallo DETIENE el arranque):
#   1. Validar AUTH_SECRET (obligatorio, ≥32 chars, no publicado).
#   2. Validar DATABASE_URL y que /data sea escribible.
#   3. Aplicar el esquema de base de datos (prisma db push).
#   4. Sembrar roles/config (idempotente); el usuario ADMIN solo se
#      crea en una base SIN usuarios (primera instalación).
#   5. Localizar server.js del standalone y ejecutarlo con bun.
#
# Nunca imprime secretos. Ante error crítico: mensaje claro + exit 1
# (Docker marca el contenedor como fallido; restart-policy reintenta,
# pero el proceso jamás "sigue adelante" con el sistema a medias).
# ============================================================
set -euo pipefail
cd /app

# Cargar el validador compartido
# shellcheck source=scripts/validar-auth-secret.sh
source scripts/validar-auth-secret.sh

echo "▶ CIG-MANUFACTURING — Iniciando contenedor de producción"

# ------------------------------------------------------------
# 1) AUTH_SECRET: obligatorio y válido (nunca se imprime el valor)
# ------------------------------------------------------------
if ! validar_auth_secret "${AUTH_SECRET:-}"; then
  echo "✖ El contenedor NO puede iniciar con un secreto de firmado inválido."
  exit 1
fi
echo "✔ AUTH_SECRET presente y válido"

# Aviso explícito si se deshabilita la cookie segura (solo LAN sin TLS)
if [ "${COOKIE_INSEGURA_HTTP:-}" = "1" ]; then
  echo "⚠ COOKIE_INSEGURA_HTTP=1: la cookie de sesión viajará por HTTP claro."
  echo "  Úsalo solo en redes internas de confianza sin TLS."
fi

# ------------------------------------------------------------
# 2) Base de datos: variable presente y destino escribible
# ------------------------------------------------------------
: "${DATABASE_URL:?✖ DATABASE_URL no está definida (esperado: file:/data/cig-manufacturing.db)}"

if [[ "$DATABASE_URL" != file:* ]]; then
  echo "✖ DATABASE_URL debe apuntar a un archivo SQLite (formato file:ruta). Valor recibido: formato no soportado."
  exit 1
fi

RUTA_BD="${DATABASE_URL#file:}"
DIR_BD="$(dirname "$RUTA_BD")"
mkdir -p "$DIR_BD" 2>/dev/null || true
if ! touch "$RUTA_BD" 2>/dev/null; then
  echo "✖ No se puede escribir la base de datos en: $RUTA_BD"
  echo "  Si el volumen proviene de una instalación anterior (propietario root),"
  echo "  corrige la propiedad con:  docker compose exec cig-manufacturing true || \\"
  echo "    docker run --rm -v cig-manufacturing-data:/data alpine chown -R 1000:1000 /data"
  exit 1
fi
echo "✔ Base de datos accesible: $RUTA_BD"

# ------------------------------------------------------------
# 3) Esquema (db push): fallo aquí = arranque detenido
# ------------------------------------------------------------
echo "▶ Aplicando esquema de base de datos…"
bunx prisma db push --skip-generate
echo "✔ Esquema aplicado"

# ------------------------------------------------------------
# 4) Semilla: roles/config idempotentes; ADMIN solo en BD vacía
# ------------------------------------------------------------
echo "▶ Sembrando roles y configuración…"
bun prisma/seed.ts
echo "✔ Semilla aplicada"

# ------------------------------------------------------------
# 5) Servidor standalone (compilado en la imagen) con bun
# ------------------------------------------------------------
SERVER_JS="$(find .next/standalone -maxdepth 5 -name server.js -not -path '*node_modules*' | head -1)"
if [ -z "$SERVER_JS" ]; then
  echo "✖ No se encontró server.js dentro de .next/standalone — la imagen se compiló incorrectamente."
  exit 1
fi

echo "▶ CIG-MANUFACTURING escuchando en http://0.0.0.0:${PORT:-3000}"
exec bun "$SERVER_JS"
