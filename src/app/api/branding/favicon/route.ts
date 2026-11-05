/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import {
  obtenerRutaFavicon,
  obtenerRutaLogoPorDefecto,
  mimePorExtension,
} from "@/modulos/ajustes/servicios/branding";

// Ruta de servicio PÚBLICA (favicon del navegador): nunca se pre-renderiza
// en build — siempre refleja el archivo vigente en disco.
export const dynamic = "force-dynamic";

/** Convierte un stream de Node en cuerpo de Response (sin cargar en memoria) */
function cuerpoStream(ruta: string): ReadableStream {
  return Readable.toWeb(createReadStream(ruta)) as unknown as ReadableStream;
}

/** Respuesta de archivo con cabeceras de servicio (cache pública de 1 h) */
function respuestaArchivo(ruta: string, extension: string): Response {
  return new Response(cuerpoStream(ruta), {
    headers: {
      "Content-Type": mimePorExtension(extension),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

// GET /api/branding/favicon — Sirve el favicon personalizado
// (branding/favicon.{ico,png}) o, si no existe, el predeterminado
// (public/logo.svg, servido como icono SVG). Mismo patrón que el logo.
// Público: el navegador lo solicita antes de cualquier sesión.
export async function GET() {
  const personalizado = obtenerRutaFavicon();
  if (personalizado) {
    return respuestaArchivo(personalizado.ruta, personalizado.extension);
  }

  const porDefecto = obtenerRutaLogoPorDefecto();
  if (porDefecto) {
    return respuestaArchivo(porDefecto, "svg");
  }

  // Último recurso: dejar que Next sirva el estático de public/.
  return NextResponse.redirect(new URL("/logo.svg", "http://localhost"), 307);
}
