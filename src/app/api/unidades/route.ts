import { NextResponse } from "next/server";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { crearUnidad, listarUnidades } from "@/modulos/unidades/servicios/nucleo";
import type { TipoUnidad } from "@/modulos/unidades/tipos";

// GET /api/unidades — Catálogo de unidades de medida.
// Disponible para cualquiera con acceso de consulta al almacén: los
// formularios de captura (Almacén y OQC) lo usan para ofrecer el conteo
// en paquetes. Siembra el catálogo base del sistema si está vacío.
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.ver");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { searchParams } = new URL(request.url);
    const incluirInactivos = searchParams.get("incluirInactivos") === "true";
    const unidades = await listarUnidades({ incluirInactivos });
    return NextResponse.json(unidades);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// POST /api/unidades — Crear unidad de medida (permiso unidades.gestionar)
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "unidades.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const unidad = await crearUnidad({
      codigo: cuerpo.codigo,
      nombre: cuerpo.nombre,
      nombreEn: cuerpo.nombreEn,
      tipo: cuerpo.tipo as TipoUnidad,
      unidadBase: cuerpo.unidadBase,
      notas: cuerpo.notas,
    });
    return NextResponse.json(unidad, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
