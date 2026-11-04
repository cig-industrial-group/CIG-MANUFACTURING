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
import { DIAS_RESTAURACION, enviarParteAPapelera } from "@/modulos/papelera/servicios/nucleo";
import { aParte } from "@/modulos/catalogo/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

const INCLUSION_MODELOS = {
  modelos: {
    orderBy: { modelo: { codigo: "asc" } },
    include: { modelo: { select: { id: true, codigo: true, nombre: true } } },
  },
} as const;

// PATCH /api/catalogo/partes/[id] — Actualizar parte (y sincronizar asociaciones)
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "catalogo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const existente = await db.numeroParte.findUnique({ where: { id } });
    if (!existente) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }

    const numero = cuerpo.numero !== undefined ? String(cuerpo.numero).trim().toUpperCase() : undefined;
    if (numero && numero !== existente.numero) {
      const duplicado = await db.numeroParte.findUnique({ where: { numero } });
      if (duplicado) return NextResponse.json({ error: "NUMERO_DUPLICADO" }, { status: 409 });
    }

    // Sincronización de asociaciones N:M cuando se envía modelosIds
    const sincronizarModelos = cuerpo.modelosIds !== undefined;
    let modelosIds: string[] = [];
    if (sincronizarModelos) {
      const brutos: unknown[] = Array.isArray(cuerpo.modelosIds) ? cuerpo.modelosIds : [];
      modelosIds = [...new Set(brutos.map((id) => String(id)))];
      if (modelosIds.length > 0) {
        const encontrados = await db.modelo.count({ where: { id: { in: modelosIds } } });
        if (encontrados !== modelosIds.length) {
          return NextResponse.json({ error: "MODELOS_INVALIDOS" }, { status: 400 });
        }
      }
    }

    const parte = await db.$transaction(async (tx) => {
      if (sincronizarModelos) {
        await tx.modeloParte.deleteMany({ where: { numeroParteId: id } });
        if (modelosIds.length > 0) {
          await tx.modeloParte.createMany({
            data: modelosIds.map((modeloId) => ({ modeloId, numeroParteId: id })),
          });
        }
      }
      return tx.numeroParte.update({
        where: { id },
        data: {
          ...(numero !== undefined && { numero }),
          ...(cuerpo.nombre !== undefined && { nombre: String(cuerpo.nombre).trim() }),
          ...(cuerpo.descripcion !== undefined && { descripcion: cuerpo.descripcion?.trim() || null }),
          ...(cuerpo.activo !== undefined && { activo: Boolean(cuerpo.activo) }),
        },
        include: INCLUSION_MODELOS,
      });
    });

    return NextResponse.json(aParte(parte));
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/catalogo/partes/[id] — Enviar a la papelera (borrado en 2 etapas)
// La parte sale de la base con sus asociaciones N:M y queda restaurable
// durante 30 días; después puede purgarse de forma definitiva.
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "catalogo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    await enviarParteAPapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, restaurableDuranteDias: DIAS_RESTAURACION });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
