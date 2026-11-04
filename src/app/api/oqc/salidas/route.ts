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
import { liberarSalidaOQC, listarSalidasOQC } from "@/modulos/oqc/servicios/nucleo";

// GET /api/oqc/salidas — Salidas emitidas con sus partidas agrupadas
// ?incluirEliminadas=true muestra también las eliminadas (bitácora)
// ?clienteId=... filtra por cliente
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "oqc.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  const salidas = await listarSalidasOQC({
    clienteId: searchParams.get("clienteId") ?? undefined,
    incluirEliminadas: searchParams.get("incluirEliminadas") === "true",
  });
  return NextResponse.json(salidas);
}

// POST /api/oqc/salidas — Liberar material de salida a un cliente
// Crea UNA salida (folio OQC-...) que agrupa todas las partidas.
// Toda la liberación es transaccional: si una partida excede el stock,
// nada cambia.
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "oqc.liberar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const cuerpo = await request.json();
    const clienteId = String(cuerpo.clienteId ?? "");
    const almacenOrigenId = String(cuerpo.almacenOrigenId ?? "");
    if (!clienteId || !almacenOrigenId) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const brutas: unknown[] = Array.isArray(cuerpo.lineas) ? cuerpo.lineas : [];
    const lineas = brutas
      .map((l) => {
        const linea = l as {
          productoId?: unknown;
          cantidad?: unknown;
          conteo?: { unidad?: unknown; paquetes?: unknown; sueltas?: unknown };
        };
        // Conteo en paquetes (opcional por línea)
        const unidadConteo = linea.conteo?.unidad ? String(linea.conteo.unidad) : null;
        return {
          productoId: String(linea.productoId ?? ""),
          cantidad: Number(linea.cantidad),
          ...(unidadConteo && {
            conteo: {
              unidad: unidadConteo,
              paquetes: Number(linea.conteo?.paquetes ?? 0),
              sueltas: Number(linea.conteo?.sueltas ?? 0),
            },
          }),
        };
      })
      .filter((l) => l.productoId);
    if (lineas.length === 0) {
      return NextResponse.json({ error: "SALIDA_SIN_LINEAS" }, { status: 400 });
    }

    const salida = await liberarSalidaOQC({
      clienteId,
      almacenOrigenId,
      lineas,
      referencia: cuerpo.referencia,
      responsable: cuerpo.responsable,
      notas: cuerpo.notas,
      usuario: { id: usuario.id, nombre: usuario.nombre },
    });
    return NextResponse.json({ salida }, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
