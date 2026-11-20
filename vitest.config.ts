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
 * CONFIGURACIÓN DE VITEST (TASK-STR-002 — Integridad Numérica)
 * ============================================================
 *
 * · Entorno «node»: las pruebas del núcleo numérico son lógica pura en
 *   memoria. Prisma.Decimal (decimal.js, incluido en el runtime de Prisma)
 *   no abre conexiones: las pruebas quedan aisladas de la base de datos.
 *
 * · Cobertura medida con @vitest/coverage-v8 sobre src/lib/numerico.ts,
 *   con umbral de líneas ≥ 90 % exigido por la especificación de la tarea:
 *   la suite NO puede aprobar si la cobertura regresa.
 *
 * · TASK-STR-012 (RF-C2): se AÑADE src/modulos/ajustes/servicios/svg.ts
 *   al informe de cobertura (el módulo PURO del saneador, RF-C1). Sin
 *   este añadido, `bun run test` mediría únicamente numerico.ts y la
 *   cobertura del saneador —motivo de esta tarea— quedaría fuera del
 *   informe permanente. El umbral de líneas ≥ 90 % NO se baja: ahora
 *   aplica también al saneador (se endurece, no se relaja).
 *
 * · Determinismo: sin reloj, sin aleatoriedad, sin red, sin E/S.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/lib/numerico.ts', 'src/modulos/ajustes/servicios/svg.ts'],
      thresholds: {
        lines: 90,
      },
    },
  },
});
