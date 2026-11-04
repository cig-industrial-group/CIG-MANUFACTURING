#!/usr/bin/env python3
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

"""E2E del módulo de Unidades de Medida (v1.0.0) — factor POR PRODUCTO.

Modelo verificado:
  · Catálogo de unidades: SOLO unidades (PIEZA, PAQUETE, ROLLO...) y su
    unidad base (PAQUETE→PZA). SIN factor: la cantidad que lleva cada
    paquete NO vive aquí.
  · Registro del producto: ahí se configura el empaque de conteo
    (80101-06129 → 1 PAQ = 10 PZA; 80101-06130 → 1 PAQ = 24 PZA).
  · Movimientos: captura en paquetes + sueltas convertida a unidad base
    con el EMPAQUE DEL PRODUCTO (autoritativo en servidor).

  1. Catálogo sembrado (sin factor) y permisos.
  2. CRUD de unidades: paquete propio sin factor, duplicados, base
     requerida, bloqueos del sistema, unidades en uso (base y empaque),
     desactivar/reactivar.
  3. Productos con empaque (80101-06129 = PAQ×10, 80101-06130 = PAQ×24)
     y validaciones (contenido, incompatibilidad, unidad no-paquete,
     cambio de unidad base limpia el empaque).
  4. Movimientos de Almacén con conteo en paquetes DEL PRODUCTO.
  5. OQC: liberación con conteo por línea (fusión + factor por producto)
     y scrap con conteo.

Requisito: servidor corriendo en el puerto 3300.
"""
import json
import os
import sqlite3
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:3300"
DB = os.environ.get("CIG_DB", "/home/z/my-project/db/custom.db")

cookie = None


def req(method, path, body=None):
    global cookie
    r = urllib.request.Request(BASE + path, method=method)
    if cookie:
        r.add_header("Cookie", cookie)
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, data, timeout=30) as resp:
            txt, sc = resp.read().decode(), resp.status
            setc = resp.headers.get("Set-Cookie")
            if setc:
                cookie = setc.split(";")[0]
    except urllib.error.HTTPError as e:
        txt, sc = e.read().decode(), e.code
    try:
        return sc, json.loads(txt)
    except Exception:
        return sc, txt


OK = 0
FAIL = 0


def check(nombre, cond, extra=""):
    global OK, FAIL
    if cond:
        OK += 1
        print(f"  [OK] {nombre}")
    else:
        FAIL += 1
        print(f"  [FAIL] {nombre}  ->  {extra}")


con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()


def stock(producto_id, almacen_id):
    r = cur.execute(
        "SELECT cantidad FROM Stock WHERE productoId=? AND almacenId=?",
        (producto_id, almacen_id)).fetchone()
    return r[0] if r else 0.0


print("=" * 64)
print("E2E UNIDADES DE MEDIDA (factor por producto) — CIG-MANUFACTURING v1.0.0")
print("=" * 64)

# ===== Sesión =====
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or exit("✖ Define ADMIN_PASSWORD (contraseña del admin sembrado) antes de ejecutar")
sc, _ = req("POST", "/api/auth/login", {"correo": "admin@cig-manufacturing.com", "password": ADMIN_PASSWORD})
check("login admin", sc == 200, sc)

# ===== 1. Catálogo sembrado =====
print("\n— 1. Catálogo de unidades (sin factor) —")
sc, unidades = req("GET", "/api/unidades?incluirInactivos=true")
check("GET /api/unidades", sc == 200, sc)
check("catálogo sembrado (≥13 unidades)", len(unidades) >= 13, len(unidades))

pza = next((u for u in unidades if u["codigo"] == "PZA"), None)
paq = next((u for u in unidades if u["codigo"] == "PAQ"), None)
check("PZA existe, tipo CONTEO, esSistema", pza and pza["tipo"] == "CONTEO" and pza["esSistema"], pza)
check("PAQ existe, tipo PAQUETE, base PZA, SIN factor",
      paq and paq["tipo"] == "PAQUETE" and paq["unidadBase"] == "PZA", paq)
check("el catálogo ya no expone «factor»", paq and "factor" not in paq, paq)

# ===== 2. CRUD de unidades =====
print("\n— 2. CRUD de unidades —")
sc, cjax = req("POST", "/api/unidades", {
    "codigo": "cjax", "nombre": "Caja E2E", "nombreEn": "Box E2E",
    "tipo": "PAQUETE", "unidadBase": "PZA",
    "notas": "Unidad de prueba E2E",
})
check("crear paquete CJAX (sin factor, código normalizado)",
      sc == 201 and cjax["codigo"] == "CJAX" and "factor" not in cjax, (sc, cjax))

sc, resp = req("POST", "/api/unidades", {"codigo": "CJAX", "nombre": "Dup", "tipo": "CONTEO"})
check("código duplicado rechazado", sc == 409 and resp.get("error") == "UNIDAD_DUPLICADA", (sc, resp))

sc, resp = req("POST", "/api/unidades", {"codigo": "XX", "nombre": "SinBase", "tipo": "PAQUETE"})
check("paquete sin unidad base rechazado", sc == 400 and resp.get("error") == "UNIDAD_BASE_REQUERIDA", (sc, resp))

sc, resp = req("POST", "/api/unidades", {"codigo": "CJA-CJA", "nombre": "Recursivo", "tipo": "PAQUETE", "unidadBase": "CJA-CJA"})
check("paquete con base inexistente/recursiva rechazado", sc == 400, (sc, resp))

sc, resp = req("PATCH", f"/api/unidades/{pza['id']}", {"codigo": "PIEZA"})
check("código de unidad del sistema bloqueado", sc == 400 and resp.get("error") == "UNIDAD_CODIGO_BLOQUEADO", (sc, resp))

sc, resp = req("DELETE", f"/api/unidades/{pza['id']}")
check("unidad del sistema no eliminable", sc == 409 and resp.get("error") == "UNIDAD_SISTEMA", (sc, resp))

# Desactivar / reactivar una unidad propia
sc, resp = req("PATCH", f"/api/unidades/{cjax['id']}", {"activo": False})
check("desactivar unidad propia", sc == 200 and resp["activo"] is False, (sc, resp))
sc, unidades_activas = req("GET", "/api/unidades")
check("unidad inactiva fuera del listado activo",
      all(u["codigo"] != "CJAX" for u in unidades_activas), "")
sc, resp = req("PATCH", f"/api/unidades/{cjax['id']}", {"activo": True})
check("reactivar unidad", sc == 200 and resp["activo"] is True, (sc, resp))

# ===== 3. Productos con empaque (factor POR PRODUCTO) =====
print("\n— 3. Registro de productos con empaque —")
ts = int(time.time())

# Limpieza previa de ejecuciones anteriores (productos con estos SKU en papelera liberan el SKU)
for sku_viejo in ("80101-06129", "80101-06130"):
    sc, prods = req("GET", "/api/almacen/productos?incluirInactivos=true")
    viejo = next((p for p in prods if p["sku"] == sku_viejo), None)
    if viejo:
        req("DELETE", f"/api/almacen/productos/{viejo['id']}")

sc, p129 = req("POST", "/api/almacen/productos", {
    "sku": "80101-06129", "nombre": "Producto E2E con paquete de 10",
    "categoria": "PRODUCTO_TERMINADO", "unidad": "PZA",
    "unidadPaquete": "PAQ", "contenidoPaquete": 10, "stockMinimo": 0,
})
check("80101-06129 registrado: 1 PAQ = 10 PZA",
      sc == 201 and p129["unidad"] == "PZA" and p129["unidadPaquete"] == "PAQ"
      and p129["contenidoPaquete"] == 10, (sc, p129))

sc, p130 = req("POST", "/api/almacen/productos", {
    "sku": "80101-06130", "nombre": "Producto E2E con paquete de 24",
    "categoria": "PRODUCTO_TERMINADO", "unidad": "PZA",
    "unidadPaquete": "PAQ", "contenidoPaquete": 24, "stockMinimo": 0,
})
check("80101-06130 registrado: 1 PAQ = 24 PZA (factor distinto en el MISMO PAQ)",
      sc == 201 and p130["unidadPaquete"] == "PAQ" and p130["contenidoPaquete"] == 24, (sc, p130))

# Validaciones del empaque
sc, resp = req("POST", "/api/almacen/productos", {
    "sku": f"UM-BAD1-{ts}", "nombre": "Contenido inválido", "unidad": "PZA",
    "unidadPaquete": "PAQ", "contenidoPaquete": 0,
})
check("contenido ≤ 0 rechazado", sc == 400 and resp.get("error") == "PAQUETE_CONTENIDO_INVALIDO", (sc, resp))

sc, saco = req("POST", "/api/unidades", {
    "codigo": "SACO", "nombre": "Saco", "nombreEn": "Sack",
    "tipo": "PAQUETE", "unidadBase": "KG",
})
check("crear paquete SACO (base KG)", sc == 201, (sc, saco))
sc, resp = req("POST", "/api/almacen/productos", {
    "sku": f"UM-BAD2-{ts}", "nombre": "Empaque incompatible", "unidad": "PZA",
    "unidadPaquete": "SACO", "contenidoPaquete": 5,
})
check("empaque de otra base (SACO→KG en producto PZA) rechazado",
      sc == 400 and resp.get("error") == "PAQUETE_INCOMPATIBLE", (sc, resp))

sc, resp = req("POST", "/api/almacen/productos", {
    "sku": f"UM-BAD3-{ts}", "nombre": "No es paquete", "unidad": "PZA",
    "unidadPaquete": "PZA", "contenidoPaquete": 5,
})
check("unidad de empaque que no es de tipo PAQUETE rechazada",
      sc == 400 and resp.get("error") == "PAQUETE_UNIDAD_INVALIDA", (sc, resp))

# Unidad EN USO como EMPAQUE de un producto: no se puede eliminar
# Vinculamos CJAX como empaque de 130 y probamos el bloqueo
sc, resp = req("PATCH", f"/api/almacen/productos/{p130['id']}", {"unidadPaquete": "CJAX", "contenidoPaquete": 30})
check("cambiar empaque de 80101-06130 a CJAX×30", sc == 200 and resp["unidadPaquete"] == "CJAX", (sc, resp))
sc, resp = req("DELETE", f"/api/unidades/{cjax['id']}")
check("unidad en uso como EMPAQUE no eliminable", sc == 409 and resp.get("error") == "UNIDAD_EN_USO", (sc, resp))
sc, resp = req("PATCH", f"/api/almacen/productos/{p130['id']}", {"unidadPaquete": "PAQ", "contenidoPaquete": 24})
check("restaurar empaque PAQ×24 de 80101-06130", sc == 200 and resp["unidadPaquete"] == "PAQ", (sc, resp))

# Cambiar la unidad base del producto limpia el empaque incompatible
sc, resp = req("PATCH", f"/api/almacen/productos/{p129['id']}", {"unidad": "KG"})
check("cambiar unidad base a KG retira el empaque PAQ→PZA",
      sc == 200 and resp["unidad"] == "KG" and resp["unidadPaquete"] is None
      and resp["contenidoPaquete"] is None, (sc, resp))
sc, resp = req("PATCH", f"/api/almacen/productos/{p129['id']}", {"unidad": "PZA", "unidadPaquete": "PAQ", "contenidoPaquete": 10})
check("restaurar 80101-06129: PZA + PAQ×10",
      sc == 200 and resp["unidad"] == "PZA" and resp["unidadPaquete"] == "PAQ", (sc, resp))

sc, resp = req("PATCH", f"/api/almacen/productos/{p129['id']}", {"unidad": "KILO-FANTASMA"})
check("producto con unidad fuera de catálogo rechazado", sc == 400 and resp.get("error") == "UNIDAD_NO_EXISTE", (sc, resp))

# Almacén de prueba (o el primero activo)
sc, almacenes = req("GET", "/api/almacen/almacenes")
almacen = almacenes[0] if almacenes else None
check("hay almacén para pruebas", almacen is not None, almacenes)

# ===== 4. Movimientos con conteo (empaque DEL PRODUCTO) =====
print("\n— 4. Movimientos con conteo en paquetes —")
antes = stock(p129["id"], almacen["id"])

sc, mov = req("POST", "/api/almacen/movimientos", {
    "tipo": "ENTRADA", "productoId": p129["id"], "almacenDestinoId": almacen["id"],
    "cantidad": 0,  # ignorada: manda el conteo (autoritativo en servidor)
    "conteo": {"unidad": "PAQ", "paquetes": 2, "sueltas": 3},
    "motivo": "E2E unidades",
})
check("80101-06129: entrada 2 PAQ×10 + 3 sueltas → 23 PZA",
      sc == 201 and mov["cantidad"] == 23, (sc, mov))
check("conteo en el resumen (partes con factor del PRODUCTO)",
      mov.get("conteo") and mov["conteo"][0]["unidad"] == "PAQ" and mov["conteo"][0]["factor"] == 10
      and mov["conteo"][1]["unidad"] == "PZA" and mov["conteo"][1]["cantidad"] == 3, mov.get("conteo"))
check("stock en unidad base (+23)", abs(stock(p129["id"], almacen["id"]) - (antes + 23)) < 1e-6,
      (antes, stock(p129["id"], almacen["id"])))

# El MISMO PAQ con el OTRO producto: 2 PAQ×24 = 48 (factor por producto)
sc, mov130 = req("POST", "/api/almacen/movimientos", {
    "tipo": "ENTRADA", "productoId": p130["id"], "almacenDestinoId": almacen["id"],
    "cantidad": 0,
    "conteo": {"unidad": "PAQ", "paquetes": 2, "sueltas": 0},
    "motivo": "E2E unidades",
})
check("80101-06130: entrada 2 PAQ×24 → 48 PZA (mismo PAQ, otro factor)",
      sc == 201 and mov130["cantidad"] == 48, (sc, mov130))

sc, mov2 = req("POST", "/api/almacen/movimientos", {
    "tipo": "SALIDA", "productoId": p129["id"], "almacenOrigenId": almacen["id"],
    "cantidad": 0,
    "conteo": {"unidad": "PAQ", "paquetes": 1, "sueltas": 0},
    "motivo": "E2E unidades",
})
check("salida 1 PAQ → 10 PZA", sc == 201 and mov2["cantidad"] == 10, (sc, mov2))
check("stock tras salida (+13 neto)", abs(stock(p129["id"], almacen["id"]) - (antes + 13)) < 1e-6,
      stock(p129["id"], almacen["id"]))

# Contar en una unidad de paquete que NO es la configurada del producto
sc, resp = req("POST", "/api/almacen/movimientos", {
    "tipo": "SALIDA", "productoId": p129["id"], "almacenOrigenId": almacen["id"],
    "cantidad": 25, "conteo": {"unidad": "SACO", "paquetes": 1, "sueltas": 0},
})
check("conteo con unidad que NO es el empaque del producto rechazado",
      sc == 400 and resp.get("error") == "CONTEO_UNIDAD_INVALIDA", (sc, resp))

# Contar en paquetes un producto SIN empaque configurado
sc, prodsin = req("POST", "/api/almacen/productos", {
    "sku": f"UM-SINPAQ-{ts}", "nombre": "Producto E2E sin empaque", "unidad": "PZA",
})
sc, resp = req("POST", "/api/almacen/movimientos", {
    "tipo": "ENTRADA", "productoId": prodsin["id"], "almacenDestinoId": almacen["id"],
    "cantidad": 0, "conteo": {"unidad": "PAQ", "paquetes": 1, "sueltas": 0},
})
check("producto sin empaque: conteo en paquetes rechazado",
      sc == 400 and resp.get("error") == "CONTEO_UNIDAD_INVALIDA", (sc, resp))

# Conteo DIRECTO explícito (unidad base declarada en la captura)
sc, movdirecto = req("POST", "/api/almacen/movimientos", {
    "tipo": "ENTRADA", "productoId": p129["id"], "almacenDestinoId": almacen["id"],
    "cantidad": 0,
    "conteo": {"unidad": "PZA", "paquetes": 0, "sueltas": 7},
    "motivo": "E2E unidades (directo)",
})
check("captura directa declarada (unidad PZA, 7 sueltas) → 7 PZA",
      sc == 201 and movdirecto["cantidad"] == 7, (sc, movdirecto))

# Ajuste negativo con conteo (signo de la cantidad manda)
sc, ajuste = req("POST", "/api/almacen/movimientos", {
    "tipo": "AJUSTE", "productoId": p129["id"], "almacenDestinoId": almacen["id"],
    "cantidad": -1, "motivo": "Conteo físico E2E",
    "conteo": {"unidad": "PAQ", "paquetes": 1, "sueltas": 2},
})
check("ajuste −(1 PAQ×10 + 2) → −12 PZA (signo preservado)",
      sc == 201 and ajuste["cantidad"] == -12, (sc, ajuste))
check("stock tras ajuste (+8 neto)", abs(stock(p129["id"], almacen["id"]) - (antes + 8)) < 1e-6,
      stock(p129["id"], almacen["id"]))

# La corrección limpia el conteo; la bitácora conserva el original
sc, corregido = req("PATCH", f"/api/almacen/movimientos/{ajuste['id']}", {
    "productoId": p129["id"], "almacenDestinoId": almacen["id"],
    "cantidad": -5, "motivo": "Conteo físico E2E",
    "motivoCorreccion": "Recuento E2E",
})
check("corrección del ajuste", sc == 200 and corregido["cantidad"] == -5, (sc, corregido))
check("corrección limpia el conteo (expresado en unidad base)", corregido.get("conteo") is None, corregido.get("conteo"))
sc, detalle = req("GET", f"/api/almacen/movimientos/{ajuste['id']}")
antes_bit = detalle["correcciones"][0]["antes"] if detalle.get("correcciones") else {}
check("bitácora conserva el conteo original",
      antes_bit.get("conteo") and antes_bit["conteo"][0]["unidad"] == "PAQ", antes_bit)
check("stock tras corrección (23 − 10 + 7 − 5 = +15)",
      abs(stock(p129["id"], almacen["id"]) - (antes + 15)) < 1e-6,
      (antes, stock(p129["id"], almacen["id"])))

# ===== 5. OQC con conteo =====
print("\n— 5. OQC: liberación y scrap con conteo —")
sc, clientes = req("GET", "/api/clientes")
cliente = next((c for c in clientes if c["activo"]), None)
check("hay cliente activo para liberación", cliente is not None, len(clientes))

stock_pre_129 = stock(p129["id"], almacen["id"])
stock_pre_130 = stock(p130["id"], almacen["id"])

# Entrada extra de 129 para tener stock de sobra en la liberación
req("POST", "/api/almacen/movimientos", {
    "tipo": "ENTRADA", "productoId": p129["id"], "almacenDestinoId": almacen["id"],
    "cantidad": 200, "motivo": "E2E unidades (base)",
})
stock_pre_129 = stock(p129["id"], almacen["id"])

sc, liberacion = req("POST", "/api/oqc/salidas", {
    "clienteId": cliente["id"], "almacenOrigenId": almacen["id"],
    "referencia": "REM-E2E-UM", "responsable": "E2E",
    "lineas": [
        {"productoId": p129["id"], "cantidad": 0, "conteo": {"unidad": "PAQ", "paquetes": 2, "sueltas": 5}},
        {"productoId": p129["id"], "cantidad": 0, "conteo": {"unidad": "PAQ", "paquetes": 1, "sueltas": 0}},
        {"productoId": p130["id"], "cantidad": 0, "conteo": {"unidad": "PAQ", "paquetes": 1, "sueltas": 1}},
    ],
})
partidas = liberacion["salida"]["partidas"] if sc == 201 and liberacion.get("salida") else []
part129 = next((p for p in partidas if p["productoId"] == p129["id"]), None)
part130 = next((p for p in partidas if p["productoId"] == p130["id"]), None)
check("liberación con conteo por línea (fusión 3 PAQ×10 + 5 = 35)",
      sc == 201 and part129 and part129["cantidad"] == 35, (sc, liberacion))
check("partida 129 fusionada: 3 PAQ ×10 + 5 PZA",
      part129 and part129["conteo"] and part129["conteo"][0]["cantidad"] == 3
      and part129["conteo"][1]["cantidad"] == 5, part129 and part129.get("conteo"))
check("línea del producto 130 usa SU factor (1 PAQ×24 + 1 = 25)",
      part130 and part130["cantidad"] == 25, part130)
check("stock 129 descontado en unidad base (−35)",
      abs(stock(p129["id"], almacen["id"]) - (stock_pre_129 - 35)) < 1e-6,
      (stock_pre_129, stock(p129["id"], almacen["id"])))
check("stock 130 descontado en unidad base (−25)",
      abs(stock(p130["id"], almacen["id"]) - (stock_pre_130 - 25)) < 1e-6,
      (stock_pre_130, stock(p130["id"], almacen["id"])))

# Scrap con conteo
sc, scrap = req("POST", "/api/oqc/scrap", {
    "productoId": p129["id"], "almacenId": almacen["id"],
    "cantidad": 0, "motivo": "Daño E2E",
    "conteo": {"unidad": "PAQ", "paquetes": 1, "sueltas": 4},
})
check("scrap 1 PAQ×10 + 4 → 14 PZA", sc == 201 and scrap["cantidad"] == 14, (sc, scrap))
check("scrap conserva el detalle de conteo",
      scrap.get("conteo") and scrap["conteo"][0]["unidad"] == "PAQ", scrap.get("conteo"))

# ===== Limpieza =====
print("\n— Limpieza —")
if sc == 201:
    req("DELETE", f"/api/oqc/scrap/{scrap['id']}", {"motivoCorreccion": "Limpieza E2E"})
if liberacion and liberacion.get("salida"):
    req("DELETE", f"/api/oqc/salidas/{liberacion['salida']['id']}", {"motivoCorreccion": "Limpieza E2E"})
sc, resp = req("DELETE", f"/api/unidades/{cjax['id']}")
check("unidad de prueba CJAX eliminable tras liberar su uso", sc == 200, (sc, resp))
sc, resp = req("DELETE", f"/api/unidades/{saco['id']}")
check("paquete de prueba (SACO) eliminable", sc == 200, (sc, resp))
for p in (p129, p130, prodsin):
    sc, resp = req("DELETE", f"/api/almacen/productos/{p['id']}")
    check(f"producto {p['sku']} a papelera", sc == 200, (sc, resp))

con.close()
print("\n" + "=" * 64)
print(f"RESULTADO: {OK} OK / {FAIL} FAIL")
print("=" * 64)
exit(1 if FAIL else 0)
