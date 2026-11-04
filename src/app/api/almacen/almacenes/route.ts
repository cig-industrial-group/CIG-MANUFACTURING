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

// GET /api/almacen/almacenes — Listar almacenes con agregados de stock
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  // Por defecto solo se listan los activos; los inactivos se consultan expresamente
  const incluirInactivos = searchParams.get("incluirInactivos") === "true";

  const almacenes = await db.almacen.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: { codigo: "asc" },
  });
  const stocks = await db.stock.findMany({
    select: {
      almacenId: true,
      cantidad: true,
      producto: { select: { costoUnitario: true } },
    },
  });

  const unidadesPorAlmacen = new Map<string, number>();
  const valorPorAlmacen = new Map<string, number>();
  const productosPorAlmacen = new Map<string, number>();
  for (const s of stocks) {
    if (s.cantidad <= 0) continue;
    unidadesPorAlmacen.set(s.almacenId, (unidadesPorAlmacen.get(s.almacenId) ?? 0) + s.cantidad);
    valorPorAlmacen.set(
      s.almacenId,
      (valorPorAlmacen.get(s.almacenId) ?? 0) + s.cantidad * (s.producto.costoUnitario ?? 0),
    );
    productosPorAlmacen.set(s.almacenId, (productosPorAlmacen.get(s.almacenId) ?? 0) + 1);
  }

  return NextResponse.json(
    almacenes.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
      numProductos: productosPorAlmacen.get(a.id) ?? 0,
      totalUnidades: unidadesPorAlmacen.get(a.id) ?? 0,
      valorInventario: valorPorAlmacen.get(a.id) ?? 0,
    })),
  );
}

// POST /api/almacen/almacenes — Crear almacén
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const codigo = String(cuerpo.codigo ?? "").trim().toUpperCase();
    const nombre = String(cuerpo.nombre ?? "").trim();
    if (!codigo || !nombre) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }
    const existe = await db.almacen.findUnique({ where: { codigo } });
    if (existe) {
      return NextResponse.json({ error: "CODIGO_DUPLICADO" }, { status: 409 });
    }
    const almacen = await db.almacen.create({
      data: {
        codigo,
        nombre,
        ubicacion: cuerpo.ubicacion?.trim() || null,
        tipo: ["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "GENERAL"].includes(cuerpo.tipo)
          ? cuerpo.tipo
          : "GENERAL",
        responsable: cuerpo.responsable?.trim() || null,
      },
    });
    return NextResponse.json(
      { ...almacen, createdAt: almacen.createdAt.toISOString() },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
