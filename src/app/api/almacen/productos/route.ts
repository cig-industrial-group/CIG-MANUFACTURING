import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import {
  asegurarUnidadesBase,
  validarEmpaqueProducto,
} from "@/modulos/unidades/servicios/nucleo";

/** ¿La unidad existe en el catálogo? (siembra el catálogo si está vacío) */
async function unidadDelCatalogo(crudo: unknown): Promise<string | null> {
  const codigo = String(crudo ?? "").trim().toUpperCase();
  if (!codigo) return null;
  await asegurarUnidadesBase();
  const unidad = await db.unidadMedida.findUnique({ where: { codigo } });
  return unidad ? unidad.codigo : null;
}

// GET /api/almacen/productos — Listar productos con stock total
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  // Por defecto solo se listan los activos; los inactivos se consultan expresamente
  const incluirInactivos = searchParams.get("incluirInactivos") === "true";

  const productos = await db.producto.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: { sku: "asc" },
  });

  const stocks = await db.stock.groupBy({
    by: ["productoId"],
    _sum: { cantidad: true },
  });
  const stockPorProducto = new Map(stocks.map((s) => [s.productoId, s._sum.cantidad ?? 0]));

  return NextResponse.json(
    productos.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      stockTotal: stockPorProducto.get(p.id) ?? 0,
    })),
  );
}

// POST /api/almacen/productos — Crear producto
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const sku = String(cuerpo.sku ?? "").trim().toUpperCase();
    const nombre = String(cuerpo.nombre ?? "").trim();
    if (!sku || !nombre) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }
    const existe = await db.producto.findUnique({ where: { sku } });
    if (existe) {
      return NextResponse.json({ error: "SKU_DUPLICADO" }, { status: 409 });
    }
    // La unidad base del producto debe existir en el catálogo de unidades
    const unidad = (await unidadDelCatalogo(cuerpo.unidad)) ?? "PZA";

    // Empaque de conteo configurado POR PRODUCTO: cuántas unidades base
    // lleva cada paquete (p. ej. 80101-06129 → 1 PAQ = 10 PZA).
    let empaque: { unidadPaquete: string | null; contenidoPaquete: number | null };
    try {
      empaque = await validarEmpaqueProducto(unidad, cuerpo);
    } catch (e) {
      const codigo = e instanceof Error ? e.message : "ERROR_INTERNO";
      return NextResponse.json({ error: codigo }, { status: 400 });
    }

    const producto = await db.producto.create({
      data: {
        sku,
        nombre,
        descripcion: cuerpo.descripcion?.trim() || null,
        categoria: ["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "MATERIAL", "INSUMO"].includes(cuerpo.categoria)
          ? cuerpo.categoria
          : "MATERIA_PRIMA",
        unidad,
        unidadPaquete: empaque.unidadPaquete,
        contenidoPaquete: empaque.contenidoPaquete,
        stockMinimo: Number.isFinite(Number(cuerpo.stockMinimo)) ? Number(cuerpo.stockMinimo) : 0,
        costoUnitario:
          cuerpo.costoUnitario === null || cuerpo.costoUnitario === "" || cuerpo.costoUnitario === undefined
            ? null
            : Number(cuerpo.costoUnitario) >= 0
              ? Number(cuerpo.costoUnitario)
              : null,
      },
    });
    return NextResponse.json(
      { ...producto, createdAt: producto.createdAt.toISOString(), stockTotal: 0 },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
