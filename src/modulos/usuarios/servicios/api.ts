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
 * MÓDULO: USUARIOS — Servicio HTTP (cliente)
 * Gestión de cuentas de usuario y roles con permisos.
 */
import type { InfoRol, UsuarioLista, UsuarioSesion } from "@/modulos/autenticacion/tipos";

export class ErrorApiUsuarios extends Error {
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
    throw new ErrorApiUsuarios(codigo);
  }
  return resp.json() as Promise<T>;
}

// ===== Usuarios =====
export const listarUsuarios = () => pedir<{ usuarios: UsuarioLista[] }>("/api/usuarios");

export interface CuerpoCrearUsuario {
  nombre: string;
  correo: string;
  rolId: string;
  password?: string;
  generarPassword?: boolean;
  debeCambiarPassword?: boolean;
}

export const crearUsuario = (cuerpo: CuerpoCrearUsuario) =>
  pedir<{ usuario: UsuarioSesion; passwordTemporal?: string }>("/api/usuarios", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });

export interface CuerpoActualizarUsuario {
  accion: "actualizar" | "restablecerPassword" | "alternarActivo";
  nombre?: string;
  correo?: string;
  rolId?: string;
  password?: string;
  generarPassword?: boolean;
  debeCambiarPassword?: boolean;
}

export const actualizarUsuario = (id: string, cuerpo: CuerpoActualizarUsuario) =>
  pedir<{ usuario?: UsuarioSesion; ok?: boolean; passwordTemporal?: string }>(
    `/api/usuarios/${id}`,
    { method: "PATCH", body: JSON.stringify(cuerpo) },
  );

/** Eliminación real (borrado permanente); para desactivar usar alternarActivo */
export const eliminarUsuario = (id: string) =>
  pedir<{ ok: boolean }>(`/api/usuarios/${id}`, { method: "DELETE" });

// ===== Roles =====
export const listarRoles = () => pedir<{ roles: InfoRol[] }>("/api/roles");

export interface CuerpoRol {
  clave?: string;
  nombre: string;
  nombreEn?: string;
  descripcion?: string | null;
  permisos: string[];
}

export const crearRol = (cuerpo: CuerpoRol) =>
  pedir<{ rol: InfoRol }>("/api/roles", { method: "POST", body: JSON.stringify(cuerpo) });

export const actualizarRol = (id: string, cuerpo: CuerpoRol) =>
  pedir<{ rol: InfoRol }>(`/api/roles/${id}`, {
    method: "PATCH",
    body: JSON.stringify(cuerpo),
  });

export const eliminarRol = (id: string) =>
  pedir<{ ok: boolean }>(`/api/roles/${id}`, { method: "DELETE" });
