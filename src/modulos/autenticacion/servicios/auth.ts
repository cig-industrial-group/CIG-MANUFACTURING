/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

/**
 * MÓDULO: AUTENTICACIÓN — Servicios de servidor
 * Hash de contraseñas (bcrypt), sesiones JWT (jose) en cookie httpOnly
 * y guardas de permisos para las rutas API.
 */
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { UsuarioSesion } from "../tipos";
import { obtenerSecretoFirmado, esProduccion } from "./seguridad";

export const COOKIE_SESION = "cig_manufacturing_sesion";
const DURACION_SESION_SEG = 60 * 60 * 24 * 7; // 7 días

// El secreto se resuelve y valida de forma PEREZOSA (al primer uso) y se
// memoriza. La validación de arranque vive en src/instrumentation.ts; esta
// es la defensa en profundidad: cualquier operación de firma/verificación
// exige un secreto válido (en producción, un AUTH_SECRET ausente/inválido/
// conocido lanza y la operación no continúa).
let secretoCache: Uint8Array | null = null;
function secretoFirmado(): Uint8Array {
  secretoCache ??= obtenerSecretoFirmado();
  return secretoCache;
}

// ===== Contraseñas =====

export function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verificarPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Política: mínimo 8 caracteres, al menos una letra y un número */
export function cumplePoliticaPassword(password: string): boolean {
  return (
    password.length >= 8 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(password) && /[0-9]/.test(password)
  );
}

/** Genera una contraseña aleatoria legible que cumple la política */
export function generarPasswordAleatoria(): string {
  const consonantes = "bcdfghjkmnpqrstvwxz";
  const vocales = "aeiou";
  const digitos = "23456789";
  const especiales = "*#";
  let pw = "";
  for (let i = 0; i < 6; i++) {
    pw += i % 2 === 0 ? consonantes[Math.floor(Math.random() * consonantes.length)] : vocales[Math.floor(Math.random() * vocales.length)];
  }
  pw += digitos[Math.floor(Math.random() * digitos.length)];
  pw += digitos[Math.floor(Math.random() * digitos.length)];
  pw += especiales[Math.floor(Math.random() * especiales.length)];
  return pw.charAt(0).toUpperCase() + pw.slice(1);
}

// ===== Tokens de sesión =====

export async function crearTokenSesion(usuarioId: string): Promise<string> {
  return new SignJWT({ sub: usuarioId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACION_SESION_SEG}s`)
    .sign(secretoFirmado());
}

export async function verificarTokenSesion(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretoFirmado());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Lee el valor de una cookie desde una Request estándar */
export function leerCookie(request: Request, nombre: string): string | null {
  const encabezado = request.headers.get("cookie");
  if (!encabezado) return null;
  for (const parte of encabezado.split(";")) {
    const [clave, ...resto] = parte.trim().split("=");
    if (clave === nombre) return decodeURIComponent(resto.join("="));
  }
  return null;
}

// ===== Sesión y permisos =====

function aUsuarioSesion(u: {
  id: string;
  nombre: string;
  correo: string;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: Date | null;
  rol: { id: string; clave: string; nombre: string; nombreEn: string; descripcion: string | null; permisos: string; sistema: boolean };
}): UsuarioSesion {
  return {
    id: u.id,
    nombre: u.nombre,
    correo: u.correo,
    activo: u.activo,
    debeCambiarPassword: u.debeCambiarPassword,
    ultimoAcceso: u.ultimoAcceso ? u.ultimoAcceso.toISOString() : null,
    rol: {
      id: u.rol.id,
      clave: u.rol.clave,
      nombre: u.rol.nombre,
      nombreEn: u.rol.nombreEn,
      descripcion: u.rol.descripcion,
      permisos: JSON.parse(u.rol.permisos) as string[],
      sistema: u.rol.sistema,
    },
  };
}

/** Devuelve el usuario de la sesión activa (o null si no la hay / está inválida) */
export async function obtenerSesion(request: Request): Promise<UsuarioSesion | null> {
  const token = leerCookie(request, COOKIE_SESION);
  if (!token) return null;
  const usuarioId = await verificarTokenSesion(token);
  if (!usuarioId) return null;
  const usuario = await db.usuario.findUnique({
    where: { id: usuarioId },
    include: { rol: true },
  });
  if (!usuario || !usuario.activo) return null;
  return aUsuarioSesion(usuario);
}

/**
 * Guarda de ruta API: exige sesión activa y (opcionalmente) un permiso.
 * Devuelve el usuario o una respuesta de error lista para retornar.
 */
export async function requerirPermiso(
  request: Request,
  permiso?: string,
): Promise<{ usuario: UsuarioSesion } | NextResponse> {
  const usuario = await obtenerSesion(request);
  if (!usuario) {
    return NextResponse.json({ error: "NO_AUTENTICADO" }, { status: 401 });
  }
  if (permiso) {
    const permisos = usuario.rol.permisos as string[];
    if (!permisos.includes(permiso)) {
      return NextResponse.json({ error: "SIN_PERMISO" }, { status: 403 });
    }
  }
  return { usuario };
}

/**
 * ¿La cookie debe marcarse como Secure? En producción SÍ (obligatorio por
 * defecto: la sesión no debe viajar por HTTP claro). Existe una opción
 * explícita y documentada para despliegues LAN sin TLS:
 *   COOKIE_INSEGURA_HTTP=1
 * El arranque avisa por consola cuando se usa (nunca es silenciosa).
 */
function cookieSegura(): boolean {
  if (!esProduccion()) return false;
  if (process.env.COOKIE_INSEGURA_HTTP === "1") {
    console.warn(
      "[seguridad] COOKIE_INSEGURA_HTTP=1: la cookie de sesión se enviará también por HTTP claro " +
        "(solo para redes internas de confianza sin TLS). Retírala cuando el proxy sirva HTTPS.",
    );
    return false;
  }
  return true;
}

/** Adjunta la cookie de sesión a una respuesta JSON */
export function conCookieSesion(respuesta: NextResponse, token: string): NextResponse {
  respuesta.cookies.set(COOKIE_SESION, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSegura(),
    path: "/",
    maxAge: DURACION_SESION_SEG,
  });
  return respuesta;
}

/** Elimina la cookie de sesión */
export function sinCookieSesion(respuesta: NextResponse): NextResponse {
  respuesta.cookies.set(COOKIE_SESION, "", {
    httpOnly: true,
    secure: cookieSegura(),
    path: "/",
    maxAge: 0,
  });
  return respuesta;
}

export { aUsuarioSesion };
