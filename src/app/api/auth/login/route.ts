import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  aUsuarioSesion,
  conCookieSesion,
  crearTokenSesion,
  verificarPassword,
} from "@/modulos/autenticacion/servicios/auth";
import {
  POLITICAS,
  estaBloqueada,
  ipPeticion,
  limpiar,
  msRestantes,
  registrarFallo,
  respuestaLimite,
} from "@/modulos/autenticacion/servicios/limites";

// POST /api/auth/login — Iniciar sesión con correo y contraseña
// Protección anti-fuerza bruta: máximo 5 fallos por (IP + cuenta) y
// 20 por IP en una ventana de 15 minutos; al agotarse se responde 429
// con Retry-After. Un acceso correcto limpia los contadores.
export async function POST(request: Request) {
  try {
    const ip = ipPeticion(request);
    const claveIp = `login:ip:${ip}`;

    if (estaBloqueada(claveIp)) {
      return respuestaLimite(msRestantes(claveIp));
    }

    const cuerpo = await request.json();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    const password = String(cuerpo?.password ?? "");

    if (!correo || !password) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const claveCuenta = `login:cta:${ip}:${correo}`;
    if (estaBloqueada(claveCuenta)) {
      return respuestaLimite(msRestantes(claveCuenta));
    }

    const usuario = await db.usuario.findUnique({
      where: { correo },
      include: { rol: true },
    });

    // Mensaje genérico para no revelar si el correo existe
    if (!usuario || !(await verificarPassword(password, usuario.passwordHash))) {
      registrarFallo(claveCuenta, POLITICAS.login);
      registrarFallo(claveIp, POLITICAS.loginIp);
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

    // Acceso correcto: limpiar contadores de la cuenta y la IP.
    limpiar(claveCuenta);
    limpiar(claveIp);

    const token = await crearTokenSesion(usuario.id);
    return conCookieSesion(
      NextResponse.json({ usuario: aUsuarioSesion(actualizado) }),
      token,
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
