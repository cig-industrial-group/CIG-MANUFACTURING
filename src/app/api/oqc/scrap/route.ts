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
import { aRegistroScrap, registrarScrapOQC } from "@/modulos/oqc/servicios/nucleo";

// GET /api/oqc/scrap — Registros de scrap (los más recientes primero)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "oqc.ver");
  if (guardia instanceof NextResponse) return guardia;

  const registros = await db.registroScrap.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(registros.map(aRegistroScrap));
}

// POST /api/oqc/scrap — Registrar scrap: descuenta stock del almacén
// mediante un movimiento SCRAP (mismo folio) de forma transaccional.
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "oqc.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const cuerpo = await request.json();
    const registro = await registrarScrapOQC(
      {
        productoId: String(cuerpo.productoId ?? ""),
        almacenId: String(cuerpo.almacenId ?? ""),
        cantidad: Number(cuerpo.cantidad),
        motivo: String(cuerpo.motivo ?? ""),
        notas: cuerpo.notas,
        responsable: cuerpo.responsable,
        // Conteo en paquetes (opcional): el servidor calcula el total
        ...(cuerpo.conteo?.unidad && {
          conteo: {
            unidad: String(cuerpo.conteo.unidad),
            paquetes: Number(cuerpo.conteo.paquetes ?? 0),
            sueltas: Number(cuerpo.conteo.sueltas ?? 0),
          },
        }),
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
