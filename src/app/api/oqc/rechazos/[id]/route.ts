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
import { editarRechazoOQC, eliminarRechazoOQC } from "@/modulos/oqc/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/oqc/rechazos/[id] — Editar un registro de rechazo (documental)
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const registro = await editarRechazoOQC(id, {
      productoId: cuerpo.productoId,
      clienteId: cuerpo.clienteId !== undefined ? cuerpo.clienteId : undefined,
      cantidad: cuerpo.cantidad !== undefined ? String(cuerpo.cantidad) : undefined,
      motivo: cuerpo.motivo,
      disposicion: cuerpo.disposicion,
      notas: cuerpo.notas,
      responsable: cuerpo.responsable,
    });
    return NextResponse.json(registro);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/oqc/rechazos/[id] — Eliminar un registro de rechazo
// (documental: sin efecto sobre el stock)
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const { folio } = await eliminarRechazoOQC(id);
    return NextResponse.json({ ok: true, folio });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
