import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  cumplePoliticaPassword,
  hashearPassword,
  requerirPermiso,
  verificarPassword,
} from "@/modulos/autenticacion/servicios/auth";

// POST /api/auth/password — Cambiar la contraseña propia
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request);
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const cuerpo = await request.json();
    const actual = String(cuerpo?.actual ?? "");
    const nueva = String(cuerpo?.nueva ?? "");

    if (!actual || !nueva) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }
    if (!cumplePoliticaPassword(nueva)) {
      return NextResponse.json({ error: "PASSWORD_DEBIL" }, { status: 400 });
    }

    const registro = await db.usuario.findUnique({ where: { id: usuario.id } });
    if (!registro || !(await verificarPassword(actual, registro.passwordHash))) {
      return NextResponse.json({ error: "PASSWORD_INCORRECTA" }, { status: 401 });
    }

    await db.usuario.update({
      where: { id: usuario.id },
      data: {
        passwordHash: await hashearPassword(nueva),
        debeCambiarPassword: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
