/**
 * TRADUCCIÓN DE CÓDIGOS DE ERROR DE LA API A CLAVES I18N
 * Mapa canónico compartido por todos los módulos.
 */
export function claveErrorApi(codigo: string): string {
  const mapa: Record<string, string> = {
    // ===== Almacén =====
    STOCK_INSUFICIENTE: "comun.stockInsuficiente",
    PRODUCTO_NO_EXISTE: "comun.errorGenerico",
    PRODUCTO_REQUERIDO: "comun.seleccionarProducto",
    ALMACEN_INVALIDO: "comun.seleccionarAlmacen",
    ALMACEN_DESTINO_REQUERIDO: "comun.seleccionarAlmacen",
    ALMACEN_ORIGEN_REQUERIDO: "comun.seleccionarAlmacen",
    ALMACENES_IGUALES: "comun.seleccionarAlmacenesDistintos",
    TRASLADO_REQUIERE_AMBOS: "comun.seleccionarAlmacenesDistintos",
    QUANTIDAD_INVALIDA: "comun.cantidadInvalida",
    AJUSTE_NEGATIVO: "comun.cantidadInvalida",
    REVERSION_NEGATIVA: "registros.errorReversion",
    MOTIVO_CORRECCION_REQUERIDO: "registros.motivoCorreccionRequerido",
    MOVIMIENTO_NO_EXISTE: "comun.errorGenerico",
    CAMPOS_INCOMPLETOS: "comun.camposIncompletos",
    CODIGO_DUPLICADO: "almacen.codigoUnico",
    SKU_DUPLICADO: "producto.skuUnico",

    // ===== Catálogo =====
    NUMERO_DUPLICADO: "catalogo.numeroUnico",
    PARTES_INVALIDAS: "catalogo.asociacionesInvalidas",
    MODELOS_INVALIDOS: "catalogo.asociacionesInvalidas",

    // ===== Clientes =====
    CLIENTE_CODIGO_DUPLICADO: "clientes.codigoUnico",
    CLIENTE_NO_EXISTE: "comun.errorGenerico",
    CLIENTE_INACTIVO: "clientes.clienteInactivo",

    // ===== OQC (salidas, scrap y rechazos) =====
    SALIDA_SIN_LINEAS: "oqc.sinLineas",
    SALIDA_OQC_NO_EXISTE: "comun.errorGenerico",
    SALIDA_OQC_ELIMINADA: "oqc.salidaEliminada",
    PARTIDA_NO_EXISTE: "comun.errorGenerico",
    SCRAP_NO_EXISTE: "comun.errorGenerico",
    RECHAZO_NO_EXISTE: "comun.errorGenerico",
    MOTIVO_SCRAP_REQUERIDO: "comun.camposIncompletos",
    MOTIVO_RECHAZO_REQUERIDO: "comun.camposIncompletos",

    // ===== Unidades de medida =====
    UNIDAD_DUPLICADA: "unidades.codigoUnico",
    UNIDAD_NO_EXISTE: "comun.errorGenerico",
    UNIDAD_CODIGO_INVALIDO: "unidades.codigoInvalido",
    UNIDAD_NOMBRE_INVALIDO: "unidades.nombreInvalido",
    UNIDAD_TIPO_INVALIDO: "unidades.tipoInvalido",
    UNIDAD_BASE_REQUERIDA: "unidades.baseRequerida",
    UNIDAD_BASE_INVALIDA: "unidades.baseInvalida",
    UNIDAD_EN_USO: "unidades.enUso",
    UNIDAD_SISTEMA: "unidades.sistemaNoEliminable",
    UNIDAD_CODIGO_BLOQUEADO: "unidades.codigoBloqueado",
    UNIDAD_TIPO_BLOQUEADO: "unidades.codigoBloqueado",
    CONTEO_UNIDAD_NO_EXISTE: "unidades.conteoUnidadInvalida",
    CONTEO_UNIDAD_INVALIDA: "unidades.conteoUnidadInvalida",
    CONTEO_UNIDAD_INCOMPATIBLE: "unidades.conteoIncompatible",
    CONTEO_INVALIDO: "comun.cantidadInvalida",

    // ===== Empaque de producto (conteo en paquetes) =====
    PAQUETE_UNIDAD_INVALIDA: "producto.paqueteInvalido",
    PAQUETE_INCOMPATIBLE: "producto.paqueteIncompatible",
    PAQUETE_CONTENIDO_INVALIDO: "producto.contenidoInvalido",

    // ===== Papelera (borrado en 2 etapas) =====
    IDENTIFICADOR_EN_USO: "papelera.identificadorEnUso",
    PAPELERA_YA_PROCESADA: "papelera.yaProcesada",
    PAPELERA_SIN_DATOS: "papelera.yaProcesada",
    PAPELERA_NO_EXISTE: "comun.errorGenerico",

    // ===== Historia congelada (entidad en papelera o purgada) =====
    REGISTRO_HISTORICO: "registros.registroHistorico",

    NO_ENCONTRADO: "comun.errorGenerico",
    ERROR_INTERNO: "comun.errorGenerico",

    // ===== Autenticación =====
    CREDENCIALES_INVALIDAS: "auth.errorCredenciales",
    USUARIO_INACTIVO: "auth.errorInactivo",
    NO_AUTENTICADO: "auth.errorCredenciales",
    PASSWORD_DEBIL: "auth.errorPasswordDebil",
    PASSWORD_INCORRECTA: "auth.errorPasswordActual",
    CORREO_INVALIDO: "auth.errorCorreoInvalido",
    CORREO_NO_EXISTE: "auth.errorCorreoNoExiste",
    CODIGO_INVALIDO: "auth.errorCodigoInvalido",
    CODIGO_EXPIRADO: "auth.errorCodigoExpirado",
    REGISTRO_DESHABILITADO: "auth.registroCerradoSub",
    RECUPERACION_DESHABILITADA: "auth.recuperacionCerradaSub",

    // ===== Usuarios y roles =====
    CORREO_EN_USO: "auth.errorCorreoExiste",
    ROL_NO_EXISTE: "comun.errorGenerico",
    ROL_CLAVE_DUPLICADA: "roles.claveAyuda",
    ROL_EN_USO: "roles.rolEnUso",
    ROL_SISTEMA: "roles.rolSistemaNoEliminable",
    ROL_NO_MODIFICABLE: "roles.adminNoModificable",
    NO_AUTO_ELIMINARSE: "usuarios.noAutoEliminar",
    NO_AUTO_DESACTIVAR: "comun.errorGenerico",
    ACCION_INVALIDA: "comun.errorGenerico",

    // ===== Permisos =====
    SIN_PERMISO: "auth.sinPermisos",
  };
  return mapa[codigo] ?? "comun.errorGenerico";
}
