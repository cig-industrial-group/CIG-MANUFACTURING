import { NextResponse } from "next/server";
import { sinCookieSesion } from "@/modulos/autenticacion/servicios/auth";

// POST /api/auth/logout — Cerrar sesión
export async function POST() {
  return sinCookieSesion(NextResponse.json({ ok: true }));
}
