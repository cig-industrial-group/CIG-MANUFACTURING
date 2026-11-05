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
import { aDecimal, sumar } from "@/lib/numerico";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { DIAS_RESTAURACION, enviarProductoAPapelera } from "@/modulos/papelera/servicios/nucleo";
import {
  asegurarUnidadesBase,
  sanearEmpaqueProducto,
  validarEmpaqueProducto,
} from "@/modulos/unidades/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

/** ¿La unidad existe en el catálogo? (siembra el catálogo si está vacío) */
async function unidadDelCatalogo(crudo: unknown): Promise<string | undefined> {
  const codigo = String(crudo ?? "").trim().toUpperCase();
  if (!codigo) return undefined;
  await asegurarUnidadesBase();
  const unidad = await db.unidadMedida.findUnique({ where: { codigo } });
  return unidad ? unidad.codigo : undefined;
}

// PATCH /api/almacen/productos/[id] — Actualizar producto
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "almacen.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const existente = await db.producto.findUnique({ where: { id } });
    if (!existente) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }

    const sku = cuerpo.sku !== undefined ? String(cuerpo.sku).trim().toUpperCase() : undefined;
    if (sku && sku !== existente.sku) {
      const duplicado = await db.producto.findUnique({ where: { sku } });
      if (duplicado) return NextResponse.json({ error: "SKU_DUPLICADO" }, { status: 409 });
    }

    // La unidad base del producto debe existir en el catálogo de unidades
    let unidad: string | undefined;
    if (cuerpo.unidad !== undefined) {
      unidad = await unidadDelCatalogo(cuerpo.unidad);
      if (!unidad) {
        return NextResponse.json({ error: "UNIDAD_NO_EXISTE" }, { status: 400 });
      }
    }
    const unidadFinal = unidad ?? existente.unidad;

    // Empaque de conteo (configurado POR PRODUCTO). Si viene en el cuerpo
    // se valida contra la unidad final; si la unidad base cambia y el
    // empaque vigente deja de ser compatible, se retira automáticamente
    // (p. ej. pasar de PZA a KG invalida un empaque PAQ→PZA).
    let empaque: { unidadPaquete: string | null; contenidoPaquete: string | null } | undefined;
    if (cuerpo.unidadPaquete !== undefined || cuerpo.contenidoPaquete !== undefined) {
      try {
        empaque = await validarEmpaqueProducto(unidadFinal, {
          unidadPaquete:
            cuerpo.unidadPaquete !== undefined ? cuerpo.unidadPaquete : existente.unidadPaquete,
          contenidoPaquete:
            cuerpo.contenidoPaquete !== undefined
              ? cuerpo.contenidoPaquete
              : existente.contenidoPaquete,
        });
      } catch (e) {
        const codigo = e instanceof ErrorNegocio ? e.message : "ERROR_INTERNO";
        return NextResponse.json({ error: codigo }, { status: 400 });
      }
    } else if (unidad !== undefined && unidad !== existente.unidad) {
      empaque = await sanearEmpaqueProducto(unidad, {
        unidadPaquete: existente.unidadPaquete,
        contenidoPaquete: existente.contenidoPaquete,
      });
    }

    // Validación decimal exacta (fail-closed): valores inválidos se rechazan
    const stockMinimoNuevo =
      cuerpo.stockMinimo !== undefined ? aDecimal(cuerpo.stockMinimo) : undefined;
    const costoUnitarioNuevo =
      cuerpo.costoUnitario === null || cuerpo.costoUnitario === ""
        ? null
        : cuerpo.costoUnitario !== undefined
          ? aDecimal(cuerpo.costoUnitario)
          : undefined;

    const producto = await db.producto.update({
      where: { id },
      data: {
        ...(sku !== undefined && { sku }),
        ...(cuerpo.nombre !== undefined && { nombre: String(cuerpo.nombre).trim() }),
        ...(cuerpo.descripcion !== undefined && { descripcion: cuerpo.descripcion?.trim() || null }),
        ...(cuerpo.categoria !== undefined &&
          ["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "MATERIAL", "INSUMO"].includes(cuerpo.categoria) && {
            categoria: cuerpo.categoria,
          }),
        ...(unidad !== undefined && { unidad }),
        ...(empaque !== undefined && {
          unidadPaquete: empaque.unidadPaquete,
          contenidoPaquete: empaque.contenidoPaquete,
        }),
        ...(stockMinimoNuevo !== undefined &&
          stockMinimoNuevo !== null && { stockMinimo: stockMinimoNuevo.toString() }),
        ...(costoUnitarioNuevo !== undefined && {
          costoUnitario:
            costoUnitarioNuevo && !costoUnitarioNuevo.isNeg()
              ? costoUnitarioNuevo.toString()
              : null,
        }),
        ...(cuerpo.activo !== undefined && { activo: Boolean(cuerpo.activo) }),
      },
    });

    // Suma Decimal exacta en la capa de aplicación (agregado _sum no
    // aplica a texto decimal; prohibido float en agregados de inventario)
    const stocksDelProducto = await db.stock.findMany({
      where: { productoId: id },
      select: { cantidad: true },
    });
    const stockTotal = sumar(stocksDelProducto.map((s) => s.cantidad)).toString();

    return NextResponse.json({
      ...producto,
      createdAt: producto.createdAt.toISOString(),
      stockTotal,
    });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/almacen/productos/[id] — Enviar a la papelera (borrado en 2 etapas)
// El registro sale de la base con su stock y queda en la papelera con un
// snapshot completo: restaurable durante 30 días o purgable de forma
// definitiva. Su historial de movimientos sobrevive intacto (ledger).
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "almacen.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    await enviarProductoAPapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, restaurableDuranteDias: DIAS_RESTAURACION });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
