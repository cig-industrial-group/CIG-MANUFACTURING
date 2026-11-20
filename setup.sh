#!/usr/bin/env bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# ============================================================
# CIG-MANUFACTURING — Instalación y preparación para producción
# (PostgreSQL 16+)
#
# Uso:   ./setup.sh
#        ADMIN_PASSWORD='TuClave123' ./setup.sh   (fija la clave del
#        administrador inicial; si no, se genera una aleatoria)
#
# Qué hace:
#   1. Genera/actualiza .env:
#      · AUTH_SECRET aleatorio (se CONSERVA si ya existe)
#      · DATABASE_URL de PostgreSQL (si el .env trae una URL file: del
#        motor de archivo anterior, se actualiza a PostgreSQL conservando el resto)
#      · DATA_DIR (raíz de respaldos/branding/credenciales)
#   2. Instala dependencias (bun si está disponible; si no, npm)
#   3. Aprovisiona rol y base de datos en el servidor PostgreSQL local
#      (CREATE ROLE … CREATEDB + CREATE DATABASE; idempotente). Si no
#      puede (sin sudo/psql), escribe instrucciones-postgres.txt con el
#      SQL exacto para ejecutar como administrador.
#   4. Aplica las migraciones (prisma migrate deploy) y siembra roles,
#      configuración y (solo BD vacía) el administrador.
#   5. Compila la aplicación para producción
#
# Se puede ejecutar varias veces sin romper nada (idempotente) y
# se DETIENE con código de error ante cualquier fallo crítico.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"
PROYECTO_DIR="$(pwd)"

# Colores para la consola
VERDE='\033[0;32m'; AZUL='\033[1;34m'; ROJO='\033[0;31m'; AMAR='\033[1;33m'; SIN='\033[0m'
paso() { echo -e "\n${AZUL}▶ $1${SIN}"; }
ok()   { echo -e "${VERDE}✔ $1${SIN}"; }
aviso(){ echo -e "${AMAR}⚠ $1${SIN}" >&2; }
fallo(){ echo -e "${ROJO}✖ $1${SIN}" >&2; exit 1; }

# Validador compartido de AUTH_SECRET (mismo criterio que la app)
# shellcheck source=scripts/validar-auth-secret.sh
source scripts/validar-auth-secret.sh

# --- Parámetros de la base de datos local -------------------
PG_HOST="localhost"
PG_PUERTO="5432"
PG_USUARIO="cig_manufacturing"
PG_BASE="cig_manufacturing"

# ------------------------------------------------------------
# 1) Archivo .env
# ------------------------------------------------------------
paso "1/6 · Configurando variables de entorno (PostgreSQL)"
if [ ! -f .env ]; then
  CLAVE="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  CLAVE_BD="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  cat > .env <<EOF
DATABASE_URL=postgresql://${PG_USUARIO}:${CLAVE_BD}@${PG_HOST}:${PG_PUERTO}/${PG_BASE}?schema=public
DATA_DIR=${PROYECTO_DIR}/db
AUTH_SECRET=${CLAVE}
EOF
  chmod 600 .env
  ok "Creado .env con URL de PostgreSQL + DATA_DIR y AUTH_SECRET aleatorio"
else
  # Actualización desde el motor de archivo anterior: la URL file: ya
  # no es válida. Se sustituye SOLO la línea DATABASE_URL (los secretos
  # existentes, como AUTH_SECRET, jamás se tocan) y se añade DATA_DIR si falta.
  if grep -qE '^DATABASE_URL=["'"'"']?file:' .env; then
    CLAVE_BD="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    python3 - "$CLAVE_BD" <<'PYEOF' || fallo "No se pudo actualizar .env (¿está python3 disponible?)"
import sys
clave_bd = sys.argv[1]
lineas = open(".env").read().splitlines()
salida = []
hay_data_dir = False
for l in lineas:
    if l.startswith("DATABASE_URL="):
        salida.append(f"DATABASE_URL=postgresql://cig_manufacturing:{clave_bd}@localhost:5432/cig_manufacturing?schema=public")
    else:
        if l.startswith("DATA_DIR="):
            hay_data_dir = True
        salida.append(l)
if not hay_data_dir:
    salida.append("DATA_DIR=" + __import__("os").getcwd() + "/db")
open(".env", "w").write("\n".join(salida) + "\n")
PYEOF
    ok ".env actualizado: DATABASE_URL migrada de file: a PostgreSQL; el resto se conservó"
  else
    ok ".env ya existe — se conserva (los secretos existentes nunca se sobrescriben)"
  fi
fi

# Cargar variables para los pasos siguientes
set -a; source .env; set +a

# Validar el secreto con el que se va a trabajar (exista o no se haya
# generado ahora): una clave inválida detiene la instalación.
validar_auth_secret "${AUTH_SECRET:-}" \
  || fallo "Corrige AUTH_SECRET en .env y vuelve a ejecutar ./setup.sh"
ok "AUTH_SECRET válido"

# Validar formato de DATABASE_URL (PostgreSQL)
case "${DATABASE_URL}" in
  postgresql://*|postgres://*) ok "DATABASE_URL es una URL de PostgreSQL" ;;
  *) fallo "DATABASE_URL no es una URL de PostgreSQL (postgresql://usuario:clave@host:puerto/base). Revisa .env" ;;
esac

# DATA_DIR presente (o se usa el defecto ./db de la app)
mkdir -p "${DATA_DIR:-db}"
ok "Directorio de datos: ${DATA_DIR:-db} (respaldos, branding, credenciales)"

# ------------------------------------------------------------
# 2) Dependencias
# ------------------------------------------------------------
paso "2/6 · Instalando dependencias"
if command -v bun >/dev/null 2>&1; then
  RUNTIME="bun";  INSTALL="bun install";        EJECUTAR="bun"
else
  RUNTIME="npm";  INSTALL="npm ci || npm install"; EJECUTAR="npm"
fi
echo "  Runtime detectado: $RUNTIME"
$INSTALL || fallo "No se pudieron instalar las dependencias"
ok "Dependencias instaladas"

# Cliente de PostgreSQL para el módulo de respaldo (pg_dump/pg_restore)
if command -v pg_dump >/dev/null 2>&1; then
  ok "Cliente de PostgreSQL presente: $(pg_dump --version 2>/dev/null | head -1)"
else
  aviso "pg_dump/pg_restore NO están en el PATH: el módulo de Respaldo no podrá operar."
  aviso "  Instálalos (Ubuntu/Debian): apt install postgresql-client-16 (repositorio PGDG)"
  aviso "  La instalación puede continuar: solo el respaldo en caliente los requiere."
fi

# ------------------------------------------------------------
# 3) Rol y base de datos en PostgreSQL (idempotente)
# ------------------------------------------------------------
paso "3/6 · Aprovisionando rol y base de datos (${PG_USUARIO}@${PG_HOST}:${PG_PUERTO}/${PG_BASE})"

# Extraer la contraseña de la app desde el DATABASE_URL del .env (sin
# hacer eco del valor; solo viaja al SQL ejecutado como administrador).
CLAVE_BD="$(python3 - <<'PYEOF'
import os
from urllib.parse import urlparse
u = urlparse(os.environ.get("DATABASE_URL", ""))
print(u.password or "")
PYEOF
)"

provisionar() {
  # $1 = comando psql de administración disponible (o vacío)
  local PSQL_ADMIN="$1"
  [ -n "$PSQL_ADMIN" ] || return 1
  # Idempotente por construcción: DO blocks con IF NOT EXISTS.
  "$PSQL_ADMIN" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${PG_USUARIO}') THEN
    CREATE ROLE ${PG_USUARIO} LOGIN CREATEDB PASSWORD '${CLAVE_BD}';
  ELSE
    ALTER ROLE ${PG_USUARIO} LOGIN CREATEDB PASSWORD '${CLAVE_BD}';
  END IF;
END
\$\$;
SQL
  # La base se crea aparte (CREATE DATABASE no puede vivir en DO block).
  "$PSQL_ADMIN" -tAc "SELECT 1 FROM pg_database WHERE datname = '${PG_BASE}'" | grep -q 1 \
    || "$PSQL_ADMIN" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PG_BASE}\" OWNER \"${PG_USUARIO}\""
}

PSQL_ADMIN=""
if command -v psql >/dev/null 2>&1; then
  # Opción A: acceso administrativo vía socket unix como usuario postgres.
  if sudo -n -u postgres -- psql -tAc "SELECT 1" >/dev/null 2>&1; then
    PSQL_ADMIN="sudo -n -u postgres -- psql"
  # Opción B: el usuario actual es superusuario de PG (PeerAuth).
  elif psql -tAc "SELECT 1" >/dev/null 2>&1 && psql -tAc "SELECT rolsuper FROM pg_roles WHERE rolname = current_user" 2>/dev/null | grep -q t; then
    PSQL_ADMIN="psql"
  fi
fi

if [ -n "$PSQL_ADMIN" ]; then
  if provisionar "$PSQL_ADMIN"; then
    ok "Rol ${PG_USUARIO} (CREATEDB) y base ${PG_BASE} listos (idempotente)"
  else
    fallo "El aprovisionamiento falló — revisa el SQL/administrador de PostgreSQL"
  fi
else
  # Sin acceso administrativo: instrucciones exactas para el operador.
  INSTRUCCIONES="${DATA_DIR:-db}/instrucciones-postgres.txt"
  umask 077
  cat > "$INSTRUCCIONES" <<EOF
CIG-MANUFACTURING — Aprovisionamiento manual de PostgreSQL
============================================================
Ejecuta como administrador (sudo -u postgres psql) el siguiente SQL:

DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${PG_USUARIO}') THEN
    CREATE ROLE ${PG_USUARIO} LOGIN CREATEDB PASSWORD '${CLAVE_BD}';
  ELSE
    ALTER ROLE ${PG_USUARIO} LOGIN CREATEDB PASSWORD '${CLAVE_BD}';
  END IF;
END
\$\$;

CREATE DATABASE "${PG_BASE}" OWNER "${PG_USUARIO}";

Luego vuelve a ejecutar ./setup.sh y ELIMINA este archivo (contiene
la contraseña de la base de datos; .env ya la tiene).
EOF
  umask 022
  ok "Sin acceso administrativo a PostgreSQL: instrucciones escritas en ${INSTRUCCIONES} (permisos 600)"
  fallo "Ejecuta el SQL de ${INSTRUCCIONES} como administrador y vuelve a correr ./setup.sh"
fi

# Esperar a que el servidor acepte conexiones con las credenciales nuevas.
if command -v pg_isready >/dev/null 2>&1; then
  intentos=0
  until PGPASSWORD="$CLAVE_BD" pg_isready -q -h "$PG_HOST" -p "$PG_PUERTO" -d "$PG_BASE" -U "$PG_USUARIO"; do
    intentos=$((intentos + 1))
    [ "$intentos" -ge 10 ] && fallo "PostgreSQL no responde en ${PG_HOST}:${PG_PUERTO} — ¿está en ejecución?"
    sleep 1
  done
fi
ok "Servidor PostgreSQL accesible"

# ------------------------------------------------------------
# 4) Esquema (migrate deploy) + semilla
# ------------------------------------------------------------
paso "4/6 · Aplicando migraciones y sembrando datos iniciales"
if [ "$RUNTIME" = "bun" ]; then
  bunx prisma generate || fallo "No se pudo generar el cliente de Prisma"
  bunx prisma migrate deploy || fallo "No se pudieron aplicar las migraciones (¿está bien DATABASE_URL?)"
  bun prisma/seed.ts || fallo "La semilla falló — revisa el mensaje anterior"
else
  npx --yes prisma generate || fallo "No se pudo generar el cliente de Prisma"
  npx --yes prisma migrate deploy || fallo "No se pudieron aplicar las migraciones (¿está bien DATABASE_URL?)"
  npx --yes tsx prisma/seed.ts || fallo "La semilla falló — revisa el mensaje anterior"
fi
ok "Migraciones aplicadas y semilla ejecutada (el administrador inicial solo se crea si la BD no tenía usuarios)"

# ------------------------------------------------------------
# 5) Compilación de producción
# ------------------------------------------------------------
paso "5/6 · Compilando para producción"
if [ "$RUNTIME" = "bun" ]; then bun run build || fallo "La compilación falló"; else npm run build || fallo "La compilación falló"; fi
ok "Compilación completada"

# ------------------------------------------------------------
# 6) Resumen
# ------------------------------------------------------------
paso "6/6 · Listo"
unset CLAVE_BD
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
  echo "  Contraseña inicial:      ${DATA_DIR:-db}/credenciales-iniciales.txt (si la BD"
  echo "                          estaba vacía; se genera aleatoria con"
  echo "                          permisos 600). Cámbiala al entrar y borra"
  echo "                          el archivo."
fi
echo ""
echo "  Consulta DESPLIEGUE.md para PM2, systemd, Nginx, Caddy y Docker."
