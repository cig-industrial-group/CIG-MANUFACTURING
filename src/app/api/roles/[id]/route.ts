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
import { PERMISOS } from "@/modulos/autenticacion/permisos";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/roles/[id] — Actualizar rol (requiere usuarios.gestionar)
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "usuarios.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();

    const rol = await db.rol.findUnique({
      where: { id },
      include: { _count: { select: { usuarios: true } } },
    });
    if (!rol) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }

    // El rol ADMIN no puede perder permisos (evita bloquear el sistema)
    if (rol.clave === "ADMIN" && Array.isArray(cuerpo?.permisos)) {
      return NextResponse.json({ error: "ROL_NO_MODIFICABLE" }, { status: 400 });
    }

    const permisosActuales = JSON.parse(rol.permisos) as string[];
    const nombre = cuerpo?.nombre !== undefined ? String(cuerpo.nombre).trim() : rol.nombre;
    const nombreEn =
      cuerpo?.nombreEn !== undefined ? String(cuerpo.nombreEn).trim() : rol.nombreEn;
    const descripcion =
      cuerpo?.descripcion !== undefined
        ? cuerpo.descripcion
          ? String(cuerpo.descripcion).trim()
          : null
        : rol.descripcion;
    const permisos = Array.isArray(cuerpo?.permisos)
      ? (cuerpo.permisos as string[]).filter((p) => (PERMISOS as readonly string[]).includes(p))
      : permisosActuales;

    if (!nombre || permisos.length === 0) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const actualizado = await db.rol.update({
      where: { id },
      data: { nombre, nombreEn, descripcion, permisos: JSON.stringify(permisos) },
      include: { _count: { select: { usuarios: true } } },
    });

    return NextResponse.json({
      rol: {
        ...actualizado,
        permisos: JSON.parse(actualizado.permisos),
        numUsuarios: actualizado._count.usuarios,
      },
    });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/roles/[id] — Eliminar rol (no sistema y sin usuarios asignados)
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "usuarios.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const rol = await db.rol.findUnique({
      where: { id },
      include: { _count: { select: { usuarios: true } } },
    });
    if (!rol) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }
    if (rol.sistema) {
      return NextResponse.json({ error: "ROL_SISTEMA" }, { status: 400 });
    }
    if (rol._count.usuarios > 0) {
      return NextResponse.json({ error: "ROL_EN_USO" }, { status: 400 });
    }

    await db.rol.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
