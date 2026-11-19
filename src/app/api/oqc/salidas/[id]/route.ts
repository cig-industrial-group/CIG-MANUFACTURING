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
import { detalleSalidaOQC, editarSalidaOQC, eliminarSalidaOQC } from "@/modulos/oqc/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/oqc/salidas/[id] — Detalle con partidas y bitácora de correcciones
export async function GET(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "oqc.ver");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const detalle = await detalleSalidaOQC(id);
    return NextResponse.json(detalle);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// PATCH /api/oqc/salidas/[id] — Editar la cabecera de una salida EMITIDA
// (referencia, responsable, notas) con motivo de corrección obligatorio.
// La remisión y el responsable se PROPAGAN a todas las partidas vivas para
// que el historial de movimientos refleje siempre la cabecera vigente, y la
// edición queda en la bitácora inmutable (auditoría de fábrica). El cliente
// y el almacén de origen no se alteran: para eso se elimina la salida
// completa y se registra una nueva.
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
    const salida = await editarSalidaOQC(
      id,
      {
        referencia: cuerpo.referencia,
        responsable: cuerpo.responsable,
        notas: cuerpo.notas,
        motivoCorreccion: String(cuerpo.motivoCorreccion),
      },
      { usuarioId: usuario.id, usuarioNombre: usuario.nombre },
    );
    return NextResponse.json(salida);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/oqc/salidas/[id] — Eliminar la salida COMPLETA
// Devuelve todo el material al almacén (reversión por partida con
// bitácora) y marca la salida como ELIMINADA. La fila sobrevive como
// bitácora histórica. Requiere motivo de corrección.
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
    const salida = await eliminarSalidaOQC(id, {
      motivoCorreccion: String(cuerpo.motivoCorreccion),
      usuarioId: usuario.id,
      usuarioNombre: usuario.nombre,
    });
    return NextResponse.json({ salida });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
