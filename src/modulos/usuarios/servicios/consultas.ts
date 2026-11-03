"use client";

/**
 * MÓDULO: USUARIOS — Hooks de consulta (React Query)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  actualizarRol,
  actualizarUsuario,
  crearRol,
  crearUsuario,
  eliminarRol,
  eliminarUsuario,
  listarRoles,
  listarUsuarios,
  type CuerpoCrearUsuario,
  type CuerpoActualizarUsuario,
  type CuerpoRol,
} from "./api";

export const CLAVES_QUERY = {
  usuarios: ["usuarios", "lista"] as const,
  roles: ["usuarios", "roles"] as const,
};

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  };
}

export function useUsuarios() {
  return useQuery({ queryKey: CLAVES_QUERY.usuarios, queryFn: listarUsuarios });
}

export function useRoles() {
  return useQuery({ queryKey: CLAVES_QUERY.roles, queryFn: listarRoles });
}

export function useCrearUsuario() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (cuerpo: CuerpoCrearUsuario) => crearUsuario(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarUsuario() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: CuerpoActualizarUsuario }) =>
      actualizarUsuario(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarUsuario() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => eliminarUsuario(id),
    onSuccess: invalidar,
  });
}

export function useCrearRol() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (cuerpo: CuerpoRol) => crearRol(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarRol() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: CuerpoRol }) => actualizarRol(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarRol() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (id: string) => eliminarRol(id),
    onSuccess: invalidar,
  });
}
