/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { descargarRespaldo } from "@/modulos/respaldo/servicios/nucleo";

// GET /api/respaldo/descargar?id=... — Descarga el archivo de respaldo
// (volcado pg_dump completo, útil para resguardo externo). La respuesta
// se sirve en STREAMING: el archivo jamás se carga entero en memoria.
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID_REQUERIDO" }, { status: 400 });

    const { flujo, archivo, tamanoBytes } = await descargarRespaldo(id);
    return new NextResponse(flujo, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${archivo}"`,
        "Content-Length": String(tamanoBytes),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
