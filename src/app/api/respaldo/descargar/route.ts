import { NextResponse } from "next/server";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { descargarRespaldo } from "@/modulos/respaldo/servicios/nucleo";

// GET /api/respaldo/descargar?id=... — Descarga el archivo de respaldo
// (copia completa de la base de datos, útil para resguardo externo).
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID_REQUERIDO" }, { status: 400 });

    const { buffer, archivo } = await descargarRespaldo(id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${archivo}"`,
        "Content-Length": String(buffer.length),
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
