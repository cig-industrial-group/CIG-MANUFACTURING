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
import { aModelo } from "@/modulos/catalogo/servicios/nucleo";

const INCLUSION_PARTES = {
  partes: {
    orderBy: { numeroParte: { numero: "asc" } },
    include: { numeroParte: { select: { id: true, numero: true, nombre: true } } },
  },
} as const;

// GET /api/catalogo/modelos — Listar modelos con sus números de parte
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "catalogo.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  // Por defecto solo se listan los activos; los inactivos se consultan expresamente
  const incluirInactivos = searchParams.get("incluirInactivos") === "true";

  const modelos = await db.modelo.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: { codigo: "asc" },
    include: INCLUSION_PARTES,
  });

  return NextResponse.json(modelos.map(aModelo));
}

// POST /api/catalogo/modelos — Crear modelo con partes asociadas
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "catalogo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const codigo = String(cuerpo.codigo ?? "").trim().toUpperCase();
    const nombre = String(cuerpo.nombre ?? "").trim();
    if (!codigo || !nombre) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const existe = await db.modelo.findUnique({ where: { codigo } });
    if (existe) {
      return NextResponse.json({ error: "CODIGO_DUPLICADO" }, { status: 409 });
    }

    // Validar que todos los números de parte existan
    const brutos: unknown[] = Array.isArray(cuerpo.partesIds) ? cuerpo.partesIds : [];
    const partesIds = [...new Set(brutos.map((id) => String(id)))];
    if (partesIds.length > 0) {
      const encontradas = await db.numeroParte.count({ where: { id: { in: partesIds } } });
      if (encontradas !== partesIds.length) {
        return NextResponse.json({ error: "PARTES_INVALIDAS" }, { status: 400 });
      }
    }

    const modelo = await db.modelo.create({
      data: {
        codigo,
        nombre,
        descripcion: cuerpo.descripcion?.trim() || null,
        partes: {
          create: partesIds.map((numeroParteId) => ({ numeroParteId })),
        },
      },
      include: INCLUSION_PARTES,
    });

    return NextResponse.json(aModelo(modelo), { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
