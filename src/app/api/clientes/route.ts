import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { aCliente } from "@/modulos/clientes/servicios/nucleo";

// GET /api/clientes — Listar clientes (activos; incluirInactivos=true para todos)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "clientes.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  const incluirInactivos = searchParams.get("incluirInactivos") === "true";

  const clientes = await db.cliente.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return NextResponse.json(clientes.map((c) => aCliente(c)));
}

// POST /api/clientes — Crear cliente
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "clientes.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const codigo = String(cuerpo.codigo ?? "").trim().toUpperCase();
    const nombre = String(cuerpo.nombre ?? "").trim();
    if (!codigo || !nombre) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const existe = await db.cliente.findUnique({ where: { codigo } });
    if (existe) {
      return NextResponse.json({ error: "CLIENTE_CODIGO_DUPLICADO" }, { status: 409 });
    }

    const cliente = await db.cliente.create({
      data: {
        codigo,
        nombre,
        contacto: cuerpo.contacto?.trim() || null,
        correo: cuerpo.correo?.trim() || null,
        telefono: cuerpo.telefono?.trim() || null,
        direccion: cuerpo.direccion?.trim() || null,
        notas: cuerpo.notas?.trim() || null,
      },
    });

    return NextResponse.json(aCliente(cliente), { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
