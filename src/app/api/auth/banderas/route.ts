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
import { obtenerBanderasAuth } from "@/modulos/autenticacion/servicios/configuracion";

// GET /api/auth/banderas — Banderas públicas para la pantalla de acceso
// (si el registro y la recuperación automática están habilitados)
export async function GET() {
  try {
    const banderas = await obtenerBanderasAuth();
    return NextResponse.json(banderas);
  } catch {
    return NextResponse.json(
      { registroHabilitado: false, recuperacionHabilitada: false },
      { status: 200 },
    );
  }
}
