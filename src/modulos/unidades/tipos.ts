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
 * guarda como { unidad: "CJA", nombre: "Caja", factor: "12", cantidad: "2" }.
 * Viaja como JSON en Movimiento.conteoDetalle (snapshot del ledger).
 * factor/cantidad son TEXTO DECIMAL EXACTO (remediación Fase 1: nunca
 * float — ver src/lib/numerico.ts en el servidor).
 */
export interface ParteConteo {
  unidad: string; // código (CJA)
  nombre: string; // nombre visible al momento del registro (Caja)
  factor: string; // unidades base por paquete ("12"); "1" en la base
  cantidad: string; // paquetes (o unidades sueltas de la base); decimal exacto
}

/** Patrón decimal frontend-safe (espejo del validador del servidor:
 *  máximo 6 decimales, 15 dígitos enteros). El servidor SIEMPRE revalida. */
const PATRON_DECIMAL = /^-?\d{1,15}(\.\d{1,6})?$/;

/** ¿El texto es un decimal válido (máx. 6 decimales)? */
export function esDecimalTextoValido(valor: string): boolean {
  return PATRON_DECIMAL.test(valor.trim());
}

/** ¿El texto es un decimal estrictamente mayor que cero? */
export function esDecimalPositivo(valor: string | null | undefined): boolean {
  if (valor === null || valor === undefined) return false;
  const texto = valor.trim();
  if (!PATRON_DECIMAL.test(texto)) return false;
  return texto !== "0" && texto !== "-0" && !texto.startsWith("-");
}

/** Normaliza número (legado) o texto a texto decimal canónico ("2.50" → "2.5"); null si es inválido */
export function aTextoDecimal(v: unknown): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    v = String(v);
  }
  if (typeof v !== "string") return null;
  const texto = v.trim();
  if (!PATRON_DECIMAL.test(texto)) return null;
  const canonico = texto.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return canonico === "-0" ? "0" : canonico;
}

// ============================================================
// ARITMÉTICA DECIMAL EXACTA (frontend, sin dependencias)
// ============================================================
// Los agregados que el frontend calcula para PRESENTAR (totales de
// KPI, valoraciones) se hacen con aritmética BigInt escalada por 10^6:
// exacta para toda la escala aceptada por el dominio (máx. 6 decimales)
// y sin introducir float64 en el cliente. El servidor SIEMPRE recalcula
// de forma autoritativa con Decimal (@/lib/numerico).

/** Factor de escala BigInt: 10^6 (máxima escala aceptada del dominio).
 *  Se construye con BigInt() para no exigir target ES2020 en tsconfig. */
const FACTOR_ESCALA = BigInt(1000000);
const CERO_ESCALA = BigInt(0);
const DOS = BigInt(2);

/** Convierte un texto decimal (escala ≤ 6) a BigInt escalado por 10^6; null si es inválido. */
function aEscalado(texto: string): bigint | null {
  const limpio = texto.trim();
  if (!/^-?\d{1,15}(\.\d{1,6})?$/.test(limpio)) return null;
  const negativo = limpio.startsWith("-");
  const [enteros, decimales = ""] = limpio.replace("-", "").split(".");
  const valor = BigInt(enteros || "0") * FACTOR_ESCALA + BigInt(decimales.padEnd(6, "0"));
  return negativo ? -valor : valor;
}

/** BigInt escalado por 10^6 → texto decimal canónico. */
function desdeEscalado(escalado: bigint): string {
  const negativo = escalado < CERO_ESCALA;
  const absoluto = negativo ? -escalado : escalado;
  const enteros = absoluto / FACTOR_ESCALA;
  const decimales = (absoluto % FACTOR_ESCALA).toString().padStart(6, "0").replace(/0+$/, "");
  return `${negativo ? "-" : ""}${enteros.toString()}${decimales ? "." + decimales : ""}`;
}

/** Suma EXACTA de textos decimales (ignora nulos/vacíos/inválidos). */
export function sumarDecimales(valores: Array<string | number | null | undefined>): string {
  let acumulado = CERO_ESCALA;
  for (const v of valores) {
    if (v === null || v === undefined || v === "") continue;
    const escalado = aEscalado(String(v));
    if (escalado === null) continue;
    acumulado += escalado;
  }
  return desdeEscalado(acumulado);
}

/** Multiplicación EXACTA (redondeada a 6 decimales, half-up) de dos textos decimales. */
export function multiplicarDecimales(a: string | number, b: string | number): string {
  const ea = aEscalado(String(a));
  const eb = aEscalado(String(b));
  if (ea === null || eb === null) return "0";
  // (a×10^6)×(b×10^6) = ab×10^12 → reescalar a 10^6 con redondeo half-up
  const producto = ea * eb;
  const mitad = FACTOR_ESCALA / DOS;
  const redondeado =
    producto >= CERO_ESCALA
      ? (producto + mitad) / FACTOR_ESCALA
      : -((-producto + mitad) / FACTOR_ESCALA);
  return desdeEscalado(redondeado);
}

/** Compara dos textos decimales: -1 si a < b, 0 si iguales, 1 si a > b (inválidos → 0). */
export function compararDecimales(a: string | number, b: string | number): number {
  const ea = aEscalado(String(a));
  const eb = aEscalado(String(b));
  if (ea === null || eb === null) return 0;
  return ea < eb ? -1 : ea > eb ? 1 : 0;
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
  /** unidades base que contiene cada paquete (texto decimal exacto); null = sin empaque */
  contenidoPaquete?: string | null;
}

/**
 * Estado inicial del widget de captura. Si el producto tiene empaque
 * configurado, arranca en modo paquetes (la forma natural de contar en
 * fábrica); si no, en captura directa sobre su unidad base.
 */
export function estadoConteoInicial(producto?: EmpaqueProductoConteo | null): EstadoConteo {
  const unidadInicial =
    producto?.unidadPaquete && esDecimalPositivo(producto.contenidoPaquete)
      ? producto.unidadPaquete
      : (producto?.unidad ?? "PZA");
  return { unidad: unidadInicial, paquetes: "", sueltas: "" };
}

/** Formatea un número o texto decimal sin ceros ni decimales innecesarios (2 → "2", 2.5 → "2.5") */
export function formatearNumeroConteo(n: number | string): string {
  return aTextoDecimal(n) ?? "0";
}

/**
 * Texto legible del detalle de conteo:
 * [{CJA×12, 2}, {PZA×1, 3}] → "2 CJA ×12 + 3 PZA"
 * Devuelve null si no hay partes (captura directa).
 */
export function textoConteo(partes: ParteConteo[] | null | undefined): string | null {
  if (!partes || partes.length === 0) return null;
  return partes
    .filter((p) => esDecimalPositivo(p.cantidad))
    .map(
      (p) =>
        `${formatearNumeroConteo(p.cantidad)} ${p.unidad}${p.factor !== "1" ? ` ×${formatearNumeroConteo(p.factor)}` : ""}`,
    )
    .join(" + ");
}

/** Interpreta el JSON de conteoDetalle de forma defensiva (null si es inválido).
 *  Normaliza snapshots legados (números) a texto decimal canónico. */
export function parsearConteo(json: string | null | undefined): ParteConteo[] | null {
  if (!json) return null;
  try {
    const crudo = JSON.parse(json);
    if (!Array.isArray(crudo)) return null;
    const partes = crudo
      .map((p): ParteConteo | null => {
        if (!p || typeof p.unidad !== "string" || typeof p.nombre !== "string") return null;
        const factor = aTextoDecimal(p.factor);
        const cantidad = aTextoDecimal(p.cantidad);
        if (factor === null || cantidad === null) return null;
        return { unidad: p.unidad, nombre: p.nombre, factor, cantidad };
      })
      .filter((p): p is ParteConteo => p !== null);
    return partes.length > 0 ? partes : null;
  } catch {
    return null;
  }
}
