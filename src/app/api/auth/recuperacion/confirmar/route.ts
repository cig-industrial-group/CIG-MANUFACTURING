/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transaccion } from "@/lib/reintentos";
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

    // TASK-STR-005 (H2 — OWASP ASVS 3.3.1 / NIST SP 800-63B §7.1):
    // marca de revocación de sesiones al restablecer la contraseña. Se
    // fija al INICIO del segundo actual (ms en cero), alineada al reloj
    // del JWT: `iat` tiene resolución de 1 s truncada hacia abajo.
    //
    //   · Toda sesión de un segundo anterior o más viejo —incluida
    //     cualquier sesión concurrente de la cuenta— queda revocada
    //     (iat < marca → obtenerSesion() devuelve null → 401).
    //   · El token que este endpoint emite A CONTINUACIÓN (inicio de
    //     sesión automático tras restablecer) se firma en este mismo
    //     segundo o posterior: iat >= marca, nunca se revoca a sí mismo.
    //     Con milisegundos completos, iat*1000 (segundo truncado) sería
    //     casi siempre menor que la marca y la sesión recién creada
    //     nacería muerta: una regresión que este ajuste elimina.
    //
    // Contraste deliberado con POST /api/auth/password (marca con ms
    // completos, fail-closed): aquí la marca se alinea al reloj del JWT
    // porque este es el ÚNICO flujo que firma un token inmediatamente
    // después de escribir la marca, y el orden real de emisión (token
    // DESPUÉS del cambio) es un hecho conocido que la comparación de
    // `iat` —por su resolución de 1 s— no puede expresar por sí sola.
    //
    // Se calcula ANTES de la transacción para que un reintento del
    // envoltorio de reintentos reutilice exactamente la misma marca (la
    // marca es monótona respecto al token, que siempre se emite después).
    const passwordCambiadaEn = new Date();
    passwordCambiadaEn.setMilliseconds(0);

    // Forma de callback (Fase 3): la forma de arreglo de $transaction no
    // puede re-ejecutarse en un reintento (las promesas ya fueron creadas),
    // y este par de escrituras — marcar el código como usado y cambiar la
    // contraseña — es exactamente la unidad atómica que el envoltorio de
    // reintentos debe poder re-ejecutar completa si un cerrojo externo
    // interrumpe la transacción.
    await transaccion(async (tx) => {
      await tx.restablecimiento.update({
        where: { id: registro.id },
        data: { usadoEn: new Date() },
      });
      await tx.usuario.update({
        where: { id: usuario.id },
        data: {
          passwordHash: await hashearPassword(password),
          debeCambiarPassword: false,
          passwordCambiadaEn,
        },
      });
    });

    // Iniciar sesión automáticamente tras restablecer
    const token = await crearTokenSesion(usuario.id);
    return conCookieSesion(NextResponse.json({ ok: true }), token);
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
