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
import { estadoBranding } from "@/modulos/ajustes/servicios/branding";

// GET /api/ajustes/branding — Estado de la identidad visual: URLs de logo
// y favicon vigentes (o null en tipo/tamaño si no hay personalizado).
// Requiere el permiso ajustes.branding.
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "ajustes.branding");
  if (guardia instanceof NextResponse) return guardia;

  try {
    return NextResponse.json({ branding: estadoBranding() });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
