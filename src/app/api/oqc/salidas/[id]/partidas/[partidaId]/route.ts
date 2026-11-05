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
import { corregirPartidaSalidaOQC, eliminarPartidaSalidaOQC } from "@/modulos/oqc/servicios/nucleo";

type Ctx = { params: Promise<{ id: string; partidaId: string }> };

// PATCH /api/oqc/salidas/[id]/partidas/[partidaId] — Corregir una partida
// individual de la salida: revierte el efecto original sobre el stock,
// aplica el corregido y deja bitácora (CorreccionMovimiento). El folio,
// el tipo y el vínculo con la salida permanecen intactos.
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id, partidaId } = await params;
    const cuerpo = await request.json();
    if (!cuerpo.productoId) {
      return NextResponse.json({ error: "PRODUCTO_REQUERIDO" }, { status: 400 });
    }
    if (!cuerpo.motivoCorreccion?.trim()) {
      return NextResponse.json({ error: "MOTIVO_CORRECCION_REQUERIDO" }, { status: 400 });
    }

    const partida = await corregirPartidaSalidaOQC(
      id,
      partidaId,
      {
        productoId: String(cuerpo.productoId),
        almacenOrigenId: cuerpo.almacenOrigenId || undefined,
        // Decimal como texto: la validación exacta la hace el núcleo (fail-closed)
        cantidad: String(cuerpo.cantidad ?? ""),
        motivo: cuerpo.motivo,
        // La remisión (PL) y el responsable no se corrigen por partida:
        // se reflejan desde la cabecera de la salida (editarSalidaOQC).
        motivoCorreccion: String(cuerpo.motivoCorreccion),
      },
      { usuarioId: usuario.id, usuarioNombre: usuario.nombre },
    );
    return NextResponse.json(partida);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/oqc/salidas/[id]/partidas/[partidaId] — Eliminar una partida
// individual: devuelve el material al almacén con bitácora. La salida y
// sus demás partidas permanecen intactas. Requiere motivo de corrección.
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id, partidaId } = await params;
    const cuerpo = await request.json().catch(() => ({}));
    if (!cuerpo.motivoCorreccion?.trim()) {
      return NextResponse.json({ error: "MOTIVO_CORRECCION_REQUERIDO" }, { status: 400 });
    }

    const { folio } = await eliminarPartidaSalidaOQC(id, partidaId, {
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
