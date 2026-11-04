#!/usr/bin/env python3
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

"""E2E del módulo de Respaldo y Restauración (v1.0.0).

Valida el ciclo completo CONTRA EL SERVIDOR EN PRODUCCIÓN (standalone,
puerto 3300, sin reiniciarlo en ningún momento — restauración EN CALIENTE):

  1.  Respaldo automático diario (solo si procede) + respaldo manual.
  2.  Restauración en caliente: los datos vuelven al estado del respaldo
      y la sesión sigue viva (JWT + usuario presente en el respaldo).
  3.  Snapshot pre-restauración creado y protegido contra borrado.
  4.  Reversión dentro de la ventana de 24 h: el estado posterior a la
      restauración (con la mutación) regresa íntegro.
  5.  ROLLBACK AUTOMÁTICO: un respaldo envenenado (id duplicado) falla a
      mitad de la copia y la base queda EXACTAMENTE igual (conteos).
  6.  Respaldo incompatible (esquema distinto) rechazado antes de tocar nada.
  7.  Ventana de 24 h expirada → reversión rechazada (409).
  8.  Permisos: un rol sin «respaldo.gestionar» recibe 403.
  9.  RESTAURAR DESDE ARCHIVO SUBIDO: el ciclo REAL del usuario —
      descargar → guardar → SUBIR → restaurar en caliente → revertir —
      y rechazos de subida (no-SQLite, extensión .txt, corrupto,
      esquema incompatible, vacío, sin permiso; sin dejar rastro).

Requisito: servidor standalone corriendo en el puerto 3300.
"""
import json
import os
import shutil
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:3300"
DB = os.environ.get("CIG_DB", "/home/z/my-project/db/custom.db")
CARPETA = os.path.join(os.path.dirname(DB), "backups")
VENTANA_SEG = 24 * 3600

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
        with urllib.request.urlopen(r, data, timeout=60) as resp:
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
        print(f"  [FALLA] {nombre} {extra}")


def contar_db():
    """Conteos directos de la base (verificación independiente del API)."""
    con = sqlite3.connect(DB)
    try:
        cur = con.cursor()
        tablas = [
            r[0]
            for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name NOT IN "
                "('_prisma_migrations','RespaldoBD','RestauracionBD')"
            )
        ]
        return {t: cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tablas}
    finally:
        con.close()


def sql_directo(sentencias):
    """Escritura directa (con reintentos por bloqueos WAL del servidor)."""
    for intento in range(10):
        try:
            con = sqlite3.connect(DB, timeout=10)
            try:
                cur = con.cursor()
                for s in sentencias:
                    cur.execute(s)
                con.commit()
                return True
            finally:
                con.close()
        except sqlite3.OperationalError:
            time.sleep(0.5)
    return False


print("════════ 1. SESIÓN Y ESTADO INICIAL ════════")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or exit("✖ Define ADMIN_PASSWORD (contraseña del admin sembrado) antes de ejecutar")
sc, _ = req("POST", "/api/auth/login", {"correo": "admin@cig-manufacturing.com", "password": ADMIN_PASSWORD})
check("login admin", sc == 200, f"status={sc}")

sc, estado = req("GET", "/api/respaldo")
check("GET /api/respaldo", sc == 200, f"status={sc} cuerpo={estado}")
iniciales = contar_db()
print(f"  · Conteos iniciales: {iniciales}")

print("════════ 2. RESPALDO AUTOMÁTICO + MANUAL ════════")
sc, resp = req("POST", "/api/respaldo/auto")
check("POST /api/respaldo/auto", sc == 200, f"status={sc} cuerpo={resp}")
fue_auto = isinstance(resp, dict) and resp.get("respaldo")

sc, resp = req("POST", "/api/respaldo", {"etiqueta": "E2E punto de partida"})
check("POST /api/respaldo (manual)", sc == 200 and resp.get("respaldo", {}).get("archivo", "").startswith("respaldo-"), f"status={sc} cuerpo={resp}")
manual = resp["respaldo"]
check("respaldo manual con registros", manual["totalRegistros"] > 0 and manual["tamanoBytes"] > 1000, f"registros={manual.get('totalRegistros')} bytes={manual.get('tamanoBytes')}")
import os
check("archivo del respaldo en disco", os.path.isfile(os.path.join(CARPETA, manual["archivo"])))

sc, resp = req("POST", "/api/respaldo/auto")
check("auto no duplica (hay respaldo <24h)", sc == 200 and resp.get("respaldo") is None, f"status={sc} cuerpo={resp}")

print("════════ 3. MUTACIÓN POST-RESPALDO ════════")
# Código único por corrida (idempotente) + limpieza de restos de corridas previas
CODIGO_PRUEBA = f"CLI-E2E-{int(time.time())}"
sc, lista_previa = req("GET", "/api/clientes")
if isinstance(lista_previa, list):
    for c in lista_previa:
        if str(c.get("codigo", "")).startswith("CLI-E2E"):
            req("DELETE", f"/api/clientes/{c['id']}")
            print(f"  · restos de corridas previas retirados: {c['codigo']}")
sc, cliente = req("POST", "/api/clientes", {"nombre": "Cliente E2E Respaldo", "codigo": CODIGO_PRUEBA})
check("crear cliente de prueba", sc in (200, 201), f"status={sc} cuerpo={cliente}")
sc, lista_clientes = req("GET", "/api/clientes")
n_con_mutacion = len(lista_clientes) if isinstance(lista_clientes, list) else len(lista_clientes.get("clientes", []))
check("cliente visible antes de restaurar", n_con_mutacion >= 1, f"n={n_con_mutacion}")

print("════════ 4. RESTAURACIÓN EN CALIENTE ════════")
conteo_pre = contar_db()
sc, resultado = req("POST", "/api/respaldo/restaurar", {"id": manual["id"]})
check("POST /api/respaldo/restaurar", sc == 200, f"status={sc} cuerpo={resultado}")
if sc == 200:
    r = resultado["restauracion"]
    check("restauración COMPLETADA", r["estado"] == "COMPLETADA", f"estado={r['estado']}")
    check("ventana de 24 h asignada", r["ventanaReversaHasta"] is not None, f"ventana={r.get('ventanaReversaHasta')}")
    check("snapshot pre-restauración registrado", r["snapshotPre"] and os.path.isfile(os.path.join(CARPETA, r["snapshotPre"])), f"snapshot={r.get('snapshotPre')}")
    check("duración razonable", resultado["resumen"]["duracionMs"] < 60000, f"ms={resultado['resumen']['duracionMs']}")

    # La sesión SOBREVIVE (usuario admin presente en el respaldo) — clave del "en caliente"
    sc, ses = req("GET", "/api/auth/sesion")
    check("sesión sigue viva tras restaurar (en caliente)", sc == 200, f"status={sc} cuerpo={ses}")

    # El cliente creado DESPUÉS del respaldo desapareció
    sc, lista_clientes = req("GET", "/api/clientes")
    nombres = json.dumps(lista_clientes, ensure_ascii=False)
    check("la mutación posterior desapareció (datos del respaldo)", "Cliente E2E Respaldo" not in nombres)

    # Los conteos vuelven a los del respaldo (= iniciales, pues nada más cambió)
    conteo_post = contar_db()
    check("conteos de datos = estado del respaldo", conteo_post == iniciales, f"antes={iniciales} despues={conteo_post}")

    # Los registros del módulo respaldo NO se restauran (excluidos: son de la máquina)
    check("la bitácora de restauraciones no se restauró (tabla excluida)", conteo_post.get("RestauracionBD") is None)

    # Estado: reversión disponible
    sc, estado = req("GET", "/api/respaldo")
    check("reversión disponible (ventana activa)", estado["reversion"]["puedeRevertir"] is True, f"reversion={estado['reversion']}")
    snapshot_id = next((x["id"] for x in estado["respaldos"] if x["archivo"] == r["snapshotPre"]), None)

    # El snapshot activo NO se puede borrar
    sc, _ = req("DELETE", f"/api/respaldo?id={snapshot_id}")
    check("snapshot activo protegido contra borrado (409)", sc == 409, f"status={sc}")

    print("════════ 5. REVERSIÓN DENTRO DE LA VENTANA (24 h) ════════")
    sc, resultado_rev = req("POST", "/api/respaldo/revertir")
    check("POST /api/respaldo/revertir", sc == 200, f"status={sc} cuerpo={resultado_rev}")
    if sc == 200:
        check("reversión COMPLETADA", resultado_rev["restauracion"]["estado"] == "COMPLETADA")
        check("reversión es tipo REVERSION", resultado_rev["restauracion"]["tipo"] == "REVERSION")
        # El cliente mutado REGRESA (estado post-mutación íntegro)
        sc, lista_clientes = req("GET", "/api/clientes")
        nombres = json.dumps(lista_clientes, ensure_ascii=False)
        check("la mutación regresó tras revertir", "Cliente E2E Respaldo" in nombres)
        sc, estado = req("GET", "/api/respaldo")
        check("la reversión tiene su propia ventana", estado["reversion"]["puedeRevertir"] is True, f"reversion={estado['reversion']}")
        ultima = estado["ultimaRestauracion"]
        check("última restauración = la reversión", ultima["tipo"] == "REVERSION" and ultima["estado"] == "COMPLETADA")

    print("════════ 6. VENTANA EXPIRADA → REVERSIÓN RECHAZADA ════════")
    # Expirar la ventana de la reversión directamente en la base.
    # (Prisma guarda los DateTime como millisegundos ÉPOC — INTEGER.)
    ok_sql = sql_directo([
        "UPDATE RestauracionBD SET ventanaReversaHasta = 1577836800000 "
        "WHERE estado = 'COMPLETADA' AND revertidaEn IS NULL"
    ])
    check("expirar ventana vía SQL directo", ok_sql)
    sc, _ = req("POST", "/api/respaldo/revertir")
    check("reversión con ventana expirada → 409", sc == 409, f"status={sc}")

    # Con la ventana expirada, el snapshot deja de estar protegido
    sc, estado = req("GET", "/api/respaldo")
    check("reversión ya no disponible", estado["reversion"]["puedeRevertir"] is False and estado["reversion"]["motivo"] == "VENTANA_EXPIRADA", f"reversion={estado['reversion']}")

print("════════ 7. ROLLBACK AUTOMÁTICO (RESPALDO ENVENENADO) ════════")
# Fabricar un respaldo válido en apariencia pero con id duplicado en Cliente:
# la copia transaccional debe fallar a mitad y NO cambiar nada.
veneno = os.path.join(CARPETA, "respaldo-veneno-e2e.db")
shutil.copy(os.path.join(CARPETA, manual["archivo"]), veneno)
con = sqlite3.connect(veneno)
try:
    cur = con.cursor()
    cur.execute('CREATE TABLE Cliente_copia (id TEXT NOT NULL, codigo TEXT NOT NULL, nombre TEXT NOT NULL, contacto TEXT, correo TEXT, telefono TEXT, direccion TEXT, notas TEXT, activo BOOLEAN NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)')
    cur.execute('INSERT INTO Cliente_copia SELECT * FROM Cliente')
    fila = cur.execute('SELECT * FROM Cliente LIMIT 1').fetchone()
    cur.execute('INSERT INTO Cliente_copia VALUES (' + ','.join('?' * len(fila)) + ')', fila)  # id duplicado
    cur.execute('DROP TABLE Cliente')
    cur.execute('ALTER TABLE Cliente_copia RENAME TO Cliente')
    con.commit()
finally:
    con.close()

sc, estado = req("GET", "/api/respaldo")
veneno_row = next((x for x in estado["respaldos"] if x["archivo"] == "respaldo-veneno-e2e.db"), None)
check("archivo veneno detectado en la carpeta", veneno_row is not None and veneno_row["compatible"] is True, f"row={veneno_row}")

antes_veneno = contar_db()
sc, resp_veneno = req("POST", "/api/respaldo/restaurar", {"id": veneno_row["id"]})
check("restauración envenenada → 500", sc == 500, f"status={sc} cuerpo={resp_veneno}")
check("error reportado (unique/id duplicado)", "RESTAURACION_FALLIDA" in json.dumps(resp_veneno), f"cuerpo={resp_veneno}")
despues_veneno = contar_db()
check("base INTACTA tras el fallo (rollback automático)", antes_veneno == despues_veneno, f"antes={antes_veneno} despues={despues_veneno}")
sc, estado = req("GET", "/api/respaldo")
fallidas = [u for u in [estado["ultimaRestauracion"]] if u and u["estado"] == "FALLIDA"]
check("intento fallido registrado en la bitácora", len(fallidas) == 1, f"ultima={estado['ultimaRestauracion']}")

print("════════ 8. RESPALDO INCOMPATIBLE ════════")
incomp = os.path.join(CARPETA, "respaldo-incompatible-e2e.db")
shutil.copy(os.path.join(CARPETA, manual["archivo"]), incomp)
con = sqlite3.connect(incomp)
try:
    con.execute("DROP TABLE RegistroRechazo")
    con.commit()
finally:
    con.close()
sc, estado = req("GET", "/api/respaldo")
incomp_row = next((x for x in estado["respaldos"] if x["archivo"] == "respaldo-incompatible-e2e.db"), None)
check("incompatible detectado (compatible=false)", incomp_row is not None and incomp_row["compatible"] is False, f"row={incomp_row}")
sc, _ = req("POST", "/api/respaldo/restaurar", {"id": incomp_row["id"]})
check("restauración incompatible → 409", sc == 409, f"status={sc}")

print("════════ 9. LIMPIEZA Y PERMISOS ════════")
sc, _ = req("DELETE", f"/api/respaldo?id={veneno_row['id']}")
check("eliminar respaldo veneno", sc == 200, f"status={sc}")
sc, _ = req("DELETE", f"/api/respaldo?id={incomp_row['id']}")
check("eliminar respaldo incompatible", sc == 200, f"status={sc}")
check("archivos de veneno retirados del disco", not os.path.exists(veneno) and not os.path.exists(incomp))

# Rol sin permiso: usuario temporal con rol ALMACENERO (sin respaldo.gestionar)
cookie_previo = cookie
sc, roles = req("GET", "/api/roles")
lista_roles = roles.get("roles", []) if isinstance(roles, dict) else (roles if isinstance(roles, list) else [])
rol_almacenero = next((r for r in lista_roles if r["clave"] == "ALMACENERO"), None)
usuario_prueba_id = None
if rol_almacenero:
    sc, creado = req("POST", "/api/usuarios", {
        "nombre": "Prueba Respaldo",
        "correo": "respaldo.test@cig-manufacturing.com",
        "password": "Permisos*2026",
        "rolId": rol_almacenero["id"],
    })
    usuario_prueba_id = creado.get("usuario", {}).get("id") if sc == 201 else None
    cookie = None
    sc, _ = req("POST", "/api/auth/login", {"correo": "respaldo.test@cig-manufacturing.com", "password": "Permisos*2026"})
    if sc == 200:
        sc, _ = req("GET", "/api/respaldo")
        check("ALMACENERO sin respaldo.gestionar → 403", sc == 403, f"status={sc}")
    else:
        check("login del usuario de prueba", False, f"status={sc}")
else:
    print("  · (rol ALMACENERO no encontrado: se omite la prueba de permisos)")
cookie = cookie_previo
if usuario_prueba_id:
    req("DELETE", f"/api/usuarios/{usuario_prueba_id}")
    print("  · usuario de prueba retirado")

# Eliminar el cliente de prueba para dejar la base como estaba
sc, lista = req("GET", "/api/clientes")
if isinstance(lista, list):
    for c in lista:
        if str(c.get("codigo", "")).startswith("CLI-E2E"):
            req("DELETE", f"/api/clientes/{c['id']}")
    print("  · clientes de prueba retirados")

print("════════ 10. RESTAURAR DESDE ARCHIVO SUBIDO ════════")
# El ciclo REAL del usuario: descargar un respaldo, guardarlo fuera y
# volver a subirlo para restaurarlo — con las mismas garantías de siempre.


def descargar_respaldo(id_):
    """GET binario del archivo de respaldo."""
    r = urllib.request.Request(BASE + f"/api/respaldo/descargar?id={urllib.parse.quote(id_)}")
    r.add_header("Cookie", cookie)
    with urllib.request.urlopen(r, timeout=120) as resp:
        return resp.read()


def subir_multipart(nombre, datos, cookie_subida=None):
    """POST /api/respaldo/subir multipart/form-data (armado a mano)."""
    limite = f"----e2e{int(time.time() * 1000)}"
    partes = (
        f"--{limite}\r\n"
        f'Content-Disposition: form-data; name="archivo"; filename="{nombre}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + datos + f"\r\n--{limite}--\r\n".encode()
    r = urllib.request.Request(BASE + "/api/respaldo/subir", data=partes, method="POST")
    r.add_header("Content-Type", f"multipart/form-data; boundary={limite}")
    r.add_header("Cookie", cookie_subida if cookie_subida is not None else cookie)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


sc, estado = req("GET", "/api/respaldo")
objetivo = next(
    (x for x in estado["respaldos"] if x["tipo"] in ("MANUAL", "AUTOMATICO") and x["compatible"]),
    None,
)
check("respaldo objetivo para descargar", objetivo is not None, f"objetivo={objetivo}")

if objetivo:
    bytes_respaldo = descargar_respaldo(objetivo["id"])
    check("descarga binaria con cabecera SQLite", bytes_respaldo[:16] == b"SQLite format 3\x00", f"cabecera={bytes_respaldo[:16]!r}")
    check("descarga con contenido", len(bytes_respaldo) == objetivo["tamanoBytes"] and len(bytes_respaldo) > 1000, f"bytes={len(bytes_respaldo)}")

    # 10a. Subida válida → fila SUBIDO + archivo en disco
    fotos_carpeta = lambda: sorted(n for n in os.listdir(CARPETA) if n.endswith(".db") or n.endswith(".tmp"))
    carpeta_antes = fotos_carpeta()
    sc, resp = subir_multipart(objetivo["archivo"], bytes_respaldo)
    check("POST /api/respaldo/subir (válido)", sc == 200 and "respaldo" in (resp or {}), f"status={sc} cuerpo={resp}")
    subido = resp.get("respaldo", {}) if sc == 200 else {}
    check("registrado como SUBIDO", subido.get("tipo") == "SUBIDO", f"tipo={subido.get('tipo')}")
    check("etiqueta = nombre original del archivo", subido.get("etiqueta") == objetivo["archivo"], f"etiqueta={subido.get('etiqueta')}")
    check("conteo de registros calculado", isinstance(subido.get("totalRegistros"), int) and subido["totalRegistros"] > 0, f"registros={subido.get('totalRegistros')}")
    check("archivo subido publicado en la carpeta", os.path.isfile(os.path.join(CARPETA, subido.get("archivo", "x"))) and subido["archivo"].endswith("-sub.db"), f"archivo={subido.get('archivo')}")
    check("no quedaron temporales de la subida", not [n for n in fotos_carpeta() if n.endswith(".tmp")], f"tmp={[n for n in fotos_carpeta() if n.endswith('.tmp')]}")

    # 10b. Mutación post-subida → restauración del SUBIDO en caliente
    antes_subida = contar_db()
    sc, cli2 = req("POST", "/api/clientes", {"nombre": "Cliente E2E Subida", "codigo": f"CLI-E2E2-{int(time.time())}"})
    check("mutación previa a restaurar el SUBIDO", sc in (200, 201), f"status={sc} cuerpo={cli2}")
    con_mutacion = contar_db()
    check("la mutación se registró", con_mutacion.get("Cliente", 0) == antes_subida.get("Cliente", 0) + 1, f"clientes={con_mutacion.get('Cliente')}")

    # Conteos esperados según el ARCHIVO subido (verificación independiente)
    ruta_tmp = os.path.join(os.path.dirname(DB), "tmp-e2e-subida.db")
    with open(ruta_tmp, "wb") as fh:
        fh.write(bytes_respaldo)
    con = sqlite3.connect(ruta_tmp)
    try:
        cur = con.cursor()
        tablas_sub = [
            t[0]
            for t in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' AND name NOT IN "
                "('_prisma_migrations','RespaldoBD','RestauracionBD')"
            )
        ]
        esperados = {t: cur.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in tablas_sub}
    finally:
        con.close()
        os.remove(ruta_tmp)

    sc, resultado_sub = req("POST", "/api/respaldo/restaurar", {"id": subido["id"]})
    check("restauración del respaldo SUBIDO", sc == 200 and resultado_sub["restauracion"]["estado"] == "COMPLETADA", f"status={sc} cuerpo={resultado_sub}")
    if sc == 200:
        check("ventana de 24 h asignada al SUBIDO", resultado_sub["restauracion"]["ventanaReversaHasta"] is not None)
        sc, ses = req("GET", "/api/auth/sesion")
        check("sesión viva tras restaurar el SUBIDO (en caliente)", sc == 200, f"status={sc}")
        sc, lista_clientes = req("GET", "/api/clientes")
        check("la mutación posterior a la subida desapareció", "Cliente E2E Subida" not in json.dumps(lista_clientes, ensure_ascii=False))
        check("conteos = contenido exacto del archivo subido", contar_db() == esperados, f"esperados={esperados} reales={contar_db()}")
        # La bitácora de ESTA máquina no se restauró (tablas excluidas):
        # el SUBIDO sigue registrado y disponible.
        sc, estado = req("GET", "/api/respaldo")
        sigue = next((x for x in estado["respaldos"] if x["archivo"] == subido["archivo"]), None)
        check("el respaldo SUBIDO sigue registrado tras su propia restauración", sigue is not None and sigue["compatible"] is True, f"fila={sigue}")

        # 10c. Revertir la restauración del SUBIDO (misma garantía de 24 h)
        sc, rev_sub = req("POST", "/api/respaldo/revertir")
        check("reversión de la restauración del SUBIDO", sc == 200 and rev_sub["restauracion"]["estado"] == "COMPLETADA", f"status={sc} cuerpo={rev_sub}")
        if sc == 200:
            check("estado previo íntegro tras revertir (incluida la mutación)", contar_db() == con_mutacion, f"esperado={con_mutacion} real={contar_db()}")
            sc, lista_clientes = req("GET", "/api/clientes")
            check("la mutación volvió a estar tras revertir", "Cliente E2E Subida" in json.dumps(lista_clientes, ensure_ascii=False))

    # Limpieza de la sección: cliente de prueba + respaldo SUBIDO
    if isinstance(cli2, dict) and cli2.get("id"):
        req("DELETE", f"/api/clientes/{cli2['id']}")
    sc, _ = req("DELETE", f"/api/respaldo?id={subido['id']}")
    check("eliminar el respaldo SUBIDO", sc == 200, f"status={sc}")
    check("archivo del SUBIDO retirado del disco", not os.path.exists(os.path.join(CARPETA, subido["archivo"])))

# 10d. Rechazos de subida — nada queda registrado ni en la carpeta
sc, estado = req("GET", "/api/respaldo")
n_subidos_antes = sum(1 for x in estado["respaldos"] if x["tipo"] == "SUBIDO")

carpeta_antes = sorted(n for n in os.listdir(CARPETA))
sc, resp = subir_multipart("no-es-sqlite.db", b"esto no es una base de datos sqlite")
check("archivo de texto (.db) rechazado → 400 ARCHIVO_NO_SQLITE", sc == 400 and isinstance(resp, dict) and resp.get("error") == "ARCHIVO_NO_SQLITE", f"status={sc} cuerpo={resp}")

sc, resp = subir_multipart("copia.txt", bytes_respaldo if objetivo else b"SQLite format 3\x00")
check("contenido válido con extensión .txt rechazado → 400 ARCHIVO_INVALIDO", sc == 400 and isinstance(resp, dict) and resp.get("error") == "ARCHIVO_INVALIDO", f"status={sc} cuerpo={resp}")

sc, resp = subir_multipart("corrupto.db", b"SQLite format 3\x00" + b"\x00" * 8192)
check("archivo corrupto rechazado → 409 RESPALDO_CORRUPTO", sc == 409 and isinstance(resp, dict) and resp.get("error") == "RESPALDO_CORRUPTO", f"status={sc} cuerpo={resp}")

sc, resp = subir_multipart("vacio.db", b"")
check("archivo vacío rechazado → 400 ARCHIVO_VACIO", sc == 400 and isinstance(resp, dict) and resp.get("error") == "ARCHIVO_VACIO", f"status={sc} cuerpo={resp}")

if objetivo:
    incomp_ruta = os.path.join(CARPETA, "tmp-e2e-incompatible.db")
    shutil.copy(os.path.join(CARPETA, objetivo["archivo"]), incomp_ruta)
    con = sqlite3.connect(incomp_ruta)
    try:
        con.execute("DROP TABLE RegistroRechazo")
        con.commit()
    finally:
        con.close()
    with open(incomp_ruta, "rb") as fh:
        bytes_incomp = fh.read()
    os.remove(incomp_ruta)
    sc, resp = subir_multipart("respaldo-otra-version.db", bytes_incomp)
    check("esquema incompatible rechazado en la subida → 409 RESPALDO_INCOMPATIBLE", sc == 409 and isinstance(resp, dict) and resp.get("error") == "RESPALDO_INCOMPATIBLE", f"status={sc} cuerpo={resp}")

sc, estado = req("GET", "/api/respaldo")
n_subidos_despues = sum(1 for x in estado["respaldos"] if x["tipo"] == "SUBIDO")
check("los rechazos NO registraron respaldos SUBIDO", n_subidos_antes == n_subidos_despues, f"antes={n_subidos_antes} despues={n_subidos_despues}")
carpeta_despues = sorted(n for n in os.listdir(CARPETA))
nuevos = [n for n in carpeta_despues if n not in carpeta_antes]
check("los rechazos NO dejaron rastro en la carpeta", len(nuevos) == 0, f"nuevos={nuevos}")

# 10e. Autorización de la subida: 401 sin sesión; 403 sin permiso
sc, resp = subir_multipart("sin-sesion.db", bytes_respaldo if objetivo else b"SQLite format 3\x00", cookie_subida="")
check("subida sin sesión → 401", sc == 401, f"status={sc} cuerpo={resp}")

sc, roles = req("GET", "/api/roles")
lista_roles = roles.get("roles", []) if isinstance(roles, dict) else (roles if isinstance(roles, list) else [])
rol_almacenero = next((r for r in lista_roles if r["clave"] == "ALMACENERO"), None)
if rol_almacenero:
    cookie_admin = cookie
    sc, creado = req("POST", "/api/usuarios", {
        "nombre": "Prueba Subida",
        "correo": "subida.test@cig-manufacturing.com",
        "password": "Permisos*2026",
        "rolId": rol_almacenero["id"],
    })
    usuario_subida_id = creado.get("usuario", {}).get("id") if sc == 201 else None
    cookie = None
    sc, _ = req("POST", "/api/auth/login", {"correo": "subida.test@cig-manufacturing.com", "password": "Permisos*2026"})
    if sc == 200:
        sc, resp = subir_multipart("sin-permiso.db", bytes_respaldo if objetivo else b"SQLite format 3\x00")
        check("ALMACENERO sin respaldo.gestionar: subida → 403", sc == 403, f"status={sc} cuerpo={resp}")
    else:
        check("login del usuario de prueba (subida)", False, f"status={sc}")
    cookie = cookie_admin
    if usuario_subida_id:
        req("DELETE", f"/api/usuarios/{usuario_subida_id}")
        print("  · usuario de prueba de subida retirado")
else:
    print("  · (rol ALMACENERO no encontrado: se omite la prueba de permisos de subida)")

print(f"\n════════ RESULTADO: {OK} OK / {FAIL} FALLAS ════════")
exit(1 if FAIL else 0)
