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
import {
  guardarAjustes,
  obtenerAjustes,
  obtenerBranding,
  restaurarFavicon,
  restaurarLogo,
  subirFavicon,
  subirLogo,
  type CuerpoAjustes,
} from "./api";
import { notificarBrandingActualizado } from "@/modulos/compartidos/branding";

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

// ============================================================
// BRANDING (Identidad Visual)
// ============================================================

export function useBranding() {
  return useQuery({
    queryKey: ["ajustes", "branding"],
    queryFn: obtenerBranding,
  });
}

/** Mutaciones de branding: refrescan el estado y publican la nueva versión */
function useMutacionBranding<TVariables>(
  mutationFn: (variables: TVariables) => Promise<{ branding: unknown }>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ajustes", "branding"] });
      // Nueva versión de caché para todas las vistas que muestran el logo
      notificarBrandingActualizado();
    },
  });
}

export function useSubirLogo() {
  return useMutacionBranding((archivo: File) => subirLogo(archivo));
}

export function useRestaurarLogo() {
  return useMutacionBranding<void>(() => restaurarLogo());
}

export function useSubirFavicon() {
  return useMutacionBranding((archivo: File) => subirFavicon(archivo));
}

export function useRestaurarFavicon() {
  return useMutacionBranding<void>(() => restaurarFavicon());
}
