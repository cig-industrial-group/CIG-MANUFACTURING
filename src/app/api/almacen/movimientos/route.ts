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
import {
  ErrorNegocio,
  mapearMovimiento,
  productosVivos,
  registrarMovimientoTx,
} from "@/modulos/almacen/servicios/nucleo";
import type { TipoMovimiento } from "@/modulos/almacen/tipos";

const TIPOS_VALIDOS: TipoMovimiento[] = ["ENTRADA", "RECEPCION", "SALIDA", "TRASLADO", "AJUSTE"];

// GET /api/almacen/movimientos — Historial con filtros y paginación
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo");
  const almacenId = searchParams.get("almacenId");
  const productoId = searchParams.get("productoId");
  const clienteId = searchParams.get("clienteId");
  const q = searchParams.get("q")?.trim();
  const desde = searchParams.get("desde");
  const hasta = searchParams.get("hasta");
  const pagina = Math.max(1, Number(searchParams.get("pagina") ?? 1) || 1);
  const porPagina = Math.min(100, Math.max(5, Number(searchParams.get("porPagina") ?? 20) || 20));

  const filtros: Record<string, unknown>[] = [];
  if (tipo && TIPOS_VALIDOS.includes(tipo as TipoMovimiento)) {
    filtros.push({ tipo });
  }
  if (almacenId) {
    filtros.push({
      OR: [{ almacenOrigenId: almacenId }, { almacenDestinoId: almacenId }],
    });
  }
  if (productoId) {
    filtros.push({ productoId });
  }
  if (clienteId) {
    filtros.push({ clienteId });
  }
  if (q) {
    filtros.push({
      OR: [
        { folio: { contains: q } },
        { referencia: { contains: q } },
        { responsable: { contains: q } },
        { motivo: { contains: q } },
        { productoSku: { contains: q } },
        { productoNombre: { contains: q } },
        { clienteCodigo: { contains: q } },
        { clienteNombre: { contains: q } },
      ],
    });
  }
  if (desde || hasta) {
    const rango: Record<string, Date> = {};
    if (desde) rango.gte = new Date(`${desde}T00:00:00`);
    if (hasta) rango.lte = new Date(`${hasta}T23:59:59.999`);
    filtros.push({ createdAt: rango });
  }

  const where = filtros.length ? { AND: filtros } : {};

  const [total, movimientos] = await Promise.all([
    db.movimiento.count({ where }),
    db.movimiento.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pagina - 1) * porPagina,
      take: porPagina,
    }),
  ]);

  // Los movimientos son autodescriptivos (snapshots); el distintivo de
  // «eliminado» se calcula contra los productos y clientes vivos.
  const vivos = await productosVivos(movimientos.map((m) => m.productoId));
  const idsClientes = [...new Set(movimientos.map((m) => m.clienteId).filter((c): c is string => !!c))];
  const clientesVivos = idsClientes.length
    ? new Set((await db.cliente.findMany({ where: { id: { in: idsClientes } }, select: { id: true } })).map((c) => c.id))
    : new Set<string>();

  return NextResponse.json({
    movimientos: movimientos.map((m) =>
      mapearMovimiento(
        m,
        vivos.has(m.productoId),
        m.clienteId ? clientesVivos.has(m.clienteId) : true,
      ),
    ),
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / porPagina)),
  });
}

// POST /api/almacen/movimientos — Registrar movimiento (transaccional)
export async function POST(request: Request) {
  try {
    const cuerpo = await request.json();
    const tipo = cuerpo.tipo as TipoMovimiento;
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json({ error: "TIPO_INVALIDO" }, { status: 400 });
    }
    if (!cuerpo.productoId) {
      return NextResponse.json({ error: "PRODUCTO_REQUERIDO" }, { status: 400 });
    }

    // Los ajustes de inventario requieren un permiso distinto al resto de movimientos
    const permiso = tipo === "AJUSTE" ? "inventario.ajustar" : "movimientos.crear";
    const guardia = await requerirPermiso(request, permiso);
    if (guardia instanceof NextResponse) return guardia;
    const { usuario } = guardia;

    const resultado = await db.$transaction((tx) =>
      registrarMovimientoTx(tx, {
        tipo,
        productoId: String(cuerpo.productoId),
        almacenOrigenId: cuerpo.almacenOrigenId || undefined,
        almacenDestinoId: cuerpo.almacenDestinoId || undefined,
        cantidad: Number(cuerpo.cantidad),
        motivo: cuerpo.motivo,
        referencia: cuerpo.referencia,
        // Si no se captura responsable, se asigna el usuario de la sesión
        responsable: cuerpo.responsable?.trim() || usuario.nombre,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        // Conteo en paquetes (opcional): { unidad, paquetes, sueltas }.
        // El servidor calcula la cantidad en unidad base de forma autoritativa.
        ...(cuerpo.conteo?.unidad && {
          conteo: {
            unidad: String(cuerpo.conteo.unidad),
            paquetes: Number(cuerpo.conteo.paquetes ?? 0),
            sueltas: Number(cuerpo.conteo.sueltas ?? 0),
          },
        }),
      }),
    );

    return NextResponse.json(mapearMovimiento(resultado), { status: 201 });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
