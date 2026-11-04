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
import {
  POLITICAS,
  estaBloqueada,
  ipPeticion,
  msRestantes,
  registrarFallo,
  respuestaLimite,
} from "@/modulos/autenticacion/servicios/limites";

// POST /api/auth/recuperacion/confirmar — Confirmar código y establecer nueva contraseña
//
// Medidas aplicadas:
//  · Sin enumeración: correo inexistente → misma respuesta CODIGO_INVALIDO
//    que un código erróneo (el señuelo jamás está en la BD).
//  · Máximo 5 intentos de confirmación fallidos por (correo + IP) en
//    15 minutos; con el 6.º intento se responde 429 (el código, de 6
//    dígitos, no puede agotarse por fuerza bruta).
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

    const clave = `conf:${correo}:${ipPeticion(request)}`;
    if (estaBloqueada(clave)) {
      return respuestaLimite(msRestantes(clave));
    }

    const usuario = await db.usuario.findUnique({ where: { correo } });
    if (!usuario || !usuario.activo) {
      // Sin enumeración: mismo error que un código inválido.
      registrarFallo(clave, POLITICAS.confirmacion);
      return NextResponse.json({ error: "CODIGO_INVALIDO" }, { status: 400 });
    }

    const hash = createHash("sha256").update(codigo).digest("hex");
    const registro = await db.restablecimiento.findFirst({
      where: { usuarioId: usuario.id, codigoHash: hash, usadoEn: null },
      orderBy: { createdAt: "desc" },
    });

    if (!registro) {
      registrarFallo(clave, POLITICAS.confirmacion);
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
