#!/usr/bin/env bash
# ============================================================
# CIG-MANUFACTURING — Instalación y preparación para producción
#
# Uso:   ./setup.sh
#
# Qué hace:
#   1. Genera .env (ruta absoluta de la BD + AUTH_SECRET aleatorio)
#   2. Instala dependencias (bun si está disponible; si no, npm)
#   3. Crea la base de datos SQLite con su esquema
#   4. Siembra roles, usuarios iniciales y configuración (idempotente)
#   5. Compila la aplicación para producción
#
# Se puede ejecutar varias veces sin romper nada.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
PROYECTO_DIR="$(pwd)"

# Colores para la consola
VERDE='\033[0;32m'; AZUL='\033[1;34m'; AMAR='\033[1;33m'; SIN='\033[0m'
paso() { echo -e "\n${AZUL}▶ $1${SIN}"; }
ok()   { echo -e "${VERDE}✔ $1${SIN}"; }

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
  ok "Creado .env con ruta de BD y AUTH_SECRET aleatorio"
else
  ok ".env ya existe — se conserva"
fi
# Cargar variables para los pasos siguientes
set -a; source .env; set +a

# ------------------------------------------------------------
# 2) Dependencias
# ------------------------------------------------------------
paso "2/5 · Instalando dependencias"
if command -v bun >/dev/null 2>&1; then
  RUNTIME="bun";  INSTALL="bun install";        EJECUTAR="bun"
else
  RUNTIME="npm";  INSTALL="npm install";        EJECUTAR="npm"
fi
echo "  Runtime detectado: $RUNTIME"
$INSTALL
ok "Dependencias instaladas"

# ------------------------------------------------------------
# 3) Esquema de base de datos
# ------------------------------------------------------------
paso "3/5 · Preparando base de datos (SQLite)"
mkdir -p db
if [ "$RUNTIME" = "bun" ]; then
  bunx prisma db push --skip-generate
else
  npx --yes prisma db push --skip-generate
fi
ok "Esquema aplicado en ${DATABASE_URL}"

# ------------------------------------------------------------
# 4) Semilla: roles, usuarios y configuración del sistema
# ------------------------------------------------------------
paso "4/5 · Sembrando roles y usuarios iniciales"
if [ "$RUNTIME" = "bun" ]; then
  bun prisma/seed.ts
else
  npx --yes tsx prisma/seed.ts
fi
ok "Usuarios listos"

# ------------------------------------------------------------
# 5) Compilación de producción
# ------------------------------------------------------------
paso "5/5 · Compilando para producción"
if [ "$RUNTIME" = "bun" ]; then bun run build; else npm run build; fi
ok "Compilación completada"

echo ""
echo -e "${VERDE}============================================================${SIN}"
echo -e "${VERDE}  Instalación terminada${SIN}"
echo -e "${VERDE}============================================================${SIN}"
echo ""
echo "  Iniciar en producción:   ./start.sh"
echo "  Modo desarrollo:         ${EJECUTAR} run dev   (o bun run dev)"
echo ""
echo -e "${AMAR}Cuentas iniciales (cambia las contraseñas al entrar):${SIN}"
echo "    admin@cig-manufacturing.com  /  Admin*2024   (Administrador)"
echo "    ti@cig-manufacturing.com     /  Ti*2024      (Departamento de TI)"
echo ""
echo "  Consulta DESPLIEGUE.md para PM2, systemd, Nginx y Docker."
