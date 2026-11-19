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
import { actualizarUnidad, eliminarUnidad } from "@/modulos/unidades/servicios/nucleo";
import type { TipoUnidad } from "@/modulos/unidades/tipos";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/unidades/[id] — Actualizar unidad (nombre, unidad base,
// estado activo). El código y el tipo de las unidades del sistema son
// identidad: no cambian.
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "unidades.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const unidad = await actualizarUnidad(id, {
      ...(cuerpo.codigo !== undefined && { codigo: cuerpo.codigo }),
      ...(cuerpo.nombre !== undefined && { nombre: cuerpo.nombre }),
      ...(cuerpo.nombreEn !== undefined && { nombreEn: cuerpo.nombreEn }),
      ...(cuerpo.tipo !== undefined && { tipo: cuerpo.tipo as TipoUnidad }),
      ...(cuerpo.unidadBase !== undefined && { unidadBase: cuerpo.unidadBase }),
      ...(cuerpo.notas !== undefined && { notas: cuerpo.notas }),
      ...(cuerpo.activo !== undefined && { activo: Boolean(cuerpo.activo) }),
    });
    return NextResponse.json(unidad);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/unidades/[id] — Eliminación real. Solo unidades propias
// (las del sistema no se eliminan: se desactivan) y sin referencias
// vivas (productos que las usen o paquetes que dependan de ellas).
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "unidades.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const resultado = await eliminarUnidad(id);
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
