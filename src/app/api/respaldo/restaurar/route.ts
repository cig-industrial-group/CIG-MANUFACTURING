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
import { restaurarRespaldo } from "@/modulos/respaldo/servicios/nucleo";

// POST /api/respaldo/restaurar — Restauración EN CALIENTE de un respaldo.
// Reemplaza TODOS los datos en una única transacción: si algo falla,
// la base queda intacta (rollback automático). Con éxito, queda una
// ventana de 24 h para revertir desde el snapshot pre-restauración.
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const cuerpo = await request.json().catch(() => ({}));
    const id = typeof cuerpo?.id === "string" ? cuerpo.id : null;
    if (!id) return NextResponse.json({ error: "ID_REQUERIDO" }, { status: 400 });

    const resultado = await restaurarRespaldo(id, usuario.nombre);
    if (resultado.restauracion.estado === "FALLIDA") {
      return NextResponse.json(
        { error: "RESTAURACION_FALLIDA", detalle: resultado.restauracion.error },
        { status: 500 },
      );
    }
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
