import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { DIAS_RESTAURACION, enviarClienteAPapelera } from "@/modulos/papelera/servicios/nucleo";
import { aCliente } from "@/modulos/clientes/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/clientes/[id] — Detalle de un cliente
export async function GET(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "clientes.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { id } = await params;
  const cliente = await db.cliente.findUnique({ where: { id } });
  if (!cliente) {
    return NextResponse.json({ error: "CLIENTE_NO_EXISTE" }, { status: 404 });
  }
  return NextResponse.json(aCliente(cliente));
}

// PATCH /api/clientes/[id] — Actualizar cliente (campos parciales)
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "clientes.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const existente = await db.cliente.findUnique({ where: { id } });
    if (!existente) {
      return NextResponse.json({ error: "CLIENTE_NO_EXISTE" }, { status: 404 });
    }

    const codigo =
      cuerpo.codigo !== undefined ? String(cuerpo.codigo).trim().toUpperCase() : undefined;
    if (codigo && codigo !== existente.codigo) {
      const duplicado = await db.cliente.findUnique({ where: { codigo } });
      if (duplicado) {
        return NextResponse.json({ error: "CLIENTE_CODIGO_DUPLICADO" }, { status: 409 });
      }
    }
    if (codigo === "") {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const cliente = await db.cliente.update({
      where: { id },
      data: {
        ...(codigo !== undefined && { codigo }),
        ...(cuerpo.nombre !== undefined && { nombre: String(cuerpo.nombre).trim() }),
        ...(cuerpo.contacto !== undefined && { contacto: cuerpo.contacto?.trim() || null }),
        ...(cuerpo.correo !== undefined && { correo: cuerpo.correo?.trim() || null }),
        ...(cuerpo.telefono !== undefined && { telefono: cuerpo.telefono?.trim() || null }),
        ...(cuerpo.direccion !== undefined && { direccion: cuerpo.direccion?.trim() || null }),
        ...(cuerpo.notas !== undefined && { notas: cuerpo.notas?.trim() || null }),
        ...(cuerpo.activo !== undefined && { activo: Boolean(cuerpo.activo) }),
      },
    });

    return NextResponse.json(aCliente(cliente));
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/clientes/[id] — Enviar a la papelera (borrado en 2 etapas)
// El cliente sale de la base pero se conserva su registro completo en la
// papelera (restaurable 30 días) y, tras la purga, queda bitácora histórica.
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "clientes.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    await enviarClienteAPapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, restaurableDuranteDias: DIAS_RESTAURACION });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
