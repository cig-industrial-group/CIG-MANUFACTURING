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
 * HOOKS DE CONSULTA (React Query) DEL MÓDULO UNIDADES
 * También expone helpers de interpretación del conteo en paquetes
 * compartidos por Almacén y OQC.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  actualizarUnidad,
  crearUnidad,
  eliminarUnidad,
  listarUnidades,
} from "./api";
import type { CuerpoUnidad, EmpaqueProductoConteo, EstadoConteo, ParteConteo, Unidad } from "../tipos";

export const CLAVES_QUERY_UNIDADES = {
  unidades: ["unidades"] as const,
};

// ===== Consultas =====

/** Catálogo de unidades (activas por defecto; true incluye inactivas) */
export function useUnidades(incluirInactivos = false) {
  return useQuery({
    queryKey: [...CLAVES_QUERY_UNIDADES.unidades, incluirInactivos],
    queryFn: () => listarUnidades(incluirInactivos),
  });
}

/** Invalida el catálogo de unidades */
export function useInvalidarUnidades() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["unidades"] });
  };
}

// ===== Mutaciones =====

export function useCrearUnidad() {
  const invalidar = useInvalidarUnidades();
  return useMutation({
    mutationFn: (cuerpo: CuerpoUnidad) => crearUnidad(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarUnidad() {
  const invalidar = useInvalidarUnidades();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: Partial<CuerpoUnidad> & { activo?: boolean } }) =>
      actualizarUnidad(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarUnidad() {
  const invalidar = useInvalidarUnidades();
  return useMutation({
    mutationFn: (id: string) => eliminarUnidad(id),
    onSuccess: invalidar,
  });
}

// ============================================================
// HELPERS DE CONTEO (compartidos con Almacén y OQC)
// ============================================================

/**
 * La unidad de empaque configurada de un producto, tal como vive en el
 * catálogo (para nombre visible y disponibilidad). null si el producto
 * no tiene empaque, si la unidad fue desactivada o si dejó de ser
 * compatible con la unidad base del producto.
 */
export function paqueteDelProducto(
  unidades: Unidad[] | undefined,
  producto: EmpaqueProductoConteo | null | undefined,
): Unidad | null {
  if (!unidades || !producto?.unidadPaquete) return null;
  if (!((producto.contenidoPaquete ?? 0) > 0)) return null;
  const unidad = unidades.find(
    (u) => u.codigo === producto.unidadPaquete && u.activo && u.tipo === "PAQUETE",
  );
  if (!unidad) return null;
  if (unidad.unidadBase !== producto.unidad) return null;
  return unidad;
}

/** Busca una unidad por código (activa o no) */
export function buscarUnidad(unidades: Unidad[] | undefined, codigo: string): Unidad | undefined {
  if (!unidades) return undefined;
  return unidades.find((u) => u.codigo === codigo);
}

export interface ResultadoConteo {
  /** true si la captura es en paquetes (unidad de empaque del producto) */
  enPaquetes: boolean;
  /** total en unidad base (0 si la captura está vacía) */
  total: number;
  /** true si el total es válido (> 0) */
  valido: boolean;
  /** partes del detalle (solo en modo paquete con datos) */
  partes: ParteConteo[] | null;
}

/**
 * Calcula el total en unidad base a partir del estado del widget de
 * captura, usando el EMPAQUE CONFIGURADO DEL PRODUCTO (la cantidad que
 * lleva cada paquete varía por producto). Es el espejo cliente de
 * `resolverConteoTx` (el servidor recalcula y valida todo de forma
 * autoritativa).
 */
export function calcularConteo(
  estado: EstadoConteo,
  producto: EmpaqueProductoConteo | null | undefined,
): ResultadoConteo {
  const unidadBase = producto?.unidad ?? "PZA";
  const esPaquete = Boolean(
    producto?.unidadPaquete &&
      estado.unidad === producto.unidadPaquete &&
      estado.unidad !== unidadBase,
  );

  if (!esPaquete) {
    // Captura directa en la unidad base del producto
    const cantidad = Number(estado.sueltas);
    return {
      enPaquetes: false,
      total: Number.isFinite(cantidad) ? cantidad : 0,
      valido: Number.isFinite(cantidad) && cantidad > 0,
      partes: null,
    };
  }

  const paquetes = Number(estado.paquetes);
  const sueltas = Number(estado.sueltas);
  const factor = producto?.contenidoPaquete ?? 0;
  const pOk = Number.isFinite(paquetes) && paquetes >= 0;
  const sOk = Number.isFinite(sueltas) && sueltas >= 0;
  if (!pOk || !sOk || !Number.isFinite(factor) || factor <= 0) {
    return { enPaquetes: true, total: 0, valido: false, partes: null };
  }

  const total = paquetes * factor + sueltas;
  const partes: ParteConteo[] = [];
  if (paquetes > 0) {
    partes.push({
      unidad: producto!.unidadPaquete!,
      nombre: producto!.unidadPaquete!,
      factor,
      cantidad: paquetes,
    });
  }
  if (sueltas > 0) {
    partes.push({ unidad: unidadBase, nombre: unidadBase, factor: 1, cantidad: sueltas });
  }

  return {
    enPaquetes: true,
    total,
    valido: total > 0,
    partes: partes.length > 0 ? partes : null,
  };
}
