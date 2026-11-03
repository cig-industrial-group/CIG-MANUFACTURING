/**
 * TIPOS DEL MÓDULO OQC (CALIDAD DE SALIDA)
 * Contratos de datos compartidos entre el frontend y las APIs.
 */
import type { MovimientoResumen, CapturaConteoCuerpo } from "@/modulos/almacen/tipos";
import type { ParteConteo } from "@/modulos/unidades/tipos";

// ============================================================
// SALIDAS (agrupador único de una liberación)
// ============================================================

export interface PartidaSalida extends MovimientoResumen {
  salidaId: string | null;
  salidaFolio: string | null;
}

export interface SalidaOQC {
  id: string;
  folio: string;
  clienteId: string | null;
  clienteCodigo: string | null;
  clienteNombre: string | null;
  clienteExiste: boolean;
  almacenOrigenId: string | null;
  almacenOrigenCodigo: string | null;
  almacenOrigenNombre: string | null;
  referencia: string | null;
  responsable: string | null;
  notas: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  estado: "EMITIDA" | "ELIMINADA";
  eliminadaEn: string | null;
  eliminadaPor: string | null;
  createdAt: string;
  updatedAt: string;
  /** Partidas vivas agrupadas bajo esta salida */
  partidas: PartidaSalida[];
  /** Agregados calculados a partir de las partidas vivas */
  totalPartidas: number;
  totalUnidades: number;
}

export interface LineaSalida {
  productoId: string;
  cantidad: number;
  /** Conteo en paquetes (opcional): el servidor calcula el total en unidad base */
  conteo?: CapturaConteoCuerpo;
}

export interface CuerpoLiberacionSalida {
  clienteId: string;
  almacenOrigenId: string;
  lineas: LineaSalida[];
  referencia?: string;
  responsable?: string;
  notas?: string;
}

export interface RespuestaLiberacion {
  salida: SalidaOQC;
}

export interface CuerpoEdicionPartida {
  productoId: string;
  almacenOrigenId?: string;
  cantidad: number;
  motivo?: string;
  motivoCorreccion: string;
  // NOTA: la remisión (referencia / PL) y el responsable de una partida NO
  // se corrigen aquí: viven en la cabecera de la salida (CuerpoEdicionSalida)
  // y la partida siempre refleja sus valores vigentes.
}

export interface CuerpoEdicionSalida {
  referencia?: string; // "" = limpiar; undefined = no modificar
  responsable?: string; // "" = limpiar; undefined = no modificar
  notas?: string; // "" = limpiar; undefined = no modificar
  motivoCorreccion: string; // obligatorio: queda en la bitácora inmutable
}

export interface CuerpoEliminacionRegistro {
  motivoCorreccion: string;
}

// ============================================================
// SCRAP
// ============================================================

export interface RegistroScrap {
  id: string;
  folio: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  productoUnidad: string;
  almacenId: string | null;
  almacenCodigo: string | null;
  almacenNombre: string | null;
  cantidad: number;
  motivo: string;
  notas: string | null;
  responsable: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  movimientoId: string | null;
  /** Cómo se contó (paquetes + sueltas); null = captura directa */
  conteo: ParteConteo[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CuerpoRegistroScrap {
  productoId: string;
  almacenId: string;
  cantidad: number;
  motivo: string;
  notas?: string;
  responsable?: string;
  /** Conteo en paquetes (opcional): el servidor calcula el total en unidad base */
  conteo?: CapturaConteoCuerpo;
}

export interface CuerpoEdicionScrap {
  productoId?: string;
  almacenId?: string;
  cantidad?: number;
  motivo?: string;
  notas?: string;
  responsable?: string;
  motivoCorreccion: string;
}

// ============================================================
// RECHAZOS
// ============================================================

export type DisposicionRechazo = "PENDIENTE" | "RETRABAJO" | "SCRAP" | "LIBERADO";

export interface RegistroRechazo {
  id: string;
  folio: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  productoUnidad: string;
  clienteId: string | null;
  clienteCodigo: string | null;
  clienteNombre: string | null;
  salidaId: string | null;
  salidaFolio: string | null;
  cantidad: number;
  motivo: string;
  disposicion: DisposicionRechazo;
  notas: string | null;
  responsable: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CuerpoRegistroRechazo {
  productoId: string;
  clienteId?: string;
  salidaId?: string;
  cantidad: number;
  motivo: string;
  disposicion?: DisposicionRechazo;
  notas?: string;
  responsable?: string;
}

export interface CuerpoEdicionRechazo {
  productoId?: string;
  clienteId?: string | null;
  cantidad?: number;
  motivo?: string;
  disposicion?: DisposicionRechazo;
  notas?: string;
  responsable?: string;
}
