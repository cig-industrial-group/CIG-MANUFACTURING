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
import { DIAS_RESTAURACION, enviarModeloAPapelera } from "@/modulos/papelera/servicios/nucleo";
import { aModelo } from "@/modulos/catalogo/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

const INCLUSION_PARTES = {
  partes: {
    orderBy: { numeroParte: { numero: "asc" } },
    include: { numeroParte: { select: { id: true, numero: true, nombre: true } } },
  },
} as const;

// PATCH /api/catalogo/modelos/[id] — Actualizar modelo (y sincronizar asociaciones)
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "catalogo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const existente = await db.modelo.findUnique({ where: { id } });
    if (!existente) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }

    const codigo = cuerpo.codigo !== undefined ? String(cuerpo.codigo).trim().toUpperCase() : undefined;
    if (codigo && codigo !== existente.codigo) {
      const duplicado = await db.modelo.findUnique({ where: { codigo } });
      if (duplicado) return NextResponse.json({ error: "CODIGO_DUPLICADO" }, { status: 409 });
    }

    // Sincronización de asociaciones N:M cuando se envía partesIds
    const sincronizarPartes = cuerpo.partesIds !== undefined;
    let partesIds: string[] = [];
    if (sincronizarPartes) {
      const brutos: unknown[] = Array.isArray(cuerpo.partesIds) ? cuerpo.partesIds : [];
      partesIds = [...new Set(brutos.map((id) => String(id)))];
      if (partesIds.length > 0) {
        const encontradas = await db.numeroParte.count({ where: { id: { in: partesIds } } });
        if (encontradas !== partesIds.length) {
          return NextResponse.json({ error: "PARTES_INVALIDAS" }, { status: 400 });
        }
      }
    }

    const modelo = await db.$transaction(async (tx) => {
      if (sincronizarPartes) {
        await tx.modeloParte.deleteMany({ where: { modeloId: id } });
        if (partesIds.length > 0) {
          await tx.modeloParte.createMany({
            data: partesIds.map((numeroParteId) => ({ modeloId: id, numeroParteId })),
          });
        }
      }
      return tx.modelo.update({
        where: { id },
        data: {
          ...(codigo !== undefined && { codigo }),
          ...(cuerpo.nombre !== undefined && { nombre: String(cuerpo.nombre).trim() }),
          ...(cuerpo.descripcion !== undefined && { descripcion: cuerpo.descripcion?.trim() || null }),
          ...(cuerpo.activo !== undefined && { activo: Boolean(cuerpo.activo) }),
        },
        include: INCLUSION_PARTES,
      });
    });

    return NextResponse.json(aModelo(modelo));
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/catalogo/modelos/[id] — Enviar a la papelera (borrado en 2 etapas)
// El modelo sale de la base con sus asociaciones N:M y queda restaurable
// durante 30 días; después puede purgarse de forma definitiva.
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "catalogo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    await enviarModeloAPapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, restaurableDuranteDias: DIAS_RESTAURACION });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
