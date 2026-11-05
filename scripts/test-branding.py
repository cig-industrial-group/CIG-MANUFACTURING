#!/usr/bin/env python3
# ============================================================================
# PROYECTO: CIG.MANUFACTURING
# COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
# UBICACIÓN: Tijuana, Baja California, México
# LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
# CONTACTO: caballeroemanuel966@gmail.com
# ============================================================================

"""
VERIFICACIÓN END-TO-END DEL MÓDULO DE BRANDING (CIG-MANUFACTURING, Fase 14)

Arranca el servidor standalone en el puerto 3400, ejecuta la batería de
pruebas contra las APIs reales y lo apaga al terminar. Todo ocurre en un
solo proceso para que el servidor no sobreviva a la prueba.

Cubre:
  · Servicio público: GET /api/branding/logo y /api/branding/favicon
    (predeterminado con Content-Type y Cache-Control correctos)
  · Gestión: GET /api/ajustes/branding (estado), POST/DELETE de logo y
    favicon (subida válida, sobrescritura de extensión, restauración)
  · Validación de seguridad: archivo inválido (.exe / contenido falso
    con extensión .png), tamaño excedido (logo > 2 MB, favicon > 500 KB)
  · Idempotencia: eliminar un branding inexistente es éxito
  · Permisos: sin sesión → 401; rol sin ajustes.branding → 403
  · Integración del layout: <link rel="icon" href="/api/branding/favicon">
"""
import http.cookiejar
import json
import os
import signal
import struct
import subprocess
import sys
import time
import urllib.error
import urllib.request
import zlib

BASE = "http://127.0.0.1:3400"
PROYECTO = os.environ.get(
    "CIG_PROYECTO",
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
)
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or sys.exit(
    "✖ Define ADMIN_PASSWORD (contraseña del admin sembrado) antes de ejecutar")

PRUEBAS = []


def check(desc, esperado, obtenido):
    ok = esperado == obtenido
    PRUEBAS.append((desc, ok))
    print(("  ✔ " if ok else "  ✘ ") + desc + ("" if ok else f"  — esperado: {esperado!r}, obtenido: {obtenido!r}"))
    return ok


# ============================================================
# GENERADORES DE ARCHIVOS DE PRUEBA (stdlib puro)
# ============================================================

def _trozo_png(tipo, datos):
    return (struct.pack(">I", len(datos)) + tipo + datos
            + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF))


def png_solido(ancho, alto, rgb):
    """PNG válido de color plano (RGB, 8 bits)."""
    ihdr = struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)
    crudo = b"".join(b"\x00" + bytes(rgb) * ancho for _ in range(alto))
    return (b"\x89PNG\r\n\x1a\n" + _trozo_png(b"IHDR", ihdr)
            + _trozo_png(b"IDAT", zlib.compress(crudo)) + _trozo_png(b"IEND", b""))


def png_ruido(ancho, alto):
    """PNG válido INCOMPRESIBLE (ruido): para probar el límite de tamaño."""
    ihdr = struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)
    crudo = b"".join(b"\x00" + os.urandom(ancho * 3) for _ in range(alto))
    return (b"\x89PNG\r\n\x1a\n" + _trozo_png(b"IHDR", ihdr)
            + _trozo_png(b"IDAT", zlib.compress(crudo, 0)) + _trozo_png(b"IEND", b""))


def ico_con_png(png, ancho=32, alto=32):
    """ICO válido cuyo contenido es un PNG (formato permitido por Windows/Excel modernos)."""
    entrada = struct.pack("<BBBBHHII", ancho, alto, 0, 0, 1, 32, len(png), 22)
    return struct.pack("<HHH", 0, 1, 1) + entrada + png


SVG_LOGO = (
    b'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
    b'<rect width="64" height="64" rx="12" fill="#f59e0b"/>'
    b'<path d="M18 46 46 18 M18 18 46 46" stroke="#fff" stroke-width="7" stroke-linecap="round"/>'
    b"</svg>"
)

FALSO_PNG = b"esto no es una imagen de verdad, es texto con extension .png"
EXE_FALSO = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff" + b"\x00" * 64


# ============================================================
# CLIENTE HTTP (sesión con cookies + multipart)
# ============================================================

class Sesion:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def req(self, metodo, ruta, cuerpo=None):
        """Petición JSON: devuelve (estado, cuerpo-parseado)."""
        data = json.dumps(cuerpo).encode() if cuerpo is not None else None
        r = urllib.request.Request(
            BASE + ruta, data=data, method=metodo,
            headers={"Content-Type": "application/json"},
        )
        try:
            with self.opener.open(r, timeout=60) as resp:
                texto = resp.read().decode()
                return resp.status, (json.loads(texto) if texto else {})
        except urllib.error.HTTPError as e:
            texto = e.read().decode()
            try:
                return e.code, json.loads(texto)
            except json.JSONDecodeError:
                return e.code, {}

    def req_archivo(self, metodo, ruta, datos, content_type):
        """Petición cruda (multipart/binaria): devuelve (estado, cabeceras, bytes)."""
        r = urllib.request.Request(
            BASE + ruta, data=datos, method=metodo,
            headers={"Content-Type": content_type},
        )
        try:
            with self.opener.open(r, timeout=120) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def req_bytes(self, ruta):
        """GET público: devuelve (estado, cabeceras, bytes)."""
        r = urllib.request.Request(BASE + ruta, method="GET")
        try:
            with self.opener.open(r, timeout=60) as resp:
                return resp.status, dict(resp.headers), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()


def multipart(campo, nombre, contenido, content_type):
    limite = "----cigbranding7d1a2c3b4f6e8d"
    partes = [
        f"--{limite}\r\n".encode(),
        f'Content-Disposition: form-data; name="{campo}"; filename="{nombre}"\r\n'.encode(),
        f"Content-Type: {content_type}\r\n\r\n".encode(),
        contenido,
        f"\r\n--{limite}--\r\n".encode(),
    ]
    return b"".join(partes), f"multipart/form-data; boundary={limite}"


def subir(sesion, ruta, nombre, contenido, content_type):
    cuerpo, tipo = multipart("archivo", nombre, contenido, content_type)
    estado, cabeceras, respuesta = sesion.req_archivo("POST", ruta, cuerpo, tipo)
    try:
        return estado, cabeceras, json.loads(respuesta.decode())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return estado, cabeceras, {}


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
    # ===== Arranque del servidor (standalone, puerto 3400) =====
    env = dict(os.environ)
    # Servidor de pruebas por HTTP plano: permitir cookie sin Secure
    # (equivale a un despliegue LAN sin TLS; ver DESPLIEGUE.md)
    env.update({"PORT": "3400", "HOSTNAME": "0.0.0.0", "COOKIE_INSEGURA_HTTP": "1"})
    log = open("/tmp/cig-manufacturing-test-branding.log", "w")
    proc = subprocess.Popen(
        ["bash", "start.sh"], cwd=PROYECTO, env=env,
        stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
    )
    try:
        if not esperar_servidor():
            print("✘ El servidor no respondió en 90s; log en /tmp/cig-manufacturing-test-branding.log")
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
    png_logo = png_solido(512, 512, (245, 158, 11))
    png_favicon = png_solido(64, 64, (59, 130, 246))
    ico_favicon = ico_con_png(png_solido(32, 32, (16, 185, 129)))

    print("\n=== 0. Limpieza de restos de ejecuciones previas ===")
    cod, _ = admin.req("POST", "/api/auth/login",
                       {"correo": "admin@cig-manufacturing.com", "password": ADMIN_PASSWORD})
    check("Login admin", 200, cod)
    cod, _ = admin.req("DELETE", "/api/ajustes/branding/logo")
    check("Logo previo eliminado (idempotente)", 200, cod)
    cod, _ = admin.req("DELETE", "/api/ajustes/branding/favicon")
    check("Favicon previo eliminado (idempotente)", 200, cod)

    print("\n=== 1. Servicio público (sin sesión) ===")
    estado, cabeceras, bytes_logo = admin.req_bytes("/api/branding/logo")
    check("GET /api/branding/logo sin sesión → 200 (público)", 200, estado)
    check("  sirve el logo predeterminado (SVG del repositorio)",
          "image/svg+xml", (cabeceras.get("Content-Type") or "").split(";")[0])
    check("  Cache-Control público de 1 hora",
          "public, max-age=3600", cabeceras.get("Cache-Control"))
    check("  contenido no vacío", True, len(bytes_logo) > 0)

    estado, cabeceras, bytes_fav = admin.req_bytes("/api/branding/favicon")
    check("GET /api/branding/favicon sin sesión → 200 (público)", 200, estado)
    check("  favicon predeterminado con Content-Type SVG",
          "image/svg+xml", (cabeceras.get("Content-Type") or "").split(";")[0])
    check("  mismo predeterminado que el logo", bytes_logo, bytes_fav)

    # Integración del layout: <link rel="icon"> apunta a la API dinámica
    estado, _, html = admin.req_bytes("/")
    check("GET / incluye <link rel=\"icon\" href=\"/api/branding/favicon\">", True,
          b'href="/api/branding/favicon"' in html and b'rel="icon"' in html)

    print("\n=== 2. Autenticación y estado inicial ===")
    # Cliente sin cookies: la sesión admin ya está activa desde la limpieza
    anonima = Sesion()
    cod, cuerpo = anonima.req("GET", "/api/ajustes/branding")
    check("GET /api/ajustes/branding sin sesión → 401", 401, cod)
    check("  error NO_AUTENTICADO", "NO_AUTENTICADO", cuerpo.get("error"))

    cod, cuerpo = admin.req("GET", "/api/ajustes/branding")
    check("GET /api/ajustes/branding (admin) → 200", 200, cod)
    branding = cuerpo.get("branding", {})
    check("  sin logo personalizado al inicio", False, branding.get("logo", {}).get("personalizado"))
    check("  sin favicon personalizado al inicio", False, branding.get("favicon", {}).get("personalizado"))

    print("\n=== 3. Subida de logo válido (PNG) ===")
    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/logo",
                           "logo-prueba.png", png_logo, "image/png")
    check("POST logo PNG válido → 201", 201, cod)
    check("  estado refleja logo personalizado tipo png", True,
          cuerpo.get("branding", {}).get("logo", {}).get("personalizado")
          and cuerpo.get("branding", {}).get("logo", {}).get("tipo") == "png")

    estado, cabeceras, servido = admin.req_bytes("/api/branding/logo")
    check("  GET /api/branding/logo sirve el PNG subido", 200, estado)
    check("  Content-Type image/png", "image/png", (cabeceras.get("Content-Type") or "").split(";")[0])
    check("  bytes servidos == bytes subidos", png_logo, servido)
    check("  Cache-Control público de 1 hora",
          "public, max-age=3600", cabeceras.get("Cache-Control"))

    print("\n=== 4. Sobrescritura por otra extensión (SVG) ===")
    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/logo",
                           "logo-prueba.svg", SVG_LOGO, "image/svg+xml")
    check("POST logo SVG válido → 201 (reemplaza al PNG)", 201, cod)
    check("  estado refleja tipo svg", "svg", cuerpo.get("branding", {}).get("logo", {}).get("tipo"))
    estado, cabeceras, servido = admin.req_bytes("/api/branding/logo")
    check("  GET sirve el SVG nuevo (no el PNG viejo)", SVG_LOGO, servido)
    check("  Content-Type image/svg+xml", "image/svg+xml",
          (cabeceras.get("Content-Type") or "").split(";")[0])

    print("\n=== 5. Validación de seguridad ===")
    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/logo",
                           "malware.exe", EXE_FALSO, "application/octet-stream")
    check("POST logo .exe → 400", 400, cod)
    check("  error BRANDING_ARCHIVO_INVALIDO", "BRANDING_ARCHIVO_INVALIDO", cuerpo.get("error"))

    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/logo",
                           "falso.png", FALSO_PNG, "image/png")
    check("POST texto con extensión .png → 400 (magic bytes)", 400, cod)
    check("  error BRANDING_ARCHIVO_INVALIDO", "BRANDING_ARCHIVO_INVALIDO", cuerpo.get("error"))

    logo_grande = png_ruido(900, 900)  # ≈ 2.4 MB > 2 MB
    check(f"  PNG de prueba supera 2 MB ({len(logo_grande) // 1024} KB)", True,
          len(logo_grande) > 2 * 1024 * 1024)
    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/logo",
                           "logo-grande.png", logo_grande, "image/png")
    check("POST logo > 2 MB → 413", 413, cod)
    check("  error BRANDING_TAMANNO_EXCEDIDO", "BRANDING_TAMANNO_EXCEDIDO", cuerpo.get("error"))

    estado, _, servido = admin.req_bytes("/api/branding/logo")
    check("  el logo vigente no cambió tras los rechazos", SVG_LOGO, servido)

    print("\n=== 6. Favicon: subida válida y límites ===")
    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/favicon",
                           "favicon-prueba.ico", ico_favicon, "image/x-icon")
    check("POST favicon ICO válido → 201", 201, cod)
    check("  estado refleja favicon personalizado tipo ico", True,
          cuerpo.get("branding", {}).get("favicon", {}).get("personalizado")
          and cuerpo.get("branding", {}).get("favicon", {}).get("tipo") == "ico")
    estado, cabeceras, servido = admin.req_bytes("/api/branding/favicon")
    check("  GET /api/branding/favicon sirve el ICO subido", ico_favicon, servido)
    check("  Content-Type image/x-icon", "image/x-icon",
          (cabeceras.get("Content-Type") or "").split(";")[0])

    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/favicon",
                           "favicon-grande.png", png_ruido(600, 600), "image/png")
    check("POST favicon PNG > 500 KB → 413", 413, cod)
    check("  error BRANDING_TAMANNO_EXCEDIDO", "BRANDING_TAMANNO_EXCEDIDO", cuerpo.get("error"))

    cod, _, cuerpo = subir(admin, "/api/ajustes/branding/favicon",
                           "favicon.png", png_favicon, "image/png")
    check("POST favicon PNG válido → 201 (reemplaza al ICO)", 201, cod)
    estado, _, servido = admin.req_bytes("/api/branding/favicon")
    check("  GET sirve el PNG nuevo", png_favicon, servido)

    print("\n=== 7. Restauración e idempotencia ===")
    cod, cuerpo = admin.req("DELETE", "/api/ajustes/branding/logo")
    check("DELETE logo personalizado → 200", 200, cod)
    check("  estado sin logo personalizado", False,
          cuerpo.get("branding", {}).get("logo", {}).get("personalizado"))
    estado, _, servido = admin.req_bytes("/api/branding/logo")
    check("  se restablece el logo predeterminado", bytes_logo, servido)

    cod, _ = admin.req("DELETE", "/api/ajustes/branding/logo")
    check("DELETE logo inexistente → 200 (idempotente)", 200, cod)

    cod, _ = admin.req("DELETE", "/api/ajustes/branding/favicon")
    check("DELETE favicon personalizado → 200", 200, cod)
    estado, _, servido = admin.req_bytes("/api/branding/favicon")
    check("  se restablece el favicon predeterminado", bytes_fav, servido)
    cod, _ = admin.req("DELETE", "/api/ajustes/branding/favicon")
    check("DELETE favicon inexistente → 200 (idempotente)", 200, cod)

    print("\n=== 8. Permisos por rol (OPERADOR sin ajustes.branding) ===")
    cod, roles = admin.req("GET", "/api/roles")
    operador = next((r for r in roles.get("roles", []) if r["clave"] == "OPERADOR"), None)
    check("Rol OPERADOR presente", True, operador is not None)
    if operador:
        check("  OPERADOR sin ajustes.branding", False, "ajustes.branding" in operador["permisos"])

        cod, cuerpo = admin.req("POST", "/api/usuarios", {
            "nombre": "Prueba Branding", "correo": "branding.test@cig-manufacturing.com",
            "password": "Branding*2026", "rolId": operador["id"],
        })
        check("Crear usuario de prueba con rol OPERADOR", 201, cod)
        uid = cuerpo.get("usuario", {}).get("id")
        op = Sesion()
        cod, _ = op.req("POST", "/api/auth/login",
                        {"correo": "branding.test@cig-manufacturing.com", "password": "Branding*2026"})
        check("Login del usuario de prueba", 200, cod)

        cod, cuerpo = op.req("GET", "/api/ajustes/branding")
        check("OPERADOR: GET /api/ajustes/branding → 403", 403, cod)
        check("  error SIN_PERMISO", "SIN_PERMISO", cuerpo.get("error"))

        cod, cuerpo, _ = subir(op, "/api/ajustes/branding/logo",
                               "logo-operador.png", png_logo, "image/png")
        check("OPERADOR: subir logo → 403 (sin ajustes.branding)", 403, cod)

        cod, _ = op.req("DELETE", "/api/ajustes/branding/logo")
        check("OPERADOR: eliminar logo → 403", 403, cod)

        # Limpieza del usuario de prueba
        admin.req("DELETE", f"/api/usuarios/{uid}")
        cod, papelera = admin.req("GET", "/api/papelera")
        for e in papelera.get("entradas", []):
            if e["entidad"] == "USUARIO" and e["identificador"] == "branding.test@cig-manufacturing.com":
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
