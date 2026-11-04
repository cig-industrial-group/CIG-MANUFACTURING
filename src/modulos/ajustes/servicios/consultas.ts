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
 * MÓDULO: AJUSTES — Hooks de consulta (React Query)
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { guardarAjustes, obtenerAjustes, type CuerpoAjustes } from "./api";

export function useAjustes() {
  return useQuery({
    queryKey: ["ajustes", "sistema"],
    queryFn: obtenerAjustes,
  });
}

export function useGuardarAjustes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cuerpo: CuerpoAjustes) => guardarAjustes(cuerpo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ajustes"] });
      qc.invalidateQueries({ queryKey: ["auth", "banderas"] });
    },
  });
}
