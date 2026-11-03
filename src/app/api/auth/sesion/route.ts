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
