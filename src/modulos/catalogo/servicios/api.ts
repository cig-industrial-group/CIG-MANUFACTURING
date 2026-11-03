/**
 * SERVICIO HTTP DEL MÓDULO CATÁLOGO (cliente)
 * Centraliza las peticiones al backend y traduce errores.
 */
import type { CuerpoModelo, CuerpoParte, Modelo, NumeroParte } from "../tipos";

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

// ===== Modelos =====
export const listarModelos = (incluirInactivos = false) =>
  pedir<Modelo[]>(`/api/catalogo/modelos?incluirInactivos=${incluirInactivos}`);
export const crearModelo = (cuerpo: CuerpoModelo) =>
  pedir<Modelo>("/api/catalogo/modelos", { method: "POST", body: JSON.stringify(cuerpo) });
export const actualizarModelo = (id: string, cuerpo: Partial<CuerpoModelo> & { activo?: boolean }) =>
  pedir<Modelo>(`/api/catalogo/modelos/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });
/** Eliminación real (borrado permanente); para desactivar usar actualizarModelo({ activo: false }) */
export const eliminarModelo = (id: string) =>
  pedir<{ ok: boolean }>(`/api/catalogo/modelos/${id}`, { method: "DELETE" });

// ===== Números de parte =====
export const listarPartes = (incluirInactivos = false) =>
  pedir<NumeroParte[]>(`/api/catalogo/partes?incluirInactivos=${incluirInactivos}`);
export const crearParte = (cuerpo: CuerpoParte) =>
  pedir<NumeroParte>("/api/catalogo/partes", { method: "POST", body: JSON.stringify(cuerpo) });
export const actualizarParte = (id: string, cuerpo: Partial<CuerpoParte> & { activo?: boolean }) =>
  pedir<NumeroParte>(`/api/catalogo/partes/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });
/** Eliminación real (borrado permanente); para desactivar usar actualizarParte({ activo: false }) */
export const eliminarParte = (id: string) =>
  pedir<{ ok: boolean }>(`/api/catalogo/partes/${id}`, { method: "DELETE" });
