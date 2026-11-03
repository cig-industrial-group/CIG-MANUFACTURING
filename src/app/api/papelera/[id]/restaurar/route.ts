import { NextResponse } from "next/server";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { restaurarDePapelera } from "@/modulos/papelera/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/papelera/[id]/restaurar — Restaura el registro con su id original
// (el historial de movimientos se re-vincula automáticamente).
export async function POST(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "papelera.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    const resultado = await restaurarDePapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
