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
import { obtenerSesion } from "@/modulos/autenticacion/servicios/auth";

// GET /api/auth/sesion — Usuario de la sesión activa
export async function GET(request: Request) {
  const usuario = await obtenerSesion(request);
  if (!usuario) {
    return NextResponse.json({ error: "NO_AUTENTICADO" }, { status: 401 });
  }
  return NextResponse.json({ usuario });
}
