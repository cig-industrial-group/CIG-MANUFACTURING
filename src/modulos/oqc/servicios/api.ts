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
 * SERVICIO HTTP DEL MÓDULO OQC (cliente)
 * Centraliza las peticiones al backend y traduce errores.
 */
import type {
  CuerpoEdicionPartida,
  CuerpoEdicionRechazo,
  CuerpoEdicionSalida,
  CuerpoEliminacionRegistro,
  CuerpoLiberacionSalida,
  CuerpoRegistroRechazo,
  CuerpoRegistroScrap,
  PartidaSalida,
  RegistroRechazo,
  RegistroScrap,
  SalidaOQC,
} from "../tipos";

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

// ===== Salidas (liberaciones agrupadas) =====
export const listarSalidas = (incluirEliminadas = false) =>
  pedir<SalidaOQC[]>(`/api/oqc/salidas?incluirEliminadas=${incluirEliminadas}`);

export const detalleSalida = (id: string) =>
  pedir<{
    salida: SalidaOQC;
    correcciones: Array<{
      id: string;
      folio: string;
      accion: string;
      /** true = edición de la cabecera de la salida (no de una partida) */
      esCabecera: boolean;
      motivo: string | null;
      usuarioNombre: string | null;
      createdAt: string;
      antes: Record<string, unknown>;
      despues: Record<string, unknown> | null;
    }>;
  }>(`/api/oqc/salidas/${id}`);

export const liberarSalida = (cuerpo: CuerpoLiberacionSalida) =>
  pedir<{ salida: SalidaOQC }>("/api/oqc/salidas", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });

export const editarSalida = (id: string, cuerpo: CuerpoEdicionSalida) =>
  pedir<SalidaOQC>(`/api/oqc/salidas/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });

export const eliminarSalida = (id: string, cuerpo: CuerpoEliminacionRegistro) =>
  pedir<{ salida: SalidaOQC }>(`/api/oqc/salidas/${id}`, {
    method: "DELETE",
    body: JSON.stringify(cuerpo),
  });

// ===== Partidas de una salida =====
export const corregirPartida = (salidaId: string, partidaId: string, cuerpo: CuerpoEdicionPartida) =>
  pedir<PartidaSalida>(`/api/oqc/salidas/${salidaId}/partidas/${partidaId}`, {
    method: "PATCH",
    body: JSON.stringify(cuerpo),
  });

export const eliminarPartida = (salidaId: string, partidaId: string, cuerpo: CuerpoEliminacionRegistro) =>
  pedir<{ ok: boolean; folio: string }>(`/api/oqc/salidas/${salidaId}/partidas/${partidaId}`, {
    method: "DELETE",
    body: JSON.stringify(cuerpo),
  });

// ===== Scrap =====
export const listarScrap = () => pedir<RegistroScrap[]>("/api/oqc/scrap");

export const registrarScrap = (cuerpo: CuerpoRegistroScrap) =>
  pedir<RegistroScrap>("/api/oqc/scrap", { method: "POST", body: JSON.stringify(cuerpo) });

export const corregirScrap = (
  id: string,
  cuerpo: {
    productoId?: string;
    almacenId?: string;
    /** Texto decimal exacto en unidad base */
    cantidad?: string;
    motivo?: string;
    notas?: string;
    responsable?: string;
    motivoCorreccion: string;
  },
) => pedir<RegistroScrap>(`/api/oqc/scrap/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });

export const eliminarScrap = (id: string, cuerpo: CuerpoEliminacionRegistro) =>
  pedir<{ ok: boolean; folio: string }>(`/api/oqc/scrap/${id}`, {
    method: "DELETE",
    body: JSON.stringify(cuerpo),
  });

// ===== Rechazos =====
export const listarRechazos = () => pedir<RegistroRechazo[]>("/api/oqc/rechazos");

export const registrarRechazo = (cuerpo: CuerpoRegistroRechazo) =>
  pedir<RegistroRechazo>("/api/oqc/rechazos", { method: "POST", body: JSON.stringify(cuerpo) });

export const editarRechazo = (id: string, cuerpo: CuerpoEdicionRechazo) =>
  pedir<RegistroRechazo>(`/api/oqc/rechazos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(cuerpo),
  });

export const eliminarRechazo = (id: string) =>
  pedir<{ ok: boolean; folio: string }>(`/api/oqc/rechazos/${id}`, { method: "DELETE" });
