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
import { db } from "@/lib/db";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { DIAS_RESTAURACION, enviarAlmacenAPapelera } from "@/modulos/papelera/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/almacen/almacenes/[id] — Actualizar almacén
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "almacen.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const existente = await db.almacen.findUnique({ where: { id } });
    if (!existente) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }

    const codigo = cuerpo.codigo !== undefined ? String(cuerpo.codigo).trim().toUpperCase() : undefined;
    if (codigo && codigo !== existente.codigo) {
      const duplicado = await db.almacen.findUnique({ where: { codigo } });
      if (duplicado) return NextResponse.json({ error: "CODIGO_DUPLICADO" }, { status: 409 });
    }

    const almacen = await db.almacen.update({
      where: { id },
      data: {
        ...(codigo !== undefined && { codigo }),
        ...(cuerpo.nombre !== undefined && { nombre: String(cuerpo.nombre).trim() }),
        ...(cuerpo.ubicacion !== undefined && { ubicacion: cuerpo.ubicacion?.trim() || null }),
        ...(cuerpo.tipo !== undefined &&
          ["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "GENERAL"].includes(cuerpo.tipo) && { tipo: cuerpo.tipo }),
        ...(cuerpo.responsable !== undefined && { responsable: cuerpo.responsable?.trim() || null }),
        ...(cuerpo.activo !== undefined && { activo: Boolean(cuerpo.activo) }),
      },
    });
    return NextResponse.json({ ...almacen, createdAt: almacen.createdAt.toISOString() });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/almacen/almacenes/[id] — Enviar a la papelera (borrado en 2 etapas)
// El almacén sale de la base con su stock y queda restaurable 30 días.
// Su historial de movimientos sobrevive intacto (ledger con snapshots).
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "almacen.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    await enviarAlmacenAPapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, restaurableDuranteDias: DIAS_RESTAURACION });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
