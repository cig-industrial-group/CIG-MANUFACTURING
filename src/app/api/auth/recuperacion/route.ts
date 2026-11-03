import { createHash, randomInt } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { obtenerBanderasAuth } from "@/modulos/autenticacion/servicios/configuracion";

const MINUTOS_VALIDEZ = 15;

function hashCodigo(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

// POST /api/auth/recuperacion — Solicitar código de recuperación
// Solo disponible si la recuperación automática está habilitada en Ajustes.
// Entorno sin servicio de correo: el código se devuelve en la respuesta
// (simulación de envío por email). El hash se guarda en la base de datos.
export async function POST(request: Request) {
  try {
    const banderas = await obtenerBanderasAuth();
    if (!banderas.recuperacionHabilitada) {
      return NextResponse.json({ error: "RECUPERACION_DESHABILITADA" }, { status: 403 });
    }

    const cuerpo = await request.json();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    if (!correo) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const usuario = await db.usuario.findUnique({ where: { correo } });
    if (!usuario || !usuario.activo) {
      return NextResponse.json({ error: "CORREO_NO_EXISTE" }, { status: 404 });
    }

    // Invalidar códigos previos no usados
    await db.restablecimiento.updateMany({
      where: { usuarioId: usuario.id, usadoEn: null },
      data: { usadoEn: new Date() },
    });

    const codigo = String(randomInt(100000, 999999));
    await db.restablecimiento.create({
      data: {
        usuarioId: usuario.id,
        codigoHash: hashCodigo(codigo),
        expiraEn: new Date(Date.now() + MINUTOS_VALIDEZ * 60 * 1000),
      },
    });

    return NextResponse.json({
      // Simulación de envío por correo (el sistema no cuenta con SMTP):
      codigo,
      expiraMinutos: MINUTOS_VALIDEZ,
    });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
