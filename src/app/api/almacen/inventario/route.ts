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
import { CERO, desdeBD, multiplicar } from "@/lib/numerico";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";

// GET /api/almacen/inventario — Existencias por producto y almacén
// Filtros: almacenId, productoId, q (sku/nombre), conStock (default true)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  const almacenId = searchParams.get("almacenId");
  const productoId = searchParams.get("productoId");
  const q = searchParams.get("q")?.trim();
  const conStock = searchParams.get("conStock") !== "false";

  const where: Record<string, unknown> = {};
  if (almacenId) where.almacenId = almacenId;
  if (productoId) where.productoId = productoId;
  // «conStock» (cantidad > 0) se filtra en la capa de aplicación con
  // comparación Decimal exacta (el SQL no compara texto decimal)
  if (q) {
    where.OR = [
      { producto: { sku: { contains: q } } },
      { producto: { nombre: { contains: q } } },
    ];
  }

  const filas = await db.stock.findMany({
    where,
    include: {
      producto: {
        select: {
          id: true,
          sku: true,
          nombre: true,
          categoria: true,
          unidad: true,
          stockMinimo: true,
          costoUnitario: true,
        },
      },
      almacen: { select: { id: true, codigo: true, nombre: true, tipo: true, activo: true } },
    },
    orderBy: [{ almacenId: "asc" }, { producto: { sku: "asc" } }],
  });

  return NextResponse.json(
    filas
      .filter((f) => !conStock || desdeBD(f.cantidad, "Stock.cantidad").isPositive())
      .map((f) => ({
        id: f.id,
        cantidad: f.cantidad,
        productoId: f.producto.id,
        sku: f.producto.sku,
        productoNombre: f.producto.nombre,
        categoria: f.producto.categoria,
        unidad: f.producto.unidad,
        stockMinimo: f.producto.stockMinimo,
        costoUnitario: f.producto.costoUnitario,
        almacenId: f.almacen.id,
        almacenCodigo: f.almacen.codigo,
        almacenNombre: f.almacen.nombre,
        // Valoración exacta: cantidad × costoUnitario en Decimal
        valor: multiplicar(f.cantidad, f.producto.costoUnitario ?? CERO.toString()).toString(),
      })),
  );
}
