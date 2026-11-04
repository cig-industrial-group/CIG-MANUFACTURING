/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

"use client";

/**
 * MÓDULO: AUTENTICACIÓN — Servicio HTTP (cliente)
 * Login, registro, recuperación de contraseña, sesión y cambio de contraseña.
 */
import type {
  BanderasAuth,
  RespuestaLogin,
  RespuestaRecuperacion,
  UsuarioSesion,
} from "../tipos";

export class ErrorApiAuth extends Error {
  codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.codigo = codigo;
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!resp.ok) {
    let codigo = "ERROR_INTERNO";
    try {
      const cuerpo = await resp.json();
      if (cuerpo?.error) codigo = cuerpo.error;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ErrorApiAuth(codigo);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json() as Promise<T>;
}

// ===== Banderas públicas de la pantalla de acceso =====
export const obtenerBanderas = () => pedir<BanderasAuth>("/api/auth/banderas");

// ===== Sesión =====
export const obtenerSesion = () => pedir<{ usuario: UsuarioSesion }>("/api/auth/sesion");

export const iniciarSesion = (correo: string, password: string) =>
  pedir<RespuestaLogin>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ correo, password }),
  });

export const cerrarSesion = () =>
  pedir<{ ok: boolean }>("/api/auth/logout", { method: "POST" });

// ===== Registro público (condicionado por Ajustes) =====
export const registrarse = (nombre: string, correo: string, password: string) =>
  pedir<RespuestaLogin>("/api/auth/registro", {
    method: "POST",
    body: JSON.stringify({ nombre, correo, password }),
  });

// ===== Recuperación automática (condicionada por Ajustes) =====
export const pedirCodigoRecuperacion = (correo: string) =>
  pedir<RespuestaRecuperacion>("/api/auth/recuperacion", {
    method: "POST",
    body: JSON.stringify({ correo }),
  });

export const confirmarRecuperacion = (correo: string, codigo: string, password: string) =>
  pedir<{ ok: boolean }>("/api/auth/recuperacion/confirmar", {
    method: "POST",
    body: JSON.stringify({ correo, codigo, password }),
  });

// ===== Cambio de contraseña propia =====
export const cambiarPassword = (actual: string, nueva: string) =>
  pedir<{ ok: boolean }>("/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ actual, nueva }),
  });
