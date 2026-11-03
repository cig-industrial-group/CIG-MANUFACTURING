"use client";

/**
 * MÓDULO: RESPALDO — Hooks de consulta (React Query)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  crearRespaldo,
  eliminarRespaldo,
  obtenerEstadoRespaldo,
  restaurarRespaldo,
  respaldoAutomatico,
  revertirRestauracion,
  subirArchivoRespaldo,
} from "./api";

/** Clave de consulta del estado del módulo */
export const CLAVE_RESPALDO = ["respaldo", "estado"] as const;

export function useEstadoRespaldo() {
  return useQuery({
    queryKey: CLAVE_RESPALDO,
    queryFn: obtenerEstadoRespaldo,
  });
}

export function useCrearRespaldo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (etiqueta?: string) => crearRespaldo(etiqueta),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["respaldo"] }),
  });
}

export function useEliminarRespaldo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => eliminarRespaldo(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["respaldo"] }),
  });
}

export function useRestaurarRespaldo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restaurarRespaldo(id),
    onSuccess: () => {
      // La base cambió por completo: invalidar TODAS las consultas
      qc.invalidateQueries();
    },
  });
}

export function useRevertirRestauracion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => revertirRestauracion(),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useRespaldoAutomatico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => respaldoAutomatico(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["respaldo"] }),
  });
}

/** Sube un archivo de respaldo (.db) descargado antes; queda en la lista
 *  como SUBIDO y desde ahí se restaura con las garantías de siempre. */
export function useSubirRespaldo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archivo: File) => subirArchivoRespaldo(archivo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["respaldo"] }),
  });
}
