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

    // TASK-STR-005 (H2 — OWASP ASVS 3.3.1 / NIST SP 800-63B §7.1):
    // al cambiar la contraseña se adelanta la marca de revocación a
    // AHORA, con milisegundos completos (fail-closed). obtenerSesion()
    // rechazará (401) todo JWT cuyo `iat` —en segundos, truncado hacia
    // abajo— sea estrictamente anterior a esta marca: la sesión actual y
    // cualquier otra concurrente quedan invalidadas de inmediato, sin
    // lista de revocación (comparación O(1) iat vs passwordCambiadaEn).
    //
    // Este endpoint NO emite un token nuevo (el usuario debe volver a
    // iniciar sesión), por eso la marca NO se alinea al reloj de segundos
    // del JWT: cualquier token preexistiente —incluso uno emitido en
    // este mismo segundo— queda del lado revocado. El contraste con
    // recuperacion/confirmar (que SÍ alinea la marca) está documentado
    // allí: es el único flujo que firma un token inmediatamente después
    // de escribir la marca.
    await db.usuario.update({
      where: { id: usuario.id },
      data: {
        passwordHash: await hashearPassword(nueva),
        debeCambiarPassword: false,
        passwordCambiadaEn: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
