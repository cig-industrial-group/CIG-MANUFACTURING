import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  conCookieSesion,
  crearTokenSesion,
  cumplePoliticaPassword,
  hashearPassword,
} from "@/modulos/autenticacion/servicios/auth";
import { obtenerBanderasAuth } from "@/modulos/autenticacion/servicios/configuracion";

// POST /api/auth/recuperacion/confirmar — Confirmar código y establecer nueva contraseña
export async function POST(request: Request) {
  try {
    const banderas = await obtenerBanderasAuth();
    if (!banderas.recuperacionHabilitada) {
      return NextResponse.json({ error: "RECUPERACION_DESHABILITADA" }, { status: 403 });
    }

    const cuerpo = await request.json();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    const codigo = String(cuerpo?.codigo ?? "").trim();
    const password = String(cuerpo?.password ?? "");

    if (!correo || !codigo || !password) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }
    if (!cumplePoliticaPassword(password)) {
      return NextResponse.json({ error: "PASSWORD_DEBIL" }, { status: 400 });
    }

    const usuario = await db.usuario.findUnique({ where: { correo } });
    if (!usuario || !usuario.activo) {
      return NextResponse.json({ error: "CORREO_NO_EXISTE" }, { status: 404 });
    }

    const hash = createHash("sha256").update(codigo).digest("hex");
    const registro = await db.restablecimiento.findFirst({
      where: { usuarioId: usuario.id, codigoHash: hash, usadoEn: null },
      orderBy: { createdAt: "desc" },
    });

    if (!registro) {
      return NextResponse.json({ error: "CODIGO_INVALIDO" }, { status: 400 });
    }
    if (registro.expiraEn < new Date()) {
      return NextResponse.json({ error: "CODIGO_EXPIRADO" }, { status: 400 });
    }

    await db.$transaction([
      db.restablecimiento.update({
        where: { id: registro.id },
        data: { usadoEn: new Date() },
      }),
      db.usuario.update({
        where: { id: usuario.id },
        data: {
          passwordHash: await hashearPassword(password),
          debeCambiarPassword: false,
        },
      }),
    ]);

    // Iniciar sesión automáticamente tras restablecer
    const token = await crearTokenSesion(usuario.id);
    return conCookieSesion(NextResponse.json({ ok: true }), token);
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
