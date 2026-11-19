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
import { guardarAjustes, obtenerAjustes } from "@/modulos/autenticacion/servicios/configuracion";

// GET /api/ajustes — Ajustes del sistema + roles disponibles (requiere ajustes.gestionar)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "ajustes.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const [ajustes, roles] = await Promise.all([
      obtenerAjustes(),
      db.rol.findMany({
        select: { id: true, clave: true, nombre: true, nombreEn: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return NextResponse.json({ ajustes, roles });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// PATCH /api/ajustes — Actualizar ajustes del sistema (requiere ajustes.gestionar)
export async function PATCH(request: Request) {
  const guardia = await requerirPermiso(request, "ajustes.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const datos: Partial<{
      registroHabilitado: boolean;
      recuperacionHabilitada: boolean;
      rolRegistro: string;
    }> = {};

    if (cuerpo?.registroHabilitado !== undefined) {
      datos.registroHabilitado = Boolean(cuerpo.registroHabilitado);
    }
    if (cuerpo?.recuperacionHabilitada !== undefined) {
      datos.recuperacionHabilitada = Boolean(cuerpo.recuperacionHabilitada);
    }
    if (cuerpo?.rolRegistro !== undefined) {
      datos.rolRegistro = String(cuerpo.rolRegistro);
    }

    const ajustes = await guardarAjustes(datos);
    return NextResponse.json({ ajustes });
  } catch (e) {
    if (e instanceof Error && e.message === "ROL_NO_EXISTE") {
      return NextResponse.json({ error: "ROL_NO_EXISTE" }, { status: 400 });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
