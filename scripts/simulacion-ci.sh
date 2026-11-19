#!/bin/bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# ============================================================
# SIMULACIÓN LOCAL DEL PIPELINE DE CI
# Replica .github/workflows/ci.yml sin necesidad de GitHub:
#   guardia de config -> guardia de secretos -> prisma -> lint ->
#   build -> tipos -> humo real (BD PostgreSQL efímera + migraciones +
#   semilla + servidor standalone + API + login + sesión + rate-limit)
#
# Uso (desde la raíz del proyecto, en un checkout limpio):
#   bash scripts/simulacion-ci.sh
#
# Requisito: PostgreSQL 16+ local accesible (igual que el CI real, que
# usa el servicio contenedor postgres:16). La simulación crea una base
# EFÍMERA y la ELIMINA al salir; los secretos se generan ALEATORIOS en
# cada ejecución (el repositorio no publica valores fijos).
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

paso() { echo ""; echo "──── $1 ────"; }
fallo() { echo "  ✘ $1" >&2; exit 1; }
fallo_postgres() {
  echo "  ✘ La simulación necesita PostgreSQL 16+ local accesible" >&2
  echo "    (sudo -n -u postgres psql, o superusuario por TCP en" >&2
  echo "     \"${PG_HOST}:${PG_PUERTO}\"). Es la réplica del servicio" >&2
  echo "    postgres:16 que usa el CI real. Arranca el servidor y reintenta." >&2
  exit 1
}

PUERTO="${PUERTO_CI:-3100}"
# Secretos ALEATORIOS de esta ejecución (nada publicado en el repo; el
# servidor de producción valida AUTH_SECRET al arrancar, igual que el CI).
AUTH_SECRET="$(openssl rand -hex 32)"
ADMIN_PASSWORD="Ci-$(openssl rand -hex 12)"
export AUTH_SECRET ADMIN_PASSWORD
DIR_TMP="$(mktemp -d)"
PID_SERVIDOR=""
export NEXT_TELEMETRY_DISABLED=1
export DATA_DIR="${DIR_TMP}/datos"
mkdir -p "$DATA_DIR"

# ── Base de datos PostgreSQL EFÍMERA (réplica local del servicio
#    postgres:16 del CI real). Se crea en el PostgreSQL local del
#    desarrollador y se ELIMINA al salir; el rol se reutiliza entre
#    ejecuciones con contraseña nueva (patrón de setup.sh).
PG_HOST="${PGHOST:-127.0.0.1}"
PG_PUERTO="${PGPORT:-5432}"
PG_BASE="cig_ci_$(date +%s)_$RANDOM"
PG_USUARIO_CI="cig_ci"
PG_CLAVE_CI="$(openssl rand -hex 12)"

comando_admin() { # psql administrativo disponible (o vacío)
  if command -v psql >/dev/null 2>&1; then
    if sudo -n -u postgres -- psql -tAc "SELECT 1" >/dev/null 2>&1; then
      echo "sudo -n -u postgres -- psql"; return
    fi
    if psql -h "$PG_HOST" -p "$PG_PUERTO" -tAc "SELECT 1" >/dev/null 2>&1 \
       && psql -h "$PG_HOST" -p "$PG_PUERTO" -tAc "SELECT rolsuper FROM pg_roles WHERE rolname = current_user" 2>/dev/null | grep -q t; then
      echo "psql -h $PG_HOST -p $PG_PUERTO"; return
    fi
  fi
  echo ""
}

PSQL_ADMIN="$(comando_admin)"
[ -n "$PSQL_ADMIN" ] || fallo_postgres
pg_isready -h "$PG_HOST" -p "$PG_PUERTO" -q \
  || fallo_postgres

$PSQL_ADMIN -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${PG_USUARIO_CI}') THEN
    CREATE ROLE ${PG_USUARIO_CI} LOGIN CREATEDB PASSWORD '${PG_CLAVE_CI}';
  ELSE
    ALTER ROLE ${PG_USUARIO_CI} LOGIN CREATEDB PASSWORD '${PG_CLAVE_CI}';
  END IF;
END
\$\$;
SQL
$PSQL_ADMIN -tAc "SELECT 1 FROM pg_database WHERE datname = '${PG_BASE}'" | grep -q 1 \
  || $PSQL_ADMIN -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PG_BASE}\" OWNER \"${PG_USUARIO_CI}\""

export DATABASE_URL="postgresql://${PG_USUARIO_CI}:${PG_CLAVE_CI}@${PG_HOST}:${PG_PUERTO}/${PG_BASE}?schema=public"

limpiar() {
  [ -n "$PID_SERVIDOR" ] && kill "$PID_SERVIDOR" 2>/dev/null || true
  rm -rf "$DIR_TMP"
  [ -n "$PSQL_ADMIN" ] && $PSQL_ADMIN -q -c "DROP DATABASE IF EXISTS \"${PG_BASE}\"" >/dev/null 2>&1 || true
}
trap limpiar EXIT

paso "1/9 Guardia: ignoreBuildErrors desactivado"
grep -nE 'ignoreBuildErrors[[:space:]]*:[[:space:]]*true' next.config.ts \
  && fallo "typescript.ignoreBuildErrors está en true (revísalo)"
grep -nE 'ignoreDuringBuilds[[:space:]]*:[[:space:]]*true' next.config.ts \
  && fallo "eslint.ignoreDuringBuilds está en true (revísalo)"
echo "  ✔ ignoreBuildErrors e ignoreDuringBuilds no están habilitados"

paso "2/9 Guardia: sin secretos inseguros en el código"
# La lista negra de valores prohibidos vive POR DISEÑO en seguridad.ts,
# validar-auth-secret.sh y deploy.sh (para RECHAZARLOS); se excluyen de
# la búsqueda. docs/ también se excluye: la documentación cita esos
# valores como ejemplos de la lista negra (documenta el bloqueo, no usa
# el secreto). La guardia vigila código.
# Aquí se detectan PATRONES DE USO inseguros:
#   1) fallback con literal: AUTH_SECRET ?? "..." / || "..."
#   2) fallback en orquestación: ${AUTH_SECRET:-...}
#   3) credenciales fijas publicadas (patrones históricos Admin/Ti del 2024)
#   4) los secretos de desarrollo históricos usados como valor fuera de la lista negra
PROBLEMA=0
if grep -rn --include='*.ts' --include='*.tsx' -E 'AUTH_SECRET[[:space:]]*(\?\?|\|\|)[[:space:]]*["'"'"']' src/; then
  fallo "Fallback de AUTH_SECRET con literal en src/ (elimínalo: el secreto es obligatorio)"
fi
if grep -n 'AUTH_SECRET.*:-' docker-compose.yml Dockerfile; then
  fallo "docker-compose.yml / Dockerfile definen un fallback de AUTH_SECRET (no permitido)"
fi
if grep -rn --exclude='simulacion-ci.sh' --exclude='ci.yml' \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=db --exclude-dir=docs \
  -e 'Admin\*2024' -e 'Ti\*2024' . 2>/dev/null; then
  fallo "Queda una credencial fija publicada en el repositorio (patrones Admin/Ti del 2024)"
fi
if grep -rn --exclude='seguridad.ts' --exclude='validar-auth-secret.sh' --exclude='deploy.sh' --exclude='simulacion-ci.sh' --exclude='ci.yml' \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=db --exclude-dir=.git --exclude-dir=docs \
  -e 'cig-manufacturing-secreto-desarrollo' -e 'fabriflow-secreto-desarrollo' . 2>/dev/null; then
  fallo "Un secreto de desarrollo histórico se usa como valor (ver líneas de arriba)"
fi
echo "  ✔ Sin fallbacks de secretos ni credenciales publicadas"

# Nota de dureza (v1.1.1): los pasos de calidad usan `|| fallo` para que un
# fallo ABORTE la simulación. El patrón anterior `cmd && echo "  ✔ …"` NO
# abortaba: bash no aplica errexit a comandos dentro de una lista &&, así
# que un lint/build/tsc fallido pasaba sin ✔ y la simulación seguía hasta
# el final (se descubrió con el lint de eslint-config-next 16.4.5, cuya
# regla react-hooks/set-state-in-effect era error y la simulación la dejó
# pasar). Cada paso es ahora una puerta real.

paso "3/9 Esquema Prisma (validate + generate)"
bunx prisma validate > /dev/null || fallo "prisma validate falló"
echo "  ✔ prisma validate"
bunx prisma generate > /dev/null || fallo "prisma generate falló"
echo "  ✔ prisma generate"

paso "4/9 Lint (ESLint)"
bun run lint || fallo "lint con errores de ESLint (corrígelos antes de entregar)"
echo "  ✔ lint sin errores"

paso "5/9 Build de producción (verificación de tipos real)"
bun run build || fallo "el build de producción falló"
echo "  ✔ build completado"

paso "6/9 Typecheck completo (tsc --noEmit)"
./node_modules/.bin/tsc --noEmit || fallo "tsc --noEmit reportó errores de tipos"
echo "  ✔ sin errores de tipos"

paso "7/9 BD efímera + migraciones + semilla"
bunx prisma migrate deploy > /dev/null \
  || fallo "prisma migrate deploy falló sobre la BD efímera"
echo "  ✔ migraciones aplicadas (base efímera ${PG_BASE} en ${PG_HOST}:${PG_PUERTO})"
ADMIN_PASSWORD="$ADMIN_PASSWORD" bun prisma/seed.ts

paso "8/9 Servidor standalone (puerto $PUERTO)"
NODE_ENV=production PORT="$PUERTO" HOSTNAME=127.0.0.1 \
  bun .next/standalone/server.js > "$DIR_TMP/servidor.log" 2>&1 &
PID_SERVIDOR=$!

listo=0
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PUERTO/api" > /dev/null; then listo=1; break; fi
  sleep 1
done
[ "$listo" = "1" ] || { cat "$DIR_TMP/servidor.log"; fallo "el servidor no arrancó en 60 s"; }
echo "  ✔ servidor arriba"

paso "9/9 Humo: API, login, sesión y límite de intentos"
CUERPO=$(curl -sf "http://127.0.0.1:$PUERTO/api")
echo "  GET /api -> $CUERPO"
# Contrato del health check (TASK-STR-003, SSOT): GET /api devuelve
# { estado, sistema, version }. Se exigen las tres claves y que la
# versión informada coincida con el campo "version" de package.json
# (única fuente de verdad, expuesta por la ruta vía @/lib/version).
# Sustituye a la comprobación del marcador «Hello, world!» del
# andamiaje inicial, que el endpoint ya no devuelve.
CLAVES_FALTANTES=""
echo "$CUERPO" | grep -q '"estado"'  || CLAVES_FALTANTES="${CLAVES_FALTANTES} estado"
echo "$CUERPO" | grep -q '"sistema"' || CLAVES_FALTANTES="${CLAVES_FALTANTES} sistema"
echo "$CUERPO" | grep -q '"version"' || CLAVES_FALTANTES="${CLAVES_FALTANTES} version"
[ -z "$CLAVES_FALTANTES" ] \
  || fallo "GET /api no devolvió el cuerpo esperado (faltan claves SSOT:${CLAVES_FALTANTES})"
VERSION_PKG="$(grep -m1 '"version"' package.json \
  | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
echo "$CUERPO" | grep -q "\"version\"[[:space:]]*:[[:space:]]*\"${VERSION_PKG}\"" \
  || fallo "GET /api no devolvió el cuerpo esperado (la versión ${VERSION_PKG} de package.json no está en la respuesta: SSOT roto)"
echo "  ✔ API viva (health check SSOT: estado/sistema/version = ${VERSION_PKG})"

LOGIN=$(curl -sf -c "$DIR_TMP/cookies.txt" -X POST "http://127.0.0.1:$PUERTO/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"correo\":\"admin@cig-manufacturing.com\",\"password\":\"$ADMIN_PASSWORD\"}")
echo "$LOGIN" | grep -q '"usuario"' || fallo "el login no devolvió un usuario"
echo "  ✔ login real OK (admin@cig-manufacturing.com)"

SESION=$(curl -sf -b "$DIR_TMP/cookies.txt" "http://127.0.0.1:$PUERTO/api/auth/sesion")
echo "$SESION" | grep -q 'admin@cig-manufacturing.com' || fallo "la cookie de sesión no autentica"
echo "  ✔ sesión con cookie firmada OK"

# Rate limit: 5 fallos → 429 (protección anti-fuerza bruta)
for i in 1 2 3 4 5 6 7; do
  COD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://127.0.0.1:$PUERTO/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"correo\":\"rate-limit@test.local\",\"password\":\"mala-$i\"}")
done
[ "$COD" = "429" ] || fallo "el login no aplicó el límite de intentos (esperaba 429, obtuve $COD)"
echo "  ✔ límite de intentos de login OK (429 tras fallos repetidos)"

echo ""
echo "✔✔ SIMULACIÓN DE CI COMPLETA: TODO EN ORDEN"
