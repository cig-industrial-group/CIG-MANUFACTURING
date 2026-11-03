/**
 * SERVICIO HTTP DEL MÓDULO PAPELERA (cliente)
 * Centraliza las peticiones y traduce errores.
 */
import type { EntradaPapelera, VistaPapelera } from "../tipos";

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

export const listarPapelera = (vista: VistaPapelera = "activa") =>
  pedir<{ vista: VistaPapelera; entradas: EntradaPapelera[] }>(`/api/papelera?vista=${vista}`);

export const restaurarEntrada = (id: string) =>
  pedir<{ ok: boolean; entidad: string; identificador: string; nombre: string }>(
    `/api/papelera/${id}/restaurar`,
    { method: "POST" },
  );

export const purgarEntrada = (id: string) =>
  pedir<{ ok: boolean; entidad: string; identificador: string }>(`/api/papelera/${id}`, {
    method: "DELETE",
  });
