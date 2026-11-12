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
  claveRecuperacion,
  estaBloqueada,
  msRestantes,
  registrarFallo,
} from "@/modulos/autenticacion/servicios/limites";

const MINUTOS_VALIDEZ = 15;

function hashCodigo(codigo: string): string {
  return createHash("sha256").update(codigo).digest("hex");
}

// POST /api/auth/recuperacion — Solicitar código de recuperación
// Solo disponible si la recuperación automática está habilitada en Ajustes
// (por defecto DESHABILITADA en instalaciones nuevas).
//
// ============================================================================
// FLUJO SEGURO (TASK-STR-004 — cierre del hallazgo H1, CVSS 9.8)
// ============================================================================
// El sistema no cuenta con SMTP configurado, por lo que el código de 6
// dígitos se entrega por un CANAL FUERA DE BANDA: el log auditado del
// servidor (stdout). El operador lee el código del log y lo comunica de
// forma manual/verbal al usuario.
//
// Principio rector (OWASP ASVS 6.3.1 / NIST SP 800-63B §5.1.1.2): el
// secreto NUNCA viaja por el mismo canal que la solicitud — la respuesta
// HTTP jamás contiene el código ni pistas sobre su valor.
//
// Medidas aplicadas:
//  · Anti-enumeración: la respuesta es IDÉNTICA exista o no el correo
//    ({"ok": true, "expiraMinutos": N}, HTTP 200). Para correos
//    inexistentes o usuarios inactivos no se genera, almacena ni
//    registra ningún código.
//  · Límite EXCLUSIVAMENTE por cuenta: clave rec:cta:{correo} (ver
//    claveRecuperacion() en limites.ts), sin componente de IP — rotar
//    la cabecera X-Forwarded-For NO evade el límite (política
//    POLITICAS.recuperacion: 3 solicitudes por correo en 15 min → 429).
//  · El código se almacena HASHEADO (SHA-256) en Restablecimiento y se
//    registra en el log con la etiqueta AUDIT_SENSITIVE para que los
//    sistemas de logs centralizados (Datadog, CloudWatch...) puedan
//    identificar, filtrar o enmascarar la línea (enmascaramiento
//    parcial planificado para una futura iteración).
//  · Cada emisión invalida los códigos previos no usados de la cuenta.
// ============================================================================
export async function POST(request: Request) {
  try {
    const banderas = await obtenerBanderasAuth();
    if (!banderas.recuperacionHabilitada) {
      return NextResponse.json({ error: "RECUPERACION_DESHABILITADA" }, { status: 403 });
    }

    const cuerpo = await request.json();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    // Límite EXCLUSIVAMENTE por cuenta (rec:cta:{correo}): sin componente
    // de IP, la rotación de X-Forwarded-For no evade el bloqueo.
    const clave = claveRecuperacion(correo);
    if (estaBloqueada(clave)) {
      const reintentarEn = Math.max(1, Math.ceil(msRestantes(clave) / 1000));
      return NextResponse.json(
        { error: "DEMASIADOS_INTENTOS", reintentarEn },
        { status: 429, headers: { "Retry-After": String(reintentarEn) } },
      );
    }
    registrarFallo(clave, POLITICAS.recuperacion);

    const usuario = await db.usuario.findUnique({ where: { correo } });
    if (!usuario || !usuario.activo) {
      // Anti-enumeración: misma respuesta exacta que para un correo
      // existente. No se genera, almacena ni registra ningún código.
      return NextResponse.json({ ok: true, expiraMinutos: MINUTOS_VALIDEZ });
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

    // Entrega fuera de banda (ASVS 6.3.1): el código NO viaja en la
    // respuesta HTTP. Se registra en el log auditado del servidor para
    // su entrega manual/verbal por el operador. La etiqueta
    // AUDIT_SENSITIVE permite a los sistemas de logs centralizados
    // identificar y filtrar esta línea (enmascaramiento parcial
    // planificado para una futura iteración).
    console.info(
      `[recuperacion] código emitido para ${correo}; expira en ${MINUTOS_VALIDEZ} min. ` +
        `Canal: entrega manual/verbal. [AUDIT_SENSITIVE] codigo=${codigo}`,
    );

    // Respuesta uniforme (anti-enumeración): sin rastro del código.
    return NextResponse.json({ ok: true, expiraMinutos: MINUTOS_VALIDEZ });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
