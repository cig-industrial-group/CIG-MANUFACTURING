#!/usr/bin/env python3
"""E2E del fix de folios monotónicos + bitácora ligada por salidaId (opción B).

Reproduce el escenario EXACTO reportado por el usuario: con folios SAL-*
liberados por eliminaciones previas (bitácora con ELIMINACION de un folio
reciclable), una liberación OQC nueva debe:
  1. NO reciclar el folio del movimiento eliminado (serie monotónica).
  2. NO heredar correcciones ajenas en su bitácora (liga por salidaId).

Cubre además: partidas (corregir/eliminar), eliminación de salida completa
con bitácora preservada, folios OQC/SCRAP/RECH sin reutilización, ruta
manual de Almacén, y rechazo de SCRAP manual (regresión).

Requisito: servidor standalone corriendo en el puerto 3300.
"""
import json
import sqlite3
import urllib.error
import urllib.request
from datetime import datetime

BASE = "http://127.0.0.1:3300"
DB = "/home/z/my-project/db/custom.db"
FECHA = datetime.now().strftime("%Y%m%d")

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
        print(f"  [FAIL] {nombre}  -> {extra}")


def fol(prefijo, n):
    return f"{prefijo}-{FECHA}-{n:04d}"


con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
cur = con.cursor()


def num_max(prefijo):
    """Máximo número emitido de una serie según vivos + bitácora + SecuenciaFolio."""
    vivos = [r[0] for r in cur.execute(
        "SELECT folio FROM Movimiento WHERE folio LIKE ?", (f"{prefijo}-{FECHA}-%",))]
    arch = [r[0] for r in cur.execute(
        "SELECT folio FROM CorreccionMovimiento WHERE folio LIKE ?", (f"{prefijo}-{FECHA}-%",))]
    nums = [int(f.rsplit("-", 1)[1]) for f in vivos + arch if f.rsplit("-", 1)[1].isdigit()]
    seq = cur.execute("SELECT ultimo FROM SecuenciaFolio WHERE clave=?", (f"{prefijo}-{FECHA}",)).fetchone()
    if seq:
        nums.append(seq[0])
    return max(nums) if nums else 0


def num_max_salida():
    vivas = [r[0] for r in cur.execute(
        "SELECT folio FROM SalidaOQC WHERE folio LIKE ?", (f"OQC-{FECHA}-%",))]
    arch = [r[0] for r in cur.execute(
        "SELECT salidaFolio FROM CorreccionMovimiento WHERE salidaFolio LIKE ?", (f"OQC-{FECHA}-%",))]
    nums = [int(f.rsplit("-", 1)[1]) for f in vivas + arch if f and f.rsplit("-", 1)[1].isdigit()]
    seq = cur.execute("SELECT ultimo FROM SecuenciaFolio WHERE clave=?", (f"OQC-{FECHA}",)).fetchone()
    if seq:
        nums.append(seq[0])
    return max(nums) if nums else 0


def stock(producto_id, almacen_id):
    r = cur.execute(
        "SELECT cantidad FROM Stock WHERE productoId=? AND almacenId=?",
        (producto_id, almacen_id)).fetchone()
    return r[0] if r else 0.0


# ============================================================
# FASE 1 — Sesión y datos base
# ============================================================
print("\n== FASE 1: sesión y datos base ==")
sc, _ = req("POST", "/api/auth/login", {"correo": "admin@cig-manufacturing.com", "password": "Admin*2024"})
check("login admin", sc == 200, f"status={sc}")

cliente = cur.execute(
    "SELECT id, nombre FROM Cliente ORDER BY nombre LIMIT 1").fetchone()
check("hay cliente de prueba", cliente is not None)
CLIENTE_ID = cliente["id"]

# Dos productos distintos con stock holgado en el MISMO almacén activo
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
ALM, P1, P2 = fila["aid"], fila["p1"], fila["p2"]
if P1 == P2:  # misma pareja min/max imposible con COUNT>=2, defensa
    raise SystemExit("No se encontraron 2 productos distintos")

stock_p1_0, stock_p2_0 = stock(P1, ALM), stock(P2, ALM)
total_0 = cur.execute("SELECT ROUND(SUM(cantidad),2) FROM Stock").fetchone()[0]
print(f"  datos: cliente={cliente['nombre'][:30]} | P1={P1[:8]} stock={stock_p1_0} | P2={P2[:8]} stock={stock_p2_0}")

# ============================================================
# FASE 2 — ESCENARIO FANTASMA (reporte del usuario)
# ============================================================
print("\n== FASE 2: liberación nueva NO hereda bitácora ni folio reciclado ==")
max_sal = num_max("SAL")
max_sal_inicial = max_sal
max_oqc = num_max_salida()
fantasma = fol("SAL", max_sal)  # con el bug, la partida recibía este folio reciclado
print(f"  serie SAL-{FECHA}: máximo histórico={max_sal} (folio fantasma potencial={fantasma})")

sc, r = req("POST", "/api/oqc/salidas", {
    "clienteId": CLIENTE_ID, "almacenOrigenId": ALM,
    "lineas": [{"productoId": P1, "cantidad": 10}],
    "referencia": "E2E-FIX-1", "responsable": "E2E", "notas": "escenario fantasma"})
check("POST liberación (1 partida) 201", sc == 201, f"status={sc} body={r}")
S1 = r.get("salida", {}) if isinstance(r, dict) else {}
S1_ID = S1.get("id")
check(f"folio salida = OQC-{FECHA}-{max_oqc + 1:04d}", S1.get("folio") == fol("OQC", max_oqc + 1),
      f"esperado={fol('OQC', max_oqc + 1)} obtenido={S1.get('folio')}")
partidas1 = S1.get("partidas", [])
check("partida creada", len(partidas1) == 1, f"n={len(partidas1)}")
folio_partida1 = partidas1[0]["folio"] if partidas1 else None
check(f"folio partida = SAL siguiente ({fol('SAL', max_sal + 1)}), NO el reciclado {fantasma}",
      folio_partida1 == fol("SAL", max_sal + 1),
      f"esperado={fol('SAL', max_sal + 1)} obtenido={folio_partida1}")
check("stock P1 descontado 10", abs(stock(P1, ALM) - (stock_p1_0 - 10)) < 1e-6,
      f"esperado={stock_p1_0 - 10} obtenido={stock(P1, ALM)}")

sc, r = req("GET", f"/api/oqc/salidas/{S1_ID}")
det = r if isinstance(r, dict) else {}
correcciones = det.get("correcciones", [])
check("*** BITÁCORA VACÍA sin correcciones heredadas (bug del usuario) ***",
      correcciones == [], f"correcciones={json.dumps(correcciones, ensure_ascii=False)[:300]}")

# ============================================================
# FASE 3 — correcciones ligadas por salidaId
# ============================================================
print("\n== FASE 3: corrección de partida queda en bitácora por salidaId ==")
PART1_ID = partidas1[0]["id"] if partidas1 else None
# El cuerpo NO lleva remisión/responsable (como el diálogo real): el servidor
# debe reflejarlos desde la cabecera y NO perderlos (bug reportado).
sc, r = req("PATCH", f"/api/oqc/salidas/{S1_ID}/partidas/{PART1_ID}", {
    "productoId": P1, "almacenOrigenId": ALM, "cantidad": 7,
    "motivo": "Salida a cliente", "motivoCorreccion": "E2E: captura equivocada"})
check("PATCH partida 10→7", sc == 200, f"status={sc} body={r}")
check("*** la partida CONSERVA la remisión tras corregir (bug 1 usuario) ***",
      isinstance(r, dict) and r.get("referencia") == "E2E-FIX-1",
      f"referencia={r.get('referencia') if isinstance(r, dict) else r}")
check("*** la partida CONSERVA el responsable tras corregir ***",
      isinstance(r, dict) and r.get("responsable") == "E2E",
      f"responsable={r.get('responsable') if isinstance(r, dict) else r}")
check("stock P1 queda -7 (devuelve 3)", abs(stock(P1, ALM) - (stock_p1_0 - 7)) < 1e-6,
      f"esperado={stock_p1_0 - 7} obtenido={stock(P1, ALM)}")

sc, r = req("GET", f"/api/oqc/salidas/{S1_ID}")
correcciones = r.get("correcciones", []) if isinstance(r, dict) else []
check("bitácora = 1 EDICION", len(correcciones) == 1 and correcciones[0]["accion"] == "EDICION",
      f"n={len(correcciones)}")
check("la corrección cita el folio de la partida",
      len(correcciones) == 1 and correcciones[0]["folio"] == folio_partida1,
      f"{correcciones[:1]}")

# ---- salida con 2 partidas: eliminar una partida y la salida completa
sc, r = req("POST", "/api/oqc/salidas", {
    "clienteId": CLIENTE_ID, "almacenOrigenId": ALM,
    "lineas": [{"productoId": P1, "cantidad": 15}, {"productoId": P2, "cantidad": 20}],
    "referencia": "E2E-FIX-2", "responsable": "E2E"})
check("POST liberación 2 partidas 201", sc == 201, f"status={sc} body={r}")
S2 = r.get("salida", {})
S2_ID = S2.get("id")
p2s = S2.get("partidas", [])
pA = next((p for p in p2s if p["productoId"] == P1), None)
pB = next((p for p in p2s if p["productoId"] == P2), None)
check("salida 2 con 2 partidas", pA is not None and pB is not None)
check(f"folios partida consecutivos nuevos ({fol('SAL', max_sal + 2)}, {fol('SAL', max_sal + 3)})",
      sorted(p["folio"] for p in p2s) == [fol("SAL", max_sal + 2), fol("SAL", max_sal + 3)],
      f"obtenido={[p['folio'] for p in p2s]}")
check("stock P2 descontado 20", abs(stock(P2, ALM) - (stock_p2_0 - 20)) < 1e-6,
      f"esperado={stock_p2_0 - 20} obtenido={stock(P2, ALM)}")

sc, r = req("DELETE", f"/api/oqc/salidas/{S2_ID}/partidas/{pB['id']}",
            {"motivoCorreccion": "E2E: partida capturada por error"})
check("DELETE partida B 200", sc == 200, f"status={sc} body={r}")
check("stock P2 restaurado", abs(stock(P2, ALM) - stock_p2_0) < 1e-6,
      f"esperado={stock_p2_0} obtenido={stock(P2, ALM)}")

# Editar cabecera: ahora exige motivo de corrección, lo documenta en la
# bitácora como «Edición de cabecera» y PROPAGA remisión/responsable a las
# partidas vivas (bug 2 del usuario).
sc, r = req("PATCH", f"/api/oqc/salidas/{S2_ID}",
            {"referencia": "E2E-FIX-2-EDITADA", "notas": "cabecera corregida",
             "motivoCorreccion": "E2E: remisión corregida"})
check("PATCH cabecera salida 200", sc == 200, f"status={sc} body={r}")

sc, r = req("GET", f"/api/oqc/salidas/{S2_ID}")
det2 = r if isinstance(r, dict) else {}
corr2 = det2.get("correcciones", [])
check("bitácora salida 2 = 2 (ELIMINACION partida B + EDICION cabecera)",
      len(corr2) == 2 and sorted(c["accion"] for c in corr2) == ["EDICION", "ELIMINACION"],
      f"n={len(corr2)} acciones={[c['accion'] for c in corr2]}")
ed_cab = next((c for c in corr2 if c.get("esCabecera")), None)
check("la edición de cabecera queda en bitácora (folio OQC, esCabecera)",
      ed_cab is not None and ed_cab["folio"] == S2.get("folio") and ed_cab["motivo"] == "E2E: remisión corregida",
      f"{ed_cab}")
partidas_v2 = det2.get("salida", {}).get("partidas", [])
check("*** la remisión editada se PROPAGA a la partida viva (bug 2 usuario) ***",
      len(partidas_v2) == 1 and partidas_v2[0]["referencia"] == "E2E-FIX-2-EDITADA",
      f"n={len(partidas_v2)} referencia={partidas_v2[0].get('referencia') if partidas_v2 else None}")
check("salida 2 conserva 1 partida viva", len(partidas_v2) == 1,
      f"n={len(partidas_v2)}")

# PATCH de cabecera sin motivo de corrección → 400 (auditoría obligatoria)
sc, r = req("PATCH", f"/api/oqc/salidas/{S2_ID}", {"notas": "sin motivo"})
check("PATCH cabecera sin motivo → 400", sc == 400, f"status={sc} body={r}")

# Eliminar la salida completa
sc, r = req("DELETE", f"/api/oqc/salidas/{S2_ID}", {"motivoCorreccion": "E2E: limpieza de salida 2"})
check("DELETE salida completa 200", sc == 200, f"status={sc} body={r}")
check("stock P1 restaurado (partida A revertida)",
      abs(stock(P1, ALM) - (stock_p1_0 - 7)) < 1e-6,
      f"esperado={stock_p1_0 - 7} obtenido={stock(P1, ALM)}")

sc, r = req("GET", f"/api/oqc/salidas/{S2_ID}")
det2 = r if isinstance(r, dict) else {}
check("salida 2 ELIMINADA pero consultable",
      det2.get("salida", {}).get("estado") == "ELIMINADA", f"{det2.get('salida', {}).get('estado')}")
check("bitácora preservada tras eliminar salida = 3 (ELIM B + EDIC cabecera + ELIM A)",
      len(det2.get("correcciones", [])) == 3, f"n={len(det2.get('correcciones', []))}")

# Eliminar también la salida 1 (partida corregida) — su bitácora queda en 2
sc, r = req("DELETE", f"/api/oqc/salidas/{S1_ID}", {"motivoCorreccion": "E2E: limpieza de salida 1"})
check("DELETE salida 1 200", sc == 200, f"status={sc} body={r}")
check("stock P1 totalmente restaurado", abs(stock(P1, ALM) - stock_p1_0) < 1e-6,
      f"esperado={stock_p1_0} obtenido={stock(P1, ALM)}")
sc, r = req("GET", f"/api/oqc/salidas/{S1_ID}")
det1 = r if isinstance(r, dict) else {}
check("bitácora salida 1 = 2 (EDICION + ELIMINACION)",
      len(det1.get("correcciones", [])) == 2 and
      {c["accion"] for c in det1.get("correcciones", [])} == {"EDICION", "ELIMINACION"},
      f"n={len(det1.get('correcciones', []))}")

# ============================================================
# FASE 4 — folios OQC sin reutilización tras eliminación
# ============================================================
print("\n== FASE 4: nueva liberación tras eliminaciones ==")
esperado_oqc3 = num_max_salida() + 1  # las eliminadas mantienen su número quemado
sc, r = req("POST", "/api/oqc/salidas", {
    "clienteId": CLIENTE_ID, "almacenOrigenId": ALM,
    "lineas": [{"productoId": P1, "cantidad": 5}],
    "referencia": "E2E-FIX-3"})
check("POST salida 3 (201)", sc == 201, f"status={sc} body={r}")
S3 = r.get("salida", {})
S3_ID = S3.get("id")
check(f"folio salida 3 = {fol('OQC', esperado_oqc3)} (serie OQC no reutiliza)",
      S3.get("folio") == fol("OQC", esperado_oqc3),
      f"esperado={fol('OQC', esperado_oqc3)} obtenido={S3.get('folio')}")
sc, r = req("GET", f"/api/oqc/salidas/{S3_ID}")
correcciones = r.get("correcciones", []) if isinstance(r, dict) else []
check("bitácora salida 3 VACÍA (sin fantasmas de salidas eliminadas)", correcciones == [],
      f"correcciones={json.dumps(correcciones, ensure_ascii=False)[:200]}")
sc, r = req("DELETE", f"/api/oqc/salidas/{S3_ID}", {"motivoCorreccion": "E2E: limpieza de salida 3"})
check("DELETE salida 3 (limpieza)", sc == 200, f"status={sc}")

# ============================================================
# FASE 5 — ruta manual de Almacén: serie SAL compartida
# ============================================================
print("\n== FASE 5: movimientos manuales de Almacén ==")
max_sal = num_max("SAL")
sc, r = req("POST", "/api/almacen/movimientos", {
    "tipo": "SALIDA", "productoId": P1, "almacenOrigenId": ALM, "cantidad": 3,
    "motivo": "E2E manual 1"})
check("POST SALIDA manual 201", sc == 201, f"status={sc} body={r}")
M1_ID = r.get("id")
check(f"folio manual = {fol('SAL', max_sal + 1)} (continúa serie)",
      r.get("folio") == fol("SAL", max_sal + 1),
      f"esperado={fol('SAL', max_sal + 1)} obtenido={r.get('folio')}")
folio_manual_1 = r.get("folio")

sc, r = req("DELETE", f"/api/almacen/movimientos/{M1_ID}", {"motivoCorreccion": "E2E: limpieza manual 1"})
check("DELETE manual 1 200", sc == 200, f"status={sc} body={r}")

sc, r = req("POST", "/api/almacen/movimientos", {
    "tipo": "SALIDA", "productoId": P1, "almacenOrigenId": ALM, "cantidad": 2,
    "motivo": "E2E manual 2"})
check("POST SALIDA manual 2 (201)", sc == 201, f"status={sc} body={r}")
check(f"folio manual 2 = {fol('SAL', max_sal + 2)} — NO recicla el recién eliminado {folio_manual_1}",
      r.get("folio") == fol("SAL", max_sal + 2) and r.get("folio") != folio_manual_1,
      f"obtenido={r.get('folio')}")
M2_ID = r.get("id")
sc, r = req("DELETE", f"/api/almacen/movimientos/{M2_ID}", {"motivoCorreccion": "E2E: limpieza manual 2"})
check("DELETE manual 2 (limpieza)", sc == 200, f"status={sc}")

# Regresión: SCRAP sigue prohibido en la ruta manual
sc, r = req("POST", "/api/almacen/movimientos", {
    "tipo": "SCRAP", "productoId": P1, "almacenOrigenId": ALM, "cantidad": 1, "motivo": "x"})
check("SCRAP manual rechazado 400 (solo desde OQC)", sc == 400, f"status={sc} body={r}")

# Bitácora de Almacén por movimientoId (endpoint intacto)
vivo = cur.execute(
    "SELECT id FROM Movimiento WHERE folio LIKE ? ORDER BY createdAt DESC LIMIT 1",
    (f"SAL-{FECHA}-%",)).fetchone()
sc, r = req("GET", f"/api/almacen/movimientos/{vivo['id']}")
check("GET detalle Almacén por id 200", sc == 200, f"status={sc}")
check("endpoint Almacén devuelve lista de correcciones", isinstance(r, dict) and "correcciones" in r,
      f"keys={list(r.keys()) if isinstance(r, dict) else r}")

# ============================================================
# FASE 6 — SCRAP sin reutilización de folio
# ============================================================
print("\n== FASE 6: scrap ==")
# máximo histórico SCR (vivos + bitácora + SecuenciaFolio, la autoridad)
scr_vivos = [r[0] for r in cur.execute("SELECT folio FROM Movimiento WHERE folio LIKE ?", (f"SCR-{FECHA}-%",))]
scr_arch = [r[0] for r in cur.execute("SELECT folio FROM CorreccionMovimiento WHERE folio LIKE ?", (f"SCR-{FECHA}-%",))]
nums = [int(f.rsplit("-", 1)[1]) for f in scr_vivos + scr_arch if f.rsplit("-", 1)[1].isdigit()]
scr_seq = cur.execute("SELECT ultimo FROM SecuenciaFolio WHERE clave=?", (f"SCR-{FECHA}",)).fetchone()
if scr_seq:
    nums.append(scr_seq[0])
max_scr = max(nums) if nums else 0
print(f"  serie SCR-{FECHA}: máximo histórico={max_scr}")

sc, r = req("POST", "/api/oqc/scrap", {
    "productoId": P1, "almacenId": ALM, "cantidad": 4,
    "motivo": "E2E scrap 1", "responsable": "E2E"})
check("POST scrap 1 (201)", sc == 201, f"status={sc} body={r}")
SCR1 = r.get("id")
check(f"folio scrap 1 = SCR siguiente ({fol('SCR', max_scr + 1)}), NO recicla",
      r.get("folio") == fol("SCR", max_scr + 1),
      f"esperado={fol('SCR', max_scr + 1)} obtenido={r.get('folio')}")
check("stock P1 -4 por scrap", abs(stock(P1, ALM) - (stock_p1_0 - 4)) < 1e-6,
      f"esperado={stock_p1_0 - 4} obtenido={stock(P1, ALM)}")
sc, r = req("DELETE", f"/api/oqc/scrap/{SCR1}", {"motivoCorreccion": "E2E: scrap de prueba"})
check("DELETE scrap 1 (200)", sc == 200, f"status={sc} body={r}")
check("stock P1 restaurado", abs(stock(P1, ALM) - stock_p1_0) < 1e-6,
      f"esperado={stock_p1_0} obtenido={stock(P1, ALM)}")

sc, r = req("POST", "/api/oqc/scrap", {
    "productoId": P1, "almacenId": ALM, "cantidad": 2,
    "motivo": "E2E scrap 2", "responsable": "E2E"})
check("POST scrap 2 (201)", sc == 201, f"status={sc} body={r}")
SCR2 = r.get("id")
check(f"folio scrap 2 = {fol('SCR', max_scr + 2)} — serie SCR no reutiliza",
      r.get("folio") == fol("SCR", max_scr + 2),
      f"esperado={fol('SCR', max_scr + 2)} obtenido={r.get('folio')}")
sc, r = req("DELETE", f"/api/oqc/scrap/{SCR2}", {"motivoCorreccion": "E2E: limpieza scrap 2"})
check("DELETE scrap 2 (limpieza)", sc == 200, f"status={sc}")

# ============================================================
# FASE 7 — RECHAZOS sin reutilización de folio
# ============================================================
print("\n== FASE 7: rechazos ==")
# Los rechazos se eliminan sin bitácora: la única memoria de sus folios es
# SecuenciaFolio (por eso es la autoridad). Vivos + serie:
vivos = [r[0] for r in cur.execute("SELECT folio FROM RegistroRechazo WHERE folio LIKE ?", (f"RECH-{FECHA}-%",))]
nums = [int(f.rsplit("-", 1)[1]) for f in vivos if f.rsplit("-", 1)[1].isdigit()]
seq = cur.execute("SELECT ultimo FROM SecuenciaFolio WHERE clave=?", (f"RECH-{FECHA}",)).fetchone()
if seq:
    nums.append(seq[0])
max_rech = max(nums) if nums else 0

sc, r = req("POST", "/api/oqc/rechazos", {
    "productoId": P1, "clienteId": CLIENTE_ID, "cantidad": 2,
    "motivo": "E2E rechazo 1", "disposicion": "PENDIENTE"})
check("POST rechazo 1 (201)", sc == 201, f"status={sc} body={r}")
R1 = r.get("id")
check(f"folio rechazo 1 = {fol('RECH', max_rech + 1)}", r.get("folio") == fol("RECH", max_rech + 1),
      f"esperado={fol('RECH', max_rech + 1)} obtenido={r.get('folio')}")
folio_rech_1 = r.get("folio")
sc, r = req("DELETE", f"/api/oqc/rechazos/{R1}")
check("DELETE rechazo 1 (200)", sc == 200, f"status={sc} body={r}")

sc, r = req("POST", "/api/oqc/rechazos", {
    "productoId": P1, "clienteId": CLIENTE_ID, "cantidad": 1,
    "motivo": "E2E rechazo 2", "disposicion": "RETRABAJO"})
check("POST rechazo 2 (201)", sc == 201, f"status={sc} body={r}")
R2 = r.get("id")
check(f"folio rechazo 2 = {fol('RECH', max_rech + 2)} — NO recicla el eliminado {folio_rech_1}",
      r.get("folio") == fol("RECH", max_rech + 2) and r.get("folio") != folio_rech_1,
      f"obtenido={r.get('folio')}")
sc, r = req("DELETE", f"/api/oqc/rechazos/{R2}")
check("DELETE rechazo 2 (limpieza)", sc == 200, f"status={sc}")

# ============================================================
# FASE 8 — integridad final
# ============================================================
print("\n== FASE 8: integridad final ==")
total_1 = cur.execute("SELECT ROUND(SUM(cantidad),2) FROM Stock").fetchone()[0]
check(f"stock total restaurado ({total_0} → {total_1})", abs(total_1 - total_0) < 1e-6,
      f"esperado={total_0} obtenido={total_1}")
check("stock P1 intacto", abs(stock(P1, ALM) - stock_p1_0) < 1e-6)
check("stock P2 intacto", abs(stock(P2, ALM) - stock_p2_0) < 1e-6)

secuencias = {r["clave"]: r["ultimo"] for r in cur.execute("SELECT clave, ultimo FROM SecuenciaFolio")}
print(f"  SecuenciaFolio: {secuencias}")
for clave in [f"SAL-{FECHA}", f"OQC-{FECHA}", f"SCR-{FECHA}", f"RECH-{FECHA}"]:
    check(f"serie {clave} registrada en SecuenciaFolio", clave in secuencias,
          f"claves={list(secuencias)}")

# El número fantasma (máximo histórico PRE-fix) jamás se reasignó a un vivo
check(f"el folio fantasma {fantasma} NO fue reasignado a ningún movimiento vivo",
      cur.execute("SELECT COUNT(*) FROM Movimiento WHERE folio=?", (fantasma,)).fetchone()[0] == 0)
check(f"serie SAL avanzó más allá del histórico pre-fix ({max_sal_inicial})",
      secuencias.get(f"SAL-{FECHA}", 0) > max_sal_inicial,
      f"ultimo={secuencias.get(f'SAL-{FECHA}')}")
vivos_hoy = [dict(r) for r in cur.execute(
    "SELECT folio FROM Movimiento WHERE folio LIKE ? ORDER BY folio", (f"%{FECHA}%",))]
print(f"  folios vivos hoy: {[v['folio'] for v in vivos_hoy]}")

# ============================================================
# RESUMEN
# ============================================================
print(f"\n{'=' * 60}")
print(f"RESULTADO: {OK} OK / {FAIL} FAIL")
print("=" * 60)
raise SystemExit(1 if FAIL else 0)
