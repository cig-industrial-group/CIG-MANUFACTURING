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

// ============================================================
// BRANDING (Identidad Visual) — tipos y límites del cliente
// ============================================================

export interface EstadoActivoBranding {
  url: string;
  personalizado: boolean;
  tipo: string | null;
  tamanoBytes: number | null;
  actualizadoEn: string | null;
}

export interface EstadoBranding {
  logo: EstadoActivoBranding;
  favicon: EstadoActivoBranding;
}

/** Límites del cliente (espejo de los validados en el servidor) */
export const LIMITES_BRANDING = {
  logoTamanoMaxBytes: 2 * 1024 * 1024, // 2 MB
  faviconTamanoMaxBytes: 500 * 1024, // 500 KB
  logoTipos: ["png", "svg", "jpg"],
  faviconTipos: ["ico", "png"],
} as const;

async function pedirBranding(url: string, init?: RequestInit): Promise<{ branding: EstadoBranding }> {
  const resp = await fetch(url, init);
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
  return resp.json() as Promise<{ branding: EstadoBranding }>;
}

/** GET /api/ajustes/branding — estado del logo y favicon */
export const obtenerBranding = () => pedirBranding("/api/ajustes/branding");

/** POST /api/ajustes/branding/logo — subir logo (multipart, campo «archivo») */
export const subirLogo = (archivo: File) => {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  return pedirBranding("/api/ajustes/branding/logo", { method: "POST", body: formulario });
};

/** DELETE /api/ajustes/branding/logo — restaurar logo predeterminado */
export const restaurarLogo = () => pedirBranding("/api/ajustes/branding/logo", { method: "DELETE" });

/** POST /api/ajustes/branding/favicon — subir favicon (multipart, campo «archivo») */
export const subirFavicon = (archivo: File) => {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  return pedirBranding("/api/ajustes/branding/favicon", { method: "POST", body: formulario });
};

/** DELETE /api/ajustes/branding/favicon — restaurar favicon predeterminado */
export const restaurarFavicon = () =>
  pedirBranding("/api/ajustes/branding/favicon", { method: "DELETE" });

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
