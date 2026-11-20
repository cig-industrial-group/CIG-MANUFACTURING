-- ============================================================================
-- NUMERIC NATIVO PARA CAMPOS NUMÉRICOS — ADR-010 (v2.3.0)
-- ----------------------------------------------------------------------------
-- Migración total y directa de las columnas de texto decimal a NUMERIC:
-- el dominio numérico pasa a imponerlo el MOTOR, no solo la aplicación
-- (NIST SP 800-53 SI-10/SC-28; ISO/IEC 27001 A.8.15). Fin de la era
-- «Decimales como String/TEXT».
--
-- Estrategia: ALTER COLUMN ... TYPE ... USING (conversión EN SITIO,
-- transaccional, preservando el valor de cada fila). NÓTESE que el diff
-- automático de Prisma genera DROP COLUMN + ADD COLUMN — que PIERDE los
-- datos — por lo que esta migración se redacta a mano con la conversión
-- USING correcta; `prisma migrate diff` no aplica USING.
--
-- Detalle operativo (PostgreSQL): una columna con DEFAULT de texto no
-- puede convertir su tipo automáticamente («default for column ... cannot
-- be cast automatically», SQLSTATE 42804). El orden correcto es:
-- DROP DEFAULT → ALTER TYPE USING → SET DEFAULT numérico. Ese orden se
-- aplica aquí para Stock.cantidad y Producto.stockMinimo.
--
-- Precisión (ver docs/adr/ADR-010-migracion-directa-a-numeric.md):
--   · NUMERIC(15,6) para cantidades y medidas: la frontera que
--     src/lib/numerico.ts ya imponía (15 dígitos enteros, 6 decimales).
--   · NUMERIC(15,4) para costoUnitario: magnitud monetaria, práctica
--     contable (subcentavos).
--   · Float/Real PROHIBIDOS para cantidades, costos o medidas (invariante).
--
-- Entorno greenfield: se aplica antes de la primera siembra; en bases con
-- datos, USING cantidad::DECIMAL(15,6) convierte cada texto decimal exacto
-- a NUMERIC sin pérdida (un valor no numérico aborta la transacción: el
-- incidente se detecta aquí, no en producción a mitad de lectura).
-- ============================================================================

-- AlterTable
ALTER TABLE "Producto" ALTER COLUMN "contenidoPaquete" TYPE DECIMAL(15,6) USING "contenidoPaquete"::DECIMAL(15,6);
ALTER TABLE "Producto" ALTER COLUMN "stockMinimo" DROP DEFAULT;
ALTER TABLE "Producto" ALTER COLUMN "stockMinimo" TYPE DECIMAL(15,6) USING "stockMinimo"::DECIMAL(15,6);
ALTER TABLE "Producto" ALTER COLUMN "stockMinimo" SET DEFAULT 0;
ALTER TABLE "Producto" ALTER COLUMN "costoUnitario" TYPE DECIMAL(15,4) USING "costoUnitario"::DECIMAL(15,4);

-- AlterTable
ALTER TABLE "Stock" ALTER COLUMN "cantidad" DROP DEFAULT;
ALTER TABLE "Stock" ALTER COLUMN "cantidad" TYPE DECIMAL(15,6) USING "cantidad"::DECIMAL(15,6);
ALTER TABLE "Stock" ALTER COLUMN "cantidad" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Movimiento" ALTER COLUMN "cantidad" TYPE DECIMAL(15,6) USING "cantidad"::DECIMAL(15,6);
ALTER TABLE "Movimiento" ALTER COLUMN "cantidadDespues" TYPE DECIMAL(15,6) USING "cantidadDespues"::DECIMAL(15,6);

-- AlterTable
ALTER TABLE "RegistroScrap" ALTER COLUMN "cantidad" TYPE DECIMAL(15,6) USING "cantidad"::DECIMAL(15,6);

-- AlterTable
ALTER TABLE "RegistroRechazo" ALTER COLUMN "cantidad" TYPE DECIMAL(15,6) USING "cantidad"::DECIMAL(15,6);
