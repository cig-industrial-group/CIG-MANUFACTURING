#!/usr/bin/env python3
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

"""
VERIFICACIÓN END-TO-END DEL MÓDULO CLIENTES (CIG-MANUFACTURING v1.0.0)

Arranca el servidor standalone en el puerto 3300, ejecuta la batería de
pruebas contra las APIs reales y lo apaga al terminar. Todo ocurre en un
solo proceso para que el servidor no sobreviva a la prueba.

Cubre:
  · CRUD de clientes + código duplicado
  · Liberación de material de salida VÍA OQC (/api/oqc/salidas: descuenta
    stock, folios SAL- por partida agrupados bajo un folio OQC-, snapshots)
  · Fusión de partidas duplicadas, stock insuficiente (todo-o-nada)
  · Cliente inactivo / inexistente / sin partidas
  · Filtros del historial (clienteId, búsqueda por nombre de cliente)
  · Ciclo completo de la papelera: eliminar → historial marcado «eliminado»
    → restaurar → re-vinculación automática
  · Conflicto de código al restaurar (IDENTIFICADOR_EN_USO) + purga
  · Permisos: roles con «oqc.liberar» liberan material; OPERADOR → 403
"""
import http.cookiejar
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

BASE = "http://127.0.0.1:3300"
PROYECTO = os.environ.get("CIG_PROYECTO", "/home/z/my-project")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or sys.exit(
    "✖ Define ADMIN_PASSWORD (contraseña del admin sembrado) antes de ejecutar")

PRUEBAS = []


def check(desc, esperado, obtenido):
    ok = esperado == obtenido
    PRUEBAS.append((desc, ok))
    print(("  ✔ " if ok else "  ✘ ") + desc + ("" if ok else f"  — esperado: {esperado!r}, obtenido: {obtenido!r}"))
    return ok


class Sesion:
    """Cliente HTTP con cookie jar (sesión httpOnly)."""

    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, metodo, ruta, cuerpo=None):
        data = json.dumps(cuerpo).encode() if cuerpo is not None else None
        r = urllib.request.Request(
            BASE + ruta, data=data, method=metodo,
            headers={"Content-Type": "application/json"},
        )
        try:
            with self.opener.open(r, timeout=30) as resp:
                texto = resp.read().decode()
                return resp.status, (json.loads(texto) if texto else {})
        except urllib.error.HTTPError as e:
            texto = e.read().decode()
            try:
                return e.code, json.loads(texto)
            except json.JSONDecodeError:
                return e.code, {}


def esperar_servidor(segundos=90):
    for _ in range(segundos):
        try:
            urllib.request.urlopen(BASE + "/api", timeout=2)
            return True
        except urllib.error.HTTPError:
            return True  # respondió (aunque sea 404/405): ya está arriba
        except Exception:
            time.sleep(1)
    return False


def main():
    # ===== Arranque del servidor (standalone, puerto 3300) =====
    env = dict(os.environ)
    # Servidor de pruebas por HTTP plano: permitir cookie sin Secure
    # (equivale a un despliegue LAN sin TLS; ver DESPLIEGUE.md)
    env.update({"PORT": "3300", "HOSTNAME": "0.0.0.0", "COOKIE_INSEGURA_HTTP": "1"})
    log = open("/tmp/cig-manufacturing-test-clientes.log", "w")
    proc = subprocess.Popen(
        ["bash", "start.sh"], cwd=PROYECTO, env=env,
        stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
    )
    try:
        if not esperar_servidor():
            print("✘ El servidor no respondió en 90s; log en /tmp/cig-manufacturing-test-clientes.log")
            return 2
        return pruebas()
    finally:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            time.sleep(2)
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except ProcessLookupError:
            pass


def pruebas():
    admin = Sesion()

    print("\n=== 0. Limpieza de restos de ejecuciones previas ===")
    cod, _ = admin.req("POST", "/api/auth/login",
                       {"correo": "admin@cig-manufacturing.com", "password": ADMIN_PASSWORD})
    check("Login admin", 200, cod)
    cod, lista = admin.req("GET", "/api/clientes?incluirInactivos=true")
    for c in lista:
        if not str(c["codigo"]).startswith("CLI-"):
            continue
        # Revertir los movimientos de prueba (stock) antes de purgar
        cod, movs = admin.req("GET", f"/api/almacen/movimientos?clienteId={c['id']}&porPagina=100")
        for m in movs.get("movimientos", []):
            admin.req("DELETE", f"/api/almacen/movimientos/{m['id']}",
                      {"motivoCorreccion": "Limpieza de pruebas del módulo Clientes (revierte stock)"})
        admin.req("DELETE", f"/api/clientes/{c['id']}")
        cod, papelera = admin.req("GET", "/api/papelera")
        for e in papelera.get("entradas", []):
            if e["entidad"] == "CLIENTE" and e["entidadId"] == c["id"]:
                admin.req("DELETE", f"/api/papelera/{e['id']}")
    print("  · Limpieza terminada")

    print("\n=== 1. Sesión y catálogo de clientes ===")

    cod, _ = admin.req("GET", "/api/clientes")
    check("GET /api/clientes (permiso clientes.ver)", 200, cod)

    cod, c1 = admin.req("POST", "/api/clientes", {
        "codigo": "CLI-0001",
        "nombre": "Tecnológica Industrial del Norte S.A. de C.V.",
        "contacto": "Ing. Laura Méndez",
        "correo": "compras@tecnort.mx",
        "telefono": "81-1234-5678",
        "direccion": "Av. Industrial 4501, Apodaca, N.L.",
    })
    check("Crear cliente CLI-0001", 201, cod)
    cod, c2 = admin.req("POST", "/api/clientes", {
        "codigo": "CLI-0002",
        "nombre": "Maquinados Precisos de México S.A.",
        "contacto": "C. Ramiro Vega",
        "telefono": "222-887-9010",
    })
    check("Crear cliente CLI-0002", 201, cod)

    cod, cuerpo = admin.req("POST", "/api/clientes", {"codigo": "CLI-0001", "nombre": "Duplicado"})
    check("Código de cliente duplicado → 409", 409, cod)
    check("  código de error CLIENTE_CODIGO_DUPLICADO", "CLIENTE_CODIGO_DUPLICADO", cuerpo.get("error"))

    print("\n=== 2. Liberación de material de salida (vía OQC) ===")
    cod, inv = admin.req("GET", "/api/almacen/inventario")
    con_stock = [f for f in inv if f["cantidad"] > 0]
    if not con_stock:
        print("✘ No hay stock para probar; abortando")
        return 2
    por_almacen = Counter(f["almacenId"] for f in con_stock)
    almacen_id = por_almacen.most_common(1)[0][0]
    filas = [f for f in con_stock if f["almacenId"] == almacen_id]
    p1 = filas[0]
    p2 = filas[1] if len(filas) > 1 else None

    cant1 = min(3.0, p1["cantidad"])
    lineas = [{"productoId": p1["productoId"], "cantidad": cant1}]
    if p2:
        lineas.append({"productoId": p2["productoId"], "cantidad": min(2.0, p2["cantidad"])})

    cod, resp = admin.req("POST", "/api/oqc/salidas", {
        "clienteId": c1["id"], "almacenOrigenId": almacen_id,
        "referencia": "REM-DEMO-001", "lineas": lineas,
    })
    check(f"Liberar {len(lineas)} partidas a CLI-0001 (OQC)", 201, cod)
    salida1 = resp.get("salida", {})
    movs1 = salida1.get("partidas", [])
    folios = [m["folio"] for m in movs1]
    check("  folio único de salida con prefijo OQC-", True,
          str(salida1.get("folio", "")).startswith("OQC-"))
    check("  un folio SAL- por partida", len(lineas), len(folios))
    check("  folios con prefijo SAL-", True, all(f.startswith("SAL-") for f in folios))
    check("  partidas ligadas al folio de su salida", True,
          all(m.get("salidaFolio") == salida1.get("folio") for m in movs1))
    if movs1:
        check("  snapshot clienteNombre en el movimiento",
              "Tecnológica Industrial del Norte S.A. de C.V.", movs1[0]["clienteNombre"])
        check("  snapshot clienteCodigo en el movimiento", "CLI-0001", movs1[0]["clienteCodigo"])
        check("  clienteExiste=true en recién creados", True, movs1[0]["clienteExiste"])
        check("  stock resultante capturado (cantidadDespues)", True,
              all(m["cantidadDespues"] is not None for m in movs1))
        check("  responsable por omisión = usuario de sesión",
              "Administrador del Sistema", movs1[0]["responsable"])

    # El stock se descuenta exactamente
    cod, inv2 = admin.req("GET", "/api/almacen/inventario")
    stock = {(f["productoId"], f["almacenId"]): f["cantidad"] for f in inv2}
    for linea in lineas:
        antes = next(f["cantidad"] for f in inv if (f["productoId"], f["almacenId"]) == (linea["productoId"], almacen_id))
        despues = stock.get((linea["productoId"], almacen_id), 0)
        check(f"  stock de {linea['productoId'][:8]}… descontado {linea['cantidad']}",
              round(antes - linea["cantidad"], 6), round(despues, 6))

    # Stock insuficiente → rechazo total (nada cambia)
    cod, cuerpo = admin.req("POST", "/api/oqc/salidas", {
        "clienteId": c1["id"], "almacenOrigenId": almacen_id,
        "lineas": [{"productoId": p1["productoId"], "cantidad": 99999999}],
    })
    check("Stock insuficiente → 400", 400, cod)
    check("  error STOCK_INSUFICIENTE", "STOCK_INSUFICIENTE", cuerpo.get("error"))
    cod, inv3 = admin.req("GET", "/api/almacen/inventario")
    check("  stock intacto tras el rechazo (todo-o-nada)",
          round(stock.get((p1["productoId"], almacen_id), 0), 6),
          round(next(f["cantidad"] for f in inv3 if (f["productoId"], f["almacenId"]) == (p1["productoId"], almacen_id)), 6))

    # Partidas duplicadas del mismo producto se fusionan
    cod, resp = admin.req("POST", "/api/oqc/salidas", {
        "clienteId": c2["id"], "almacenOrigenId": almacen_id,
        "referencia": "REM-DEMO-002",
        "lineas": [
            {"productoId": p1["productoId"], "cantidad": 1},
            {"productoId": p1["productoId"], "cantidad": 2},
        ],
    })
    check("Liberar a CLI-0002 con partidas duplicadas", 201, cod)
    movs2 = resp.get("salida", {}).get("partidas", [])
    check("  partidas duplicadas fusionadas en 1 movimiento", 1, len(movs2))
    if movs2:
        check("  cantidad fusionada = 3", 3, movs2[0]["cantidad"])

    print("\n=== 3. Reglas de negocio de la liberación ===")
    admin.req("PATCH", f"/api/clientes/{c2['id']}", {"activo": False})
    cod, cuerpo = admin.req("POST", "/api/oqc/salidas", {
        "clienteId": c2["id"], "almacenOrigenId": almacen_id,
        "lineas": [{"productoId": p1["productoId"], "cantidad": 1}],
    })
    check("Salida a cliente inactivo → 409", 409, cod)
    check("  error CLIENTE_INACTIVO", "CLIENTE_INACTIVO", cuerpo.get("error"))
    admin.req("PATCH", f"/api/clientes/{c2['id']}", {"activo": True})

    cod, cuerpo = admin.req("POST", "/api/oqc/salidas", {
        "clienteId": c1["id"], "almacenOrigenId": almacen_id, "lineas": [],
    })
    check("Liberación sin partidas → 400", 400, cod)
    check("  error SALIDA_SIN_LINEAS", "SALIDA_SIN_LINEAS", cuerpo.get("error"))

    cod, _ = admin.req("POST", "/api/oqc/salidas", {
        "clienteId": "id-inexistente", "almacenOrigenId": almacen_id,
        "lineas": [{"productoId": p1["productoId"], "cantidad": 1}],
    })
    check("Salida a cliente inexistente → 404", 404, cod)

    print("\n=== 4. Historial: filtros y snapshots ===")
    cod, movs = admin.req("GET", f"/api/almacen/movimientos?clienteId={c1['id']}")
    check("Filtro clienteId en el historial", 200, cod)
    check("  todas las filas son de CLI-0001", True,
          all(m["clienteId"] == c1["id"] for m in movs["movimientos"]))
    check("  total ≥ partidas liberadas", len(lineas), movs["total"])
    cod, movs_q = admin.req("GET", "/api/almacen/movimientos?q=Tecnol")
    check("Búsqueda por nombre de cliente (q)", True, movs_q["total"] >= 1)

    print("\n=== 5. Ciclo completo de la papelera (cliente con historial) ===")
    cod, c3 = admin.req("POST", "/api/clientes",
                        {"codigo": "CLI-0003", "nombre": "Prueba Ciclo Papelera"})
    check("Crear cliente de prueba CLI-0003", 201, cod)
    cod, resp = admin.req("POST", "/api/oqc/salidas", {
        "clienteId": c3["id"], "almacenOrigenId": almacen_id,
        "lineas": [{"productoId": p1["productoId"], "cantidad": 1}],
    })
    check("Liberar 1 partida a CLI-0003 (para el ciclo de papelera)", 201, cod)
    mov_c3 = (resp.get("salida", {}).get("partidas") or [{}])[0]

    cod, cuerpo = admin.req("DELETE", f"/api/clientes/{c3['id']}")
    check("DELETE cliente con salidas → papelera (ya no se bloquea)", 200, cod)
    check("  ventana de restauración = 30 días", 30, cuerpo.get("restaurableDuranteDias"))

    cod, lista = admin.req("GET", "/api/clientes")
    check("  cliente fuera del listado vivo", False, any(c["id"] == c3["id"] for c in lista))

    cod, movs3 = admin.req("GET", f"/api/almacen/movimientos?clienteId={c3['id']}")
    check("  el historial de salidas sobrevive intacto", 1, movs3["total"])
    if movs3["movimientos"]:
        m = movs3["movimientos"][0]
        check("  snapshot del nombre conservado", "Prueba Ciclo Papelera", m["clienteNombre"])
        check("  distintivo «eliminado» (clienteExiste=false)", False, m["clienteExiste"])

    cod, papelera = admin.req("GET", "/api/papelera")
    entrada = next((e for e in papelera.get("entradas", []) if e["entidadId"] == c3["id"]), None)
    check("  entrada CLIENTE en la papelera", True, entrada is not None)
    if entrada:
        check("  entidad = CLIENTE", "CLIENTE", entrada["entidad"])
        check("  identificador = CLI-0003", "CLI-0003", entrada["identificador"])
        check("  días restantes ≈ 30", True, entrada["diasRestantes"] >= 29)

        cod, _ = admin.req("POST", f"/api/papelera/{entrada['id']}/restaurar")
        check("  restaurar cliente desde la papelera", 200, cod)
        cod, movs3 = admin.req("GET", f"/api/almacen/movimientos?clienteId={c3['id']}")
        check("  historial re-vinculado (clienteExiste=true)", True,
              movs3["movimientos"][0]["clienteExiste"])
        cod, lista = admin.req("GET", "/api/clientes")
        check("  cliente de vuelta y activo", True,
              any(c["id"] == c3["id"] and c["activo"] for c in lista))

    print("\n=== 6. Conflicto de código al restaurar ===")
    admin.req("DELETE", f"/api/clientes/{c3['id']}")  # de nuevo a la papelera
    cod, papelera = admin.req("GET", "/api/papelera")
    entrada = next((e for e in papelera["entradas"] if e["entidadId"] == c3["id"]), None)
    cod, c3b = admin.req("POST", "/api/clientes",
                         {"codigo": "CLI-0003", "nombre": "Cliente conflictivo"})
    check("Crear cliente nuevo con el código liberado", 201, cod)
    cod, cuerpo = admin.req("POST", f"/api/papelera/{entrada['id']}/restaurar")
    check("Restaurar con código ocupado → 409", 409, cod)
    check("  error IDENTIFICADOR_EN_USO", "IDENTIFICADOR_EN_USO", cuerpo.get("error"))

    # Limpieza del ciclo de pruebas: purgar papelera + revertir movimiento
    admin.req("DELETE", f"/api/clientes/{c3b['id']}")
    cod, papelera = admin.req("GET", "/api/papelera")
    for e in papelera.get("entradas", []):
        if e["entidad"] == "CLIENTE" and e["identificador"] == "CLI-0003":
            cod, _ = admin.req("DELETE", f"/api/papelera/{e['id']}")
            check(f"Purga definitiva de {e['identificador']} (bitácora permanece)", 200, cod)
    if mov_c3.get("id"):
        cod, _ = admin.req("DELETE", f"/api/almacen/movimientos/{mov_c3['id']}",
                           {"motivoCorreccion": "Limpieza de pruebas del módulo Clientes (revierte stock)"})
        check("Movimiento de prueba eliminado (stock revertido, bitácora en orden)", 200, cod)

    print("\n=== 7. Permisos por rol (calidad/almacén liberan; OPERADOR no) ===")
    cod, roles = admin.req("GET", "/api/roles")
    lista_roles = roles.get("roles", [])
    oqc = next((r for r in lista_roles if r["clave"] == "OQC"), None)
    check("Rol OQC presente", True, oqc is not None)
    if oqc:
        check("  OQC tiene oqc.liberar", True, "oqc.liberar" in oqc["permisos"])
        check("  OQC tiene clientes.ver", True, "clientes.ver" in oqc["permisos"])
        check("  OQC sin clientes.gestionar (solo consulta y liberación)", False,
              "clientes.gestionar" in oqc["permisos"])
    jefe = next((r for r in lista_roles if r["clave"] == "JEFE_ALMACEN"), None)
    if jefe:
        check("  JEFE_ALMACEN con clientes.gestionar + oqc.liberar", True,
              "clientes.gestionar" in jefe["permisos"] and "oqc.liberar" in jefe["permisos"])
    almacen = next((r for r in lista_roles if r["clave"] == "ALMACENERO"), None)
    if almacen:
        check("  ALMACENERO con clientes.ver + oqc.liberar", True,
              "clientes.ver" in almacen["permisos"] and "oqc.liberar" in almacen["permisos"])
    operador = next((r for r in lista_roles if r["clave"] == "OPERADOR"), None)
    if operador:
        check("  OPERADOR sin oqc.liberar", False, "oqc.liberar" in operador["permisos"])

    if operador:
        cod, cuerpo = admin.req("POST", "/api/usuarios", {
            "nombre": "Prueba Permisos", "correo": "permisos.test@cig-manufacturing.com",
            "password": "Permisos*2026", "rolId": operador["id"],
        })
        check("Crear usuario de prueba con rol OPERADOR", 201, cod)
        uid = cuerpo.get("usuario", {}).get("id")
        op = Sesion()
        cod, _ = op.req("POST", "/api/auth/login",
                        {"correo": "permisos.test@cig-manufacturing.com", "password": "Permisos*2026"})
        check("Login del usuario de prueba", 200, cod)
        cod, _ = op.req("GET", "/api/clientes")
        check("OPERADOR: GET /api/clientes → 403 (sin clientes.ver)", 403, cod)
        cod, _ = op.req("POST", "/api/oqc/salidas", {
            "clienteId": c1["id"], "almacenOrigenId": almacen_id,
            "lineas": [{"productoId": p1["productoId"], "cantidad": 1}],
        })
        check("OPERADOR: liberar material → 403 (sin oqc.liberar)", 403, cod)
        # Limpieza del usuario de prueba
        admin.req("DELETE", f"/api/usuarios/{uid}")
        cod, papelera = admin.req("GET", "/api/papelera")
        for e in papelera.get("entradas", []):
            if e["entidad"] == "USUARIO" and e["identificador"] == "permisos.test@cig-manufacturing.com":
                cod, _ = admin.req("DELETE", f"/api/papelera/{e['id']}")
                check("Purga del usuario de prueba", 200, cod)

    # ===== Resumen =====
    ok = sum(1 for _, hecho in PRUEBAS if hecho)
    total = len(PRUEBAS)
    print(f"\n{'=' * 56}\nRESULTADO: {ok}/{total} pruebas superadas")
    if ok != total:
        print("FALLAS:")
        for desc, hecho in PRUEBAS:
            if not hecho:
                print(f"  ✘ {desc}")
    return 0 if ok == total else 1


if __name__ == "__main__":
    sys.exit(main())
