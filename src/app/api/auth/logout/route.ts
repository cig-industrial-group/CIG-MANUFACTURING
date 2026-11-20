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
import { sinCookieSesion } from "@/modulos/autenticacion/servicios/auth";

// POST /api/auth/logout — Cerrar sesión
export async function POST() {
  return sinCookieSesion(NextResponse.json({ ok: true }));
}
