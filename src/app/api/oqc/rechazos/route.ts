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
import { aRegistroRechazo, registrarRechazoOQC } from "@/modulos/oqc/servicios/nucleo";

// GET /api/oqc/rechazos — Registros de rechazo (los más recientes primero)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "oqc.ver");
  if (guardia instanceof NextResponse) return guardia;

  const registros = await db.registroRechazo.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(registros.map(aRegistroRechazo));
}

// POST /api/oqc/rechazos — Registrar un rechazo de inspección.
// Documental: no altera el stock del almacén.
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const cuerpo = await request.json();
    const registro = await registrarRechazoOQC(
      {
        productoId: String(cuerpo.productoId ?? ""),
        clienteId: cuerpo.clienteId || undefined,
        salidaId: cuerpo.salidaId || undefined,
        // Decimal como texto: la validación exacta la hace el núcleo (fail-closed)
        cantidad: String(cuerpo.cantidad ?? ""),
        motivo: String(cuerpo.motivo ?? ""),
        disposicion: cuerpo.disposicion,
        notas: cuerpo.notas,
        responsable: cuerpo.responsable,
      },
      { id: usuario.id, nombre: usuario.nombre },
    );
    return NextResponse.json(registro, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
