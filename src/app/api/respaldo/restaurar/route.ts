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
// de usuarios/roles (agregados/eliminados) en la bitácora y en la
// respuesta (ver nucleo.ts).
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const cuerpo = await request.json().catch(() => ({}));
    const id = typeof cuerpo?.id === "string" ? cuerpo.id : null;
    const password = typeof cuerpo?.password === "string" ? cuerpo.password : "";

    // La sesión ya no basta para un acto de esta magnitud: se exige el
    // identificador del respaldo Y la contraseña del operador.
    if (!id || !password) {
      return NextResponse.json({ error: "ID_Y_PASSWORD_REQUERIDOS" }, { status: 400 });
    }

    // Step-up: re-autenticación del operador (ASVS 6.2.2). La contraseña
    // se valida contra el hash del usuario que SOLICITA la restauración
    // (el dueño de la sesión), no contra ninguna cuenta del respaldo. Si
    // el usuario fue eliminado o la contraseña no coincide, no se revela
    // cuál de las dos condiciones falló (respuesta uniforme 401).
    const registro = await db.usuario.findUnique({ where: { id: usuario.id } });
    if (!registro || !(await verificarPassword(password, registro.passwordHash))) {
      return NextResponse.json({ error: "PASSWORD_INCORRECTA" }, { status: 401 });
    }

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
