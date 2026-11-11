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
import { VERSION_DEL_SISTEMA } from "@/lib/version";

/**
 * HEALTH CHECK de la aplicación (GET /api).
 *
 * Lo consume el HEALTHCHECK del Dockerfile (espera 200 mientras el servidor
 * standalone esté operativo). La versión proviene de la ÚNICA fuente de
 * verdad (package.json, vía @/lib/version): cambiar la versión en
 * package.json actualiza esta respuesta sin tocar código de ruta —
 * sustituye al marcador "Hello, world!" del andamiaje inicial.
 */
export async function GET() {
  return NextResponse.json({
    estado: "ok",
    sistema: "CIG-MANUFACTURING",
    version: VERSION_DEL_SISTEMA,
  });
}
