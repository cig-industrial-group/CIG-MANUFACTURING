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
import { corregirScrapOQC, eliminarScrapOQC } from "@/modulos/oqc/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/oqc/scrap/[id] — Corregir un registro de scrap:
// revierte y reaplica el movimiento SCRAP (con bitácora) y refleja
// los cambios en el registro. Requiere motivo de corrección.
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    if (!cuerpo.motivoCorreccion?.trim()) {
      return NextResponse.json({ error: "MOTIVO_CORRECCION_REQUERIDO" }, { status: 400 });
    }

    const registro = await corregirScrapOQC(
      id,
      {
        productoId: cuerpo.productoId,
        almacenId: cuerpo.almacenId,
        cantidad: cuerpo.cantidad !== undefined ? String(cuerpo.cantidad) : undefined,
        motivo: cuerpo.motivo,
        notas: cuerpo.notas,
        responsable: cuerpo.responsable,
        motivoCorreccion: String(cuerpo.motivoCorreccion),
      },
      { id: usuario.id, nombre: usuario.nombre },
    );
    return NextResponse.json(registro);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/oqc/scrap/[id] — Eliminar un registro de scrap:
// devuelve el material al almacén (reversión con bitácora) y retira
// el registro. Requiere motivo de corrección.
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json().catch(() => ({}));
    if (!cuerpo.motivoCorreccion?.trim()) {
      return NextResponse.json({ error: "MOTIVO_CORRECCION_REQUERIDO" }, { status: 400 });
    }

    const { folio } = await eliminarScrapOQC(id, {
      motivoCorreccion: String(cuerpo.motivoCorreccion),
      usuarioId: usuario.id,
      usuarioNombre: usuario.nombre,
    });
    return NextResponse.json({ ok: true, folio });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
