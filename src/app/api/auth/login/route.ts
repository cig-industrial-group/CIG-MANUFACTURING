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
  verificarPassword,
} from "@/modulos/autenticacion/servicios/auth";
import {
  POLITICAS,
  claveLoginCuenta,
  claveLoginIp,
  estaBloqueada,
  ipPeticion,
  limpiar,
  msRestantes,
  registrarFallo,
  respuestaLimite,
} from "@/modulos/autenticacion/servicios/limites";

// POST /api/auth/login — Iniciar sesión con correo y contraseña
// Protección anti-fuerza bruta (TASK-STR-006 — cierre del hallazgo H3):
//  · Clave PRINCIPAL por CUENTA (login:cta:{correo}, SIN IP): 5 fallos
//    en 15 min → bloqueo 15 min. El 5.º fallo responde 429 EN EL ACTO;
//    rotar X-Forwarded-For (o cambiar de red) NO evade este candado.
//  · Clave SECUNDARIA de volumen por IP (login:ip:{ip}, 20 fallos/15 min):
//    acota el rociado de credenciales sobre varias cuentas desde una
//    misma IP. La IP es fail-closed (ipPeticion ignora la cabecera
//    salvo PROXY_DE_CONFIANZA=1).
// Un acceso correcto limpia ambos contadores.
//
// Protección anti-enumeración por timing (TASK-STR-010 — cierre del
// hallazgo H7): la verificación de contraseña se ejecuta SIEMPRE con
// el mismo coste criptográfico (bcrypt, coste 10), exista o no el
// correo en la base de datos (OWASP ASVS V2.5.4). Un correo inexistente
// consume el mismo bcrypt.compare que uno existente (hash señuelo), de
// modo que el TIEMPO de respuesta no delata qué cuentas son reales.

// Hash señuelo (bcrypt, coste 10 — idéntico al real). Garantiza que el
// tiempo de respuesta sea el mismo exista o no el correo (ASVS 2.5.4).
// Se calcula una sola vez y se hardcodea; no contiene datos sensibles.
const HASH_SENUELO = "$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGfaE7lW";

export async function POST(request: Request) {
  try {
    const claveIp = claveLoginIp(ipPeticion(request));

    if (estaBloqueada(claveIp)) {
      return respuestaLimite(msRestantes(claveIp));
    }

    const cuerpo = await request.json();
    const correo = String(cuerpo?.correo ?? "").trim().toLowerCase();
    const password = String(cuerpo?.password ?? "");

    if (!correo || !password) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    // Clave principal POR CUENTA, sin componente de IP (H3): la
    // rotación de X-Forwarded-For no evade este bloqueo.
    const claveCuenta = claveLoginCuenta(correo);
    if (estaBloqueada(claveCuenta)) {
      return respuestaLimite(msRestantes(claveCuenta));
    }

    const usuario = await db.usuario.findUnique({
      where: { correo },
      include: { rol: true },
    });

    // SIEMPRE se ejecuta bcrypt.compare (ASVS 2.5.4: tiempos uniformes).
    // Si el correo no existe, se compara contra el hash señuelo con el
    // mismo coste (10) que cualquier hash real: sin rama rápida que
    // delate la inexistencia de la cuenta por timing (hallazgo H7).
    const hashAComparar = usuario?.passwordHash ?? HASH_SENUELO;
    const passwordOk = await verificarPassword(password, hashAComparar);

    // Mensaje genérico para no revelar si el correo existe
    if (!usuario || !passwordOk) {
      // El fallo que agota la política de cuenta responde 429 de
      // inmediato: el atacante no recibe una respuesta 401 más.
      const cuentaBloqueada = registrarFallo(claveCuenta, POLITICAS.login);
      registrarFallo(claveIp, POLITICAS.loginIp);
      if (cuentaBloqueada) {
        return respuestaLimite(msRestantes(claveCuenta));
      }
      return NextResponse.json({ error: "CREDENCIALES_INVALIDAS" }, { status: 401 });
    }
    if (!usuario.activo) {
      return NextResponse.json({ error: "USUARIO_INACTIVO" }, { status: 403 });
    }

    const actualizado = await db.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcceso: new Date() },
      include: { rol: true },
    });

    // Acceso correcto: limpiar contadores de la cuenta y la IP.
    limpiar(claveCuenta);
    limpiar(claveIp);

    const token = await crearTokenSesion(usuario.id);
    return conCookieSesion(
      NextResponse.json({ usuario: aUsuarioSesion(actualizado) }),
      token,
    );
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
