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
 * HOOKS DE CONSULTA (React Query) DEL MÓDULO CATÁLOGO
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  actualizarModelo,
  actualizarParte,
  crearModelo,
  crearParte,
  eliminarModelo,
  eliminarParte,
  listarModelos,
  listarPartes,
} from "./api";
import type { CuerpoModelo, CuerpoParte } from "../tipos";

export const CLAVES_QUERY = {
  modelos: ["catalogo", "modelos"] as const,
  partes: ["catalogo", "partes"] as const,
};

/** Invalida todas las consultas del módulo catálogo */
export function useInvalidarCatalogo() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["catalogo"] });
  };
}

// ===== Consultas =====
/** Por defecto solo incluye activos; pasar true para ver también inactivos */
export function useModelos(incluirInactivos = false) {
  return useQuery({
    queryKey: [...CLAVES_QUERY.modelos, incluirInactivos],
    queryFn: () => listarModelos(incluirInactivos),
  });
}

/** Por defecto solo incluye activos; pasar true para ver también inactivos */
export function usePartes(incluirInactivos = false) {
  return useQuery({
    queryKey: [...CLAVES_QUERY.partes, incluirInactivos],
    queryFn: () => listarPartes(incluirInactivos),
  });
}

// ===== Mutaciones: modelos =====
export function useCrearModelo() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: (cuerpo: CuerpoModelo) => crearModelo(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarModelo() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: Partial<CuerpoModelo> & { activo?: boolean } }) =>
      actualizarModelo(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarModelo() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: (id: string) => eliminarModelo(id),
    onSuccess: invalidar,
  });
}

// ===== Mutaciones: números de parte =====
export function useCrearParte() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: (cuerpo: CuerpoParte) => crearParte(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarParte() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: Partial<CuerpoParte> & { activo?: boolean } }) =>
      actualizarParte(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarParte() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: (id: string) => eliminarParte(id),
    onSuccess: invalidar,
  });
}
