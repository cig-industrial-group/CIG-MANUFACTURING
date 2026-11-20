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
import { restaurarRespaldo } from "@/modulos/respaldo/servicios/nucleo";
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

// POST /api/respaldo/restaurar — Restauración EN CALIENTE de un respaldo.
// Reemplaza TODOS los datos en una única transacción: si algo falla,
// la base queda intacta (rollback automático). Con éxito, queda una
// ventana de 24 h para revertir desde el snapshot pre-restauración.
//
// STEP-UP AUTHENTICATION (TASK-STR-007, hallazgo H5 — OWASP ASVS 6.2.2):
// la restauración reemplaza el plantel completo de usuarios y puede
// introducir cuentas maliciosas de forma sigilosa (persistencia tras
// comprometer un respaldo). Una sesión válida ya no basta: el operador
// debe re-autenticarse aportando SU CONTRASEÑA en el cuerpo de la
// petición. Además, toda restauración deja un informe de diferencias
// de usuarios/roles (agregados/eliminados/MODIFICADOS — TASK-STR-012,
// hallazgo B-7) en la bitácora y en la respuesta (ver nucleo.ts).
//
// ORDEN OBLIGATORIO DE LA GUARDIA (TASK-STR-012, RF-A6 — cierre B-2/B-2b):
//   (1) permiso respaldo.gestionar
//   (2) validación de campos presentes (id y password)
//   (3) comprobación del bloqueo step:cta:{correo} — ANTES de bcrypt:
//       un 429 barato no agota CPU en el candado correcto
//   (4) bcrypt verificarPassword contra el hash del dueño de la sesión
//   (5) fallo: registrarFallo + 401 uniforme (o 429 si agotó la política)
//   (6) acierto: limpiar(clave) + ejecutar la restauración
//
// La clave de limitación es DEDICADA (step:cta:{correo}, ver
// claveStepUp): 5 fallos de restauración NO bloquean el login legítimo
// del operador (login:cta: es otra clave) y viceversa. El intento
// fallido NO crea registro en RestauracionBD (la operación jamás se
// ejecuta sin re-autenticación — RF-A7).
export async function POST(request: Request) {
  // (1) Permiso: sin sesión válida y permiso respaldo.gestionar no hay nada que hacer.
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    // (2) Campos presentes: identificador del respaldo Y contraseña del operador.
    const cuerpo = await request.json().catch(() => ({}));
    const id = typeof cuerpo?.id === "string" ? cuerpo.id : null;
    const password = typeof cuerpo?.password === "string" ? cuerpo.password : "";

    if (!id || !password) {
      return NextResponse.json({ error: "ID_Y_PASSWORD_REQUERIDOS" }, { status: 400 });
    }

    // (3) Candado de step-up por cuenta: ANTES de gastar CPU en bcrypt.
    // La clave es el correo de la SESIÓN (dueño de la operación), no un
    // correo del cuerpo de la petición.
    const clave = claveStepUp(usuario.correo.toLowerCase());
    if (estaBloqueada(clave)) {
      return respuestaLimite(msRestantes(clave));
    }

    // (4) Re-autenticación (ASVS 6.2.2): la contraseña se valida contra el
    // hash del usuario que SOLICITA la restauración (el dueño de la
    // sesión), no contra ninguna cuenta del respaldo. Si el usuario fue
    // eliminado o la contraseña no coincide, no se revela cuál de las dos
    // condiciones falló (respuesta uniforme 401).
    const registro = await db.usuario.findUnique({ where: { id: usuario.id } });
    if (!registro || !(await verificarPassword(password, registro.passwordHash))) {
      // (5) Fallo: cuenta el intento contra la política dedicada; el 5.º
      // fallo dentro de la ventana responde 429 con Retry-After.
      const agotada = registrarFallo(clave, POLITICAS.stepUp);
      if (agotada) {
        return respuestaLimite(msRestantes(clave));
      }
      return NextResponse.json({ error: "PASSWORD_INCORRECTA" }, { status: 401 });
    }

    // (6) Acierto: la cuenta queda limpia (un éxito no arrastra fallos
    // viejos) y la restauración procede con las garantías de siempre
    // (ventana de 24 h, candado de concurrencia, snapshot pre-restauración).
    limpiar(clave);

    const resultado = await restaurarRespaldo(id, usuario.nombre);
    if (resultado.restauracion.estado === "FALLIDA") {
      return NextResponse.json(
        { error: "RESTAURACION_FALLIDA", detalle: resultado.restauracion.error },
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
