import { NextResponse } from "next/server";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { listarBitacora, listarPapelera } from "@/modulos/papelera/servicios/nucleo";

// GET /api/papelera?vista=activa|bitacora — Registros restaurables o trail completo
// La purga perezosa de expirados corre antes de cada consulta.
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "papelera.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  const vista = searchParams.get("vista") === "bitacora" ? "bitacora" : "activa";
  const entradas = vista === "bitacora" ? await listarBitacora() : await listarPapelera();
  return NextResponse.json({ vista, entradas });
}
