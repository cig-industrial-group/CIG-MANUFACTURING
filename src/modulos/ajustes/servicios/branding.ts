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
 * MÓDULO: AJUSTES — Branding / Identidad Visual (servidor)
 *
 * Gestión del logo y el favicon personalizados del sistema:
 *
 * · Almacenamiento: directorio `branding/` bajo DATA_DIR (fuera de
 *   `public/` para que los builds no lo regeneren ni lo sobrescriban).
 *   La variable BRANDING_DIR permite reubicarlo por separado (p. ej.
 *   instalaciones que montan volúmenes distintos).
 *
 * · Nombres fijos por diseño: solo existen `logo.png|svg|jpg` y
 *   `favicon.ico|png`. Ningún nombre proveniente del usuario toca el
 *   sistema de archivos (satisfacción estructural de la sanitización).
 *
 * · Tipos: el MIME se valida por CONTENIDO (magic bytes), nunca solo por
 *   la extensión. Límites: logo 2 MB, favicon 500 KB.
 *
 * · SVG: desde TASK-STR-009 (hallazgo H4 del pentest) el logo SVG se
 *   SANEa antes de persistir: se eliminan los elementos de ejecución
 *   (script, foreignObject, animate…), los atributos de evento (on*) y
 *   las referencias externas (href/xlink:href), y se neutralizan las
 *   URLs externas de estilos/filtros. Lista blanca estricta de
 *   elementos; sin dependencias externas de sanitización.
 *
 * · Configuración: las claves `branding.logoTipo` y `branding.faviconTipo`
 *   de la tabla Configuracion registran el tipo vigente; la operación de
 *   servicio verifica el disco (única fuente de verdad de existencia).
 *
 * · Idempotencia: subir con el mismo nombre sobrescribe; eliminar un
 *   archivo inexistente es un éxito, nunca un error.
 */
import fs from "node:fs";
import path from "node:path";
import { db, directorioDatos } from "@/lib/db";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
// Saneador de SVG en módulo PURO (TASK-STR-012, RF-C1): sin imports de
// infraestructura, importable por la prueba unitaria con ruta relativa
// (src/lib/__tests__/svg.test.ts). La lógica vive en ./svg.
import { esSvg, sanearSvg } from "./svg";

// ============================================================
// CONSTANTES
// ============================================================

export const CLAVES_BRANDING = {
  logoTipo: "branding.logoTipo",
  faviconTipo: "branding.faviconTipo",
} as const;

/** Límite del logo: 2 MB */
export const TAMANO_MAX_LOGO_BYTES = 2 * 1024 * 1024;
/** Límite del favicon: 500 KB */
export const TAMANO_MAX_FAVICON_BYTES = 500 * 1024;

/** Extensiones aceptadas (fuente de verdad del nombre final en disco) */
const EXTENSIONES_LOGO = ["png", "svg", "jpg"] as const;
const EXTENSIONES_FAVICON = ["ico", "png"] as const;

/** MIME por extensión (para servir con Content-Type correcto) */
const MIME_POR_EXTENSION: Record<string, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
  ico: "image/x-icon",
};

export interface EstadoActivoBranding {
  url: string;
  personalizado: boolean;
  tipo: string | null;
  tamanoBytes: number | null;
  actualizadoEn: string | null;
}

export interface EstadoBranding {
  logo: EstadoActivoBranding;
  favicon: EstadoActivoBranding;
}

/** Archivo validado listo para guardar */
interface ArchivoValidado {
  bytes: Buffer;
  extension: string;
}

// ============================================================
// RUTAS DE ARCHIVOS (DATA_DIR — misma raíz canónica que los respaldos)
// ============================================================

/**
 * Carpeta de branding: bajo DATA_DIR (misma raíz de archivos locales
 * de la máquina que los respaldos: todo el estado persistente de la
 * app vive bajo un único directorio reubicable). Reubicable además
 * con BRANDING_DIR (p. ej. instalaciones que separan los volúmenes).
 */
export function carpetaBranding(): string {
  if (process.env.BRANDING_DIR) {
    return path.resolve(process.env.BRANDING_DIR);
  }
  return path.join(directorioDatos(), "branding");
}

/** Ruta de un archivo dentro de branding/ (nombre siempre del catálogo fijo) */
function rutaBranding(nombre: string): string {
  return path.join(carpetaBranding(), path.basename(nombre));
}

/** Busca el archivo personalizado activo entre las extensiones conocidas */
function buscarPersonalizado(extensiones: readonly string[]): { ruta: string; extension: string } | null {
  for (const extension of extensiones) {
    const ruta = rutaBranding(`logo.${extension}`);
    if (fs.existsSync(ruta)) return { ruta, extension };
  }
  return null;
}

/** Ruta absoluta del logo personalizado (o null si no existe) */
export function obtenerRutaLogo(): { ruta: string; extension: string } | null {
  return buscarPersonalizado(EXTENSIONES_LOGO);
}

/** Ruta absoluta del favicon personalizado (o null si no existe) */
export function obtenerRutaFavicon(): { ruta: string; extension: string } | null {
  for (const extension of EXTENSIONES_FAVICON) {
    const ruta = rutaBranding(`favicon.${extension}`);
    if (fs.existsSync(ruta)) return { ruta, extension };
  }
  return null;
}

/**
 * Ruta del logo por defecto (public/logo.svg). Candidatos: raíz del
 * proyecto y standalone (la compilación copia public/ a ambos sitios).
 */
export function obtenerRutaLogoPorDefecto(): string | null {
  const candidatos = [
    path.join(process.cwd(), "public", "logo.svg"),
    path.join(process.cwd(), ".next", "standalone", "public", "logo.svg"),
  ];
  return candidatos.find((ruta) => fs.existsSync(ruta)) ?? null;
}

/** MIME de un archivo por su extensión */
export function mimePorExtension(extension: string): string {
  return MIME_POR_EXTENSION[extension] ?? "application/octet-stream";
}

// ============================================================
// VALIDACIÓN DE CONTENIDO (magic bytes — nunca solo la extensión)
// ============================================================

const MAGICO_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG: firma de 8 byte */
function esPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && MAGICO_PNG.equals(bytes.subarray(0, 8));
}

/** JPG: FF D8 FF */
function esJpg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** ICO: reserved=0, type=1, count>=1 (cabecera de 6 byte) */
function esIco(bytes: Buffer): boolean {
  return (
    bytes.length >= 6 &&
    bytes[0] === 0x00 && bytes[1] === 0x00 &&
    bytes[2] === 0x01 && bytes[3] === 0x00 &&
    bytes[4] > 0
  );
}

// La detección de SVG (esSvg) y el saneador completo (sanearSvg, con las
// puertas fail-closed V-1…V-8 de TASK-STR-012) viven en ./svg — módulo
// PURO deliberadamente desacoplado de @/lib/db para ser testeable.

/** ¿La extensión del nombre es una de las permitidas? */
function extensionPermitida(nombre: string, permitidas: readonly string[]): string | null {
  const limpia = path
    .basename(String(nombre ?? "").toLowerCase())
    .split("?")[0];
  for (const extension of permitidas) {
    if (limpia.endsWith(`.${extension}`)) return extension;
  }
  return null;
}

/**
 * Validación completa de un archivo subido para LOGO.
 * Orden: presencia → tamaño no vacío → límite de tamaño → extensión
 * permitida → contenido (magic bytes) → sanitización (solo SVG).
 * Lanza ErrorNegocio con el código estable correspondiente.
 *
 * La sanitización es PARTE de la validación (RF-04): lo que se devuelve
 * aquí es lo único que llega a persistirse, de modo que el SVG en disco
 * jamás contiene mecanismos de ejecución. Tras sanear se re-verifica la
 * estructura SVG (un archivo cuyo elemento raíz no sobrevive a la
 * sanitización se rechaza como inválido).
 */
export async function validarArchivoLogo(archivo: File): Promise<ArchivoValidado> {
  const bytes = Buffer.from(await archivo.arrayBuffer());

  if (bytes.length === 0) {
    throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
  }
  if (bytes.length > TAMANO_MAX_LOGO_BYTES) {
    throw new ErrorNegocio("BRANDING_TAMANNO_EXCEDIDO", 413);
  }
  const extension = extensionPermitida(archivo.name, EXTENSIONES_LOGO);
  if (!extension) {
    throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
  }
  const contenidoOk =
    (extension === "png" && esPng(bytes)) ||
    (extension === "jpg" && esJpg(bytes)) ||
    (extension === "svg" && esSvg(bytes));
  if (!contenidoOk) {
    throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
  }
  // SVG: la sanitización es parte de la validación (RF-04). PNG/JPG no
  // se tocan: son formatos binarios sin mecanismos de ejecución embebidos.
  // TASK-STR-012 (RF-C3): el saneador ahora es fail-closed — los vectores
  // V-1…V-8 (DOCTYPE con subconjunto interno, entidades, CDATA/comentarios
  // reparseables, esquemas ofuscados) se RECHAZAN con la razón registrada
  // (código estable, sin secretos) en lugar de intentar sanearlos.
  let finales: Buffer;
  if (extension === "svg") {
    const saneado = sanearSvg(bytes);
    if (!saneado.ok) {
      console.warn(`[branding] SVG rechazado por sanitización: ${saneado.razon}`);
      throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
    }
    finales = saneado.bytes;
  } else {
    finales = bytes;
  }
  if (extension === "svg" && !esSvg(finales)) {
    throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
  }
  return { bytes: finales, extension };
}

/**
 * Validación completa de un archivo subido para FAVICON
 * (ICO o PNG; mismo orden de chequeos que el logo).
 */
export async function validarArchivoFavicon(archivo: File): Promise<ArchivoValidado> {
  const bytes = Buffer.from(await archivo.arrayBuffer());

  if (bytes.length === 0) {
    throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
  }
  if (bytes.length > TAMANO_MAX_FAVICON_BYTES) {
    throw new ErrorNegocio("BRANDING_TAMANNO_EXCEDIDO", 413);
  }
  const extension = extensionPermitida(archivo.name, EXTENSIONES_FAVICON);
  if (!extension) {
    throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
  }
  const contenidoOk =
    (extension === "ico" && esIco(bytes)) ||
    (extension === "png" && esPng(bytes));
  if (!contenidoOk) {
    throw new ErrorNegocio("BRANDING_ARCHIVO_INVALIDO", 400);
  }
  return { bytes, extension };
}

// ============================================================
// PERSISTENCIA (disco + configuración)
// ============================================================

/** Guarda un archivo en branding/ (crea el directorio; permisos 644) */
export function guardarArchivo(bytes: Buffer, nombre: string): void {
  const carpeta = carpetaBranding();
  try {
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(rutaBranding(nombre), bytes, { mode: 0o644 });
  } catch (e) {
    console.error(
      `[branding] No se pudo guardar ${nombre}: ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new ErrorNegocio("BRANDING_ERROR_GUARDADO", 500);
  }
}

/** Elimina un archivo de branding/ (idempotente: no existir es éxito) */
export function eliminarArchivo(nombre: string): void {
  try {
    fs.rmSync(rutaBranding(nombre), { force: true });
  } catch (e) {
    console.error(
      `[branding] No se pudo eliminar ${nombre}: ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new ErrorNegocio("BRANDING_ERROR_GUARDADO", 500);
  }
}

/** Elimina toda variante de un recurso (logo.* o favicon.*) */
function eliminarVariantes(prefijo: "logo" | "favicon"): void {
  const extensiones = prefijo === "logo" ? EXTENSIONES_LOGO : EXTENSIONES_FAVICON;
  for (const extension of extensiones) {
    eliminarArchivo(`${prefijo}.${extension}`);
  }
}

async function escribirTipo(clave: string, extension: string): Promise<void> {
  await db.configuracion.upsert({
    where: { clave },
    create: { clave, valor: JSON.stringify(extension) },
    update: { valor: JSON.stringify(extension) },
  });
}

async function borrarTipo(clave: string): Promise<void> {
  await db.configuracion.deleteMany({ where: { clave } });
}

/** Registra el tipo vigente de un recurso en Configuracion */
export async function registrarTipoLogo(extension: string): Promise<void> {
  await escribirTipo(CLAVES_BRANDING.logoTipo, extension);
}

export async function registrarTipoFavicon(extension: string): Promise<void> {
  await escribirTipo(CLAVES_BRANDING.faviconTipo, extension);
}

/** Guarda el logo personalizado (sobrescribe variantes anteriores) */
export async function guardarLogo(validado: ArchivoValidado): Promise<void> {
  eliminarVariantes("logo");
  guardarArchivo(validado.bytes, `logo.${validado.extension}`);
  await registrarTipoLogo(validado.extension);
}

/** Guarda el favicon personalizado (sobrescribe variantes anteriores) */
export async function guardarFavicon(validado: ArchivoValidado): Promise<void> {
  eliminarVariantes("favicon");
  guardarArchivo(validado.bytes, `favicon.${validado.extension}`);
  await registrarTipoFavicon(validado.extension);
}

/** Elimina el logo personalizado (idempotente) y su configuración */
export async function eliminarLogo(): Promise<void> {
  eliminarVariantes("logo");
  await borrarTipo(CLAVES_BRANDING.logoTipo);
}

/** Elimina el favicon personalizado (idempotente) y su configuración */
export async function eliminarFavicon(): Promise<void> {
  eliminarVariantes("favicon");
  await borrarTipo(CLAVES_BRANDING.faviconTipo);
}

// ============================================================
// ESTADO (para la UI de Ajustes)
// ============================================================

function estadoRecurso(
  prefijo: "logo" | "favicon",
  personalizado: { ruta: string; extension: string } | null,
): EstadoActivoBranding {
  if (!personalizado) {
    return {
      url: `/api/branding/${prefijo}`,
      personalizado: false,
      tipo: null,
      tamanoBytes: null,
      actualizadoEn: null,
    };
  }
  let tamanoBytes = 0;
  let actualizadoEn: string | null = null;
  try {
    const stats = fs.statSync(personalizado.ruta);
    tamanoBytes = stats.size;
    actualizadoEn = stats.mtime.toISOString();
  } catch {
    /* desapareció entre la detección y la lectura: se reporta sin metadatos */
  }
  return {
    url: `/api/branding/${prefijo}`,
    personalizado: true,
    tipo: personalizado.extension,
    tamanoBytes,
    actualizadoEn,
  };
}

/** Estado completo del branding (logo y favicon) */
export function estadoBranding(): EstadoBranding {
  return {
    logo: estadoRecurso("logo", obtenerRutaLogo()),
    favicon: estadoRecurso("favicon", obtenerRutaFavicon()),
  };
}
