/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import { createHash, randomInt } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { obtenerBanderasAuth } from "@/modulos/autenticacion/servicios/configuracion";
import {
  POLITICAS,
  estaBloqueada,
  ipPeticion,
  msRestantes,
  registrarFallo,
  respuestaLimite,
} from "@/modulos/autenticacion/servicios/limites";

const MINUTOS_VALIDEZ = 15;

function hashCodigo(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

// POST /api/auth/recuperacion — Solicitar código de recuperación
// Solo disponible si la recuperación automática está habilitada en Ajustes
// (por defecto DESHABILITADA en instalaciones nuevas).
//
// Entorno sin servicio de correo: el código se devuelve en la respuesta
// (canal diseñado del sistema). Medidas aplicadas:
//  · La respuesta es IDÉNTICA exista o no el correo (sin enumeración:
//    para correos inexistentes se devuelve un código señuelo no almacenado).
//  · Máximo 3 solicitudes por (correo + IP) en 15 minutos (HTTP 429).
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

    const clave = `rec:${correo}:${ipPeticion(request)}`;
    if (estaBloqueada(clave)) {
      return respuestaLimite(msRestantes(clave));
    }
    registrarFallo(clave, POLITICAS.recuperacion);

    const usuario = await db.usuario.findUnique({ where: { correo } });
    if (!usuario || !usuario.activo) {
      // Correo inexistente: señuelo con la MISMA forma de respuesta.
      // No se almacena nada; confirmar con él siempre dará CODIGO_INVALIDO.
      return NextResponse.json({
        codigo: String(randomInt(100000, 999999)),
        expiraMinutos: MINUTOS_VALIDEZ,
      });
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
      // Simulación de envío por correo (el sistema no cuenta con SMTP).
      codigo,
      expiraMinutos: MINUTOS_VALIDEZ,
    });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
