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
 * MÓDULO: AJUSTES — Servicio HTTP (cliente)
 */
import type { AjustesSistema } from "@/modulos/autenticacion/tipos";

export class ErrorApiAjustes extends Error {
  codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.codigo = codigo;
  }
}

export interface RespuestaAjustes {
  ajustes: AjustesSistema;
  roles: Array<{ id: string; clave: string; nombre: string; nombreEn: string }>;
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
    throw new ErrorApiAjustes(codigo);
  }
  return resp.json() as Promise<T>;
}

export const obtenerAjustes = () => pedir<RespuestaAjustes>("/api/ajustes");

export interface CuerpoAjustes {
  registroHabilitado?: boolean;
  recuperacionHabilitada?: boolean;
  rolRegistro?: string;
}

export const guardarAjustes = (cuerpo: CuerpoAjustes) =>
  pedir<{ ajustes: AjustesSistema }>("/api/ajustes", {
    method: "PATCH",
    body: JSON.stringify(cuerpo),
  });
