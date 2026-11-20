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
 * SERVICIO HTTP DEL MÓDULO UNIDADES (cliente)
 * Centraliza las peticiones al backend del catálogo de unidades.
 */
import type { CuerpoUnidad, Unidad } from "../tipos";

export class ErrorApiUnidades extends Error {
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
    throw new ErrorApiUnidades(codigo);
  }
  return resp.json() as Promise<T>;
}

export const listarUnidades = (incluirInactivos = false) =>
  pedir<Unidad[]>(`/api/unidades?incluirInactivos=${incluirInactivos}`);

export const crearUnidad = (cuerpo: CuerpoUnidad) =>
  pedir<Unidad>("/api/unidades", { method: "POST", body: JSON.stringify(cuerpo) });

export const actualizarUnidad = (id: string, cuerpo: Partial<CuerpoUnidad> & { activo?: boolean }) =>
  pedir<Unidad>(`/api/unidades/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });

/** Eliminación real (solo unidades sin uso); para desactivar usar actualizarUnidad({ activo: false }) */
export const eliminarUnidad = (id: string) =>
  pedir<{ ok: boolean; codigo: string }>(`/api/unidades/${id}`, { method: "DELETE" });
