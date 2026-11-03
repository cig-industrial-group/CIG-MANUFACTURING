import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  aUsuarioSesion,
  conCookieSesion,
  crearTokenSesion,
  cumplePoliticaPassword,
  hashearPassword,
} from "@/modulos/autenticacion/servicios/auth";
import { obtenerBanderasAuth, obtenerRolRegistro } from "@/modulos/autenticacion/servicios/configuracion";

// POST /api/auth/registro — Autoregistro de cuenta (solo si está habilitado en Ajustes)
export async function POST(request: Request) {
  try {
    const banderas = await obtenerBanderasAuth();
    if (!banderas.registroHabilitado) {
      return NextResponse.json({ error: "REGISTRO_DESHABILITADO" }, { status: 403 });
    }

    const cuerpo = await request.json();
    const nombre = String(cuerpo?.nombre ?? "").trim();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    const password = String(cuerpo?.password ?? "");

    if (!nombre || !correo || !password) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return NextResponse.json({ error: "CORREO_INVALIDO" }, { status: 400 });
    }
    if (!cumplePoliticaPassword(password)) {
      return NextResponse.json({ error: "PASSWORD_DEBIL" }, { status: 400 });
    }

    const existente = await db.usuario.findUnique({ where: { correo } });
    if (existente) {
      return NextResponse.json({ error: "CORREO_EN_USO" }, { status: 409 });
    }

    const rol = await obtenerRolRegistro();
    const usuario = await db.usuario.create({
      data: {
        nombre,
        correo,
        passwordHash: await hashearPassword(password),
        rolId: rol.id,
        activo: true,
      },
      include: { rol: true },
    });

    const token = await crearTokenSesion(usuario.id);
    return conCookieSesion(
      NextResponse.json({ usuario: aUsuarioSesion(usuario) }, { status: 201 }),
      token,
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
