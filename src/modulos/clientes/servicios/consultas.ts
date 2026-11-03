"use client";

/**
 * HOOKS DE CONSULTA (React Query) DEL MÓDULO CLIENTES
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { actualizarCliente, crearCliente, eliminarCliente, listarClientes } from "./api";
import type { CuerpoCliente } from "../tipos";

export const CLAVES_QUERY = {
  clientes: ["clientes", "listado"] as const,
};

/** Invalida las consultas del módulo clientes */
export function useInvalidarClientes() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["clientes"] });
  };
}

// ===== Consultas =====
/** Por defecto solo incluye activos; pasar true para ver también inactivos */
export function useClientes(incluirInactivos = false) {
  return useQuery({
    queryKey: [...CLAVES_QUERY.clientes, incluirInactivos],
    queryFn: () => listarClientes(incluirInactivos),
  });
}

// ===== Mutaciones =====
export function useCrearCliente() {
  const invalidar = useInvalidarClientes();
  return useMutation({
    mutationFn: (cuerpo: CuerpoCliente) => crearCliente(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarCliente() {
  const invalidar = useInvalidarClientes();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: Partial<CuerpoCliente> & { activo?: boolean } }) =>
      actualizarCliente(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarCliente() {
  const invalidar = useInvalidarClientes();
  return useMutation({
    mutationFn: (id: string) => eliminarCliente(id),
    onSuccess: invalidar,
  });
}
