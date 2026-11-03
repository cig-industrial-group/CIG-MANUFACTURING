/**
 * CONSULTAS REACT QUERY DEL MÓDULO PAPELERA
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listarPapelera, purgarEntrada, restaurarEntrada } from "./api";
import type { VistaPapelera } from "../tipos";

export function usePapelera(vista: VistaPapelera = "activa") {
  return useQuery({
    queryKey: ["papelera", vista],
    queryFn: () => listarPapelera(vista),
  });
}

function useInvalidarPapelera() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["papelera"] });
    // Las entidades restauradas reaparecen en sus módulos
    qc.invalidateQueries({ queryKey: ["almacen"] });
    qc.invalidateQueries({ queryKey: ["catalogo"] });
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  };
}

export function useRestaurarEntrada() {
  const invalidar = useInvalidarPapelera();
  return useMutation({
    mutationFn: (id: string) => restaurarEntrada(id),
    onSuccess: invalidar,
  });
}

export function usePurgarEntrada() {
  const invalidar = useInvalidarPapelera();
  return useMutation({
    mutationFn: (id: string) => purgarEntrada(id),
    onSuccess: invalidar,
  });
}
