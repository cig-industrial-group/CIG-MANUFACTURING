#!/usr/bin/env python3
"""E2E de sincronización remisión (PL) / responsable entre cabecera y partidas.

Reproduce los DOS bugs reportados por el usuario:
  1. Corregir una partida en OQC (p.ej. la cantidad) PERDÍA la remisión y
     el responsable del registro en el historial de movimientos.
  2. Editar la cabecera de la salida (nota / remisión) NO se reflejaba en
     el historial de movimientos de sus partidas.

Reglas verificadas (v1.0.0, opción robusta):
  · La partida SIEMPRE refleja la remisión/responsable de la cabecera.
  · Editar la cabecera propaga a todas las partidas vivas y queda en la
    bitácora inmutable como «Edición de cabecera» (con motivo obligatorio).
  · Remisión vacía → la partida muestra el folio de la salida; responsable
    vacío → firma quien liberó (mismas reglas que al liberar).
  · Ruta manual de Almacén (RegistrosSeccion): en partidas agrupadas la
    remisión/responsable se conservan; en movimientos libres, cadena vacía
    limpia y un valor lo establece.

Requisito: servidor standalone corriendo en el puerto 3300.
"""
import json
import sqlite3
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:3300"
DB = "/home/z/my-project/db/custom.db"

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


def mov_db(mov_id):
    return cur.execute(
        "SELECT folio, referencia, responsable, salidaId, salidaFolio, editado"
        " FROM Movimiento WHERE id=?", (mov_id,)).fetchone()


# ============================================================
# FASE 1 — Sesión y datos base
# ============================================================
print("\n== FASE 1: sesión y datos base ==")
sc, _ = req("POST", "/api/auth/login", {"correo": "admin@cig-manufacturing.com", "password": "Admin*2024"})
check("login admin", sc == 200, f"status={sc}")

cliente = cur.execute("SELECT id, nombre FROM Cliente ORDER BY nombre LIMIT 1").fetchone()
check("hay cliente de prueba", cliente is not None)
CLIENTE_ID = cliente["id"]

fila = cur.execute("""
    SELECT s.almacenId AS aid, MIN(s.productoId) AS p1, MAX(s.productoId) AS p2
    FROM Stock s
    JOIN Almacen a ON a.id = s.almacenId AND a.activo = 1
    JOIN Producto p ON p.id = s.productoId AND p.activo = 1
    WHERE s.cantidad >= 100
    GROUP BY s.almacenId
    HAVING COUNT(*) >= 2
    LIMIT 1
""").fetchone()
check("hay almacén con 2 productos con stock", fila is not None)
if fila is None:
    raise SystemExit("Sin datos de prueba disponibles")
ALM, P1, P2 = fila["aid"], fila["p1"], fila["p2"]

stock_p1_0, stock_p2_0 = stock(P1, ALM), stock(P2, ALM)
print(f"  datos: cliente={cliente['nombre'][:30]} | P1={P1[:8]} stock={stock_p1_0} | P2={P2[:8]} stock={stock_p2_0}")

# ============================================================
# FASE 2 — Liberación con remisión y responsable explícitos
# ============================================================
print("\n== FASE 2: liberación con remisión (PL) y responsable ==")
sc, r = req("POST", "/api/oqc/salidas", {
    "clienteId": CLIENTE_ID, "almacenOrigenId": ALM,
    "lineas": [{"productoId": P1, "cantidad": 4}, {"productoId": P2, "cantidad": 6}],
    "referencia": "REM-SYNC-A", "responsable": "Inspector Sync", "notas": "sync e2e"})
check("POST liberación (2 partidas) 201", sc == 201, f"status={sc} body={r}")
S = r.get("salida", {}) if isinstance(r, dict) else {}
S_ID, S_FOLIO = S.get("id"), S.get("folio")
partidas = S.get("partidas", [])
check("salida con 2 partidas", len(partidas) == 2, f"n={len(partidas)}")
pA = next((p for p in partidas if p["productoId"] == P1), None)
pB = next((p for p in partidas if p["productoId"] == P2), None)
check("las partidas nacen con la remisión de la cabecera",
      pA is not None and pA["referencia"] == "REM-SYNC-A" and pB is not None and pB["referencia"] == "REM-SYNC-A",
      f"A={pA and pA['referencia']} B={pB and pB['referencia']}")
check("las partidas nacen con el responsable de la cabecera",
      pA is not None and pA["responsable"] == "Inspector Sync" and pB is not None and pB["responsable"] == "Inspector Sync",
      f"A={pA and pA['responsable']} B={pB and pB['responsable']}")

# ============================================================
# FASE 3 — BUG 1: corregir una partida NO pierde remisión/responsable
# ============================================================
print("\n== FASE 3: corregir partida (cantidad) conserva remisión/PL y responsable ==")
sc, r = req("PATCH", f"/api/oqc/salidas/{S_ID}/partidas/{pA['id']}", {
    "productoId": P1, "almacenOrigenId": ALM, "cantidad": 3,
    "motivo": "Salida a cliente", "motivoCorreccion": "E2E sync: cantidad equivocada"})
check("PATCH partida 4→3", sc == 200, f"status={sc} body={r}")
check("*** BUG 1: la partida conserva la remisión (PL) tras corregir ***",
      isinstance(r, dict) and r.get("referencia") == "REM-SYNC-A",
      f"referencia={r.get('referencia') if isinstance(r, dict) else r}")
check("*** BUG 1: la partida conserva el responsable tras corregir ***",
      isinstance(r, dict) and r.get("responsable") == "Inspector Sync",
      f"responsable={r.get('responsable') if isinstance(r, dict) else r}")
fila_db = mov_db(pA["id"])
check("BD: el movimiento conserva remisión/responsable",
      fila_db is not None and fila_db["referencia"] == "REM-SYNC-A" and fila_db["responsable"] == "Inspector Sync",
      f"{dict(fila_db) if fila_db else None}")
check("stock P1 descontado 3 (devuelve 1)", abs(stock(P1, ALM) - (stock_p1_0 - 3)) < 1e-6,
      f"esperado={stock_p1_0 - 3} obtenido={stock(P1, ALM)}")

sc, r = req("GET", f"/api/oqc/salidas/{S_ID}")
corr = r.get("correcciones", []) if isinstance(r, dict) else []
check("bitácora = 1 EDICION (de partida, esCabecera=False)",
      len(corr) == 1 and corr[0]["accion"] == "EDICION" and corr[0].get("esCabecera") is False,
      f"{corr[:1]}")
if corr:
    despues = corr[0].get("despues") or {}
    check("el snapshot «después» de la corrección conserva la remisión",
          despues.get("referencia") == "REM-SYNC-A", f"despues={despues}")

# ============================================================
# FASE 4 — BUG 2: editar la cabecera PROPAGA a las partidas
# ============================================================
print("\n== FASE 4: editar cabecera (remisión/responsable) se propaga ==")
sc, r = req("PATCH", f"/api/oqc/salidas/{S_ID}", {
    "referencia": "REM-SYNC-B", "responsable": "Nuevo Responsable",
    "notas": "remisión corregida", "motivoCorreccion": "E2E sync: remisión mal capturada"})
check("PATCH cabecera 200", sc == 200, f"status={sc} body={r}")
check("la cabecera muestra la nueva remisión",
      isinstance(r, dict) and r.get("referencia") == "REM-SYNC-B",
      f"referencia={r.get('referencia') if isinstance(r, dict) else r}")

sc, r = req("GET", f"/api/oqc/salidas/{S_ID}")
det = r if isinstance(r, dict) else {}
partidas_v = det.get("salida", {}).get("partidas", [])
check("*** BUG 2: TODAS las partidas reflejan la nueva remisión ***",
      len(partidas_v) == 2 and all(p["referencia"] == "REM-SYNC-B" for p in partidas_v),
      f"referencias={[p.get('referencia') for p in partidas_v]}")
check("*** BUG 2: TODAS las partidas reflejan el nuevo responsable ***",
      len(partidas_v) == 2 and all(p["responsable"] == "Nuevo Responsable" for p in partidas_v),
      f"responsables={[p.get('responsable') for p in partidas_v]}")
filaA, filaB = mov_db(pA["id"]), mov_db(pB["id"])
check("BD: ambos movimientos actualizados",
      filaA["referencia"] == "REM-SYNC-B" and filaB["referencia"] == "REM-SYNC-B"
      and filaA["responsable"] == "Nuevo Responsable" and filaB["responsable"] == "Nuevo Responsable",
      f"A={dict(filaA)} B={dict(filaB)}")

# El historial de movimientos (Almacén) encuentra la partida por la nueva remisión
sc, r = req("GET", "/api/almacen/movimientos?q=REM-SYNC-B&porPagina=50")
encontrados = [m for m in (r.get("movimientos", []) if isinstance(r, dict) else [])
               if m.get("folio") in (pA["folio"], pB["folio"])]
check("*** BUG 2: el historial de movimientos muestra el dato nuevo (búsqueda) ***",
      len(encontrados) == 2, f"n={len(encontrados)}")

corr = det.get("correcciones", [])
ed_cab = next((c for c in corr if c.get("esCabecera")), None)
check("bitácora: aparece la «Edición de cabecera» (folio OQC)",
      ed_cab is not None and ed_cab["folio"] == S_FOLIO and ed_cab["accion"] == "EDICION",
      f"{ed_cab}")
if ed_cab:
    check("snapshot antes/después de la cabecera correcto",
          (ed_cab.get("antes") or {}).get("referencia") == "REM-SYNC-A"
          and (ed_cab.get("despues") or {}).get("referencia") == "REM-SYNC-B",
          f"antes={ed_cab.get('antes')} despues={ed_cab.get('despues')}")

# ============================================================
# FASE 5 — Limpiar remisión/responsable: reglas de respaldo
# ============================================================
print("\n== FASE 5: limpiar remisión → folio de salida; responsable → quien liberó ==")
sc, r = req("PATCH", f"/api/oqc/salidas/{S_ID}", {
    "referencia": "", "responsable": "", "motivoCorreccion": "E2E sync: datos vacíos"})
check("PATCH cabecera (vaciar) 200", sc == 200, f"status={sc} body={r}")
check("la cabecera queda sin remisión", isinstance(r, dict) and r.get("referencia") is None,
      f"referencia={r.get('referencia') if isinstance(r, dict) else r}")

sc, r = req("GET", f"/api/oqc/salidas/{S_ID}")
det = r if isinstance(r, dict) else {}
partidas_v = det.get("salida", {}).get("partidas", [])
check("las partidas muestran el FOLIO de salida como referencia (regla de liberación)",
      len(partidas_v) == 2 and all(p["referencia"] == S_FOLIO for p in partidas_v),
      f"referencias={[p.get('referencia') for p in partidas_v]} esperado={S_FOLIO}")
usuario_lib = det.get("salida", {}).get("usuarioNombre")
check("las partidas firman con quien LIBERÓ la salida",
      len(partidas_v) == 2 and usuario_lib and all(p["responsable"] == usuario_lib for p in partidas_v),
      f"responsables={[p.get('responsable') for p in partidas_v]} usuario={usuario_lib}")

# ============================================================
# FASE 6 — Ruta Almacén sobre una partida agrupada (RegistrosSeccion)
# ============================================================
print("\n== FASE 6: corregir partida agrupada desde Almacén (Registros) ==")
sc, r = req("PATCH", f"/api/almacen/movimientos/{pA['id']}", {
    "productoId": P1, "almacenOrigenId": ALM, "cantidad": 2,
    "motivo": "Salida a cliente", "motivoCorreccion": "E2E sync: desde registros de Almacén"})
check("PATCH movimiento agrupado 200", sc == 200, f"status={sc} body={r}")
check("conserva la referencia (espejo de la cabecera) aunque no se envíe",
      isinstance(r, dict) and r.get("referencia") == S_FOLIO,
      f"referencia={r.get('referencia') if isinstance(r, dict) else r}")
check("conserva el responsable aunque no se envíe",
      isinstance(r, dict) and r.get("responsable") == usuario_lib,
      f"responsable={r.get('responsable') if isinstance(r, dict) else r}")
check("salidaId/salidaFolio visibles en el historial de Almacén",
      isinstance(r, dict) and r.get("salidaId") == S_ID and r.get("salidaFolio") == S_FOLIO,
      f"salidaId={r.get('salidaId') if isinstance(r, dict) else r}")

# ============================================================
# FASE 7 — Contrato en movimiento manual (no agrupado)
# ============================================================
print("\n== FASE 7: movimiento manual — vaciar limpia, valor establece ==")
sc, r = req("POST", "/api/almacen/movimientos", {
    "tipo": "SALIDA", "productoId": P1, "almacenOrigenId": ALM, "cantidad": 1,
    "referencia": "PED-SYNC", "responsable": "Resp Manual"})
check("POST salida manual 201", sc == 201, f"status={sc} body={r}")
M_ID = r.get("id") if isinstance(r, dict) else None

sc, r = req("PATCH", f"/api/almacen/movimientos/{M_ID}", {
    "productoId": P1, "almacenOrigenId": ALM, "cantidad": 1,
    "referencia": "", "motivoCorreccion": "E2E sync: limpiar referencia"})
check("PATCH manual: referencia \"\" limpia el dato",
      sc == 200 and isinstance(r, dict) and r.get("referencia") is None,
      f"status={sc} referencia={r.get('referencia') if isinstance(r, dict) else r}")
sc, r = req("PATCH", f"/api/almacen/movimientos/{M_ID}", {
    "productoId": P1, "almacenOrigenId": ALM, "cantidad": 1,
    "referencia": "PED-SYNC-2", "responsable": "Otro Responsable",
    "motivoCorreccion": "E2E sync: nueva referencia"})
check("PATCH manual: un valor lo establece",
      sc == 200 and isinstance(r, dict) and r.get("referencia") == "PED-SYNC-2"
      and r.get("responsable") == "Otro Responsable",
      f"status={sc} ref={r.get('referencia') if isinstance(r, dict) else r}")

sc, r = req("DELETE", f"/api/almacen/movimientos/{M_ID}", {"motivoCorreccion": "E2E sync: limpieza manual"})
check("DELETE salida manual (limpieza)", sc == 200, f"status={sc}")

# ============================================================
# FASE 8 — Validaciones
# ============================================================
print("\n== FASE 8: validaciones ==")
sc, r = req("PATCH", f"/api/oqc/salidas/{S_ID}", {"notas": "sin motivo"})
check("PATCH cabecera sin motivo → 400", sc == 400, f"status={sc} body={r}")
sc, r = req("PATCH", f"/api/oqc/salidas/{S_ID}/partidas/{pB['id']}", {
    "productoId": P2, "almacenOrigenId": ALM, "cantidad": 6})
check("PATCH partida sin motivo → 400", sc == 400, f"status={sc} body={r}")

# ============================================================
# FASE 9 — Limpieza final
# ============================================================
print("\n== FASE 9: limpieza ==")
sc, r = req("DELETE", f"/api/oqc/salidas/{S_ID}", {"motivoCorreccion": "E2E sync: limpieza de salida"})
check("DELETE salida completa 200", sc == 200, f"status={sc} body={r}")
check("stock P1 restaurado", abs(stock(P1, ALM) - stock_p1_0) < 1e-6,
      f"esperado={stock_p1_0} obtenido={stock(P1, ALM)}")
check("stock P2 restaurado", abs(stock(P2, ALM) - stock_p2_0) < 1e-6,
      f"esperado={stock_p2_0} obtenido={stock(P2, ALM)}")

sc, r = req("GET", f"/api/oqc/salidas/{S_ID}")
det = r if isinstance(r, dict) else {}
corr = det.get("correcciones", [])
acciones = sorted(c["accion"] for c in corr)
check("bitácora final = 6 (4 EDICION: 3 partida + 1... ver comentario)",
      len(corr) == 6 and acciones == ["EDICION"] * 4 + ["ELIMINACION"] * 2,
      f"n={len(corr)} acciones={acciones}")
# 6 = EDICION partida A (fase 3) + EDICION cabecera (fase 4) + EDICION cabecera (fase 5)
#     + EDICION partida A vía Almacén (fase 6) + ELIMINACION partida A + ELIMINACION partida B

con.close()
print(f"\n===== RESULTADO: {OK} OK / {FAIL} FAIL =====")
raise SystemExit(1 if FAIL else 0)
