import { NextResponse } from "next/server";
import { db } from "@/lib/db";
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
  if (conStock) where.cantidad = { gt: 0 };
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
    filas.map((f) => ({
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
      valor: f.cantidad * (f.producto.costoUnitario ?? 0),
    })),
  );
}
