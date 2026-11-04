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
 * MÓDULO: RESPALDO — Servicio HTTP (cliente)
 * Estado del módulo, creación, restauración, reversión y eliminación.
 */
import type {
  EstadoRespaldo,
  FilaRespaldo,
  ResultadoRestauracion,
} from "../servicios/nucleo";

export class ErrorApiRespaldo extends Error {
  codigo: string;
  detalle: string | null;
  constructor(codigo: string, detalle: string | null = null) {
    super(codigo);
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!resp.ok) {
    let codigo = "ERROR_INTERNO";
    let detalle: string | null = null;
    try {
      const cuerpo = await resp.json();
      if (cuerpo?.error) codigo = cuerpo.error;
      if (cuerpo?.detalle) detalle = String(cuerpo.detalle);
    } catch {
      /* respuesta sin JSON */
    }
    throw new ErrorApiRespaldo(codigo, detalle);
  }
  return resp.json() as Promise<T>;
}

/** Estado completo: respaldos, última restauración, ventana de reversión */
export const obtenerEstadoRespaldo = () => pedir<EstadoRespaldo>("/api/respaldo");

/** Crear un respaldo manual (etiqueta opcional) */
export const crearRespaldo = (etiqueta?: string) =>
  pedir<{ respaldo: FilaRespaldo }>("/api/respaldo", {
    method: "POST",
    body: JSON.stringify({ etiqueta }),
  });

/** Eliminar un respaldo (archivo + registro) */
export const eliminarRespaldo = (id: string) =>
  pediryOk(`/api/respaldo?id=${encodeURIComponent(id)}`, { method: "DELETE" });

/** Restaurar un respaldo (en caliente, con rollback automático si falla) */
export const restaurarRespaldo = (id: string) =>
  pedir<ResultadoRestauracion>("/api/respaldo/restaurar", {
    method: "POST",
    body: JSON.stringify({ id }),
  });

/** Revertir la última restauración dentro de su ventana de 24 h */
export const revertirRestauracion = () =>
  pedir<ResultadoRestauracion>("/api/respaldo/revertir", { method: "POST" });

/** Respaldo automático diario (crea uno solo si procede) */
export const respaldoAutomatico = () =>
  pedir<{ respaldo: FilaRespaldo | null }>("/api/respaldo/auto", { method: "POST" });

/**
 * Sube un archivo de respaldo (.db) descargado antes — p. ej. la copia
 * que se bajó con «Descargar» y se guardó fuera de la máquina. Se valida
 * en el servidor (integridad + esquema) antes de quedar disponible.
 */
export async function subirArchivoRespaldo(archivo: File): Promise<{ respaldo: FilaRespaldo }> {
  const cuerpo = new FormData();
  cuerpo.append("archivo", archivo);
  const resp = await fetch("/api/respaldo/subir", { method: "POST", body: cuerpo });
  if (!resp.ok) {
    let codigo = "ERROR_INTERNO";
    let detalle: string | null = null;
    try {
      const j = await resp.json();
      if (j?.error) codigo = j.error;
      if (j?.detalle) detalle = String(j.detalle);
    } catch {
      /* respuesta sin JSON */
    }
    throw new ErrorApiRespaldo(codigo, detalle);
  }
  return resp.json() as Promise<{ respaldo: FilaRespaldo }>;
}

/** URL de descarga del archivo de respaldo */
export const urlDescarga = (id: string) => `/api/respaldo/descargar?id=${encodeURIComponent(id)}`;

async function pediryOk(url: string, init?: RequestInit): Promise<{ ok: boolean }> {
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
    throw new ErrorApiRespaldo(codigo);
  }
  return { ok: true };
}
