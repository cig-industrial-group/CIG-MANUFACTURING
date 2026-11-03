#!/bin/bash
# ============================================================
# SIMULACIÓN LOCAL DEL PIPELINE DE CI
# Replica .github/workflows/ci.yml sin necesidad de GitHub:
#   guardia -> prisma -> lint -> build -> tipos -> humo real
#   (BD efímera + semilla + servidor standalone + API + login + sesión)
#
# Uso (desde la raíz del proyecto, en un checkout limpio):
#   bash scripts/simulacion-ci.sh
#
# Nota: no usa rutas absolutas del entorno; crea su BD temporal
# en un directorio efímero y limpia todo al salir.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

PUERTO="${PUERTO_CI:-3100}"
AUTH_SECRET="${AUTH_SECRET:-clave-local-solo-pruebas}"
DIR_TMP="$(mktemp -d)"
PID_SERVIDOR=""
export DATABASE_URL="file:${DIR_TMP}/cig-ci.db"
export NEXT_TELEMETRY_DISABLED=1

limpiar() {
  [ -n "$PID_SERVIDOR" ] && kill "$PID_SERVIDOR" 2>/dev/null || true
  rm -rf "$DIR_TMP"
}
trap limpiar EXIT

paso() { echo ""; echo "──── $1 ────"; }
fallo() { echo "  ✘ $1" >&2; exit 1; }

paso "1/8 Guardia: ignoreBuildErrors desactivado"
grep -nE 'ignoreBuildErrors[[:space:]]*:[[:space:]]*true' next.config.ts \
  && fallo "typescript.ignoreBuildErrors está en true (revísalo)"
grep -nE 'ignoreDuringBuilds[[:space:]]*:[[:space:]]*true' next.config.ts \
  && fallo "eslint.ignoreDuringBuilds está en true (revísalo)"
echo "  ✔ ignoreBuildErrors e ignoreDuringBuilds no están habilitados"

paso "2/8 Esquema Prisma (validate + generate)"
bunx prisma validate > /dev/null && echo "  ✔ prisma validate"
bunx prisma generate > /dev/null && echo "  ✔ prisma generate"

paso "3/8 Lint (ESLint)"
bun run lint && echo "  ✔ lint sin errores"

paso "4/8 Build de producción (verificación de tipos real)"
bun run build && echo "  ✔ build completado"

paso "5/8 Typecheck completo (tsc --noEmit)"
./node_modules/.bin/tsc --noEmit && echo "  ✔ sin errores de tipos"

paso "6/8 BD efímera + semilla"
bunx prisma db push --skip-generate > /dev/null && echo "  ✔ esquema creado ($DATABASE_URL)"
bun prisma/seed.ts

paso "7/8 Servidor standalone (puerto $PUERTO)"
NODE_ENV=production PORT="$PUERTO" HOSTNAME=127.0.0.1 \
  node .next/standalone/server.js > "$DIR_TMP/servidor.log" 2>&1 &
PID_SERVIDOR=$!

listo=0
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:$PUERTO/api" > /dev/null; then listo=1; break; fi
  sleep 1
done
[ "$listo" = "1" ] || { cat "$DIR_TMP/servidor.log"; fallo "el servidor no arrancó en 60 s"; }
echo "  ✔ servidor arriba"

paso "8/8 Humo: API, login y sesión"
CUERPO=$(curl -sf "http://127.0.0.1:$PUERTO/api")
echo "  GET /api -> $CUERPO"
echo "$CUERPO" | grep -q 'Hello, world!' || fallo "GET /api no devolvió el cuerpo esperado"
echo "  ✔ API viva"

LOGIN=$(curl -sf -c "$DIR_TMP/cookies.txt" -X POST "http://127.0.0.1:$PUERTO/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@fabriflow.com","password":"Admin*2024"}')
echo "$LOGIN" | grep -q '"usuario"' || fallo "el login no devolvió un usuario"
echo "  ✔ login real OK (admin@fabriflow.com)"

SESION=$(curl -sf -b "$DIR_TMP/cookies.txt" "http://127.0.0.1:$PUERTO/api/auth/sesion")
echo "$SESION" | grep -q 'admin@fabriflow.com' || fallo "la cookie de sesión no autentica"
echo "  ✔ sesión con cookie firmada OK"

echo ""
echo "✔✔ SIMULACIÓN DE CI COMPLETA: TODO EN ORDEN"
