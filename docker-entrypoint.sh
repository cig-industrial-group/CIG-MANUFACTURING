#!/usr/bin/env bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# ============================================================
# CIG-MANUFACTURING — Entrypoint del contenedor de producción
# (app + servidor PostgreSQL externo, ver docker-compose.yml)
#
# Orden de operaciones (cualquier fallo DETIENE el arranque):
#   1. Validar AUTH_SECRET (obligatorio, ≥32 chars, no publicado).
#   2. Validar DATABASE_URL (URL de PostgreSQL).
#   3. Esperar a que el servidor de BD acepte conexiones (pg_isready,
#      hasta 120 s: compose ya aplica su healthcheck, esto absorbe
#      arranques en frío más lentos).
#   4. Aplicar migraciones (prisma migrate deploy — auditable y
#      idempotente: registra cada migración aplicada en la base).
#   5. Sembrar roles/config (idempotente); el usuario ADMIN solo se
#      crea en una base SIN usuarios (primera instalación).
#   6. Localizar server.js del standalone y ejecutarlo con bun.
#
# Nunca imprime secretos (DATABASE_URL se valida por formato, jamás
# se hace eco de su contenido). Ante error crítico: mensaje claro +
# exit 1 (Docker marca el contenedor como fallido; restart-policy
# reintenta, pero el proceso jamás "sigue adelante" a medias).
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
# 2) Base de datos: URL de PostgreSQL presente y con formato válido
# ------------------------------------------------------------
: "${DATABASE_URL:?✖ DATABASE_URL no está definida (esperado: postgresql://usuario:clave@host:5432/base?schema=public)}"

if [[ "$DATABASE_URL" != postgresql://* && "$DATABASE_URL" != postgres://* ]]; then
  echo "✖ DATABASE_URL debe ser una URL de PostgreSQL (postgresql://usuario:clave@host:puerto/base)."
  echo "  Formato recibido: no soportado. Si conservas una URL file: de la era"
  echo "  SQLite, migra la configuración con ayuda de .env.example."
  exit 1
fi

# Componentes de conexión (host/puerto/usuario/base — sin la contraseña,
# que solo viaja por la variable de entorno del proceso de la app).
# El parseo se hace con el runtime Bun (new URL maneja el
# percent-encoding de credenciales que bash no decodifica).
if ! mapfile -t PG_CONF < <(bun -e '
  try {
    const u = new URL(process.env.DATABASE_URL || "");
    const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
    console.log([u.hostname, u.port || "5432", dec(u.username), decodeURIComponent(u.pathname.replace(/^\/+/, ""))].join("\n"));
  } catch { process.exit(1); }
'); then
  echo "✖ DATABASE_URL no es una URL válida."
  exit 1
fi
PGHOST="${PG_CONF[0]:-postgres}"
PGPORT="${PG_CONF[1]:-5432}"
PGUSER="${PG_CONF[2]:-postgres}"
PGDATABASE="${PG_CONF[3]:-cig_manufacturing}"

# ------------------------------------------------------------
# 3) Esperar al servidor de PostgreSQL (pg_isready, hasta 120 s)
# ------------------------------------------------------------
echo "▶ Esperando PostgreSQL en ${PGHOST}:${PGPORT} (base: ${PGDATABASE})…"
espera=0
until pg_isready -q -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE"; do
  espera=$((espera + 2))
  if [ "$espera" -ge 120 ]; then
    echo "✖ PostgreSQL no acepta conexiones tras 120 s (${PGHOST}:${PGPORT})."
    echo "  Diagnóstico: docker compose logs postgres"
    exit 1
  fi
  sleep 2
done
echo "✔ PostgreSQL acepta conexiones"

# ------------------------------------------------------------
# 4) Migraciones (migrate deploy): fallo aquí = arranque detenido.
#    Auditable e idempotente: cada migración queda registrada en la
#    tabla _prisma_migrations de la base.
# ------------------------------------------------------------
echo "▶ Aplicando migraciones de base de datos…"
bunx prisma migrate deploy
echo "✔ Migraciones aplicadas"

# ------------------------------------------------------------
# 5) Semilla: roles/config idempotentes; ADMIN solo en BD vacía
# ------------------------------------------------------------
echo "▶ Sembrando roles y configuración…"
bun prisma/seed.ts
echo "✔ Semilla aplicada"

# ------------------------------------------------------------
# 6) Servidor standalone (compilado en la imagen) con bun
# ------------------------------------------------------------
SERVER_JS="$(find .next/standalone -maxdepth 5 -name server.js -not -path '*node_modules*' | head -1)"
if [ -z "$SERVER_JS" ]; then
  echo "✖ No se encontró server.js dentro de .next/standalone — la imagen se compiló incorrectamente."
  exit 1
fi

echo "▶ CIG-MANUFACTURING escuchando en http://0.0.0.0:${PORT:-3000}"
exec bun "$SERVER_JS"
