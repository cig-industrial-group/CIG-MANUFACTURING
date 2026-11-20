/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

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
import {
  POLITICAS,
  estaBloqueada,
  ipPeticion,
  msRestantes,
  registrarFallo,
  respuestaLimite,
} from "@/modulos/autenticacion/servicios/limites";

// POST /api/auth/registro — Autoregistro de cuenta (solo si está habilitado en Ajustes)
// Por defecto DESHABILITADO en instalaciones nuevas; el administrador lo
// habilita desde Ajustes. Límite: 5 registros por IP cada hora.
export async function POST(request: Request) {
  try {
    const banderas = await obtenerBanderasAuth();
    if (!banderas.registroHabilitado) {
      return NextResponse.json({ error: "REGISTRO_DESHABILITADO" }, { status: 403 });
    }

    const clave = `reg:${ipPeticion(request)}`;
    if (estaBloqueada(clave)) {
      return respuestaLimite(msRestantes(clave));
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
      // Se cuenta como intento para saturar la IP (sondeo de correos).
      registrarFallo(clave, POLITICAS.registro);
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
    registrarFallo(clave, POLITICAS.registro); // cuenta también los exitosos

    const token = await crearTokenSesion(usuario.id);
    return conCookieSesion(
      NextResponse.json({ usuario: aUsuarioSesion(usuario) }, { status: 201 }),
      token,
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
