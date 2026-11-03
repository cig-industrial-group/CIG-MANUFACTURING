/**
 * TIPOS DEL MÓDULO ALMACÉN
 * Contratos de datos compartidos entre el frontend y las APIs.
 */

import type { ParteConteo } from "@/modulos/unidades/tipos";

export type TipoMovimiento = "ENTRADA" | "RECEPCION" | "SALIDA" | "TRASLADO" | "AJUSTE" | "SCRAP";
export type TipoAlmacen = "MATERIA_PRIMA" | "PRODUCTO_TERMINADO" | "GENERAL";
export type CategoriaProducto = "MATERIA_PRIMA" | "PRODUCTO_TERMINADO" | "MATERIAL" | "INSUMO";
export type UnidadMedida = "KG" | "PZA" | "L" | "M" | "CJA" | "PAR" | "ROLLO";

export const TIPOS_MOVIMIENTO: TipoMovimiento[] = ["ENTRADA", "RECEPCION", "SALIDA", "TRASLADO", "AJUSTE", "SCRAP"];

/** Tipos que un usuario puede registrar manualmente desde Almacén
 *  (SCRAP se registra desde el módulo OQC, no manualmente aquí). */
export const TIPOS_MOVIMIENTO_MANUALES: TipoMovimiento[] = [
  "ENTRADA",
  "RECEPCION",
  "SALIDA",
  "TRASLADO",
  "AJUSTE",
];
export const TIPOS_ALMACEN: TipoAlmacen[] = ["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "GENERAL"];
export const CATEGORIAS_PRODUCTO: CategoriaProducto[] = ["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "MATERIAL", "INSUMO"];
export const UNIDADES_MEDIDA: UnidadMedida[] = ["KG", "PZA", "L", "M", "CJA", "PAR", "ROLLO"];

export interface Almacen {
  id: string;
  codigo: string;
  nombre: string;
  ubicacion: string | null;
  tipo: string;
  responsable: string | null;
  activo: boolean;
  createdAt: string;
  // Agregados calculados
  numProductos: number;
  totalUnidades: number;
  valorInventario: number;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  unidad: string;
  /** Unidad de empaque para conteo (PAQ, CJA...); null = captura directa */
  unidadPaquete: string | null;
  /** Unidades base que contiene cada paquete (p. ej. 10 PZ por PAQ) */
  contenidoPaquete: number | null;
  stockMinimo: number;
  costoUnitario: number | null;
  activo: boolean;
  createdAt: string;
  stockTotal: number;
}

export interface MovimientoResumen {
  id: string;
  folio: string;
  tipo: string;
  cantidad: number;
  cantidadDespues: number | null;
  motivo: string | null;
  referencia: string | null;
  responsable: string | null;
  editado: boolean;
  createdAt: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  productoUnidad: string;
  /** false cuando el producto fue enviado a la papelera (o purgado) */
  productoExiste: boolean;
  almacenOrigenId: string | null;
  almacenOrigenNombre: string | null;
  almacenOrigenCodigo: string | null;
  almacenDestinoId: string | null;
  almacenDestinoNombre: string | null;
  almacenDestinoCodigo: string | null;
  /** Cliente que recibe la salida (solo movimientos SALIDA a cliente) */
  clienteId: string | null;
  clienteCodigo: string | null;
  clienteNombre: string | null;
  /** false cuando el cliente fue enviado a la papelera (o purgado) */
  clienteExiste: boolean;
  /** Salida OQC agrupadora (solo partidas de una liberación OQC) */
  salidaId: string | null;
  salidaFolio: string | null;
  /** Cómo se contó (paquetes + sueltas); null = captura directa en unidad base */
  conteo: ParteConteo[] | null;
}

export interface RespuestaMovimientos {
  movimientos: MovimientoResumen[];
  total: number;
  pagina: number;
  paginas: number;
}

/** Entrada de la bitácora de correcciones de un movimiento */
export interface CorreccionResumen {
  id: string;
  accion: "EDICION" | "ELIMINACION";
  motivo: string | null;
  usuarioNombre: string | null;
  createdAt: string;
  antes: Record<string, unknown>;
  despues: Record<string, unknown> | null;
}

export interface DetalleMovimiento {
  movimiento: MovimientoResumen;
  correcciones: CorreccionResumen[];
}

export interface FilaStock {
  id: string;
  cantidad: number;
  productoId: string;
  sku: string;
  productoNombre: string;
  categoria: string;
  unidad: string;
  stockMinimo: number;
  costoUnitario: number | null;
  almacenId: string;
  almacenCodigo: string;
  almacenNombre: string;
  valor: number;
}

export interface Estadisticas {
  productosActivos: number;
  almacenesActivos: number;
  unidadesStock: number;
  valorInventario: number;
  movimientos7Dias: number;
  stockBajo: Array<{
    id: string;
    sku: string;
    nombre: string;
    unidad: string;
    stockTotal: number;
    stockMinimo: number;
  }>;
  serieActividad: Array<{ fecha: string; entradas: number; salidas: number }>;
  distribucionAlmacenes: Array<{
    codigo: string;
    nombre: string;
    unidades: number;
    valor: number;
  }>;
  movimientosRecientes: MovimientoResumen[];
}

// ===== Cuerpos de petición =====

export interface CuerpoAlmacen {
  codigo: string;
  nombre: string;
  ubicacion?: string;
  tipo: string;
  responsable?: string;
}

export interface CuerpoProducto {
  sku: string;
  nombre: string;
  descripcion?: string;
  categoria: string;
  unidad: string;
  unidadPaquete?: string | null;
  contenidoPaquete?: number | null;
  stockMinimo: number;
  costoUnitario?: number | null;
}

/** Conteo en paquetes: captura alternativa a la cantidad directa */
export interface CapturaConteoCuerpo {
  /** código de la unidad de paquete (CJA, PAQ...) */
  unidad: string;
  /** paquetes completos */
  paquetes?: number;
  /** unidades sueltas de la base (piezas fuera de paquete) */
  sueltas?: number;
}

export interface CuerpoMovimiento {
  tipo: TipoMovimiento;
  productoId: string;
  almacenOrigenId?: string;
  almacenDestinoId?: string;
  cantidad: number;
  motivo?: string;
  referencia?: string;
  responsable?: string;
  /** Conteo en paquetes (opcional): el servidor calcula el total en unidad base */
  conteo?: CapturaConteoCuerpo;
}

/** Cuerpo para corregir un registro de movimiento desde su sección */
export interface CuerpoEdicionMovimiento {
  productoId: string;
  almacenOrigenId?: string;
  almacenDestinoId?: string;
  cantidad: number;
  motivo?: string;
  referencia?: string;
  responsable?: string;
  motivoCorreccion: string;
}
