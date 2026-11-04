#!/usr/bin/env bash
# ============================================================
# CIG-MANUFACTURING — Instalación y preparación para producción
#
# Uso:   ./setup.sh
#        ADMIN_PASSWORD='TuClave123' ./setup.sh   (fija la clave del
#        administrador inicial; si no, se genera una aleatoria)
#
# Qué hace:
#   1. Genera .env (ruta absoluta de la BD + AUTH_SECRET aleatorio)
#      · Si .env ya existe, se CONSERVA (nunca se sobrescriben
#        secretos existentes) pero se VALIDA su AUTH_SECRET.
#   2. Instala dependencias (bun si está disponible; si no, npm)
#   3. Crea la base de datos SQLite con su esquema
#   4. Siembra roles y configuración; el administrador SOLO se crea
#      en una base vacía (contraseña de ADMIN_PASSWORD o aleatoria
#      guardada en db/credenciales-iniciales.txt con permisos 600)
#   5. Compila la aplicación para producción
#
# Se puede ejecutar varias veces sin romper nada (idempotente) y
# se DETIENE con código de error ante cualquier fallo crítico.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
PROYECTO_DIR="$(pwd)"

# Colores para la consola
VERDE='\033[0;32m'; AZUL='\033[1;34m'; ROJO='\033[0;31m'; SIN='\033[0m'
paso() { echo -e "\n${AZUL}▶ $1${SIN}"; }
ok()   { echo -e "${VERDE}✔ $1${SIN}"; }
fallo(){ echo -e "${ROJO}✖ $1${SIN}" >&2; exit 1; }

# Validador compartido de AUTH_SECRET (mismo criterio que la app)
# shellcheck source=scripts/validar-auth-secret.sh
source scripts/validar-auth-secret.sh

# ------------------------------------------------------------
# 1) Archivo .env
# ------------------------------------------------------------
paso "1/5 · Configurando variables de entorno"
if [ ! -f .env ]; then
  CLAVE="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > .env <<EOF
DATABASE_URL=file:${PROYECTO_DIR}/db/custom.db
AUTH_SECRET=${CLAVE}
EOF
  chmod 600 .env
  ok "Creado .env con ruta de BD y AUTH_SECRET aleatorio (64 hex)"
else
  ok ".env ya existe — se conserva (los secretos existentes nunca se sobrescriben)"
fi

# Cargar variables para los pasos siguientes
set -a; source .env; set +a

# Validar el secreto con el que se va a trabajar (exista o no se haya
# generado ahora): una clave inválida detiene la instalación.
validar_auth_secret "${AUTH_SECRET:-}" \
  || fallo "Corrige AUTH_SECRET en .env y vuelve a ejecutar ./setup.sh"
ok "AUTH_SECRET válido"

# ------------------------------------------------------------
# 2) Dependencias
# ------------------------------------------------------------
paso "2/5 · Instalando dependencias"
if command -v bun >/dev/null 2>&1; then
  RUNTIME="bun";  INSTALL="bun install";        EJECUTAR="bun"
else
  RUNTIME="npm";  INSTALL="npm ci || npm install"; EJECUTAR="npm"
fi
echo "  Runtime detectado: $RUNTIME"
$INSTALL || fallo "No se pudieron instalar las dependencias"
ok "Dependencias instaladas"

# ------------------------------------------------------------
# 3) Esquema de base de datos
# ------------------------------------------------------------
paso "3/5 · Preparando base de datos (SQLite)"
mkdir -p db
if [ "$RUNTIME" = "bun" ]; then
  bunx prisma db push --skip-generate || fallo "No se pudo aplicar el esquema (¿está bien DATABASE_URL?)"
else
  npx --yes prisma db push --skip-generate || fallo "No se pudo aplicar el esquema (¿está bien DATABASE_URL?)"
fi
ok "Esquema aplicado en ${DATABASE_URL}"

# ------------------------------------------------------------
# 4) Semilla: roles, configuración y (solo BD vacía) administrador
# ------------------------------------------------------------
paso "4/5 · Sembrando roles y configuración iniciales"
if [ "$RUNTIME" = "bun" ]; then
  bun prisma/seed.ts || fallo "La semilla falló — revisa el mensaje anterior"
else
  npx --yes tsx prisma/seed.ts || fallo "La semilla falló — revisa el mensaje anterior"
fi
ok "Semilla aplicada (el administrador inicial solo se crea si la BD no tenía usuarios)"

# ------------------------------------------------------------
# 5) Compilación de producción
# ------------------------------------------------------------
paso "5/5 · Compilando para producción"
if [ "$RUNTIME" = "bun" ]; then bun run build || fallo "La compilación falló"; else npm run build || fallo "La compilación falló"; fi
ok "Compilación completada"

echo ""
echo -e "${VERDE}============================================================${SIN}"
echo -e "${VERDE}  Instalación terminada${SIN}"
echo -e "${VERDE}============================================================${SIN}"
echo ""
echo "  Iniciar en producción:   ./start.sh"
echo "  Modo desarrollo:         ${EJECUTAR} run dev   (o bun run dev)"
echo ""
echo "  Acceso inicial:          admin@cig-manufacturing.com"
if [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "  Contraseña:              la definida en ADMIN_PASSWORD"
else
  echo "  Contraseña inicial:      db/credenciales-iniciales.txt (si la BD"
  echo "                          estaba vacía; se genera aleatoria con"
  echo "                          permisos 600). Cámbiala al entrar y borra"
  echo "                          el archivo."
fi
echo ""
echo "  Consulta DESPLIEGUE.md para PM2, systemd, Nginx, Caddy y Docker."
