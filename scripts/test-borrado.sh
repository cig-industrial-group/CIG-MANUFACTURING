#!/bin/bash
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

# ============================================================
# PRUEBAS E2E v1.0.0 — Borrado real + desactivar/reactivar
# Ejecuta el servidor standalone y valida el comportamiento
# de los endpoints contra la base de datos de desarrollo.
#
# Requiere ADMIN_PASSWORD (contraseña del admin sembrado):
#   ADMIN_PASSWORD='...' bash scripts/test-borrado.sh
# ============================================================
PROYECTO="${CIG_PROYECTO:-/home/z/my-project}"
cd "$PROYECTO" || exit 1

[ -n "${ADMIN_PASSWORD:-}" ] || { echo "✖ Define ADMIN_PASSWORD (contraseña del admin sembrado) antes de ejecutar"; exit 1; }

PORT=3100
BASE="http://127.0.0.1:$PORT"
CJ=/tmp/ff-admin.txt
CJ2=/tmp/ff-temp.txt
rm -f "$CJ" "$CJ2" /tmp/ff-*.json

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✔ $1"; }
mal() { FAIL=$((FAIL+1)); echo "  ✘ $1"; }
seccion() { echo ""; echo "=== $1 ==="; }

SRV=".next/standalone/server.js"
if [ ! -f "$SRV" ]; then
  SRV=$(find .next -name server.js -path "*standalone*" -not -path "*node_modules*" | head -1)
fi
if [ -z "$SRV" ]; then echo "No se encontró server.js"; exit 1; fi
echo "Servidor: $SRV (puerto $PORT)"

# AUTH_SECRET obligatorio: del entorno o del .env del proyecto
if [ -z "${AUTH_SECRET:-}" ] && [ -f "$PROYECTO/.env" ]; then
  AUTH_SECRET=$(grep '^AUTH_SECRET=' "$PROYECTO/.env" | head -1 | cut -d= -f2-)
  export AUTH_SECRET
fi
[ -n "${AUTH_SECRET:-}" ] || { echo "✖ Falta AUTH_SECRET (defínelo en el entorno o en $PROYECTO/.env)"; exit 1; }

RUNTIME=node
command -v bun > /dev/null 2>&1 && RUNTIME=bun
HOSTNAME=0.0.0.0 PORT=$PORT \
DATABASE_URL="file:$PROYECTO/db/custom.db" \
COOKIE_INSEGURA_HTTP=1 \
NODE_ENV=production $RUNTIME "$SRV" > /tmp/ff-server.log 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null' EXIT

# Esperar arranque
for i in $(seq 1 60); do
  COD=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/catalogo/modelos" 2>/dev/null)
  [ "$COD" != "000" ] && break
  sleep 0.5
done
[ "$COD" != "000" ] || { echo "El servidor no arrancó"; cat /tmp/ff-server.log; exit 1; }

jv() { python3 -c "import json,sys; print(json.load(open(sys.argv[1]))$2)" "$1"; }

# ---------- Autenticación ----------
seccion "Autenticación"
COD=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/catalogo/modelos")
[ "$COD" = "401" ] && ok "Sin sesión → 401" || mal "Sin sesión → esperaba 401, obtuve $COD"

COD=$(curl -s -c "$CJ" -o /tmp/ff-login.json -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"correo\":\"admin@cig-manufacturing.com\",\"password\":\"$ADMIN_PASSWORD\"}")
[ "$COD" = "200" ] && ok "Login admin (200)" || { mal "Login admin ($COD)"; cat /tmp/ff-login.json; }
ADMIN_ID=$(jv /tmp/ff-login.json "['usuario']['id']")

# ---------- Modelos: desactivar / reactivar / borrar real ----------
seccion "Modelos (catálogo)"
COD=$(curl -s -b "$CJ" -o /tmp/ff-m.json -w "%{http_code}" -X POST "$BASE/api/catalogo/modelos" \
  -H "Content-Type: application/json" \
  -d '{"codigo":"TST-DEL-01","nombre":"Modelo de prueba","descripcion":"borrado real"}')
[ "$COD" = "201" ] && ok "Crear modelo (201)" || { mal "Crear modelo ($COD)"; cat /tmp/ff-m.json; }
MID=$(jv /tmp/ff-m.json "['id']")

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/catalogo/modelos/$MID" \
  -H "Content-Type: application/json" -d '{"activo":false}')
[ "$COD" = "200" ] && ok "Desactivar modelo (PATCH activo:false)" || mal "Desactivar modelo ($COD)"

ESTA=$(curl -s -b "$CJ" "$BASE/api/catalogo/modelos" | python3 -c "import sys,json; print(any(m['codigo']=='TST-DEL-01' for m in json.load(sys.stdin)))")
[ "$ESTA" = "False" ] && ok "Desactivado NO aparece en listado por defecto" || mal "Desactivado aún aparece por defecto"

ESTA=$(curl -s -b "$CJ" "$BASE/api/catalogo/modelos?incluirInactivos=true" | python3 -c "import sys,json; print(any(m['codigo']=='TST-DEL-01' for m in json.load(sys.stdin)))")
[ "$ESTA" = "True" ] && ok "Desactivado SÍ aparece con incluirInactivos=true" || mal "Desactivado no aparece con incluirInactivos=true"

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/catalogo/modelos/$MID" \
  -H "Content-Type: application/json" -d '{"activo":true}')
[ "$COD" = "200" ] && ok "Reactivar modelo (PATCH activo:true)" || mal "Reactivar modelo ($COD)"

ESTA=$(curl -s -b "$CJ" "$BASE/api/catalogo/modelos" | python3 -c "import sys,json; print(any(m['codigo']=='TST-DEL-01' for m in json.load(sys.stdin)))")
[ "$ESTA" = "True" ] && ok "Reactivado aparece de nuevo por defecto" || mal "Reactivado no aparece"

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/catalogo/modelos/$MID")
[ "$COD" = "200" ] && ok "Eliminar modelo (DELETE)" || mal "Eliminar modelo ($COD)"

ESTA=$(curl -s -b "$CJ" "$BASE/api/catalogo/modelos?incluirInactivos=true" | python3 -c "import sys,json; print(any(m['codigo']=='TST-DEL-01' for m in json.load(sys.stdin)))")
[ "$ESTA" = "False" ] && ok "Modelo borrado de la BD (no aparece ni con inactivos)" || mal "El modelo sigue existiendo tras DELETE"

# ---------- Números de parte ----------
seccion "Números de parte (catálogo)"
COD=$(curl -s -b "$CJ" -o /tmp/ff-p.json -w "%{http_code}" -X POST "$BASE/api/catalogo/partes" \
  -H "Content-Type: application/json" -d '{"numero":"TST-PT-DEL","nombre":"Parte de prueba"}')
[ "$COD" = "201" ] && ok "Crear número de parte (201)" || { mal "Crear parte ($COD)"; cat /tmp/ff-p.json; }
PID=$(jv /tmp/ff-p.json "['id']")

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/catalogo/partes/$PID")
[ "$COD" = "200" ] && ok "Eliminar número de parte (borrado real)" || mal "Eliminar parte ($COD)"

ESTA=$(curl -s -b "$CJ" "$BASE/api/catalogo/partes?incluirInactivos=true" | python3 -c "import sys,json; print(any(p['numero']=='TST-PT-DEL' for p in json.load(sys.stdin)))")
[ "$ESTA" = "False" ] && ok "Parte borrada de la BD" || mal "La parte sigue existiendo tras DELETE"

# ---------- Producto sin movimientos: borrado directo ----------
seccion "Producto sin movimientos"
COD=$(curl -s -b "$CJ" -o /tmp/ff-pr1.json -w "%{http_code}" -X POST "$BASE/api/almacen/productos" \
  -H "Content-Type: application/json" -d '{"sku":"TST-PROD-LIBRE","nombre":"Producto libre","categoria":"MATERIAL","unidad":"PZA"}')
[ "$COD" = "201" ] && ok "Crear producto (201)" || { mal "Crear producto ($COD)"; cat /tmp/ff-pr1.json; }
PR1=$(jv /tmp/ff-pr1.json "['id']")

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/almacen/productos/$PR1")
[ "$COD" = "200" ] && ok "Eliminar producto sin movimientos (borrado real)" || mal "Eliminar producto ($COD)"

ESTA=$(curl -s -b "$CJ" "$BASE/api/almacen/productos?incluirInactivos=true" | python3 -c "import sys,json; print(any(p['sku']=='TST-PROD-LIBRE' for p in json.load(sys.stdin)))")
[ "$ESTA" = "False" ] && ok "Producto borrado de la BD" || mal "El producto sigue existiendo"

# ---------- Producto y almacén CON movimientos: ciclo papelera ----------
seccion "Registros con historial (papelera + historia congelada)"
COD=$(curl -s -b "$CJ" -o /tmp/ff-alm.json -w "%{http_code}" -X POST "$BASE/api/almacen/almacenes" \
  -H "Content-Type: application/json" -d '{"codigo":"TST-ALM","nombre":"Almacén temporal","tipo":"GENERAL"}')
[ "$COD" = "201" ] && ok "Crear almacén temporal (201)" || { mal "Crear almacén ($COD)"; cat /tmp/ff-alm.json; }
AID=$(jv /tmp/ff-alm.json "['id']")

COD=$(curl -s -b "$CJ" -o /tmp/ff-pr2.json -w "%{http_code}" -X POST "$BASE/api/almacen/productos" \
  -H "Content-Type: application/json" -d '{"sku":"TST-PROD-BLOQ","nombre":"Producto con historial","categoria":"MATERIAL","unidad":"PZA"}')
[ "$COD" = "201" ] && ok "Crear producto con historial (201)" || mal "Crear producto 2 ($COD)"
PR2=$(jv /tmp/ff-pr2.json "['id']")

COD=$(curl -s -b "$CJ" -o /tmp/ff-mov.json -w "%{http_code}" -X POST "$BASE/api/almacen/movimientos" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"ENTRADA\",\"productoId\":\"$PR2\",\"almacenDestinoId\":\"$AID\",\"cantidad\":5,\"referencia\":\"PRUEBA-E2E\"}")
[ "$COD" = "201" ] && ok "Registrar ENTRADA de 5 (201)" || { mal "Registrar movimiento ($COD)"; cat /tmp/ff-mov.json; }
MOVID=$(jv /tmp/ff-mov.json "['id']")

# Con las entidades vivas, el movimiento SÍ es corregible/eliminable (bitácora)
COD=$(curl -s -b "$CJ" -o /tmp/ff-movdel.json -w "%{http_code}" -X DELETE "$BASE/api/almacen/movimientos/$MOVID" \
  -H "Content-Type: application/json" -d '{"motivoCorreccion":"Limpieza de datos de prueba E2E"}')
[ "$COD" = "200" ] && ok "Eliminar movimiento con entidades vivas (bitácora)" || { mal "Eliminar movimiento ($COD)"; cat /tmp/ff-movdel.json; }

# Sin movimientos vivos, producto y almacén se eliminan (van a papelera)
COD=$(curl -s -b "$CJ" -o /tmp/ff-del2.json -w "%{http_code}" -X DELETE "$BASE/api/almacen/productos/$PR2")
[ "$COD" = "200" ] && ok "DELETE producto tras limpiar historial → 200 (papelera)" || { mal "Eliminar producto ($COD)"; cat /tmp/ff-del2.json; }
COD=$(curl -s -b "$CJ" -o /tmp/ff-del3.json -w "%{http_code}" -X DELETE "$BASE/api/almacen/almacenes/$AID")
[ "$COD" = "200" ] && ok "DELETE almacén tras limpiar historial → 200 (papelera)" || { mal "Eliminar almacén ($COD)"; cat /tmp/ff-del3.json; }

# ---- Ciclo papelera: movimiento congelado + restauración ----
seccion "Papelera: historia congelada y restauración"
COD=$(curl -s -b "$CJ" -o /tmp/ff-pr4.json -w "%{http_code}" -X POST "$BASE/api/almacen/productos" \
  -H "Content-Type: application/json" -d '{"sku":"TST-PROD-PAPELERA","nombre":"Producto papelera","categoria":"MATERIAL","unidad":"PZA"}')
PR4=$(jv /tmp/ff-pr4.json "['id']")
# (almacén disponible: el primero activo del listado)
AID_DISP=$(curl -s -b "$CJ" "$BASE/api/almacen/almacenes" | python3 -c "import sys,json; print(next(a['id'] for a in json.load(sys.stdin) if a['activo']))")
COD=$(curl -s -b "$CJ" -o /tmp/ff-mov2.json -w "%{http_code}" -X POST "$BASE/api/almacen/movimientos" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"ENTRADA\",\"productoId\":\"$PR4\",\"almacenDestinoId\":\"$AID_DISP\",\"cantidad\":3}")
[ "$COD" = "201" ] && ok "Entrada para producto de papelera (201)" || { mal "Entrada papelera ($COD)"; cat /tmp/ff-mov2.json; }
MOVID2P=$(jv /tmp/ff-mov2.json "['id']")

COD=$(curl -s -b "$CJ" -o /tmp/ff-delp4.json -w "%{http_code}" -X DELETE "$BASE/api/almacen/productos/$PR4")
[ "$COD" = "200" ] && ok "DELETE producto con movimiento → 200 (papelera)" || { mal "Eliminar producto con historial ($COD)"; cat /tmp/ff-delp4.json; }

COD=$(curl -s -b "$CJ" -o /tmp/ff-err.json -w "%{http_code}" -X DELETE "$BASE/api/almacen/movimientos/$MOVID2P" \
  -H "Content-Type: application/json" -d '{"motivoCorreccion":"intento"}')
ERR=$(jv /tmp/ff-err.json "['error']" 2>/dev/null)
[ "$COD" = "409" ] && [ "$ERR" = "REGISTRO_HISTORICO" ] && ok "Movimiento de entidad en papelera CONGELADO → 409 REGISTRO_HISTORICO" || mal "Movimiento congelado → $COD $ERR"

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/almacen/productos/$PR4" \
  -H "Content-Type: application/json" -d '{"activo":false}')
[ "$COD" = "404" ] && ok "PATCH producto en papelera → 404 (no está entre los vivos)" || mal "PATCH producto en papelera ($COD)"

# Restaurar desde la papelera re-vincula el historial
ENTRADA_PAPELERA=$(curl -s -b "$CJ" "$BASE/api/papelera" | python3 -c "import sys,json; d=json.load(sys.stdin); e=[p for p in d.get('entradas',[]) if p.get('entidadId')=='$PR4' and p.get('estado')=='EN_PAPELERA']; print(e[0]['id'] if e else '')")
[ -n "$ENTRADA_PAPELERA" ] && ok "Entrada de papelera localizada" || mal "No se encontró la entrada de papelera"
if [ -n "$ENTRADA_PAPELERA" ]; then
  COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/papelera/$ENTRADA_PAPELERA/restaurar")
  [ "$COD" = "200" ] && ok "Restaurar producto desde papelera (200)" || mal "Restaurar ($COD)"
fi

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/almacen/productos/$PR4" \
  -H "Content-Type: application/json" -d '{"activo":false}')
[ "$COD" = "200" ] && ok "Desactivar producto restaurado (PATCH)" || mal "Desactivar producto restaurado ($COD)"
COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X PATCH "$BASE/api/almacen/productos/$PR4" \
  -H "Content-Type: application/json" -d '{"activo":true}')
[ "$COD" = "200" ] && ok "Reactivar producto restaurado" || mal "Reactivar producto ($COD)"

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/almacen/movimientos/$MOVID2P" \
  -H "Content-Type: application/json" -d '{"motivoCorreccion":"Limpieza E2E producto papelera"}')
[ "$COD" = "200" ] && ok "Movimiento editable de nuevo tras restaurar (bitácora)" || mal "Eliminar movimiento restaurado ($COD)"

curl -s -b "$CJ" -o /dev/null -X DELETE "$BASE/api/almacen/productos/$PR4"

# ---------- Usuarios ----------
seccion "Usuarios"
RID=$(curl -s -b "$CJ" "$BASE/api/roles" | python3 -c "import sys,json; print(next(r['id'] for r in json.load(sys.stdin)['roles'] if r['clave']=='ALMACENERO'))")

COD=$(curl -s -b "$CJ" -o /tmp/ff-u2.json -w "%{http_code}" -X POST "$BASE/api/usuarios" \
  -H "Content-Type: application/json" \
  -d "{\"nombre\":\"Temporal E2E\",\"correo\":\"temp.e2e@cig-manufacturing.com\",\"rolId\":\"$RID\",\"password\":\"Temporal*2024\",\"debeCambiarPassword\":false}")
[ "$COD" = "201" ] && ok "Crear usuario temporal ALMACENERO (201)" || { mal "Crear usuario ($COD)"; cat /tmp/ff-u2.json; }
U2=$(jv /tmp/ff-u2.json "['usuario']['id']")

# El usuario sin permiso catalogo.gestionar recibe 403
COD=$(curl -s -c "$CJ2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"correo":"temp.e2e@cig-manufacturing.com","password":"Temporal*2024"}')
[ "$COD" = "200" ] && ok "Login usuario temporal" || mal "Login temporal ($COD)"

COD=$(curl -s -b "$CJ2" -o /tmp/ff-err.json -w "%{http_code}" -X POST "$BASE/api/catalogo/modelos" \
  -H "Content-Type: application/json" -d '{"codigo":"TST-403","nombre":"No permitido"}')
ERR=$(jv /tmp/ff-err.json "['error']" 2>/dev/null)
[ "$COD" = "403" ] && [ "$ERR" = "SIN_PERMISO" ] && ok "Crear modelo sin permiso → 403 SIN_PERMISO" || mal "Permisos → $COD $ERR"

# El usuario temporal registra un movimiento (referencia suave en el ledger)
COD=$(curl -s -b "$CJ" -o /tmp/ff-pr3.json -w "%{http_code}" -X POST "$BASE/api/almacen/productos" \
  -H "Content-Type: application/json" -d '{"sku":"TST-PROD-U2","nombre":"Producto usuario temporal"}')
PR3=$(jv /tmp/ff-pr3.json "['id']")
curl -s -b "$CJ" -o /dev/null -X POST "$BASE/api/almacen/almacenes" \
  -H "Content-Type: application/json" -d '{"codigo":"TST-ALM-U2","nombre":"Almacén usuario temporal"}'
AID2=$(curl -s -b "$CJ" "$BASE/api/almacen/almacenes?incluirInactivos=true" | python3 -c "import sys,json; print(next(a['id'] for a in json.load(sys.stdin) if a['codigo']=='TST-ALM-U2'))")

COD=$(curl -s -b "$CJ2" -o /tmp/ff-mov2.json -w "%{http_code}" -X POST "$BASE/api/almacen/movimientos" \
  -H "Content-Type: application/json" \
  -d "{\"tipo\":\"ENTRADA\",\"productoId\":\"$PR3\",\"almacenDestinoId\":\"$AID2\",\"cantidad\":2}")
[ "$COD" = "201" ] && ok "Usuario temporal registra movimiento (201)" || { mal "Movimiento temporal ($COD)"; cat /tmp/ff-mov2.json; }
MOVID2=$(jv /tmp/ff-mov2.json "['id']")

# El usuario con registros también se elimina (va a papelera con snapshot)
COD=$(curl -s -b "$CJ" -o /tmp/ff-err.json -w "%{http_code}" -X DELETE "$BASE/api/usuarios/$U2")
[ "$COD" = "200" ] && ok "DELETE usuario con registros → 200 (papelera)" || { mal "Usuario con registros → $COD"; cat /tmp/ff-err.json; }

ESTA=$(curl -s -b "$CJ" "$BASE/api/usuarios" | python3 -c "import sys,json; print(any(u['correo']=='temp.e2e@cig-manufacturing.com' for u in json.load(sys.stdin)['usuarios']))")
[ "$ESTA" = "False" ] && ok "Usuario temporal fuera del listado vivo" || mal "El usuario sigue apareciendo"

# El usuario eliminado ya no puede iniciar sesión
COD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"correo":"temp.e2e@cig-manufacturing.com","password":"Temporal*2024"}')
[ "$COD" = "401" ] && ok "Login del usuario eliminado → 401" || mal "Login eliminado ($COD)"

# Auto-eliminación bloqueada (el usuario de referencia sigue vivo)
COD=$(curl -s -b "$CJ" -o /tmp/ff-err.json -w "%{http_code}" -X DELETE "$BASE/api/usuarios/$ADMIN_ID")
ERR=$(jv /tmp/ff-err.json "['error']" 2>/dev/null)
[ "$COD" = "400" ] && [ "$ERR" = "NO_AUTO_ELIMINARSE" ] && ok "Auto-eliminación → 400 NO_AUTO_ELIMINARSE" || mal "Auto-eliminación → $COD $ERR"

# Limpieza final: movimiento del temporal eliminado (sigue corregible:
# el usuario es una referencia suave, no congela el historial)
COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/almacen/movimientos/$MOVID2" \
  -H "Content-Type: application/json" -d '{"motivoCorreccion":"Limpieza E2E usuario temporal"}')
[ "$COD" = "200" ] && ok "Limpieza: movimiento del temporal eliminado" || mal "Limpiar movimiento ($COD)"

COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/almacen/productos/$PR3")
[ "$COD" = "200" ] || mal "Limpiar producto temporal ($COD)"
COD=$(curl -s -b "$CJ" -o /dev/null -w "%{http_code}" -X DELETE "$BASE/api/almacen/almacenes/$AID2")
[ "$COD" = "200" ] || mal "Limpiar almacén temporal ($COD)"

# ---------- Resumen ----------
echo ""
echo "===================================="
echo "RESULTADO: $PASS correctas / $FAIL fallidas"
echo "===================================="
[ "$FAIL" = "0" ]
