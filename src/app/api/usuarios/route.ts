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
  cumplePoliticaPassword,
  generarPasswordAleatoria,
  hashearPassword,
  requerirPermiso,
} from "@/modulos/autenticacion/servicios/auth";

// GET /api/usuarios — Listar usuarios (requiere usuarios.gestionar)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "usuarios.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const usuarios = await db.usuario.findMany({
      include: { rol: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      usuarios: usuarios.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        correo: u.correo,
        activo: u.activo,
        debeCambiarPassword: u.debeCambiarPassword,
        ultimoAcceso: u.ultimoAcceso ? u.ultimoAcceso.toISOString() : null,
        createdAt: u.createdAt.toISOString(),
        rol: {
          id: u.rol.id,
          clave: u.rol.clave,
          nombre: u.rol.nombre,
          nombreEn: u.rol.nombreEn,
          descripcion: u.rol.descripcion,
          permisos: JSON.parse(u.rol.permisos) as string[],
          sistema: u.rol.sistema,
        },
      })),
    });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// POST /api/usuarios — Crear usuario (gestión manual por roles con privilegio)
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "usuarios.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const nombre = String(cuerpo?.nombre ?? "").trim();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    const rolId = String(cuerpo?.rolId ?? "");
    const generar = Boolean(cuerpo?.generarPassword);
    const password = generar ? generarPasswordAleatoria() : String(cuerpo?.password ?? "");
    const debeCambiar = cuerpo?.debeCambiarPassword !== false && generar;

    if (!nombre || !correo || !rolId || !password) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return NextResponse.json({ error: "CORREO_INVALIDO" }, { status: 400 });
    }
    if (!cumplePoliticaPassword(password)) {
      return NextResponse.json({ error: "PASSWORD_DEBIL" }, { status: 400 });
    }

    const rol = await db.rol.findUnique({ where: { id: rolId } });
    if (!rol) {
      return NextResponse.json({ error: "ROL_NO_EXISTE" }, { status: 400 });
    }

    const existente = await db.usuario.findUnique({ where: { correo } });
    if (existente) {
      return NextResponse.json({ error: "CORREO_EN_USO" }, { status: 409 });
    }

    const usuario = await db.usuario.create({
      data: {
        nombre,
        correo,
        passwordHash: await hashearPassword(password),
        rolId,
        activo: true,
        debeCambiarPassword: debeCambiar,
      },
      include: { rol: true },
    });

    return NextResponse.json(
      {
        usuario: aUsuarioSesion(usuario),
        // La contraseña temporal solo se devuelve una vez (auto-generada)
        ...(generar && { passwordTemporal: password }),
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
