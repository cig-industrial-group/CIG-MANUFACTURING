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
 * PRUEBAS UNITARIAS DEL NÚCLEO DE INTEGRIDAD NUMÉRICA (TASK-STR-002)
 * ====================================================================
 *
 * Sujeto de prueba: src/lib/numerico.ts — la ÚNICA fuente de aritmética
 * para cantidades, costos y medidas del sistema (decimales como texto
 * exacto, ver ADR en prisma/schema.prisma).
 *
 * Cuatro frentes, según la especificación de la tarea:
 *   1. Camino feliz (exactitud): las operaciones válidas retornan el
 *      string exacto, sin artefactos de IEEE-754 (0.1 + 0.2 = "0.3").
 *   2. Fail-closed: las entradas inválidas ("abc", "0.1.2", null,
 *      undefined, NaN, notación científica) se rechazan de forma
 *      predecible — null en aDecimal, false en esDecimalTextual, error
 *      explícito en desdeBD — y NUNCA se devuelve un número corrupto
 *      ni NaN.
 *   3. Comparación exacta: sin épsilon de tolerancia; la igualdad es
 *      por valor decimal normalizado ("1.00" es 1).
 *   4. Valores extremos: ceros ("0", "0.00"), negativos válidos y los
 *      límites de escala (6 decimales) y magnitud (15 dígitos enteros).
 *
 * Aislamiento: ninguna prueba toca la base de datos ni instancia
 * PrismaClient — Prisma.Decimal es aritmética exacta en memoria.
 *
 * Determinismo: sin aleatoriedad ni dependencia del reloj del sistema.
 *
 * NOTA DE COBERTURA: la rama `catch` de la vía de cadena en `aDecimal`
 * es código defensivo inalcanzable — toda cadena que supera
 * PATRON_DECIMAL es construible por decimal.js —, por lo que la
 * cobertura de líneas del archivo se mantiene ≥ 90 % (umbral exigido en
 * vitest.config.ts) sin simular fallos internos del constructor.
 */
import { describe, expect, it } from 'vitest';

import {
  aDecimal,
  CERO,
  desdeBD,
  DIGITOS_ENTEROS_MAXIMOS,
  esDecimalTextual,
  esMayorQueCero,
  ESCALA_MAXIMA,
  multiplicar,
  sumar,
  texto,
} from '../numerico';
import type { Decimal } from '../numerico';

/**
 * Convierte una entrada de PRUEBA a Decimal exigiendo que sea válida.
 * Si el banco de pruebas contiene una entrada inválida, la prueba falla
 * de inmediato: las precondiciones nunca se dan por supuestas
 * (fail-closed también en el propio banco de pruebas).
 */
function aDecimalValido(entrada: unknown): Decimal {
  const convertido = aDecimal(entrada);
  if (convertido === null) {
    throw new Error(`Entrada de prueba inesperadamente inválida: ${String(entrada)}`);
  }
  return convertido;
}

describe('Integridad Numérica (Fallo Seguro)', () => {
  describe('constantes del contrato numérico', () => {
    it('declara la escala máxima (6 decimales) y la magnitud máxima (15 dígitos enteros)', () => {
      expect(ESCALA_MAXIMA).toBe(6);
      expect(DIGITOS_ENTEROS_MAXIMOS).toBe(15);
    });

    it('CERO es exactamente el cero: neutro en la suma y no positivo', () => {
      expect(texto(CERO)).toBe('0');
      expect(CERO.eq(0)).toBe(true);
      expect(esMayorQueCero(CERO)).toBe(false); // trampa documentada de isPositive()
      expect(texto(sumar([CERO]))).toBe('0');
    });
  });

  describe('aDecimal — conversión fail-closed', () => {
    describe('camino feliz', () => {
      it('convierte cadenas decimales exactas: enteras, fraccionarias y negativas', () => {
        expect(texto(aDecimalValido('0.1'))).toBe('0.1');
        expect(texto(aDecimalValido('123'))).toBe('123');
        expect(texto(aDecimalValido('-123.456'))).toBe('-123.456');
      });

      it('recorta espacios circundantes antes de validar', () => {
        expect(texto(aDecimalValido('  2.5  '))).toBe('2.5');
      });

      it('acepta números finitos vía su representación textual corta', () => {
        // String(0.1) === "0.1": el número no propaga artefactos binarios
        expect(texto(aDecimalValido(0.1))).toBe('0.1');
        expect(texto(aDecimalValido(-5))).toBe('-5');
        expect(texto(aDecimalValido(0))).toBe('0');
      });

      it('canoniza el cero negativo de IEEE-754 a cero exacto', () => {
        // String(-0) === "0": el signo del cero binario jamás se persiste
        expect(texto(aDecimalValido(-0))).toBe('0');
      });

      it('devuelve la MISMA instancia cuando un Decimal válido reingresa', () => {
        const instancia = aDecimalValido('1.5');
        expect(aDecimal(instancia)).toBe(instancia); // identidad, no copia
      });
    });

    describe('rechazo de entradas inválidas (fail-closed)', () => {
      it('devuelve null ante cadenas no numéricas o vacías', () => {
        expect(aDecimal('abc')).toBeNull();
        expect(aDecimal('')).toBeNull();
        expect(aDecimal('   ')).toBeNull(); // tras recortar queda vacío
      });

      it('devuelve null ante cadenas con formato decimal corrupto', () => {
        const corruptas = ['0.1.2', '1,5', '+1', '.5', '5.', '--1', '0x10'];
        for (const corrupta of corruptas) {
          expect(aDecimal(corrupta)).toBeNull();
        }
      });

      it('rechaza la notación científica en cualquier variante', () => {
        expect(aDecimal('1e3')).toBeNull();
        expect(aDecimal('1E3')).toBeNull();
        expect(aDecimal('1e-3')).toBeNull();
        expect(aDecimal('1.5e2')).toBeNull();
      });

      it('nunca propaga corrupción heredada de punto flotante', () => {
        // 0.1 + 0.2 en IEEE-754 produce 0.30000000000000004: el número YA
        // llega corrupto (17 decimales), excede la escala y se rechaza.
        expect(aDecimal(0.30000000000000004)).toBeNull();
        // Una instancia Decimal fuera de escala tampoco se acepta.
        const instanciaCorrupta = desdeBD('0.30000000000000004', 'sondeoDeEscala');
        expect(aDecimal(instanciaCorrupta)).toBeNull();
      });

      it('devuelve null ante tipos no soportados (nunca lanza, nunca corrompe)', () => {
        expect(aDecimal(null)).toBeNull();
        expect(aDecimal(undefined)).toBeNull();
        expect(aDecimal(NaN)).toBeNull();
        expect(aDecimal(Infinity)).toBeNull();
        expect(aDecimal(-Infinity)).toBeNull();
        expect(aDecimal(true)).toBeNull();
        expect(aDecimal(BigInt(10))).toBeNull();
        expect(aDecimal({})).toBeNull();
        expect(aDecimal([])).toBeNull();
      });
    });

    describe('límites de escala y magnitud', () => {
      it('acepta exactamente hasta 6 decimales', () => {
        expect(texto(aDecimalValido('0.000001'))).toBe('0.000001'); // límite exacto
        expect(texto(aDecimalValido('1.123456'))).toBe('1.123456');
      });

      it('rechaza el séptimo decimal', () => {
        expect(aDecimal('0.0000001')).toBeNull();
        expect(aDecimal('1.1234567')).toBeNull();
      });

      it('acepta hasta 15 dígitos enteros y rechaza el dieciseisavo', () => {
        expect(texto(aDecimalValido('999999999999999'))).toBe('999999999999999'); // 15 dígitos
        expect(aDecimal('9999999999999999')).toBeNull(); // 16 dígitos
        // Límite completo: 15 enteros + 6 decimales
        expect(texto(aDecimalValido('999999999999999.999999'))).toBe(
          '999999999999999.999999',
        );
      });

      it('aplica los mismos límites a la vía numérica', () => {
        // String(1e14) = "100000000000000" (15 dígitos): válido
        expect(texto(aDecimalValido(1e14))).toBe('100000000000000');
        // String(1e15) = "1000000000000000" (16 dígitos): rechazado
        expect(aDecimal(1e15)).toBeNull();
        // String(1e-7) = "1e-7": notación científica, rechazado
        expect(aDecimal(1e-7)).toBeNull();
        // String(0.000001) = "0.000001" (6 decimales): válido
        expect(texto(aDecimalValido(0.000001))).toBe('0.000001');
      });
    });
  });

  describe('esDecimalTextual — validación de patrón', () => {
    it('acepta decimales bien formados: enteros, fraccionarios y negativos', () => {
      const validos = ['0', '123', '-123', '0.1', '0.000001', '-999999999999999.999999'];
      for (const valido of validos) {
        expect(esDecimalTextual(valido)).toBe(true);
      }
    });

    it('recorta espacios antes de evaluar el patrón', () => {
      expect(esDecimalTextual('  2.5  ')).toBe(true);
      expect(esDecimalTextual(' ')).toBe(false); // tras recortar queda vacío
    });

    it('rechaza textos corruptos y formatos no soportados', () => {
      const invalidos = [
        'abc',
        '',
        '0.1.2',
        '1e3',
        '1E-3',
        '+1',
        '.5',
        '5.',
        '1,5',
        '--1',
        '0x10',
        'Infinity',
        'NaN',
      ];
      for (const invalido of invalidos) {
        expect(esDecimalTextual(invalido)).toBe(false);
      }
    });

    it('aplica los mismos límites de escala y magnitud que aDecimal', () => {
      expect(esDecimalTextual('0.000001')).toBe(true);
      expect(esDecimalTextual('0.0000001')).toBe(false);
      expect(esDecimalTextual('999999999999999')).toBe(true);
      expect(esDecimalTextual('9999999999999999')).toBe(false);
    });
  });

  describe('desdeBD — lectura desde la base de datos', () => {
    it('interpreta el texto persistido como Decimal exacto', () => {
      expect(texto(desdeBD('2.50', 'stockMinimo'))).toBe('2.5');
      expect(texto(desdeBD('0.1', 'cantidad'))).toBe('0.1');
      expect(texto(desdeBD('-3.5', 'costoUnitario'))).toBe('-3.5');
    });

    it('lanza el error de integridad específico ante valor corrupto', () => {
      // Un valor corrupto es un INCIDENTE: no se enmascara con null.
      expect(() => desdeBD('abc', 'cantidad')).toThrowError(/^VALOR_DECIMAL_CORRUPTO:cantidad$/);
      expect(() => desdeBD('', 'costoUnitario')).toThrowError(
        /^VALOR_DECIMAL_CORRUPTO:costoUnitario$/,
      );
      expect(() => desdeBD('0.1.2', 'stockMinimo')).toThrowError(
        /^VALOR_DECIMAL_CORRUPTO:stockMinimo$/,
      );
    });

    it('incluye el nombre del campo afectado en el mensaje de error', () => {
      let errorCapturado: Error | null = null;
      try {
        desdeBD('abc', 'cantidadDespues');
      } catch (error) {
        errorCapturado = error as Error;
      }
      if (errorCapturado === null) {
        throw new Error('desdeBD debió lanzar ante un valor corrupto');
      }
      expect(errorCapturado.message).toBe('VALOR_DECIMAL_CORRUPTO:cantidadDespues');
    });
  });

  describe('texto — serialización canónica', () => {
    it('elimina los ceros decimales insignificantes', () => {
      expect(texto('2.50')).toBe('2.5');
      expect(texto('0.000')).toBe('0');
      expect(texto('-0.00')).toBe('0'); // el cero con signo se canoniza a «0»
    });

    it('preserva el valor exacto dentro de la escala soportada', () => {
      expect(texto('0.000001')).toBe('0.000001');
      expect(texto('123456789012345.123456')).toBe('123456789012345.123456');
      expect(texto('-0.01')).toBe('-0.01');
    });

    it('acepta cadenas e instancias Decimal con idéntico resultado', () => {
      const instancia = desdeBD('2.50', 'stockMinimo');
      expect(texto(instancia)).toBe('2.5');
      expect(texto('2.50')).toBe('2.5');
    });
  });

  describe('esMayorQueCero — comparación estricta (> 0, sin tolerancias)', () => {
    it('NO acepta el cero: evita la trampa documentada de isPositive()', () => {
      // decimal.js: isPositive() incluye al cero («no negativo»).
      // esMayorQueCero exige ESTRICTAMENTE > 0.
      expect(esMayorQueCero(CERO)).toBe(false);
      expect(esMayorQueCero(aDecimalValido('0'))).toBe(false);
      expect(esMayorQueCero(aDecimalValido('0.00'))).toBe(false);
    });

    it('acepta solo valores estrictamente positivos', () => {
      expect(esMayorQueCero(aDecimalValido('0.01'))).toBe(true);
      expect(esMayorQueCero(aDecimalValido('1.00'))).toBe(true); // normalizado: sigue siendo > 0
      expect(esMayorQueCero(aDecimalValido('999999999999999.999999'))).toBe(true);
    });

    it('rechaza negativos, incluso en el límite de magnitud', () => {
      expect(esMayorQueCero(aDecimalValido('-0.01'))).toBe(false);
      expect(esMayorQueCero(aDecimalValido('-999999999999999'))).toBe(false);
    });

    it('rechaza nulos e indefinidos sin lanzar', () => {
      expect(esMayorQueCero(null)).toBe(false);
      expect(esMayorQueCero(undefined)).toBe(false);
    });
  });

  describe('sumar — aritmética exacta', () => {
    it('suma decimales exactos donde IEEE-754 falla', () => {
      expect(texto(sumar(['0.1', '0.2']))).toBe('0.3'); // JS: 0.30000000000000004
      expect(texto(sumar(['1.1', '2.2']))).toBe('3.3'); // JS: 3.3000000000000003
      expect(texto(sumar(['0.1', '0.2', '0.3']))).toBe('0.6');
    });

    it('acumula sin desviación: diez veces 0.1 es exactamente 1', () => {
      const decimas = Array<string>(10).fill('0.1');
      expect(texto(sumar(decimas))).toBe('1');
    });

    it('compara igualdad exacta por valor, sin épsilon de tolerancia', () => {
      // "1.00" y "1" son el mismo número: la igualdad es de VALOR, no de texto
      expect(aDecimalValido('1.00').eq(aDecimalValido('1'))).toBe(true);
      // La suma exacta nunca produce "0.30000000000000004"
      expect(sumar(['0.1', '0.2']).eq(aDecimalValido('0.3'))).toBe(true);
    });

    it('ignora nulos e indefinidos (agregados tolerantes a lecturas parciales)', () => {
      expect(texto(sumar(['1', null, undefined, '2']))).toBe('3');
      expect(texto(sumar([null, undefined]))).toBe('0');
    });

    it('devuelve el acumulador CERO exacto ante lista vacía', () => {
      expect(texto(sumar([]))).toBe('0');
      expect(sumar([]).eq(CERO)).toBe(true);
    });

    it('admite mezcla de cadenas e instancias Decimal', () => {
      const instancia = desdeBD('0.1', 'cantidad');
      expect(texto(sumar([instancia, '0.2']))).toBe('0.3');
    });

    it('suma negativos con signo exacto', () => {
      expect(texto(sumar(['-1.5', '0.5']))).toBe('-1');
      expect(texto(sumar(['-0.1', '-0.2']))).toBe('-0.3');
    });
  });

  describe('multiplicar — aritmética exacta', () => {
    it('multiplica sin los artefactos de IEEE-754', () => {
      expect(texto(multiplicar('0.1', '0.2'))).toBe('0.02');
      expect(texto(multiplicar('1.1', '3'))).toBe('3.3'); // JS: 3.3000000000000003
      expect(texto(multiplicar('19.9', '100'))).toBe('1990'); // JS: 1989.9999999999998
    });

    it('valoración de inventario: cantidad × costo unitario, exacto', () => {
      // 10.25 unidades × 3.5 por unidad = 35.875 exacto
      expect(texto(multiplicar('10.25', '3.5'))).toBe('35.875');
    });

    it('respeta las fronteras del cero y del signo', () => {
      expect(texto(multiplicar('0', '99.999999'))).toBe('0');
      expect(texto(multiplicar('-2.5', '4'))).toBe('-10');
      expect(texto(multiplicar('-2.5', '-4'))).toBe('10');
    });

    it('falla ruidosamente ante operandos no decimales (nunca devuelve NaN)', () => {
      // multiplicar confía en operandos ya validados por aDecimal en la
      // frontera; ante basura lanza el error de decimal.js — jamás
      // retorna un número corrupto.
      expect(() => multiplicar('abc', '2')).toThrowError();
      expect(() => multiplicar('0.1.2', '2')).toThrowError();
    });
  });
});
