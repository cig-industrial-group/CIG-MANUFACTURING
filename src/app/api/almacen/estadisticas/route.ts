import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { productosVivos } from "@/modulos/almacen/servicios/nucleo";

// GET /api/almacen/estadisticas — KPIs y datos del panel general
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "almacen.ver");
  if (guardia instanceof NextResponse) return guardia;

  const [productosActivos, almacenesActivos, stocks, movimientosRecientesRaw] = await Promise.all([
    db.producto.count({ where: { activo: true } }),
    db.almacen.count({ where: { activo: true } }),
    db.stock.findMany({
      where: { cantidad: { gt: 0 } },
      select: {
        cantidad: true,
        almacenId: true,
        producto: {
          select: { costoUnitario: true, stockMinimo: true, sku: true, nombre: true, unidad: true, activo: true },
        },
        almacen: { select: { codigo: true, nombre: true, activo: true } },
      },
    }),
    db.movimiento.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  // ===== Agregados de stock =====
  let unidadesStock = 0;
  let valorInventario = 0;
  const stockPorProducto = new Map<string, { unidades: number; producto: (typeof stocks)[0]["producto"] }>();
  const porAlmacen = new Map<string, { codigo: string; nombre: string; unidades: number; valor: number }>();

  for (const s of stocks) {
    unidadesStock += s.cantidad;
    valorInventario += s.cantidad * (s.producto.costoUnitario ?? 0);

    const agg = stockPorProducto.get(s.producto.sku);
    if (agg) agg.unidades += s.cantidad;
    else stockPorProducto.set(s.producto.sku, { unidades: s.cantidad, producto: s.producto });

    if (s.almacen.activo) {
      const aggA = porAlmacen.get(s.almacenId) ?? {
        codigo: s.almacen.codigo,
        nombre: s.almacen.nombre,
        unidades: 0,
        valor: 0,
      };
      aggA.unidades += s.cantidad;
      aggA.valor += s.cantidad * (s.producto.costoUnitario ?? 0);
      porAlmacen.set(s.almacenId, aggA);
    }
  }

  // ===== Productos con stock bajo o cerca del mínimo =====
  const stockBajo = [...stockPorProducto.entries()]
    .filter(([, v]) => v.producto.activo && v.unidades < v.producto.stockMinimo * 1.1 && v.producto.stockMinimo > 0)
    .map(([sku, v]) => ({
      id: sku,
      sku,
      nombre: v.producto.nombre,
      unidad: v.producto.unidad,
      stockTotal: v.unidades,
      stockMinimo: v.producto.stockMinimo,
    }))
    .sort((a, b) => a.stockTotal / a.stockMinimo - b.stockTotal / b.stockMinimo)
    .slice(0, 8);

  // ===== Serie de actividad últimos 14 días =====
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias: Array<{ fecha: string; entradas: number; salidas: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    dias.push({
      fecha: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      entradas: 0,
      salidas: 0,
    });
  }
  const indiceDia = new Map<string, number>();
  dias.forEach((d, i) => indiceDia.set(d.fecha, i));

  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - 13);
  const movimientosSerie = await db.movimiento.findMany({
    where: { createdAt: { gte: desde } },
    select: { tipo: true, cantidad: true, createdAt: true },
  });

  let movimientos7Dias = 0;
  const hace7 = new Date(hoy);
  hace7.setDate(hace7.getDate() - 6);
  hace7.setHours(0, 0, 0, 0);

  for (const m of movimientosSerie) {
    const fecha = m.createdAt;
    const clave = `${String(fecha.getDate()).padStart(2, "0")}/${String(fecha.getMonth() + 1).padStart(2, "0")}`;
    const idx = indiceDia.get(clave);
    if (idx !== undefined) {
      // Conteo de movimientos (las unidades mezclan kg/pza/m, no son sumables)
      if (
        m.tipo === "ENTRADA" ||
        m.tipo === "RECEPCION" ||
        (m.tipo === "AJUSTE" && m.cantidad > 0)
      ) {
        dias[idx].entradas += 1;
      }
      if (m.tipo === "SALIDA" || (m.tipo === "AJUSTE" && m.cantidad < 0)) {
        dias[idx].salidas += 1;
      }
    }
    if (fecha >= hace7) movimientos7Dias += 1;
  }

  const vivosRecientes = await productosVivos(movimientosRecientesRaw.map((m) => m.productoId));

  const movimientosRecientes = movimientosRecientesRaw.map((m) => ({
    id: m.id,
    folio: m.folio,
    tipo: m.tipo,
    cantidad: m.cantidad,
    cantidadDespues: m.cantidadDespues,
    motivo: m.motivo,
    referencia: m.referencia,
    responsable: m.responsable,
    editado: m.editado,
    createdAt: m.createdAt.toISOString(),
    productoId: m.productoId,
    productoSku: m.productoSku,
    productoNombre: m.productoNombre,
    productoUnidad: m.productoUnidad,
    productoExiste: vivosRecientes.has(m.productoId),
    almacenOrigenId: m.almacenOrigenId,
    almacenOrigenNombre: m.almacenOrigenNombre,
    almacenOrigenCodigo: m.almacenOrigenCodigo,
    almacenDestinoId: m.almacenDestinoId,
    almacenDestinoNombre: m.almacenDestinoNombre,
    almacenDestinoCodigo: m.almacenDestinoCodigo,
  }));

  return NextResponse.json({
    productosActivos,
    almacenesActivos,
    unidadesStock,
    valorInventario,
    movimientos7Dias,
    stockBajo,
    serieActividad: dias,
    distribucionAlmacenes: [...porAlmacen.values()].sort((a, b) => b.valor - a.valor),
    movimientosRecientes,
  });
}
