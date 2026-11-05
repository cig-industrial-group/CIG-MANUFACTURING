-- RedefineTables
-- REMEDIACIÓN FASE 1 (integridad numérica): Float/REAL → TEXT decimal exacto.
-- Los INSERT..SELECT fueron ENMENDADOS: las columnas numéricas se copian vía
-- CAST(ROUND(col, 6) AS TEXT) para (a) eliminar artefactos históricos de
-- float64 (p. ej. 0.30000000000000004 → 0.3) y (b) fijar la escala máxima
-- de 6 decimales que valida la capa de aplicación (src/lib/numerico.ts).
-- La conversión es sin pérdida para datos legítimos (la UI nunca aceptó
-- más de 6 decimales); NULL se propaga intacto.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Movimiento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "almacenOrigenId" TEXT,
    "almacenDestinoId" TEXT,
    "cantidad" TEXT NOT NULL,
    "cantidadDespues" TEXT,
    "motivo" TEXT,
    "referencia" TEXT,
    "responsable" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "editado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productoSku" TEXT NOT NULL DEFAULT '',
    "productoNombre" TEXT NOT NULL DEFAULT '',
    "productoUnidad" TEXT NOT NULL DEFAULT '',
    "almacenOrigenCodigo" TEXT,
    "almacenOrigenNombre" TEXT,
    "almacenDestinoCodigo" TEXT,
    "almacenDestinoNombre" TEXT,
    "clienteId" TEXT,
    "clienteCodigo" TEXT,
    "clienteNombre" TEXT,
    "salidaId" TEXT,
    "salidaFolio" TEXT,
    "conteoDetalle" TEXT
);
INSERT INTO "new_Movimiento" ("almacenDestinoCodigo", "almacenDestinoId", "almacenDestinoNombre", "almacenOrigenCodigo", "almacenOrigenId", "almacenOrigenNombre", "cantidad", "cantidadDespues", "clienteCodigo", "clienteId", "clienteNombre", "conteoDetalle", "createdAt", "editado", "folio", "id", "motivo", "productoId", "productoNombre", "productoSku", "productoUnidad", "referencia", "responsable", "salidaFolio", "salidaId", "tipo", "usuarioId", "usuarioNombre") SELECT "almacenDestinoCodigo", "almacenDestinoId", "almacenDestinoNombre", "almacenOrigenCodigo", "almacenOrigenId", "almacenOrigenNombre", CAST(ROUND("cantidad", 6) AS TEXT), CAST(ROUND("cantidadDespues", 6) AS TEXT), "clienteCodigo", "clienteId", "clienteNombre", "conteoDetalle", "createdAt", "editado", "folio", "id", "motivo", "productoId", "productoNombre", "productoSku", "productoUnidad", "referencia", "responsable", "salidaFolio", "salidaId", "tipo", "usuarioId", "usuarioNombre" FROM "Movimiento";
DROP TABLE "Movimiento";
ALTER TABLE "new_Movimiento" RENAME TO "Movimiento";
CREATE UNIQUE INDEX "Movimiento_folio_key" ON "Movimiento"("folio");
CREATE INDEX "Movimiento_tipo_idx" ON "Movimiento"("tipo");
CREATE INDEX "Movimiento_createdAt_idx" ON "Movimiento"("createdAt");
CREATE INDEX "Movimiento_productoId_idx" ON "Movimiento"("productoId");
CREATE INDEX "Movimiento_clienteId_idx" ON "Movimiento"("clienteId");
CREATE INDEX "Movimiento_salidaId_idx" ON "Movimiento"("salidaId");
CREATE TABLE "new_Producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'MATERIA_PRIMA',
    "unidad" TEXT NOT NULL DEFAULT 'PZA',
    "unidadPaquete" TEXT,
    "contenidoPaquete" TEXT,
    "stockMinimo" TEXT NOT NULL DEFAULT '0',
    "costoUnitario" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Producto" ("activo", "categoria", "contenidoPaquete", "costoUnitario", "createdAt", "descripcion", "id", "nombre", "sku", "stockMinimo", "unidad", "unidadPaquete", "updatedAt") SELECT "activo", "categoria", CAST(ROUND("contenidoPaquete", 6) AS TEXT), CAST(ROUND("costoUnitario", 6) AS TEXT), "createdAt", "descripcion", "id", "nombre", "sku", CAST(ROUND("stockMinimo", 6) AS TEXT), "unidad", "unidadPaquete", "updatedAt" FROM "Producto";
DROP TABLE "Producto";
ALTER TABLE "new_Producto" RENAME TO "Producto";
CREATE UNIQUE INDEX "Producto_sku_key" ON "Producto"("sku");
CREATE TABLE "new_RegistroRechazo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "productoSku" TEXT NOT NULL,
    "productoNombre" TEXT NOT NULL,
    "productoUnidad" TEXT NOT NULL,
    "clienteId" TEXT,
    "clienteCodigo" TEXT,
    "clienteNombre" TEXT,
    "salidaId" TEXT,
    "salidaFolio" TEXT,
    "cantidad" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "disposicion" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "responsable" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RegistroRechazo" ("cantidad", "clienteCodigo", "clienteId", "clienteNombre", "createdAt", "disposicion", "folio", "id", "motivo", "notas", "productoId", "productoNombre", "productoSku", "productoUnidad", "responsable", "salidaFolio", "salidaId", "updatedAt", "usuarioId", "usuarioNombre") SELECT CAST(ROUND("cantidad", 6) AS TEXT), "clienteCodigo", "clienteId", "clienteNombre", "createdAt", "disposicion", "folio", "id", "motivo", "notas", "productoId", "productoNombre", "productoSku", "productoUnidad", "responsable", "salidaFolio", "salidaId", "updatedAt", "usuarioId", "usuarioNombre" FROM "RegistroRechazo";
DROP TABLE "RegistroRechazo";
ALTER TABLE "new_RegistroRechazo" RENAME TO "RegistroRechazo";
CREATE UNIQUE INDEX "RegistroRechazo_folio_key" ON "RegistroRechazo"("folio");
CREATE INDEX "RegistroRechazo_createdAt_idx" ON "RegistroRechazo"("createdAt");
CREATE INDEX "RegistroRechazo_productoId_idx" ON "RegistroRechazo"("productoId");
CREATE INDEX "RegistroRechazo_clienteId_idx" ON "RegistroRechazo"("clienteId");
CREATE INDEX "RegistroRechazo_salidaId_idx" ON "RegistroRechazo"("salidaId");
CREATE TABLE "new_RegistroScrap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "productoSku" TEXT NOT NULL,
    "productoNombre" TEXT NOT NULL,
    "productoUnidad" TEXT NOT NULL,
    "almacenId" TEXT,
    "almacenCodigo" TEXT,
    "almacenNombre" TEXT,
    "cantidad" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "notas" TEXT,
    "responsable" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "movimientoId" TEXT,
    "conteoDetalle" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RegistroScrap" ("almacenCodigo", "almacenId", "almacenNombre", "cantidad", "conteoDetalle", "createdAt", "folio", "id", "motivo", "movimientoId", "notas", "productoId", "productoNombre", "productoSku", "productoUnidad", "responsable", "updatedAt", "usuarioId", "usuarioNombre") SELECT "almacenCodigo", "almacenId", "almacenNombre", CAST(ROUND("cantidad", 6) AS TEXT), "conteoDetalle", "createdAt", "folio", "id", "motivo", "movimientoId", "notas", "productoId", "productoNombre", "productoSku", "productoUnidad", "responsable", "updatedAt", "usuarioId", "usuarioNombre" FROM "RegistroScrap";
DROP TABLE "RegistroScrap";
ALTER TABLE "new_RegistroScrap" RENAME TO "RegistroScrap";
CREATE UNIQUE INDEX "RegistroScrap_folio_key" ON "RegistroScrap"("folio");
CREATE INDEX "RegistroScrap_createdAt_idx" ON "RegistroScrap"("createdAt");
CREATE INDEX "RegistroScrap_productoId_idx" ON "RegistroScrap"("productoId");
CREATE TABLE "new_Stock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productoId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "cantidad" TEXT NOT NULL DEFAULT '0',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stock_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stock_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Stock" ("almacenId", "cantidad", "id", "productoId", "updatedAt") SELECT "almacenId", CAST(ROUND("cantidad", 6) AS TEXT), "id", "productoId", "updatedAt" FROM "Stock";
DROP TABLE "Stock";
ALTER TABLE "new_Stock" RENAME TO "Stock";
CREATE INDEX "Stock_almacenId_idx" ON "Stock"("almacenId");
CREATE UNIQUE INDEX "Stock_productoId_almacenId_key" ON "Stock"("productoId", "almacenId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
