-- CreateTable
CREATE TABLE "Rol" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreEn" TEXT NOT NULL,
    "descripcion" TEXT,
    "permisos" TEXT NOT NULL,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rolId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false,
    "ultimoAcceso" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Usuario_rolId_fkey" FOREIGN KEY ("rolId") REFERENCES "Rol" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Restablecimiento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "usuarioId" TEXT NOT NULL,
    "codigoHash" TEXT NOT NULL,
    "expiraEn" DATETIME NOT NULL,
    "usadoEn" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Restablecimiento_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "clave" TEXT NOT NULL PRIMARY KEY,
    "valor" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Almacen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ubicacion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'GENERAL',
    "responsable" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'MATERIA_PRIMA',
    "unidad" TEXT NOT NULL DEFAULT 'PZA',
    "unidadPaquete" TEXT,
    "contenidoPaquete" REAL,
    "stockMinimo" REAL NOT NULL DEFAULT 0,
    "costoUnitario" REAL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productoId" TEXT NOT NULL,
    "almacenId" TEXT NOT NULL,
    "cantidad" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Stock_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stock_almacenId_fkey" FOREIGN KEY ("almacenId") REFERENCES "Almacen" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Movimiento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "almacenOrigenId" TEXT,
    "almacenDestinoId" TEXT,
    "cantidad" REAL NOT NULL,
    "cantidadDespues" REAL,
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

-- CreateTable
CREATE TABLE "CorreccionMovimiento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "movimientoId" TEXT,
    "folio" TEXT NOT NULL,
    "salidaId" TEXT,
    "salidaFolio" TEXT,
    "accion" TEXT NOT NULL,
    "antes" TEXT NOT NULL,
    "despues" TEXT,
    "motivo" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SecuenciaFolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clave" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UnidadMedida" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreEn" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "unidadBase" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "esSistema" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Modelo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "NumeroParte" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "numero" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ModeloParte" (
    "modeloId" TEXT NOT NULL,
    "numeroParteId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("modeloId", "numeroParteId"),
    CONSTRAINT "ModeloParte_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "Modelo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ModeloParte_numeroParteId_fkey" FOREIGN KEY ("numeroParteId") REFERENCES "NumeroParte" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "correo" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Papelera" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "datos" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EN_PAPELERA',
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "eliminadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEn" DATETIME NOT NULL,
    "restauradoEn" DATETIME,
    "restauradoPor" TEXT,
    "purgadoEn" DATETIME,
    "purgadoPor" TEXT
);

-- CreateTable
CREATE TABLE "SalidaOQC" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" TEXT NOT NULL,
    "clienteId" TEXT,
    "clienteCodigo" TEXT,
    "clienteNombre" TEXT,
    "almacenOrigenId" TEXT,
    "almacenOrigenCodigo" TEXT,
    "almacenOrigenNombre" TEXT,
    "referencia" TEXT,
    "responsable" TEXT,
    "notas" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'EMITIDA',
    "eliminadaEn" DATETIME,
    "eliminadaPor" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RegistroScrap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "folio" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "productoSku" TEXT NOT NULL,
    "productoNombre" TEXT NOT NULL,
    "productoUnidad" TEXT NOT NULL,
    "almacenId" TEXT,
    "almacenCodigo" TEXT,
    "almacenNombre" TEXT,
    "cantidad" REAL NOT NULL,
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

-- CreateTable
CREATE TABLE "RegistroRechazo" (
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
    "cantidad" REAL NOT NULL,
    "motivo" TEXT NOT NULL,
    "disposicion" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "responsable" TEXT,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RespaldoBD" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "archivo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "etiqueta" TEXT,
    "tamanoBytes" INTEGER NOT NULL DEFAULT 0,
    "totalRegistros" INTEGER NOT NULL DEFAULT 0,
    "compatible" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPor" TEXT
);

-- CreateTable
CREATE TABLE "RestauracionBD" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "respaldoArchivo" TEXT NOT NULL,
    "snapshotPre" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'RESTAURACION',
    "estado" TEXT NOT NULL DEFAULT 'EN_PROGRESO',
    "reversionDeId" TEXT,
    "revertidaEn" DATETIME,
    "iniciadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completadaEn" DATETIME,
    "ventanaReversaHasta" DATETIME,
    "ejecutadaPor" TEXT,
    "totalRegistros" INTEGER NOT NULL DEFAULT 0,
    "duracionMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Rol_clave_key" ON "Rol"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo");

-- CreateIndex
CREATE INDEX "Restablecimiento_usuarioId_idx" ON "Restablecimiento"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Almacen_codigo_key" ON "Almacen"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Producto_sku_key" ON "Producto"("sku");

-- CreateIndex
CREATE INDEX "Stock_almacenId_idx" ON "Stock"("almacenId");

-- CreateIndex
CREATE UNIQUE INDEX "Stock_productoId_almacenId_key" ON "Stock"("productoId", "almacenId");

-- CreateIndex
CREATE UNIQUE INDEX "Movimiento_folio_key" ON "Movimiento"("folio");

-- CreateIndex
CREATE INDEX "Movimiento_tipo_idx" ON "Movimiento"("tipo");

-- CreateIndex
CREATE INDEX "Movimiento_createdAt_idx" ON "Movimiento"("createdAt");

-- CreateIndex
CREATE INDEX "Movimiento_productoId_idx" ON "Movimiento"("productoId");

-- CreateIndex
CREATE INDEX "Movimiento_clienteId_idx" ON "Movimiento"("clienteId");

-- CreateIndex
CREATE INDEX "Movimiento_salidaId_idx" ON "Movimiento"("salidaId");

-- CreateIndex
CREATE INDEX "CorreccionMovimiento_movimientoId_idx" ON "CorreccionMovimiento"("movimientoId");

-- CreateIndex
CREATE INDEX "CorreccionMovimiento_salidaId_idx" ON "CorreccionMovimiento"("salidaId");

-- CreateIndex
CREATE INDEX "CorreccionMovimiento_salidaFolio_idx" ON "CorreccionMovimiento"("salidaFolio");

-- CreateIndex
CREATE INDEX "CorreccionMovimiento_createdAt_idx" ON "CorreccionMovimiento"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecuenciaFolio_clave_key" ON "SecuenciaFolio"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "UnidadMedida_codigo_key" ON "UnidadMedida"("codigo");

-- CreateIndex
CREATE INDEX "UnidadMedida_tipo_idx" ON "UnidadMedida"("tipo");

-- CreateIndex
CREATE INDEX "UnidadMedida_unidadBase_idx" ON "UnidadMedida"("unidadBase");

-- CreateIndex
CREATE UNIQUE INDEX "Modelo_codigo_key" ON "Modelo"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "NumeroParte_numero_key" ON "NumeroParte"("numero");

-- CreateIndex
CREATE INDEX "ModeloParte_numeroParteId_idx" ON "ModeloParte"("numeroParteId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_codigo_key" ON "Cliente"("codigo");

-- CreateIndex
CREATE INDEX "Papelera_estado_expiraEn_idx" ON "Papelera"("estado", "expiraEn");

-- CreateIndex
CREATE INDEX "Papelera_entidad_idx" ON "Papelera"("entidad");

-- CreateIndex
CREATE INDEX "Papelera_eliminadoEn_idx" ON "Papelera"("eliminadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "SalidaOQC_folio_key" ON "SalidaOQC"("folio");

-- CreateIndex
CREATE INDEX "SalidaOQC_createdAt_idx" ON "SalidaOQC"("createdAt");

-- CreateIndex
CREATE INDEX "SalidaOQC_clienteId_idx" ON "SalidaOQC"("clienteId");

-- CreateIndex
CREATE INDEX "SalidaOQC_estado_idx" ON "SalidaOQC"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroScrap_folio_key" ON "RegistroScrap"("folio");

-- CreateIndex
CREATE INDEX "RegistroScrap_createdAt_idx" ON "RegistroScrap"("createdAt");

-- CreateIndex
CREATE INDEX "RegistroScrap_productoId_idx" ON "RegistroScrap"("productoId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroRechazo_folio_key" ON "RegistroRechazo"("folio");

-- CreateIndex
CREATE INDEX "RegistroRechazo_createdAt_idx" ON "RegistroRechazo"("createdAt");

-- CreateIndex
CREATE INDEX "RegistroRechazo_productoId_idx" ON "RegistroRechazo"("productoId");

-- CreateIndex
CREATE INDEX "RegistroRechazo_clienteId_idx" ON "RegistroRechazo"("clienteId");

-- CreateIndex
CREATE INDEX "RegistroRechazo_salidaId_idx" ON "RegistroRechazo"("salidaId");

-- CreateIndex
CREATE UNIQUE INDEX "RespaldoBD_archivo_key" ON "RespaldoBD"("archivo");

-- CreateIndex
CREATE INDEX "RespaldoBD_tipo_creadoEn_idx" ON "RespaldoBD"("tipo", "creadoEn");

-- CreateIndex
CREATE INDEX "RespaldoBD_creadoEn_idx" ON "RespaldoBD"("creadoEn");

-- CreateIndex
CREATE INDEX "RestauracionBD_estado_iniciadaEn_idx" ON "RestauracionBD"("estado", "iniciadaEn");

-- CreateIndex
CREATE INDEX "RestauracionBD_reversionDeId_idx" ON "RestauracionBD"("reversionDeId");
