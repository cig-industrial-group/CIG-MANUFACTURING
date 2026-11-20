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
import { aParte } from "@/modulos/catalogo/servicios/nucleo";

const INCLUSION_MODELOS = {
  modelos: {
    orderBy: { modelo: { codigo: "asc" } },
    include: { modelo: { select: { id: true, codigo: true, nombre: true } } },
  },
} as const;

// GET /api/catalogo/partes — Listar números de parte con sus modelos
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "catalogo.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  // Por defecto solo se listan los activos; los inactivos se consultan expresamente
  const incluirInactivos = searchParams.get("incluirInactivos") === "true";

  const partes = await db.numeroParte.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: { numero: "asc" },
    include: INCLUSION_MODELOS,
  });

  return NextResponse.json(partes.map(aParte));
}

// POST /api/catalogo/partes — Crear número de parte con modelos asociados
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "catalogo.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const numero = String(cuerpo.numero ?? "").trim().toUpperCase();
    const nombre = String(cuerpo.nombre ?? "").trim();
    if (!numero || !nombre) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const existe = await db.numeroParte.findUnique({ where: { numero } });
    if (existe) {
      return NextResponse.json({ error: "NUMERO_DUPLICADO" }, { status: 409 });
    }

    // Validar que todos los modelos existan
    const brutos: unknown[] = Array.isArray(cuerpo.modelosIds) ? cuerpo.modelosIds : [];
    const modelosIds = [...new Set(brutos.map((id) => String(id)))];
    if (modelosIds.length > 0) {
      const encontrados = await db.modelo.count({ where: { id: { in: modelosIds } } });
      if (encontrados !== modelosIds.length) {
        return NextResponse.json({ error: "MODELOS_INVALIDOS" }, { status: 400 });
      }
    }

    const parte = await db.numeroParte.create({
      data: {
        numero,
        nombre,
        descripcion: cuerpo.descripcion?.trim() || null,
        modelos: {
          create: modelosIds.map((modeloId) => ({ modeloId })),
        },
      },
      include: INCLUSION_MODELOS,
    });

    return NextResponse.json(aParte(parte), { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
