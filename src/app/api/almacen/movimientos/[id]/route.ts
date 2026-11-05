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
import { aDecimal } from "@/lib/numerico";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import {
  ErrorNegocio,
  editarMovimientoTx,
  eliminarMovimientoTx,
  mapearMovimiento,
  productosVivos,
} from "@/modulos/almacen/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/almacen/movimientos/[id] — Detalle del registro + bitácora de correcciones
export async function GET(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "almacen.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { id } = await params;
  const movimiento = await db.movimiento.findUnique({ where: { id } });
  if (!movimiento) {
    return NextResponse.json({ error: "MOVIMIENTO_NO_EXISTE" }, { status: 404 });
  }

  const correccionesRaw = await db.correccionMovimiento.findMany({
    where: { movimientoId: id },
    orderBy: { createdAt: "desc" },
  });

  const correcciones = correccionesRaw.map((c) => ({
    id: c.id,
    accion: c.accion,
    motivo: c.motivo,
    usuarioNombre: c.usuarioNombre,
    createdAt: c.createdAt.toISOString(),
    antes: JSON.parse(c.antes) as Record<string, unknown>,
    despues: c.despues ? (JSON.parse(c.despues) as Record<string, unknown>) : null,
  }));

  const vivos = await productosVivos([movimiento.productoId]);

  return NextResponse.json({
    movimiento: mapearMovimiento(movimiento, vivos.has(movimiento.productoId)),
    correcciones,
  });
}

// PATCH /api/almacen/movimientos/[id] — Corregir un registro de la sección
// El tipo de movimiento y el folio no se alteran; el stock se recalcula
// (se revierte el efecto original y se aplica el corregido) y la acción
// queda registrada en la bitácora de correcciones.
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const guardia = await requerirPermiso(request, "movimientos.corregir");
    if (guardia instanceof NextResponse) return guardia;
    const { usuario } = guardia;

    const { id } = await params;
    const cuerpo = await request.json();

    if (!cuerpo.productoId) {
      return NextResponse.json({ error: "PRODUCTO_REQUERIDO" }, { status: 400 });
    }
    if (!cuerpo.motivoCorreccion?.trim()) {
      return NextResponse.json({ error: "MOTIVO_CORRECCION_REQUERIDO" }, { status: 400 });
    }
    // Validación decimal exacta (fail-closed): sin coerción silenciosa
    const cantidad = aDecimal(cuerpo.cantidad);
    if (!cantidad) {
      return NextResponse.json({ error: "QUANTIDAD_INVALIDA" }, { status: 400 });
    }

    const resultado = await db.$transaction((tx) =>
      editarMovimientoTx(
        tx,
        id,
        {
          productoId: String(cuerpo.productoId),
          almacenOrigenId: cuerpo.almacenOrigenId || undefined,
          almacenDestinoId: cuerpo.almacenDestinoId || undefined,
          cantidad,
          motivo: cuerpo.motivo,
          referencia: cuerpo.referencia,
          responsable: cuerpo.responsable,
        },
        {
          motivoCorreccion: String(cuerpo.motivoCorreccion),
          usuarioId: usuario.id,
          usuarioNombre: usuario.nombre,
        },
      ),
    );

    return NextResponse.json(mapearMovimiento(resultado));
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/almacen/movimientos/[id] — Eliminar un registro de la sección
// Requiere motivo obligatorio; el stock se restaura y la eliminación
// queda documentada en la bitácora de correcciones.
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    const guardia = await requerirPermiso(request, "movimientos.corregir");
    if (guardia instanceof NextResponse) return guardia;
    const { usuario } = guardia;

    const { id } = await params;
    let motivoCorreccion = "";
    try {
      const cuerpo = await request.json();
      motivoCorreccion = String(cuerpo?.motivoCorreccion ?? "");
    } catch {
      /* cuerpo vacío */
    }
    if (!motivoCorreccion.trim()) {
      return NextResponse.json({ error: "MOTIVO_CORRECCION_REQUERIDO" }, { status: 400 });
    }

    const resultado = await db.$transaction((tx) =>
      eliminarMovimientoTx(tx, id, {
        motivoCorreccion,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
      }),
    );

    return NextResponse.json({ ok: true, folio: resultado.folio });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
