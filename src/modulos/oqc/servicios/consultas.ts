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
 * HOOKS DE CONSULTA (React Query) DEL MÓDULO OQC
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  corregirPartida,
  corregirScrap,
  editarRechazo,
  editarSalida,
  eliminarPartida,
  eliminarRechazo,
  eliminarSalida,
  eliminarScrap,
  liberarSalida,
  listarRechazos,
  listarSalidas,
  listarScrap,
  registrarRechazo,
  registrarScrap,
} from "./api";
import type {
  CuerpoEdicionPartida,
  CuerpoEdicionRechazo,
  CuerpoEdicionSalida,
  CuerpoEliminacionRegistro,
  CuerpoLiberacionSalida,
  CuerpoRegistroRechazo,
  CuerpoRegistroScrap,
} from "../tipos";

/** Invalida las consultas de OQC y del almacén (el stock cambia) */
function useInvalidarOqc() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["oqc"] });
    qc.invalidateQueries({ queryKey: ["almacen"] });
  };
}

// ===== Consultas =====
export function useSalidas(incluirEliminadas = false) {
  return useQuery({
    queryKey: ["oqc", "salidas", incluirEliminadas],
    queryFn: () => listarSalidas(incluirEliminadas),
  });
}

export function useScrap() {
  return useQuery({ queryKey: ["oqc", "scrap"], queryFn: listarScrap });
}

export function useRechazos() {
  return useQuery({ queryKey: ["oqc", "rechazos"], queryFn: listarRechazos });
}

// ===== Liberación =====
export function useLiberarSalida() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: (cuerpo: CuerpoLiberacionSalida) => liberarSalida(cuerpo),
    onSuccess: invalidar,
  });
}

// ===== Salidas: edición / eliminación =====
export function useEditarSalida() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: CuerpoEdicionSalida }) =>
      editarSalida(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarSalida() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: CuerpoEliminacionRegistro }) =>
      eliminarSalida(id, cuerpo),
    onSuccess: invalidar,
  });
}

// ===== Partidas: corrección / eliminación =====
export function useCorregirPartida() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: ({
      salidaId,
      partidaId,
      cuerpo,
    }: {
      salidaId: string;
      partidaId: string;
      cuerpo: CuerpoEdicionPartida;
    }) => corregirPartida(salidaId, partidaId, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarPartida() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: ({
      salidaId,
      partidaId,
      cuerpo,
    }: {
      salidaId: string;
      partidaId: string;
      cuerpo: CuerpoEliminacionRegistro;
    }) => eliminarPartida(salidaId, partidaId, cuerpo),
    onSuccess: invalidar,
  });
}

// ===== Scrap =====
export function useRegistrarScrap() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: (cuerpo: CuerpoRegistroScrap) => registrarScrap(cuerpo),
    onSuccess: invalidar,
  });
}

export function useCorregirScrap() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: ({
      id,
      cuerpo,
    }: {
      id: string;
      cuerpo: Parameters<typeof corregirScrap>[1];
    }) => corregirScrap(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarScrap() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: CuerpoEliminacionRegistro }) =>
      eliminarScrap(id, cuerpo),
    onSuccess: invalidar,
  });
}

// ===== Rechazos =====
export function useRegistrarRechazo() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: (cuerpo: CuerpoRegistroRechazo) => registrarRechazo(cuerpo),
    onSuccess: invalidar,
  });
}

export function useEditarRechazo() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: CuerpoEdicionRechazo }) =>
      editarRechazo(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarRechazo() {
  const invalidar = useInvalidarOqc();
  return useMutation({
    mutationFn: (id: string) => eliminarRechazo(id),
    onSuccess: invalidar,
  });
}
