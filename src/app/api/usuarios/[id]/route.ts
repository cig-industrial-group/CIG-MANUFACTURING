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
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { DIAS_RESTAURACION, enviarUsuarioAPapelera } from "@/modulos/papelera/servicios/nucleo";
import {
  aUsuarioSesion,
  cumplePoliticaPassword,
  generarPasswordAleatoria,
  hashearPassword,
  requerirPermiso,
} from "@/modulos/autenticacion/servicios/auth";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/usuarios/[id] — Actualizar usuario, restablecer contraseña o alternar estado
// Acciones: "actualizar" | "restablecerPassword" | "alternarActivo"
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "usuarios.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario: usuarioActual } = guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const accion = String(cuerpo?.accion ?? "actualizar");

    const objetivo = await db.usuario.findUnique({ where: { id }, include: { rol: true } });
    if (!objetivo) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }

    // ===== Actualizar datos =====
    if (accion === "actualizar") {
      const nombre = String(cuerpo?.nombre ?? "").trim();
      const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
      const rolId = String(cuerpo?.rolId ?? "");
      if (!nombre || !correo || !rolId) {
        return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        return NextResponse.json({ error: "CORREO_INVALIDO" }, { status: 400 });
      }
      if (correo !== objetivo.correo) {
        const duplicado = await db.usuario.findUnique({ where: { correo } });
        if (duplicado) {
          return NextResponse.json({ error: "CORREO_EN_USO" }, { status: 409 });
        }
      }
      const rol = await db.rol.findUnique({ where: { id: rolId } });
      if (!rol) {
        return NextResponse.json({ error: "ROL_NO_EXISTE" }, { status: 400 });
      }

      const actualizado = await db.usuario.update({
        where: { id },
        data: { nombre, correo, rolId },
        include: { rol: true },
      });
      return NextResponse.json({ usuario: aUsuarioSesion(actualizado) });
    }

    // ===== Restablecer contraseña (gestión manual) =====
    if (accion === "restablecerPassword") {
      const generar = Boolean(cuerpo?.generarPassword);
      const password = generar ? generarPasswordAleatoria() : String(cuerpo?.password ?? "");
      const debeCambiar = cuerpo?.debeCambiarPassword !== false;

      if (!password || !cumplePoliticaPassword(password)) {
        return NextResponse.json({ error: "PASSWORD_DEBIL" }, { status: 400 });
      }

      await db.usuario.update({
        where: { id },
        data: {
          passwordHash: await hashearPassword(password),
          debeCambiarPassword: debeCambiar,
        },
      });
      return NextResponse.json({
        ok: true,
        ...(generar && { passwordTemporal: password }),
      });
    }

    // ===== Activar / desactivar =====
    if (accion === "alternarActivo") {
      if (objetivo.id === usuarioActual.id) {
        return NextResponse.json({ error: "NO_AUTO_DESACTIVAR" }, { status: 400 });
      }
      const actualizado = await db.usuario.update({
        where: { id },
        data: { activo: !objetivo.activo },
        include: { rol: true },
      });
      return NextResponse.json({ usuario: aUsuarioSesion(actualizado) });
    }

    return NextResponse.json({ error: "ACCION_INVALIDA" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/usuarios/[id] — Enviar a la papelera (borrado en 2 etapas)
// La cuenta sale de la base y queda restaurable durante 30 días (conserva
// su contraseña). Los movimientos y correcciones que registró sobreviven
// con su nombre (ledger); se re-vinculan solos si se restaura.
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "usuarios.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario: usuarioActual } = guardia;

  try {
    const { id } = await params;
    const objetivo = await db.usuario.findUnique({ where: { id } });
    if (!objetivo) {
      return NextResponse.json({ error: "NO_ENCONTRADO" }, { status: 404 });
    }
    if (objetivo.id === usuarioActual.id) {
      return NextResponse.json({ error: "NO_AUTO_ELIMINARSE" }, { status: 400 });
    }

    await enviarUsuarioAPapelera(id, { id: usuarioActual.id, nombre: usuarioActual.nombre });
    return NextResponse.json({ ok: true, restaurableDuranteDias: DIAS_RESTAURACION });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
