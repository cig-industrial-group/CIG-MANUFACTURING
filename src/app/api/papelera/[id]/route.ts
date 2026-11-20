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
import { purgarDePapelera } from "@/modulos/papelera/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// DELETE /api/papelera/[id] — Purga manual definitiva
// Descarta los datos de forma irrecuperable; la fila queda como bitácora.
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "papelera.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    const resultado = await purgarDePapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
