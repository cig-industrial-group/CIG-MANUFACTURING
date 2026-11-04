/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

/**
 * TIPOS DEL MÓDULO UNIDADES DE MEDIDA
 * Contratos de datos compartidos entre el frontend y las APIs, más
 * helpers puros para interpretar el conteo en paquetes.
 */

export type TipoUnidad = "CONTEO" | "PESO" | "LONGITUD" | "VOLUMEN" | "OTRO" | "PAQUETE";

export const TIPOS_UNIDAD: TipoUnidad[] = [
  "CONTEO",
  "PESO",
  "LONGITUD",
  "VOLUMEN",
  "OTRO",
  "PAQUETE",
];

/** Unidades base: la magnitud en la que vive el stock (PZA, KG, M...) */
export const TIPOS_UNIDAD_BASE: TipoUnidad[] = [
  "CONTEO",
  "PESO",
  "LONGITUD",
  "VOLUMEN",
  "OTRO",
];

/** Una fila del catálogo de unidades de medida */
export interface Unidad {
  id: string;
  codigo: string;
  nombre: string;
  nombreEn: string;
  tipo: TipoUnidad;
  /** Código de la unidad base que agrupa (solo PAQUETE) */
  unidadBase: string | null;
  notas: string | null;
  activo: boolean;
  esSistema: boolean;
  createdAt: string;
  /** Agregado calculado: cuántas unidades de paquete dependen de esta base */
  usadaComoBase: number;
  /** Agregado calculado: cuántos productos usan esta unidad
   *  (como base de stock o como empaque de conteo) */
  productosAsociados: number;
}

export interface CuerpoUnidad {
  codigo: string;
  nombre: string;
  nombreEn?: string;
  tipo: TipoUnidad;
  unidadBase?: string | null;
  notas?: string;
}

// ============================================================
// CONTEO EN PAQUETES (captura alternativa)
// ============================================================

/**
 * Una parte del detalle de conteo de un movimiento: «2 CJA × 12» se
 * guarda como { unidad: "CJA", nombre: "Caja", factor: 12, cantidad: 2 }.
 * Viaja como JSON en Movimiento.conteoDetalle (snapshot del ledger).
 */
export interface ParteConteo {
  unidad: string; // código (CJA)
  nombre: string; // nombre visible al momento del registro (Caja)
  factor: number; // unidades base por paquete (12); 1 en la base
  cantidad: number; // paquetes (o unidades sueltas de la base)
}

/** Estado del widget de captura (entradas crudas de los inputs) */
export interface EstadoConteo {
  /** código de la unidad de conteo seleccionada (=== unidad base → directo) */
  unidad: string;
  /** paquetes completos capturados (modo paquete) */
  paquetes: string;
  /** piezas/unidades sueltas (modo paquete) o cantidad directa (modo base) */
  sueltas: string;
}

/**
 * Configuración de empaque de conteo de un producto: la cantidad que
 * lleva cada paquete VARÍA POR PRODUCTO y se configura al registrarlo
 * (p. ej. 80101-06129 → 1 PAQ = 10 PZA). null = captura directa en la
 * unidad base.
 */
export interface EmpaqueProductoConteo {
  /** unidad base del producto (PZA, KG...) */
  unidad: string;
  /** código de la unidad de paquete configurada (PAQ, CJA...); null = sin empaque */
  unidadPaquete?: string | null;
  /** unidades base que contiene cada paquete; null = sin empaque */
  contenidoPaquete?: number | null;
}

/**
 * Estado inicial del widget de captura. Si el producto tiene empaque
 * configurado, arranca en modo paquetes (la forma natural de contar en
 * fábrica); si no, en captura directa sobre su unidad base.
 */
export function estadoConteoInicial(producto?: EmpaqueProductoConteo | null): EstadoConteo {
  const unidadInicial =
    producto?.unidadPaquete && (producto.contenidoPaquete ?? 0) > 0
      ? producto.unidadPaquete
      : (producto?.unidad ?? "PZA");
  return { unidad: unidadInicial, paquetes: "", sueltas: "" };
}

/** Formatea un número sin ceros ni decimales innecesarios (2 → "2", 2.5 → "2.5") */
export function formatearNumeroConteo(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const redondeado = Math.round(n * 1e6) / 1e6;
  return String(redondeado);
}

/**
 * Texto legible del detalle de conteo:
 * [{CJA×12, 2}, {PZA×1, 3}] → "2 CJA ×12 + 3 PZA"
 * Devuelve null si no hay partes (captura directa).
 */
export function textoConteo(partes: ParteConteo[] | null | undefined): string | null {
  if (!partes || partes.length === 0) return null;
  return partes
    .filter((p) => p.cantidad > 0)
    .map(
      (p) =>
        `${formatearNumeroConteo(p.cantidad)} ${p.unidad}${p.factor !== 1 ? ` ×${formatearNumeroConteo(p.factor)}` : ""}`,
    )
    .join(" + ");
}

/** Interpreta el JSON de conteoDetalle de forma defensiva (null si es inválido) */
export function parsearConteo(json: string | null | undefined): ParteConteo[] | null {
  if (!json) return null;
  try {
    const crudo = JSON.parse(json);
    if (!Array.isArray(crudo)) return null;
    const partes = crudo
      .filter(
        (p): p is ParteConteo =>
          !!p &&
          typeof p.unidad === "string" &&
          typeof p.nombre === "string" &&
          Number.isFinite(Number(p.factor)) &&
          Number.isFinite(Number(p.cantidad)),
      )
      .map((p) => ({ ...p, factor: Number(p.factor), cantidad: Number(p.cantidad) }));
    return partes.length > 0 ? partes : null;
  } catch {
    return null;
  }
}
