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
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import {
  crearRespaldo,
  eliminarRespaldo,
  obtenerEstadoRespaldo,
} from "@/modulos/respaldo/servicios/nucleo";

// GET /api/respaldo — Estado del módulo: respaldos, última restauración,
// ventana de reversión y limpieza (requiere respaldo.gestionar)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const estado = await obtenerEstadoRespaldo();
    return NextResponse.json(estado);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// POST /api/respaldo — Crear un respaldo manual completo (etiqueta opcional)
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const cuerpo = await request.json().catch(() => ({}));
    const respaldo = await crearRespaldo({
      tipo: "MANUAL",
      etiqueta: typeof cuerpo?.etiqueta === "string" ? cuerpo.etiqueta : undefined,
      usuario: usuario.nombre,
    });
    return NextResponse.json({ respaldo });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/respaldo?id=... — Eliminar un respaldo (archivo + registro)
export async function DELETE(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID_REQUERIDO" }, { status: 400 });
    await eliminarRespaldo(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
