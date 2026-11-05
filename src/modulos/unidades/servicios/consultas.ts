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
import { aTextoDecimal, esDecimalPositivo } from "../tipos";

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
  if (!esDecimalPositivo(producto.contenidoPaquete)) return null;
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
  /** total en unidad base (texto decimal canónico, máx. 6 decimales; "0" si está vacía) */
  total: string;
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
 * autoritativa con Decimal exacto); aquí la previsualización se
 * normaliza a 6 decimales para coincidir con el resultado del servidor.
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
    const cantidad = aTextoDecimal(estado.sueltas);
    return {
      enPaquetes: false,
      total: cantidad ?? "0",
      valido: cantidad !== null && esDecimalPositivo(cantidad),
      partes: null,
    };
  }

  const paquetes = aTextoDecimal(estado.paquetes);
  const sueltas = aTextoDecimal(estado.sueltas);
  const factor = aTextoDecimal(producto?.contenidoPaquete ?? null);
  if (
    paquetes === null ||
    sueltas === null ||
    factor === null ||
    paquetes.startsWith("-") ||
    sueltas.startsWith("-") ||
    !esDecimalPositivo(factor)
  ) {
    return { enPaquetes: true, total: "0", valido: false, partes: null };
  }

  // Espejo cliente (SOLO previsualización): el servidor recalculará con
  // Decimal exacto. Se normaliza a 6 decimales para ocultar el ruido
  // binario de la vista previa (p. ej. 0.1 × 3 → 0.3, no 0.30000000000000004).
  const totalNumerico = Number(paquetes) * Number(factor) + Number(sueltas);
  const total = aTextoDecimal(String(Math.round(totalNumerico * 1e6) / 1e6)) ?? "0";

  const partes: ParteConteo[] = [];
  if (esDecimalPositivo(paquetes)) {
    partes.push({
      unidad: producto!.unidadPaquete!,
      nombre: producto!.unidadPaquete!,
      factor,
      cantidad: paquetes,
    });
  }
  if (esDecimalPositivo(sueltas)) {
    partes.push({ unidad: unidadBase, nombre: unidadBase, factor: "1", cantidad: sueltas });
  }

  return {
    enPaquetes: true,
    total,
    valido: esDecimalPositivo(total),
    partes: partes.length > 0 ? partes : null,
  };
}
