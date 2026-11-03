import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  aUsuarioSesion,
  conCookieSesion,
  crearTokenSesion,
  verificarPassword,
} from "@/modulos/autenticacion/servicios/auth";

// POST /api/auth/login — Iniciar sesión con correo y contraseña
export async function POST(request: Request) {
  try {
    const cuerpo = await request.json();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    const password = String(cuerpo?.password ?? "");

    if (!correo || !password) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const usuario = await db.usuario.findUnique({
      where: { correo },
      include: { rol: true },
    });

    // Mensaje genérico para no revelar si el correo existe
    if (!usuario || !(await verificarPassword(password, usuario.passwordHash))) {
      return NextResponse.json({ error: "CREDENCIALES_INVALIDAS" }, { status: 401 });
    }
    if (!usuario.activo) {
      return NextResponse.json({ error: "USUARIO_INACTIVO" }, { status: 403 });
    }

    const actualizado = await db.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcceso: new Date() },
      include: { rol: true },
    });

    const token = await crearTokenSesion(usuario.id);
    return conCookieSesion(
      NextResponse.json({ usuario: aUsuarioSesion(actualizado) }),
      token,
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
