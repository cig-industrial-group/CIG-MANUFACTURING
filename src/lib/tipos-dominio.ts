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
 * TIPOS NOMINALES (BRANDEADOS) DE LOS IDENTIFICADORES DE DOMINIO
 *
 * Problema que resuelve: los identificadores del sistema (productoId,
 * almacenId, folio...) son `string` nativos, por lo que TypeScript permite
 * intercambiarlos por accidente (p. ej. pasar un id de almacén donde se
 * espera un id de producto) y el error solo se detecta —si es que se
 * detecta— en producción, corrompiendo stock o bitácoras.
 *
 * Solución: cada identificador crítico se envuelve en un «tipo nominal»
 * (branded type). El tipo sigue SIENDO un string en tiempo de ejecución
 * (costo cero: sin empaquetar, sin conversión al persistir), pero en tiempo
 * de compilación es INCOMPATIBLE con cualquier otro string y con los demás
 * identificadores: `IdAlmacen` no es asignable a `IdProducto` y viceversa.
 *
 * Nominalidad: cada marca usa una `unique symbol` como clave de propiedad
 * (patrón canónico de tipos brandeados). El símbolo NO se exporta: es
 * imposible forjar la marca desde fuera de este archivo; la ÚNICA vía para
 * obtener un identificador nominal es pasar por su función de fábrica, que
 * valida el formato antes de convertir.
 *
 * Frontera de confianza: los valores que llegan por HTTP (cuerpos JSON,
 * parámetros de ruta) NO son confiables. Las fábricas siguen el patrón
 * `aDecimal` de `src/lib/numerico.ts`: devuelven `null` cuando el valor no
 * cumple el formato y el CONTEXTO decide qué error de negocio significa
 * (código HTTP + clave i18n existente). Nunca lanzan por sí mismas.
 */

// ============================================================
// MARCAS NOMINALES (una `unique symbol` por identificador)
// ============================================================

/** Marca nominal del identificador de Producto (cuid de Prisma). */
declare const MARCA_ID_PRODUCTO: unique symbol;
/** Marca nominal del identificador de Almacén (cuid de Prisma). */
declare const MARCA_ID_ALMACEN: unique symbol;
/** Marca nominal del identificador de Movimiento de inventario (cuid de Prisma). */
declare const MARCA_ID_MOVIMIENTO: unique symbol;
/** Marca nominal del folio de movimiento (formato PPP-AAAAMMDD-NNNN). */
declare const MARCA_FOLIO_MOVIMIENTO: unique symbol;

// ============================================================
// TIPOS NOMINALES EXPORTADOS
// ============================================================

/** Identificador de Producto. NO es intercambiable con `string` ni con otros ids. */
export type IdProducto = string & { readonly [MARCA_ID_PRODUCTO]: "IdProducto" };

/** Identificador de Almacén. NO es intercambiable con `string` ni con otros ids. */
export type IdAlmacen = string & { readonly [MARCA_ID_ALMACEN]: "IdAlmacen" };

/** Identificador de Movimiento de inventario. NO es intercambiable con `string` ni con otros ids. */
export type IdMovimiento = string & { readonly [MARCA_ID_MOVIMIENTO]: "IdMovimiento" };

/** Folio secuencial de movimiento: ENT-20261103-0004, SAL-20261103-0012... */
export type FolioMovimiento = string & { readonly [MARCA_FOLIO_MOVIMIENTO]: "FolioMovimiento" };

// ============================================================
// VALIDACIÓN DE FORMATO
// ============================================================

/**
 * Formato básico aceptado para identificadores de entidad: de 1 a 64
 * caracteres alfanuméricos, guion (-) o guion bajo (_).
 * Cubre los cuid de Prisma (25 chars, base 36), los UUID con guiones y los
 * formatos legados compatibles. Rechaza cadenas vacías, con espacios o con
 * caracteres de control/inyección, y acota la longitud antes de tocar la
 * base de datos (falla rápido ante payloads maliciosos o corruptos).
 */
const PATRON_IDENTIFICADOR = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Formato canónico de los folios de movimiento: prefijo de la serie
 * (EXACTAMENTE los que emite generarFolio: ENT/REC/SAL/TRA/AJU/SCR),
 * fecha compacta AAAAMMDD y número secuencial de 4 dígitos o más.
 * Ejemplo válido: SAL-20261103-0004.
 *
 * NOTA DE MANTENIMIENTO: esta lista refleja el mapa PREFIJOS de
 * src/modulos/almacen/servicios/nucleo.ts. Si se agrega un nuevo tipo de
 * movimiento, su prefijo DEBE añadirse aquí también; si llegaran a
 * divergir, generarFolio lo detecta en caliente (la conversión falla y
 * se reporta ERROR_INTERNO) — falla cerrada y visible, nunca silenciosa.
 * Los folios de otras series (OQC-... de salidas, RECH-... de rechazos)
 * NO son folios de movimiento y quedan fuera a propósito.
 */
const PATRON_FOLIO_MOVIMIENTO = /^(ENT|REC|SAL|TRA|AJU|SCR)-\d{8}-\d{4,}$/;

/** Verificación interna compartida por las fábricas de identificadores. */
function esIdentificadorValido(valor: string): boolean {
  // La doble verificación de tipo protege contra valores `any` que se
  // cuelen desde el JSON de una petición sin tipar (defensa en profundidad).
  return typeof valor === "string" && PATRON_IDENTIFICADOR.test(valor);
}

// ============================================================
// FÁBRICAS SEGURAS (retornan null si el valor no es válido)
// ============================================================

/**
 * Convierte un string crudo en `IdProducto`, validando su formato.
 * Devuelve `null` si el valor está vacío o no cumple el patrón; nunca lanza.
 */
export function comoIdProducto(valor: string): IdProducto | null {
  return esIdentificadorValido(valor) ? (valor as IdProducto) : null;
}

/**
 * Convierte un string crudo en `IdAlmacen`, validando su formato.
 * Devuelve `null` si el valor está vacío o no cumple el patrón; nunca lanza.
 */
export function comoIdAlmacen(valor: string): IdAlmacen | null {
  return esIdentificadorValido(valor) ? (valor as IdAlmacen) : null;
}

/**
 * Convierte un string crudo en `IdMovimiento`, validando su formato.
 * Devuelve `null` si el valor está vacío o no cumple el patrón; nunca lanza.
 */
export function comoIdMovimiento(valor: string): IdMovimiento | null {
  return esIdentificadorValido(valor) ? (valor as IdMovimiento) : null;
}

/**
 * Convierte un string crudo en `FolioMovimiento`, validando el formato
 * canónico PPP-AAAAMMDD-NNNN. Devuelve `null` si no cumple el patrón.
 * NOTA: los folios históricos persistidos en la base de datos NO se
 * brandean (son dato de auditoría que solo se exhibe); este tipo protege
 * los folios que el propio sistema genera y opera.
 */
export function comoFolioMovimiento(valor: string): FolioMovimiento | null {
  return typeof valor === "string" && PATRON_FOLIO_MOVIMIENTO.test(valor)
    ? (valor as FolioMovimiento)
    : null;
}

/**
 * Convierte un id de almacén OPCIONAL (el campo puede faltar en el cuerpo
 * de la petición según el tipo de movimiento). Solo `IdAlmacen` necesita
 * esta variante: los ids de producto y movimiento son obligatorios en
 * todas las fronteras del sistema.
 *
 * Convención de retorno (sin ambigüedad, auditable en el llamador):
 *   · `undefined` → el campo NO vino (o vino vacío: mismo trato que el
 *     `|| undefined` histórico de las rutas) y el núcleo aplicará su
 *     regla de «campo requerido» según el tipo de movimiento.
 *   · `null` → el campo SÍ vino pero su formato es inválido; el llamador
 *     debe rechazar la petición de inmediato (fail-closed).
 *   · `IdAlmacen` → valor válido y brandeado.
 *
 * El guard `if (x === null)` del llamador elimina exactamente el caso
 * inválido y deja el tipo limpio en `IdAlmacen | undefined`.
 */
export function comoIdAlmacenOpcional(
  valor: string | null | undefined,
): IdAlmacen | null | undefined {
  if (valor === null || valor === undefined || valor === "") return undefined;
  return comoIdAlmacen(valor);
}
