/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * MIDDLEWARE DE SEGURIDAD — CSP con nonce dinámico (TASK-STR-009, hallazgo
 * H8 del pentest; corrección de raíz de la regresión de hidratación).
 *
 * La primera entrega declaraba la CSP estáticamente en `next.config.ts`
 * con `script-src 'self'`: sin 'unsafe-inline' ni nonce, el navegador
 * bloqueaba los scripts inline de arranque de Next.js (self.__next_f) y la
 * aplicación quedaba congelada en «Cargando...». La corrección de raíz
 * genera aquí un NONCE CRIPTOGRÁFICO ÚNICO POR PETICIÓN y lo declara en
 * `script-src`; Next.js App Router lee el nonce del header CSP de la
 * PETICIÓN (getScriptNonceFromHeaders) y lo aplica automáticamente a sus
 * scripts internos de hidratación: la app funciona y cualquier script
 * inyectado por un atacante —sin acceso al nonce de esta respuesta— sigue
 * bloqueado. La sanitización SVG de H4 (sanearSvg en branding.ts) queda
 * como primera capa; esta CSP es la segunda.
 *
 * Cabeceras emitidas en TODAS las respuestas:
 * · Content-Security-Policy — global con nonce (RF-02) o específica
 *   `default-src 'none'` para los recursos de identidad visual (RF-04).
 * · X-Content-Type-Options: nosniff — el navegador no puede reinterpretar
 *   un recurso servido como image/svg+xml como text/html.
 * · X-Frame-Options: DENY — anti-clickjacking; refuerza el
 *   frame-ancestors 'none' de la CSP.
 * · Referrer-Policy: strict-origin-when-cross-origin — no filtra la URL
 *   completa (posibles ids/token en query) a terceros.
 */

/** Recursos de identidad visual servidos como imagen (logo/favicon). */
const PREFIJO_RUTA_BRANDING = "/api/branding/";

/** Construye la CSP global con el nonce de esta petición (RF-02/RF-06). */
function cspGlobal(nonce: string): string {
  return [
    "default-src 'self'",
    // RF-06: SIN 'unsafe-inline' y SIN 'unsafe-eval'; el nonce autoriza
    // EXCLUSIVAMENTE los scripts de hidratación de esta respuesta.
    `script-src 'self' 'nonce-${nonce}'`,
    // shadcn/ui y Radix aplican estilos en línea, imprescindibles.
    "style-src 'self' 'unsafe-inline'",
    // logos (data:), previsualizaciones (blob:) y recursos propios.
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join("; ");
}

/** CSP específica para /api/branding/:recurso* (RF-04): el recurso es una
 * imagen; no necesita scripts, marcos ni conexiones. */
const CSP_BRANDING = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

export function middleware(peticion: NextRequest) {
  // RF-01 — nonce criptográfico único por petición: UUID v4 (122 bits de
  // aleatoriedad del CSPRNG) codificado en base64. Cada respuesta trae el
  // suyo; un nonce filtrado no sirve para otra petición.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const esRecursoBranding = peticion
    .nextUrl.pathname.startsWith(PREFIJO_RUTA_BRANDING);
  const csp = esRecursoBranding ? CSP_BRANDING : cspGlobal(nonce);

  const cabecerasPeticion = new Headers(peticion.headers);
  if (!esRecursoBranding) {
    // Forward al renderizador: Next.js extrae el nonce del header CSP de
    // la petición y lo aplica a sus scripts internos; `x-nonce` lo expone
    // al layout raíz (propagación al <html> y a los scripts del árbol).
    cabecerasPeticion.set("x-nonce", nonce);
    cabecerasPeticion.set("Content-Security-Policy", csp);
  }

  const respuesta = NextResponse.next({
    request: { headers: cabecerasPeticion },
  });

  // RF-02/RF-03 — cabeceras de seguridad de la RESPUESTA.
  respuesta.headers.set("Content-Security-Policy", csp);
  respuesta.headers.set("X-Content-Type-Options", "nosniff");
  respuesta.headers.set("X-Frame-Options", "DENY");
  respuesta.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return respuesta;
}

/**
 * El middleware cubre TODAS las rutas (documentos, API y estáticos), igual
 * de estricto que la cabecera global `/:path*` que sustituye.
 */
export const config = {
  matcher: ["/:path*"],
};
