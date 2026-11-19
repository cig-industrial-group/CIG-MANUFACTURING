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
 * SERVICIO HTTP DEL MÓDULO CLIENTES (cliente)
 * Centraliza las peticiones al backend y traduce errores.
 */
import type { CuerpoCliente, Cliente } from "../tipos";

export class ErrorApi extends Error {
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
    throw new ErrorApi(codigo);
  }
  return resp.json() as Promise<T>;
}

// ===== Catálogo de clientes =====
export const listarClientes = (incluirInactivos = false) =>
  pedir<Cliente[]>(`/api/clientes?incluirInactivos=${incluirInactivos}`);
export const crearCliente = (cuerpo: CuerpoCliente) =>
  pedir<Cliente>("/api/clientes", { method: "POST", body: JSON.stringify(cuerpo) });
export const actualizarCliente = (id: string, cuerpo: Partial<CuerpoCliente> & { activo?: boolean }) =>
  pedir<Cliente>(`/api/clientes/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });
/** Envia a la papelera (restaurable 30 días); para desactivar usar actualizarCliente({ activo: false }) */
export const eliminarCliente = (id: string) =>
  pedir<{ ok: boolean }>(`/api/clientes/${id}`, { method: "DELETE" });
