import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PERMISOS } from "@/modulos/autenticacion/permisos";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";

function mapearRol(r: {
  id: string;
  clave: string;
  nombre: string;
  nombreEn: string;
  descripcion: string | null;
  permisos: string;
  sistema: boolean;
  _count?: { usuarios: number };
}) {
  return {
    id: r.id,
    clave: r.clave,
    nombre: r.nombre,
    nombreEn: r.nombreEn,
    descripcion: r.descripcion,
    permisos: JSON.parse(r.permisos) as string[],
    sistema: r.sistema,
    numUsuarios: r._count?.usuarios ?? 0,
  };
}

// GET /api/roles — Listar roles (cualquier usuario autenticado)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request);
  if (guardia instanceof NextResponse) return guardia;

  try {
    const roles = await db.rol.findMany({
      include: { _count: { select: { usuarios: true } } },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ roles: roles.map(mapearRol) });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// POST /api/roles — Crear rol (requiere usuarios.gestionar)
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "usuarios.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const clave = String(cuerpo?.clave ?? "").trim().toUpperCase().replace(/\s+/g, "_");
    const nombre = String(cuerpo?.nombre ?? "").trim();
    const nombreEn = String(cuerpo?.nombreEn ?? "").trim() || nombre;
    const descripcion = cuerpo?.descripcion ? String(cuerpo.descripcion).trim() : null;
    const permisos = Array.isArray(cuerpo?.permisos)
      ? (cuerpo.permisos as string[]).filter((p) => (PERMISOS as readonly string[]).includes(p))
      : [];

    if (!clave || !nombre || permisos.length === 0) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const duplicado = await db.rol.findUnique({ where: { clave } });
    if (duplicado) {
      return NextResponse.json({ error: "ROL_CLAVE_DUPLICADA" }, { status: 409 });
    }

    const rol = await db.rol.create({
      data: {
        clave,
        nombre,
        nombreEn,
        descripcion,
        permisos: JSON.stringify(permisos),
        sistema: false,
      },
      include: { _count: { select: { usuarios: true } } },
    });
    return NextResponse.json({ rol: mapearRol(rol) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
