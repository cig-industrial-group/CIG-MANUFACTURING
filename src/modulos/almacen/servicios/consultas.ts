"use client";

/**
 * HOOKS DE CONSULTA (React Query) DEL MÓDULO ALMACÉN
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  actualizarAlmacen,
  actualizarMovimiento,
  actualizarProducto,
  crearAlmacen,
  crearMovimiento,
  crearProducto,
  eliminarAlmacen,
  eliminarMovimiento,
  eliminarProducto,
  listarAlmacenes,
  listarInventario,
  listarMovimientos,
  listarProductos,
  obtenerDetalleMovimiento,
  obtenerEstadisticas,
  type FiltrosInventario,
  type FiltrosMovimientos,
} from "./api";
import type {
  CuerpoAlmacen,
  CuerpoEdicionMovimiento,
  CuerpoMovimiento,
  CuerpoProducto,
} from "../tipos";

export const CLAVES_QUERY = {
  almacenes: ["almacen", "almacenes"] as const,
  productos: ["almacen", "productos"] as const,
  inventario: (f: FiltrosInventario) => ["almacen", "inventario", f] as const,
  movimientos: (f: FiltrosMovimientos) => ["almacen", "movimientos", f] as const,
  detalleMovimiento: (id: string) => ["almacen", "movimiento", id] as const,
  estadisticas: ["almacen", "estadisticas"] as const,
};

// ===== Consultas =====
export function useAlmacenes(incluirInactivos = false) {
  return useQuery({
    queryKey: [...CLAVES_QUERY.almacenes, incluirInactivos],
    queryFn: () => listarAlmacenes(incluirInactivos),
  });
}

/** Por defecto solo incluye activos; pasar true para ver también inactivos */
export function useProductos(incluirInactivos = false) {
  return useQuery({
    queryKey: [...CLAVES_QUERY.productos, incluirInactivos],
    queryFn: () => listarProductos(incluirInactivos),
  });
}

export function useInventario(
  filtros: FiltrosInventario = {},
  opciones?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: CLAVES_QUERY.inventario(filtros),
    queryFn: () => listarInventario(filtros),
    placeholderData: keepPreviousData,
    enabled: opciones?.enabled ?? true,
  });
}

export function useMovimientos(filtros: FiltrosMovimientos = {}) {
  return useQuery({
    queryKey: CLAVES_QUERY.movimientos(filtros),
    queryFn: () => listarMovimientos(filtros),
    placeholderData: keepPreviousData,
  });
}

/** Detalle de un registro + bitácora de correcciones (bajo demanda) */
export function useDetalleMovimiento(id: string | null) {
  return useQuery({
    queryKey: CLAVES_QUERY.detalleMovimiento(id ?? ""),
    queryFn: () => obtenerDetalleMovimiento(id!),
    enabled: !!id,
  });
}

export function useEstadisticas() {
  return useQuery({
    queryKey: CLAVES_QUERY.estadisticas,
    queryFn: obtenerEstadisticas,
  });
}

/** Invalida todas las consultas del módulo almacén */
export function useInvalidarAlmacen() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["almacen"] });
  };
}

// ===== Mutaciones =====
export function useCrearAlmacen() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: (cuerpo: CuerpoAlmacen) => crearAlmacen(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarAlmacen() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: Partial<CuerpoAlmacen> & { activo?: boolean } }) =>
      actualizarAlmacen(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarAlmacen() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: (id: string) => eliminarAlmacen(id),
    onSuccess: invalidar,
  });
}

export function useCrearProducto() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: (cuerpo: CuerpoProducto) => crearProducto(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarProducto() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: Partial<CuerpoProducto> & { activo?: boolean } }) =>
      actualizarProducto(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarProducto() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: (id: string) => eliminarProducto(id),
    onSuccess: invalidar,
  });
}

export function useCrearMovimiento() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: (cuerpo: CuerpoMovimiento) => crearMovimiento(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarMovimiento() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: CuerpoEdicionMovimiento }) =>
      actualizarMovimiento(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarMovimiento() {
  const invalidar = useInvalidarAlmacen();
  return useMutation({
    mutationFn: ({ id, motivo }: { id: string; motivo: string }) =>
      eliminarMovimiento(id, motivo),
    onSuccess: invalidar,
  });
}
