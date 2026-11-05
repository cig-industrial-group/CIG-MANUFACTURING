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
#   build -> tipos -> humo real (BD efímera + semilla + servidor
#   standalone + API + login + sesión + rate-limit)
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
# Secreto de PRUEBAS (64 hex aleatorios fijos: solo sirve para firmar
# sesiones en entornos efímeros; nunca un secreto de producción).
# Se EXPORTA: el servidor de producción valida AUTH_SECRET al arrancar.
export AUTH_SECRET="${AUTH_SECRET:-a9f3c1d85e7b24608f4a2c9e6b1d73580e4c2f9a5b8d3e127c6a0f4b9e2d85c31}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Pruebas*2026}"
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

paso "3/9 Esquema Prisma (validate + generate)"
bunx prisma validate > /dev/null && echo "  ✔ prisma validate"
bunx prisma generate > /dev/null && echo "  ✔ prisma generate"

paso "4/9 Lint (ESLint)"
bun run lint && echo "  ✔ lint sin errores"

paso "5/9 Build de producción (verificación de tipos real)"
bun run build && echo "  ✔ build completado"

paso "6/9 Typecheck completo (tsc --noEmit)"
./node_modules/.bin/tsc --noEmit && echo "  ✔ sin errores de tipos"

paso "7/9 BD efímera + semilla"
bunx prisma db push --skip-generate > /dev/null && echo "  ✔ esquema creado ($DATABASE_URL)"
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
echo "$CUERPO" | grep -q 'Hello, world!' || fallo "GET /api no devolvió el cuerpo esperado"
echo "  ✔ API viva"

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
