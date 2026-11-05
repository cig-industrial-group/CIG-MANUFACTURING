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
 * NÚCLEO DE INTEGRIDAD NUMÉRICA (remediación Fase 1)
 * ==================================================
 *
 * ÚNICA fuente de aritmética para cantidades de inventario, costos y
 * medidas del sistema. Las columnas persisten como TEXTO decimal exacto
 * (String en Prisma): SQLite no tiene DECIMAL nativo y el tipo Decimal de
 * Prisma sobre SQLite persiste REAL/float64 (verificado empíricamente:
 * increment de 0.1 ×3 → 0.30000000000000004, typeof = 'real'), lo que
 * viola la política de integridad numérica.
 *
 * Reglas:
 *   · Prohibido Float/Double para cantidades, costos o medidas.
 *   · Toda entrada se valida con `aDecimal` (fail-closed: valor inválido
 *     → null → el llamador responde con su código de negocio).
 *   · Toda escritura a BD se hace con `texto(...)` (forma canónica).
 *   · Toda comparación y suma es EXACTA (sin épsilon de tolerancia).
 *
 * Este módulo es SOLO SERVIDOR (importa el runtime de Prisma): los
 * componentes de cliente NO deben importarlo; usen los helpers
 * frontend-safe de @/modulos/unidades/tipos.
 *
 * Referencias: OWASP ASVS 5.4.1 (integridad de datos en tránsito/reposo),
 * NIST SP 800-53 SI-10 (validación de información), ISO 27001 A.8.28
 * (codificación segura).
 */
import { Prisma } from "@prisma/client";

/** Decimal de precisión arbitraria (decimal.js, ya incluido en el runtime de Prisma: cero dependencias nuevas). */
export type Decimal = Prisma.Decimal;

/** Escala máxima aceptada en entradas: 6 decimales (micras, ml, centavos por unidad). */
export const ESCALA_MAXIMA = 6;

/** Magnitud máxima de la parte entera: 15 dígitos (muy por encima de cualquier magnitud de planta). */
export const DIGITOS_ENTEROS_MAXIMOS = 15;

/** Patrón del texto decimal canónico aceptado como entrada.
 *  NOTA: en la interpolación, `${ESCALA_MAXIMA}}` produce "6}" — la primera
 *  llave cierra la interpolación y la segunda cierra el cuantificador {1,6}. */
const PATRON_DECIMAL = new RegExp(
  `^-?\\d{1,${DIGITOS_ENTEROS_MAXIMOS}}(\\.\\d{1,${ESCALA_MAXIMA}})?$`,
);

/** Decimal cero: constante para acumuladores y comparaciones. */
export const CERO: Decimal = new Prisma.Decimal(0);

/** ¿Es un texto decimal válido dentro de la escala y magnitud permitidas? */
export function esDecimalTextual(valor: string): boolean {
  return PATRON_DECIMAL.test(valor.trim());
}

/**
 * Convierte una entrada (texto o número) a Decimal EXACTO.
 *
 * Acepta números por compatibilidad con clientes que aún envían JSON
 * numérico: decimal.js los interpreta vía su representación textual corta
 * (String(0.1) = "0.1"), sin propagar artefactos binarios. Un número que
 * YA traiga artefactos (0.30000000000000004) excede la escala y se
 * rechaza: nunca se persiste corrupción heredada.
 *
 * Devuelve null ante cualquier entrada inválida (el llamador decide el
 * código de error de negocio). Fail-closed.
 */
export function aDecimal(valor: unknown): Decimal | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return null;
    const textoValor = String(valor);
    return PATRON_DECIMAL.test(textoValor) ? new Prisma.Decimal(textoValor) : null;
  }
  if (typeof valor === "string") {
    const limpio = valor.trim();
    if (!limpio || !PATRON_DECIMAL.test(limpio)) return null;
    try {
      return new Prisma.Decimal(limpio);
    } catch {
      return null;
    }
  }
  if (valor instanceof Prisma.Decimal) {
    return PATRON_DECIMAL.test(valor.toString()) ? valor : null;
  }
  return null;
}

/**
 * Interpreta un valor persistido en la base (texto decimal) como Decimal.
 * Es la vía de lectura estándar tras cada findMany/findUnique. Un valor
 * corrupto (escrito fuera del sistema) lanza Error: es un incidente de
 * integridad que NO se enmascara (defensa en profundidad).
 */
export function desdeBD(valor: string, campo: string): Decimal {
  try {
    return new Prisma.Decimal(valor);
  } catch {
    throw new Error(`VALOR_DECIMAL_CORRUPTO:${campo}`);
  }
}

/** Serializa a texto canónico para persistir o responder por API ("2.50" → "2.5"). */
export function texto(d: Decimal | string): string {
  return (typeof d === "string" ? new Prisma.Decimal(d) : d).toString();
}

/** Suma exacta de una lista (ignora nulos; útil para agregados de reportes). */
export function sumar(valores: Array<Decimal | string | null | undefined>): Decimal {
  return valores.reduce<Decimal>(
    (acumulado, v) => (v === null || v === undefined ? acumulado : acumulado.plus(texto(v))),
    CERO,
  );
}

/** Multiplicación exacta (p. ej. cantidad × costo unitario para valorar inventario). */
export function multiplicar(a: Decimal | string, b: Decimal | string): Decimal {
  return new Prisma.Decimal(texto(a)).times(texto(b));
}
