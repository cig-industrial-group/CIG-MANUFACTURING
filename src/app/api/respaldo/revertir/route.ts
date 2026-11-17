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
import { requerirPermiso, verificarPassword } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { revertirUltimaRestauracion } from "@/modulos/respaldo/servicios/nucleo";
import {
  claveStepUp,
  estaBloqueada,
  limpiar,
  msRestantes,
  POLITICAS,
  registrarFallo,
  respuestaLimite,
} from "@/modulos/autenticacion/servicios/limites";
import { db } from "@/lib/db";

// POST /api/respaldo/revertir — Revierte la última restauración exitosa
// dentro de su ventana de 24 h (restaura el snapshot pre-restauración).
//
// STEP-UP (TASK-STR-012, RF-A1/B-2c — paridad con /restaurar): la
// reversión también reemplaza TODA la base; una sesión válida no basta.
// El cuerpo debe llevar { password } (la contraseña del operador), con el
// MISMO orden de guardia que restaurar (RF-A6):
//   (1) permiso → (2) password presente → (3) candado step:cta:{correo}
//   → (4) bcrypt → (5) fallo: registrarFallo + 401/429 → (6) acierto:
//   limpiar + ejecutar. La MISMA clave step:cta sirve a ambas operaciones.
export async function POST(request: Request) {
  // (1) Permiso: sin sesión válida y permiso respaldo.gestionar no hay nada que hacer.
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    // (2) Campo presente: la contraseña del operador (la reversión no
    // necesita identificador: actúa sobre la última restauración vigente).
    const cuerpo = await request.json().catch(() => ({}));
    const password = typeof cuerpo?.password === "string" ? cuerpo.password : "";

    if (!password) {
      return NextResponse.json({ error: "PASSWORD_REQUERIDA" }, { status: 400 });
    }

    // (3) Candado de step-up por cuenta, ANTES de bcrypt (429 barato).
    const clave = claveStepUp(usuario.correo.toLowerCase());
    if (estaBloqueada(clave)) {
      return respuestaLimite(msRestantes(clave));
    }

    // (4) Re-autenticación contra el hash del dueño de la sesión
    // (respuesta uniforme 401 si el usuario desapareció o la contraseña
    // no coincide — no se revela cuál condición falló).
    const registro = await db.usuario.findUnique({ where: { id: usuario.id } });
    if (!registro || !(await verificarPassword(password, registro.passwordHash))) {
      // (5) Fallo: política dedicada step:cta (la misma de restaurar);
      // el intento fallido NO toca RestauracionBD (RF-A7).
      const agotada = registrarFallo(clave, POLITICAS.stepUp);
      if (agotada) {
        return respuestaLimite(msRestantes(clave));
      }
      return NextResponse.json({ error: "PASSWORD_INCORRECTA" }, { status: 401 });
    }

    // (6) Acierto: limpiar la cuenta y ejecutar la reversión con sus
    // garantías intactas (ventana de 24 h, candado de concurrencia,
    // snapshot propio: la reversión es a su vez una restauración).
    limpiar(clave);

    const resultado = await revertirUltimaRestauracion(usuario.nombre);
    if (resultado.restauracion.estado === "FALLIDA") {
      return NextResponse.json(
        { error: "REVERSION_FALLIDA", detalle: resultado.restauracion.error },
        { status: 500 },
      );
    }
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
