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
 * LÓGICA DE SERVIDOR DEL MÓDULO RESPALDO (PostgreSQL)
 * =====================================================
 *
 * Migración de motor de archivo local → PostgreSQL (v1.1.1). El respaldo
 * pasó de la instantánea compactada del archivo de la base anterior a
 * «pg_dump --format=custom» (volcado comprimido del servidor), y la
 * restauración de «leer el archivo con un segundo PrismaClient» a
 * «restaurar el volcado en una BASE TRANSITORIA de verificación y copiar
 * desde ella». Las garantías de negocio se conservan ÍNTEGRAS:
 *
 * · Crear respaldo: pg_dump produce una instantánea consistente del
 *   esquema public (MVCC: el volcado ve una fotografía coherente aunque
 *   haya actividad en curso) en formato custom comprimido (.dump).
 *
 * · Subir respaldo externo: un archivo .dump descargado antes (de esta
 *   u otra instalación con el mismo esquema) se valida —cabecera PGDMP,
 *   integridad del archivo (pg_restore --list) y esquema— y queda
 *   registrado como SUBIDO; desde ahí se restaura igual que cualquier
 *   otro respaldo, con todas las garantías.
 *
 * · Restaurar (en caliente): el volcado se restaura PRIMERO a una base
 *   transitoria (creada con CREATE DATABASE, eliminada al terminar) y
 *   se valida ahí TODO —esquema y conteos—; solo entonces una ÚNICA
 *   transacción borra y reinserta todas las tablas de la base viva en
 *   orden topológico (hijos primero al borrar, padres primero al
 *   insertar, respetando las FK físicas). Si cualquier paso falla, la
 *   transacción se revierte completa: la base queda EXACTAMENTE como
 *   estaba (rollback automático). Un archivo corrupto o incompatible
 *   jamás alcanza a modificar la base viva porque se validó ANTES, en
 *   la base transitoria.
 *
 * · Ventana de reversión de 24 h: cada restauración exitosa registra
 *   su snapshot pre-restauración. «Revertir» restaura ese snapshot
 *   (y es a su vez una restauración con su propia ventana), de modo
 *   que incluso un arrepentimiento tardío tiene salida — sin respaldos
 *   manuales intermedios.
 *
 * · Los registros de respaldo/restauración (RespaldoBD/RestauracionBD)
 *   describen archivos de ESTA máquina: se excluyen de la copia para
 *   que el inventario coincida siempre con el contenido del directorio
 *   de respaldos.
 *
 * MEMORIA: la copia de restauración es POR LOTES (lectura paginada de
 * la base transitoria + createMany por lote), y la descarga se sirve
 * en STREAMING: ninguna operación carga el volcado completo en RAM.
 *
 * SEGURIDAD de los procesos hijos (refinamientos del dictamen):
 *   1. PGPASSWORD se inyecta EXCLUSIVAMENTE en el objeto `env` de las
 *      opciones de execFile — jamás en el comando ni en los argumentos
 *      (invisible para `ps aux`).
 *   2. Toda herramienta pg_* se invoca con `--no-password`: si falta la
 *      contraseña, falla de inmediato en lugar de colgarse esperando
 *      una entrada interactiva que nunca llegará. Además cada invocación
 *      lleva `timeout`: un proceso atascado se termina con señal.
 *   3. Ningún log incluye la cadena de conexión: los mensajes de error
 *      pasan por sanearParaLog (URLs redactadas) antes de registrarse.
 *
 * QUERIES CRUDAS: este módulo usa $queryRaw (plantilla etiquetada,
 * parámetros enlazados) para consultas de catálogo (information_schema,
 * pg_database_size) y consultas fijas sin entrada de usuario. Los
 * identificadores de la base transitoria NO provienen del usuario:
 * se generan internamente y se validan contra ^[a-z0-9_]+$ antes de
 * interpolarse en el ÚNICO DDL (CREATE/DROP DATABASE), que además
 * double-quotea el identificador.
 */
import fs, { createReadStream } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { Prisma, PrismaClient } from "@prisma/client";
import { db, directorioDatos } from "@/lib/db";
import { transaccion, sanearParaLog } from "@/lib/reintentos";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const execFileAsync = promisify(execFile);

/** Horas de la ventana para revertir una restauración exitosa */
export const VENTANA_REVERSA_HORAS = 24;
/** Respaldos automáticos conservados (rotación) */
const MAX_RESPALDOS_AUTOMATICOS = 7;
/** Antigüedad (h) a partir de la cual se limpian los snapshots pre-restauración */
const HORAS_VIDA_SNAPSHOT = 48;
/** Una restauración EN_PROGRESO más antigua que esto se considera interrumpida */
const MIN_EN_PROGRESO = 15;
/**
 * Filas por lote de la copia de restauración (lectura paginada +
 * createMany): acota la memoria de la operación y el número de
 * parámetros por sentencia preparada del protocolo de PostgreSQL.
 */
const FILAS_POR_LOTE = 200;
/** Tamaño máximo aceptado para un archivo de respaldo subido (1 GB) */
export const TAMANO_MAX_SUBIDA_BYTES = 1024 * 1024 * 1024;
/** Cabecera de todo volcado pg_dump en formato custom (primeros 5 bytes) */
const MAGICO_PG_DUMP = "PGDMP";
/** Extensión canónica de los volcados pg_dump custom de este sistema */
const EXTENSION_RESPALDO = ".dump";
/** Tiempo límite (ms) por invocación de herramienta pg_* (evita hilos colgados) */
const TIMEOUT_PG_MS = 600_000;
/** Esquema donde vive el modelo de datos (coincide con ?schema=public) */
const ESQUEMA_DATOS = "public";

/** Modelos excluidos de la copia al restaurar: registros de esta máquina */
const MODELOS_EXCLUIDOS = new Set(["RespaldoBD", "RestauracionBD"]);

// ============================================================
// RUTAS DE ARCHIVOS (DATA_DIR — resolución canónica en src/lib/db.ts)
// ============================================================


/** Carpeta de respaldos (DATA_DIR/backups); la crea si no existe */
export function carpetaRespaldos(): string {
  const carpeta = path.join(directorioDatos(), "backups");
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

/** Ruta absoluta de un archivo de respaldo por su nombre */
function rutaRespaldo(archivo: string): string {
  return path.join(carpetaRespaldos(), path.basename(archivo));
}

/** Marca de tiempo compacta para nombres de archivo: AAAAMMDD-HHmmss */
function marcaTiempo(): string {
  const d = new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Sufijo aleatorio corto (hex) para nombres de base transitoria */
function sufijoAleatorio(): string {
  return Math.random().toString(36).slice(2, 8);
}

// ============================================================
// CONEXIÓN POSTGRESQL (análisis de DATABASE_URL para las
// herramientas pg_*, sin exponer la contraseña en argv)
// ============================================================

/** Componentes de conexión extraídos de DATABASE_URL. */
type ConexionPG = {
  host: string;
  puerto: string;
  usuario: string;
  /** Solo para el objeto env de execFile (PGPASSWORD); jamás en argumentos. */
  password: string;
  base: string;
};

/** Decodifica un componente percent-encoded de la URL de forma segura. */
function decodificar(valor: string): string {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

/**
 * Analiza DATABASE_URL y extrae los parámetros de conexión para las
 * herramientas pg_* (pg_dump/pg_restore/psql). Lanza ErrorNegocio si la
 * URL no es de PostgreSQL — fail-fast antes de spawnear procesos.
 */
export function analizarURLPostgres(): ConexionPG {
  const url = process.env.DATABASE_URL ?? "";
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ErrorNegocio("URL_BD_INVALIDA", 500);
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    throw new ErrorNegocio("URL_BD_INVALIDA", 500);
  }
  const base = decodificar(u.pathname.replace(/^\/+/, ""));
  if (!u.hostname || !base) throw new ErrorNegocio("URL_BD_INVALIDA", 500);
  return {
    host: u.hostname,
    puerto: u.port || "5432",
    usuario: decodificar(u.username) || "postgres",
    password: decodificar(u.password),
    base,
  };
}

/** Argumentos de conexión comunes (host/puerto/usuario — SIN contraseña). */
function argumentosConexion(conn: ConexionPG): string[] {
  return ["-h", conn.host, "-p", conn.puerto, "-U", conn.usuario];
}

// ============================================================
// EJECUCIÓN SEGURA DE HERRAMIENTAS pg_* (refinamientos 1-3)
// ============================================================

/**
 * Ejecuta una herramienta de PostgreSQL con execFile (sin shell: sin
 * inyección de comandos; los argumentos viajan como array).
 *
 * · PGPASSWORD se inyecta SOLO en el objeto env (nunca en argv).
 * · `--no-password` SIEMPRE primera bandera: si PGPASSWORD falta o es
 *   incorrecta, la herramienta falla al instante en vez de esperar
 *   entrada interactiva (bloqueo de hilo evitado).
 * · `timeout` termina el proceso si se atasca; `maxBuffer` acota la
 *   salida capturada.
 */
async function ejecutarPG(herramienta: string, args: string[]): Promise<string> {
  const { password } = analizarURLPostgres();
  const { stdout } = await execFileAsync(herramienta, ["--no-password", ...args], {
    // Refinamiento #1: la contraseña vive EXCLUSIVAMENTE aquí.
    env: { ...process.env, PGPASSWORD: password },
    timeout: TIMEOUT_PG_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

/** Forma de los errores de execFile con stderr adjunto. */
type ErrorExec = Error & { code?: string | number; stderr?: string; killed?: boolean };

/**
 * Descripción saneada (refinamiento #3) de un fallo de herramienta pg:
 * primera línea del stderr, redactando cualquier URL de conexión, sin
 * incluir jamás la contraseña ni la cadena completa DATABASE_URL.
 */
function describirFalloPG(error: unknown, herramienta: string): string {
  if (error instanceof Error) {
    const e = error as ErrorExec;
    if (e.code === "ENOENT") {
      return `la herramienta «${herramienta}» no está instalada en el contenedor (requiere postgresql-client ≥ 16)`;
    }
    if (e.killed) {
      return `«${herramienta}» excedió el tiempo límite de ${TIMEOUT_PG_MS / 1000} s`;
    }
    const stderr = typeof e.stderr === "string" ? e.stderr : "";
    const primera = stderr
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)[0];
    return sanearParaLog(primera || e.message).slice(0, 300);
  }
  return "error desconocido";
}

/**
 * Ejecuta una herramienta pg y traduce su fallo a ErrorNegocio con el
 * código correcto (herramienta ausente → HERRAMIENTA_PG_NO_DISPONIBLE;
 * falta de CREATEDB → RESPALDO_PERMISO_CREATEDB; resto → causa). El
 * detalle técnico saneado queda en el log del servidor.
 */
async function ejecutarPGO(herramienta: string, args: string[], codigoFallo: string): Promise<string> {
  try {
    return await ejecutarPG(herramienta, args);
  } catch (error) {
    const detalle = describirFalloPG(error, herramienta);
    console.error(`[respaldo] Fallo de ${herramienta}: ${detalle}`);
    if (detalle.includes("no está instalada")) {
      throw new ErrorNegocio("HERRAMIENTA_PG_NO_DISPONIBLE", 500);
    }
    if (/permission denied to create database|no le está permitido crear bases/i.test(detalle)) {
      throw new ErrorNegocio("RESPALDO_PERMISO_CREATEDB", 500);
    }
    if (/connection .* (refused|failed|timed out)|could not connect/i.test(detalle)) {
      throw new ErrorNegocio("BD_NO_DISPONIBLE", 503);
    }
    throw new ErrorNegocio(codigoFallo, 409);
  }
}

// ============================================================
// ORDEN TOPOLOGICO DE TABLAS (desde el DMMF de Prisma)
// ============================================================

type ModeloDMMF = (typeof Prisma.dmmf.datamodel.models)[number];

let ordenCache: { borrado: string[]; insercion: string[] } | null = null;

/**
 * Orden de copia derivado del grafo de FKs del esquema:
 *   borrado    → hijos primero (nadie los referencia al borrarlos)
 *   insercion  → padres primero (sus FKs ya existen al insertar)
 * Se excluyen los modelos de registro de la máquina.
 */
function ordenTablas(): { borrado: string[]; insercion: string[] } {
  if (ordenCache) return ordenCache;
  const modelos = Prisma.dmmf.datamodel.models.filter((m) => !MODELOS_EXCLUIDOS.has(m.name));

  const padres = new Map<string, Set<string>>();
  for (const m of modelos) {
    const set = new Set<string>();
    for (const f of m.fields) {
      // Solo relaciones con FK física (relationFromFields) y sin autoreferencia
      if (f.kind === "object" && (f.relationFromFields?.length ?? 0) > 0 && f.type !== m.name) {
        set.add(f.type);
      }
    }
    padres.set(m.name, set);
  }

  // DFS post-orden sobre «referencia a»: los padres quedan primero
  const visitados = new Set<string>();
  const enPila = new Set<string>();
  const orden: string[] = [];
  const visitar = (nombre: string) => {
    if (visitados.has(nombre)) return;
    if (enPila.has(nombre)) throw new Error(`Ciclo de FKs no soportado: ${nombre}`);
    enPila.add(nombre);
    for (const p of padres.get(nombre) ?? []) if (padres.has(p)) visitar(p);
    enPila.delete(nombre);
    visitados.add(nombre);
    orden.push(nombre);
  };
  for (const m of modelos) visitar(m.name);

  ordenCache = { borrado: [...orden].reverse(), insercion: orden };
  return ordenCache;
}

/** Acceso dinámico al delegado de Prisma por nombre de modelo */
function delegado(cliente: PrismaTx | PrismaClient, modelo: string) {
  const clave = modelo.charAt(0).toLowerCase() + modelo.slice(1);
  const acceso = (cliente as unknown as Record<string, unknown>)[clave];
  if (!acceso) throw new Error(`Modelo no encontrado: ${modelo}`);
  return acceso as {
    findMany: (a?: object) => Promise<object[]>;
    count: (a?: object) => Promise<number>;
    deleteMany: (a?: object) => Promise<unknown>;
    createMany: (a: { data: object[] }) => Promise<unknown>;
  };
}

// ============================================================
// CANDADO DE CONCURRENCIA (una sola operación a la vez)
// ============================================================

let candado: Promise<unknown> = Promise.resolve();

function conCandado<T>(fn: () => Promise<T>): Promise<T> {
  const resultado = candado.then(fn, fn);
  candado = resultado.catch(() => undefined);
  return resultado;
}

// ============================================================
// PROYECCIONES PÚBLICAS
// ============================================================

export type FilaRespaldo = {
  id: string;
  archivo: string;
  tipo: "MANUAL" | "AUTOMATICO" | "PRE_RESTAURACION" | "DETECTADO" | "SUBIDO";
  etiqueta: string | null;
  tamanoBytes: number;
  totalRegistros: number;
  compatible: boolean;
  creadoEn: string;
  creadoPor: string | null;
};

export type FilaRestauracion = {
  id: string;
  respaldoArchivo: string;
  snapshotPre: string | null;
  tipo: "RESTAURACION" | "REVERSION";
  estado: "EN_PROGRESO" | "COMPLETADA" | "FALLIDA";
  reversionDeId: string | null;
  revertidaEn: string | null;
  iniciadaEn: string;
  completadaEn: string | null;
  ventanaReversaHasta: string | null;
  ejecutadaPor: string | null;
  totalRegistros: number;
  duracionMs: number;
  error: string | null;
  informeDiferencias: InformeDiferencias | null;
};

/**
 * Informe de diferencias de usuarios/roles alrededor de una restauración
 * (TASK-STR-007, hallazgo H5): cuentas INTRODUCIDAS por el respaldo
 * (`agregados`) y cuentas ELIMINADAS (`eliminados`), cada una con el
 * formato legible "correo (ROL)" / "correo (ROL, INACTIVO)".
 */
export type InformeDiferencias = {
  agregados: string[];
  eliminados: string[];
};

/**
 * Lectura resistente del informe persistido (columna Json): ante un valor
 * ilegible o malformado devuelve null en lugar de tumbar el módulo — mismo
 * criterio defensivo que leerRestauraciones().
 */
function aInformeDiferencias(valor: unknown): InformeDiferencias | null {
  if (valor === null || typeof valor !== "object") return null;
  const crudo = valor as Record<string, unknown>;
  if (!Array.isArray(crudo.agregados) || !Array.isArray(crudo.eliminados)) return null;
  const limpio = (lista: unknown[]) => lista.filter((e): e is string => typeof e === "string");
  return { agregados: limpio(crudo.agregados), eliminados: limpio(crudo.eliminados) };
}

function aRespaldo(r: {
  id: string;
  archivo: string;
  tipo: string;
  etiqueta: string | null;
  tamanoBytes: number;
  totalRegistros: number;
  compatible: boolean;
  creadoEn: Date;
  creadoPor: string | null;
}): FilaRespaldo {
  const tipos = ["MANUAL", "AUTOMATICO", "PRE_RESTAURACION", "DETECTADO", "SUBIDO"] as const;
  return {
    ...r,
    tipo: tipos.includes(r.tipo as FilaRespaldo["tipo"]) ? (r.tipo as FilaRespaldo["tipo"]) : "MANUAL",
    creadoEn: r.creadoEn.toISOString(),
  };
}

function aRestauracion(r: {
  id: string;
  respaldoArchivo: string;
  snapshotPre: string | null;
  tipo: string;
  estado: string;
  reversionDeId: string | null;
  revertidaEn: Date | null;
  iniciadaEn: Date;
  completadaEn: Date | null;
  ventanaReversaHasta: Date | null;
  ejecutadaPor: string | null;
  totalRegistros: number;
  duracionMs: number;
  error: string | null;
  informeDiferencias: unknown;
}): FilaRestauracion {
  return {
    ...r,
    informeDiferencias: aInformeDiferencias(r.informeDiferencias),
    tipo: r.tipo === "REVERSION" ? "REVERSION" : "RESTAURACION",
    estado:
      r.estado === "COMPLETADA" ? "COMPLETADA" : r.estado === "FALLIDA" ? "FALLIDA" : "EN_PROGRESO",
    iniciadaEn: r.iniciadaEn.toISOString(),
    completadaEn: r.completadaEn?.toISOString() ?? null,
    ventanaReversaHasta: r.ventanaReversaHasta?.toISOString() ?? null,
    revertidaEn: r.revertidaEn?.toISOString() ?? null,
  };
}

// ============================================================
// CREAR RESPALDO (pg_dump, formato custom)
// ============================================================

/**
 * Crea un respaldo completo y consistente de la base de datos
 * (pg_dump --format=custom: instantánea MVCC aunque haya actividad
 * en curso; archivo comprimido restaurable con pg_restore).
 */
export async function crearRespaldo(args: {
  tipo: "MANUAL" | "AUTOMATICO" | "PRE_RESTAURACION";
  etiqueta?: string;
  usuario: string;
}): Promise<FilaRespaldo> {
  const carpeta = carpetaRespaldos();
  const sufijo = args.tipo === "MANUAL" ? "man" : args.tipo === "AUTOMATICO" ? "aut" : "pre";
  const conn = analizarURLPostgres();

  // Nombre único: respaldo-AAAAMMDD-HHmmss-<tipo>.dump
  let archivo = `respaldo-${marcaTiempo()}-${sufijo}${EXTENSION_RESPALDO}`;
  for (let i = 2; fs.existsSync(path.join(carpeta, archivo)); i++) {
    archivo = `respaldo-${marcaTiempo()}-${sufijo}-${i}${EXTENSION_RESPALDO}`;
  }
  const destino = path.join(carpeta, archivo);

  // pg_dump: la ruta del archivo viaja como ARGUMENTO de execFile (sin
  // shell intermedio); la contraseña jamás toca argv (ver ejecutarPG).
  await ejecutarPGO(
    "pg_dump",
    [
      "--format=custom",
      "--file",
      destino,
      ...argumentosConexion(conn),
      "--dbname",
      conn.base,
    ],
    "RESPALDO_FALLIDO",
  );

  const tamanoBytes = fs.statSync(destino).size;
  const totalRegistros = await contarRegistros(db);
  const fila = await db.respaldoBD.create({
    data: {
      archivo,
      tipo: args.tipo,
      etiqueta: args.etiqueta?.trim() || null,
      tamanoBytes,
      totalRegistros,
      compatible: true,
      creadoPor: args.usuario,
    },
  });
  return aRespaldo(fila);
}

/** Suma los registros vivos de todas las tablas copiadas */
async function contarRegistros(cliente: PrismaClient | PrismaTx): Promise<number> {
  let total = 0;
  for (const modelo of ordenTablas().insercion) {
    total += await delegado(cliente, modelo).count();
  }
  return total;
}

// ============================================================
// VALIDACIÓN Y LECTURA DE UN RESPALDO (base transitoria)
// ============================================================

/**
 * Tablas de datos presentes en la base conectada (information_schema,
 * consulta de catálogo con parámetro enlazado; excluye la bitácora de
 * migraciones de Prisma, que no forma parte del modelo de negocio).
 */
async function tablasEnBase(cliente: PrismaClient): Promise<Set<string>> {
  const filas = await cliente.$queryRaw<Array<{ tabla: string }>>(
    Prisma.sql`SELECT table_name AS tabla FROM information_schema.tables WHERE table_schema = ${ESQUEMA_DATOS}`,
  );
  return new Set(filas.map((f) => f.tabla).filter((t) => t !== "_prisma_migrations"));
}

/**
 * Columnas de la llave primaria de cada tabla (para la paginación
 * DETERMINISTA de la copia: sin ORDER BY estable, OFFSET puede repetir
 * o saltar filas). Consulta de catálogo con parámetro enlazado.
 */
async function columnasLlavePrimaria(cliente: PrismaClient): Promise<Map<string, string[]>> {
  const filas = await cliente.$queryRaw<Array<{ tabla: string; columna: string }>>(
    Prisma.sql`
      SELECT tc.table_name AS tabla, kcu.column_name AS columna
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
       AND kcu.table_name = tc.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = ${ESQUEMA_DATOS}
      ORDER BY tc.table_name, kcu.ordinal_position`,
  );
  const mapa = new Map<string, string[]>();
  for (const f of filas) {
    const actuales = mapa.get(f.tabla) ?? [];
    actuales.push(f.columna);
    mapa.set(f.tabla, actuales);
  }
  return mapa;
}

/**
 * ¿El conjunto de tablas es compatible con el esquema actual?
 * Debe contener TODAS las tablas de datos (modelos no excluidos) y
 * ninguna desconocida. Las tablas de registro de la máquina
 * (RespaldoBD/RestauracionBD) son OPCIONALES: un respaldo anterior al
 * módulo no las tiene y sigue siendo restaurable (sus registros
 * actuales se conservan, pues esas tablas nunca se copian).
 */
function esquemaCompatible(presentes: Set<string>): boolean {
  const requeridas = ordenTablas().insercion;
  const opcionales = MODELOS_EXCLUIDOS;
  return (
    requeridas.every((t) => presentes.has(t)) &&
    [...presentes].every((t) => requeridas.includes(t) || opcionales.has(t))
  );
}

/**
 * Nombres de las tablas (objeto TABLE) que declara el TOC de un
 * volcado custom, según pg_restore --list (sin conexión a BD: lee la
 * cabecera del archivo). Una línea TABLE tiene la forma:
 *   <dumpid>; <oid> <oid> TABLE <esquema> <tabla> <dueño>
 * (las entradas TABLE DATA llevan el literal «DATA» tras TABLE y se
 * descartan aquí).
 */
function tablasDelTOC(salida: string): Set<string> {
  const tablas = new Set<string>();
  for (const linea of salida.split("\n")) {
    const campos = linea.trim().split(/\s+/);
    if (campos.length < 6) continue;
    if (campos[3] !== "TABLE" || campos[4] === "DATA") continue;
    if (campos[4] === ESQUEMA_DATOS) tablas.add(campos[5]);
  }
  return tablas;
}

/**
 * Validación RÁPIDA de un archivo de respaldo (sin copiar datos ni
 * crear bases): cabecera legible por pg_restore --list (integridad del
 * contenedor) y esquema compatible (tablas declaradas en el TOC).
 * Lanza ErrorNegocio (RESPALDO_CORRUPTO / RESPALDO_INCOMPATIBLE) si el
 * archivo no es utilizable.
 *
 * Devuelve el total de registros DECLARADO (0 = se determinará al
 * restaurar: los volcados custom no registran conteos por tabla; el
 * conteo exacto se verifica en la base transitoria al restaurar).
 */
async function validarArchivoRespaldo(nombre: string): Promise<number> {
  const ruta = rutaRespaldo(nombre);
  const salida = await ejecutarPGO("pg_restore", ["--list", ruta], "RESPALDO_CORRUPTO");
  if (!esquemaCompatible(tablasDelTOC(salida))) {
    throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);
  }
  return 0;
}

/**
 * Restaura el volcado en una BASE TRANSITORIA (creada para la
 * validación) y devuelve el cliente Prisma conectado a ella junto con
 * el conteo total verificado. El llamador DEBE desconectar el cliente
 * y eliminar la base transitoria (eliminarBaseTransitoria) al terminar.
 *
 * Requisito: el usuario de la app necesita CREATEDB (documentado en
 * .env.example y provisionado por setup.sh / deploy.sh / docker-compose).
 * El nombre de la base es generado internamente (sin entrada de
 * usuario) y validado contra ^[a-z0-9_]+$ antes del único DDL.
 */
async function restaurarAVerificacion(
  archivo: string,
): Promise<{ lector: PrismaClient; baseTransitoria: string; total: number }> {
  const conn = analizarURLPostgres();
  const baseTransitoria = `cig_restauracion_${marcaTiempo().replace(/-/g, "")}_${sufijoAleatorio()}`;
  if (!/^[a-z0-9_]+$/.test(baseTransitoria)) {
    // Inalcanzable por construcción (defensa en profundidad ante el DDL).
    throw new Error("Identificador de base transitoria inválido");
  }
  const ruta = rutaRespaldo(archivo);

  // 1. Crear la base transitoria (identificador doble-quoteado).
  await ejecutarPGO(
    "psql",
    [
      ...argumentosConexion(conn),
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      `CREATE DATABASE "${baseTransitoria}";`,
    ],
    "RESPALDO_FALLIDO",
  );

  // 2. Restaurar el volcado completo ahí (exit-on-error: el menor
  //    problema de datos aborta toda la restauración transitoria).
  try {
    await ejecutarPGO(
      "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        ...argumentosConexion(conn),
        "--dbname",
        baseTransitoria,
        ruta,
      ],
      "RESPALDO_CORRUPTO",
    );
  } catch (e) {
    await eliminarBaseTransitoria(baseTransitoria).catch(() => undefined);
    throw e;
  }

  // 3. Conectar el cliente lector a la base transitoria.
  const urlTransitoria = new URL(process.env.DATABASE_URL ?? "");
  urlTransitoria.pathname = `/${baseTransitoria}`;
  const lector = new PrismaClient({
    datasources: { db: { url: urlTransitoria.toString() } },
  });

  try {
    // 4. Validación de esquema + conteo exacto (columnas incluidas:
    //    cualquier divergencia de columnas estalla en findMany/count).
    const presentes = await tablasEnBase(lector);
    if (!esquemaCompatible(presentes)) {
      throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);
    }
    const total = await contarRegistros(lector);
    return { lector, baseTransitoria, total };
  } catch (e) {
    await lector.$disconnect().catch(() => undefined);
    await eliminarBaseTransitoria(baseTransitoria).catch(() => undefined);
    if (e instanceof ErrorNegocio) throw e;
    console.error(
      `[respaldo] No se pudo validar la restauración de «${archivo}»: ${sanearParaLog(
        e instanceof Error ? e.message : String(e),
      )}`,
    );
    throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);
  }
}

/** Elimina la base transitoria (identificador generado + validado). */
async function eliminarBaseTransitoria(baseTransitoria: string): Promise<void> {
  if (!/^[a-z0-9_]+$/.test(baseTransitoria)) return;
  const conn = analizarURLPostgres();
  await ejecutarPG(
    "psql",
    [
      ...argumentosConexion(conn),
      "--dbname",
      "postgres",
      "--set",
      "ON_ERROR_STOP=1",
      "--command",
      `DROP DATABASE IF EXISTS "${baseTransitoria}";`,
    ],
  ).catch((error) => {
    // No interrumpe la operación principal: queda rastro auditable
    // para limpieza manual (el nombre es determinista y trazable).
    console.warn(
      `[respaldo] No se pudo eliminar la base transitoria «${baseTransitoria}»: ${describirFalloPG(
        error,
        "psql",
      )}`,
    );
  });
}

// ============================================================
// SUBIR RESPALDO EXTERNO (ARCHIVO DESCARGADO)
// ============================================================

/**
 * Registra un respaldo subido manualmente (p. ej. un archivo .dump
 * descargado antes con «Descargar» y guardado fuera de la máquina).
 *
 * El archivo se valida ANTES de quedar disponible: cabecera PGDMP,
 * integridad del contenedor (pg_restore --list) y esquema compatible.
 * Si algo falla, la subida se rechaza con el error concreto y NO queda
 * rastro en la carpeta. Si pasa, se publica como respaldo-<marca>-sub.dump
 * y queda en la lista como SUBIDO, restaurable igual que cualquier otro
 * respaldo (en caliente, con snapshot previo y ventana de reversión).
 */
export async function subirRespaldo(args: {
  bytes: Buffer;
  nombreOriginal: string;
  usuario: string;
}): Promise<FilaRespaldo> {
  return conCandado(async () => {
    const carpeta = carpetaRespaldos();

    // 1. Sanidad básica del contenido
    if (args.bytes.length === 0) throw new ErrorNegocio("ARCHIVO_VACIO", 400);
    if (args.bytes.length > TAMANO_MAX_SUBIDA_BYTES) {
      throw new ErrorNegocio("ARCHIVO_MUY_GRANDE", 413);
    }
    if (args.bytes.subarray(0, 5).toString("latin1") !== MAGICO_PG_DUMP) {
      throw new ErrorNegocio("ARCHIVO_NO_RESPALDO", 400);
    }

    // 2. Destino único: respaldo-AAAAMMDD-HHmmss-sub.dump
    let archivo = `respaldo-${marcaTiempo()}-sub${EXTENSION_RESPALDO}`;
    for (let i = 2; fs.existsSync(path.join(carpeta, archivo)); i++) {
      archivo = `respaldo-${marcaTiempo()}-sub-${i}${EXTENSION_RESPALDO}`;
    }
    // Temporal con sufijo .tmp (invisible para el escáner de la carpeta)
    const temporal = path.join(carpeta, `.${archivo}.tmp`);

    // 3. Escribir y validar ANTES de publicar el archivo en la carpeta
    fs.writeFileSync(temporal, args.bytes);
    let totalRegistros: number;
    try {
      totalRegistros = await validarArchivoRespaldo(path.basename(temporal));
    } catch (e) {
      fs.rmSync(temporal, { force: true });
      if (e instanceof ErrorNegocio) throw e;
      console.error(
        `[respaldo] Subida rechazada «${args.nombreOriginal}»: ${sanearParaLog(
          e instanceof Error ? e.message : String(e),
        )}`,
      );
      throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);
    }

    // 4. Publicar: renombrado atómico + registro (sin huérfanos)
    try {
      fs.renameSync(temporal, path.join(carpeta, archivo));
      const fila = await db.respaldoBD.create({
        data: {
          archivo,
          tipo: "SUBIDO",
          etiqueta: args.nombreOriginal.trim().slice(0, 120) || null,
          tamanoBytes: args.bytes.length,
          totalRegistros,
          compatible: true,
          creadoPor: args.usuario,
        },
      });
      return aRespaldo(fila);
    } catch (e) {
      // La carpeta queda sin rastro del intento
      fs.rmSync(temporal, { force: true });
      fs.rmSync(path.join(carpeta, archivo), { force: true });
      throw e;
    }
  });
}

// ============================================================
// RESTAURAR (EN CALIENTE, TRANSACCIONAL, CON REVERSIÓN)
// ============================================================

export type ResultadoRestauracion = {
  restauracion: FilaRestauracion;
  resumen: {
    archivo: string;
    totalRegistros: number;
    duracionMs: number;
    ventanaReversaHasta: string | null;
    tipo: "RESTAURACION" | "REVERSION";
  };
  /**
   * Diff de cuentas añadidas/eliminadas por la restauración (auditoría
   * H5). Null cuando la restauración falló (la base no cambió: no hay
   * diferencias que reportar).
   */
  informeDiferencias: InformeDiferencias | null;
};

// ============================================================
// AUDITORÍA DE USUARIOS/ROLES (TASK-STR-007, HALLAZGO H5)
// ============================================================

/** Una fila del plantel de usuarios: correo, clave de rol y estado. */
type FilaPlantelUsuario = { correo: string; rol: { clave: string }; activo: boolean };

/**
 * Captura el plantel de usuarios/roles (correo, clave de rol, activo) de
 * la base VIVA. Se fotografía ANTES y DESPUÉS de cada restauración para
 * generar el informe de diferencias (OWASP ASVS 6.2.2: la restauración
 * es una acción suficientemente sensible como para auditar su efecto
 * sobre el plantel de cuentas).
 */
async function plantelUsuarios(): Promise<FilaPlantelUsuario[]> {
  return db.usuario.findMany({
    select: { correo: true, rol: { select: { clave: true } }, activo: true },
  });
}

/** Formato legible y auditable de una cuenta: "correo (ROL)" o
 *  "correo (ROL, INACTIVO)" si la cuenta estaba desactivada. */
function cuentaLegible(u: FilaPlantelUsuario): string {
  return `${u.correo} (${u.rol.clave}${u.activo ? "" : ", INACTIVO"})`;
}

/**
 * Diff del plantel de usuarios/roles alrededor de una restauración:
 * cuentas INTRODUCIDAS por el respaldo (presentes después, ausentes
 * antes) y cuentas ELIMINADAS (presentes antes, ausentes después). La
 * identidad de la cuenta es el correo (único en el modelo); el rol y el
 * estado se reportan del lado donde la cuenta existía.
 */
function diffPlantel(
  usuariosPre: FilaPlantelUsuario[],
  usuariosPost: FilaPlantelUsuario[],
): InformeDiferencias {
  const correosPre = new Set(usuariosPre.map((u) => u.correo));
  const correosPost = new Set(usuariosPost.map((u) => u.correo));
  return {
    agregados: usuariosPost.filter((u) => !correosPre.has(u.correo)).map(cuentaLegible),
    eliminados: usuariosPre.filter((u) => !correosPost.has(u.correo)).map(cuentaLegible),
  };
}

/**
 * Núcleo de restauración: valida el respaldo restaurándolo a una base
 * transitoria (esquema + conteos verificados sin tocar la base viva),
 * crea el snapshot pre-restauración (punto de reversión) y reemplaza
 * los datos en una única transacción con copia POR LOTES (memoria
 * acotada). Si la transacción falla, PostgreSQL revierte todo: la base
 * queda intacta y el intento queda registrado como FALLIDA.
 */
async function restaurarNucleo(args: {
  respaldoId: string;
  usuario: string;
  tipo: "RESTAURACION" | "REVERSION";
  reversionDeId?: string;
}): Promise<ResultadoRestauracion> {
  const respaldo = await db.respaldoBD.findUnique({ where: { id: args.respaldoId } });
  if (!respaldo) throw new ErrorNegocio("RESPALDO_NO_EXISTE", 404);
  if (!respaldo.compatible) throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);

  const archivo = rutaRespaldo(respaldo.archivo);
  if (!fs.existsSync(archivo)) throw new ErrorNegocio("ARCHIVO_NO_DISPONIBLE", 409);

  // 1. Validar TODO el respaldo en la base transitoria (antes de
  //    escribir un solo dato de la base viva).
  const { lector, baseTransitoria, total } = await restaurarAVerificacion(respaldo.archivo);

  // 2. Snapshot pre-restauración: el punto de reversión de 24 h
  const snapshot = await crearRespaldo({
    tipo: "PRE_RESTAURACION",
    etiqueta: respaldo.archivo,
    usuario: args.usuario,
  });

  // 3. Bitácora del intento (sobrevive a la restauración: tabla excluida)
  const registro = await db.restauracionBD.create({
    data: {
      respaldoArchivo: respaldo.archivo,
      snapshotPre: snapshot.archivo,
      tipo: args.tipo,
      estado: "EN_PROGRESO",
      reversionDeId: args.reversionDeId ?? null,
      ejecutadaPor: args.usuario,
    },
  });

  // Columnas de llave primaria por tabla (paginación determinista).
  const llavesPorTabla = await columnasLlavePrimaria(lector);

  // 3bis. Captura PRE-restauración del plantel de usuarios/roles
  //      (auditoría H5): la fotografía contra la que se medirá qué
  //      cuentas introduce o elimina el respaldo. Se toma inmediatamente
  //      antes de la transacción para que el diff refleje SOLO el efecto
  //      de la restauración (cualquier alta producida durante la fase de
  //      verificación ya forma parte del estado «antes»).
  const usuariosPre = await plantelUsuarios();

  const t0 = Date.now();
  try {
    // 4. Reemplazo completo EN UNA TRANSACCIÓN: o entra todo, o no
    //    entra nada (con reintentos: una anomalía transitoria 40001/40P01
    //    no aborta la restauración; el callback se re-ejecuta completo).
    //    Copia por lotes: lectura paginada desde la base transitoria +
    //    createMany por lote — memoria O(lote), nunca O(base completa).
    await transaccion(
      async (tx) => {
        for (const modelo of ordenTablas().borrado) {
          await delegado(tx, modelo).deleteMany();
        }
        for (const modelo of ordenTablas().insercion) {
          const llaves = llavesPorTabla.get(modelo);
          if (!llaves || llaves.length === 0) {
            throw new Error(`Sin llave primaria declarada en la base transitoria: ${modelo}`);
          }
          // Orden estable para la paginación con OFFSET: un objeto por
          // columna de la llave (forma de ARRAY). La forma «objeto plano»
          // con varias columnas es rechazada por el validador del cliente
          // en modelos con llave primaria COMPUESTA (p. ej. ModeloParte);
          // el array de objetos es válido para todos y produce el mismo
          // orden determinista.
          const orderBy = llaves.map((c) => ({ [c]: "asc" }));
          let leidos = 0;
          for (;;) {
            const lote = await delegado(lector, modelo).findMany({
              orderBy,
              take: FILAS_POR_LOTE,
              skip: leidos,
            });
            if (lote.length === 0) break;
            await delegado(tx, modelo).createMany({ data: lote });
            leidos += lote.length;
            if (lote.length < FILAS_POR_LOTE) break;
          }
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (e) {
    // Rollback automático de PostgreSQL: la base quedó intacta
    const fallida = await db.restauracionBD.update({
      where: { id: registro.id },
      data: {
        estado: "FALLIDA",
        duracionMs: Date.now() - t0,
        error: sanearParaLog(e instanceof Error ? e.message : "ERROR_DESCONOCIDO").slice(0, 500),
      },
    });
    return {
      restauracion: aRestauracion(fallida),
      resumen: {
        archivo: respaldo.archivo,
        totalRegistros: 0,
        duracionMs: Date.now() - t0,
        ventanaReversaHasta: null,
        tipo: args.tipo,
      },
      // Sin diff: la base quedó intacta (rollback), no hay diferencias.
      informeDiferencias: null,
    };
  } finally {
    // La base transitoria y su conexión se liberan SIEMPRE.
    await lector.$disconnect().catch(() => undefined);
    await eliminarBaseTransitoria(baseTransitoria);
  }

  // 4bis. Captura POST-restauración y diff de cuentas (auditoría H5):
  //      qué usuarios/roles INTRODUJO o ELIMINÓ el respaldo restaurado.
  //      Solo se llega aquí con la transacción confirmada (el camino de
  //      fallo retornó antes, con la base intacta).
  const usuariosPost = await plantelUsuarios();
  const informe = diffPlantel(usuariosPre, usuariosPost);

  // Advertencia temprana en el log del servidor: una restauración que
  // INTRODUJO cuentas es la firma de un respaldo envenenado o de una
  // escalada involuntaria de accesos (persistencia sigilosa, hallazgo
  // H5). Además del informe persistido, la señal queda en el log para
  // el SIEM/operador (canal de alerta fuera de la respuesta HTTP).
  if (informe.agregados.length > 0) {
    console.warn(`[respaldo] La restauración INTRODUJO cuentas: ${informe.agregados.join("; ")}`);
  }

  // 5. Éxito: ventana de reversión de 24 h + informe de diferencias
  //    persistido en la bitácora (una sola actualización: el registro
  //    nunca queda COMPLETADA sin su informe).
  const completadaEn = new Date();
  const ventana = new Date(completadaEn.getTime() + VENTANA_REVERSA_HORAS * 3600_000);
  const completada = await db.restauracionBD.update({
    where: { id: registro.id },
    data: {
      estado: "COMPLETADA",
      completadaEn,
      ventanaReversaHasta: ventana,
      totalRegistros: total,
      duracionMs: Date.now() - t0,
      informeDiferencias: informe,
    },
  });

  return {
    restauracion: aRestauracion(completada),
    resumen: {
      archivo: respaldo.archivo,
      totalRegistros: total,
      duracionMs: completada.duracionMs,
      ventanaReversaHasta: ventana.toISOString(),
      tipo: args.tipo,
    },
    informeDiferencias: informe,
  };
}

/** Restaura un respaldo (requiere permiso respaldo.gestionar en la ruta) */
export async function restaurarRespaldo(
  respaldoId: string,
  usuario: string,
): Promise<ResultadoRestauracion> {
  return conCandado(() => restaurarNucleo({ respaldoId, usuario, tipo: "RESTAURACION" }));
}

/**
 * Revierte la última restauración exitosa dentro de su ventana de 24 h:
 * restaura el snapshot pre-restauración (la operación inversa completa).
 * La reversión es a su vez una restauración con su propia ventana.
 */
export async function revertirUltimaRestauracion(usuario: string): Promise<ResultadoRestauracion> {
  return conCandado(async () => {
    const objetivo = await db.restauracionBD.findFirst({
      where: { estado: "COMPLETADA", revertidaEn: null },
      orderBy: { iniciadaEn: "desc" },
    });
    if (!objetivo) throw new ErrorNegocio("NADA_QUE_REVERTIR", 409);
    if (!objetivo.ventanaReversaHasta || new Date(objetivo.ventanaReversaHasta) < new Date()) {
      throw new ErrorNegocio("VENTANA_EXPIRADA", 409);
    }
    if (!objetivo.snapshotPre || !fs.existsSync(rutaRespaldo(objetivo.snapshotPre))) {
      throw new ErrorNegocio("SNAPSHOT_NO_DISPONIBLE", 409);
    }
    const snapshot = await db.respaldoBD.findUnique({ where: { archivo: objetivo.snapshotPre } });
    if (!snapshot) throw new ErrorNegocio("SNAPSHOT_NO_DISPONIBLE", 409);

    const resultado = await restaurarNucleo({
      respaldoId: snapshot.id,
      usuario,
      tipo: "REVERSION",
      reversionDeId: objetivo.id,
    });

    if (resultado.restauracion.estado === "COMPLETADA") {
      await db.restauracionBD.update({
        where: { id: objetivo.id },
        data: { revertidaEn: new Date() },
      });
    }
    return resultado;
  });
}

// ============================================================
// ELIMINAR / DESCARGAR
// ============================================================

/** Elimina un respaldo (archivo + registro). Los snapshots con ventana
 *  activa no se pueden borrar: son el punto de reversión vigente. */
export async function eliminarRespaldo(id: string): Promise<{ ok: true }> {
  const respaldo = await db.respaldoBD.findUnique({ where: { id } });
  if (!respaldo) throw new ErrorNegocio("RESPALDO_NO_EXISTE", 404);

  if (respaldo.tipo === "PRE_RESTAURACION") {
    const activa = await db.restauracionBD.findFirst({
      where: { snapshotPre: respaldo.archivo, estado: "COMPLETADA", revertidaEn: null },
      orderBy: { iniciadaEn: "desc" },
    });
    if (activa?.ventanaReversaHasta && new Date(activa.ventanaReversaHasta) > new Date()) {
      throw new ErrorNegocio("SNAPSHOT_EN_USO", 409);
    }
  }

  try {
    fs.unlinkSync(rutaRespaldo(respaldo.archivo));
  } catch {
    /* el archivo ya no estaba: se limpia el registro igualmente */
  }
  await db.respaldoBD.delete({ where: { id } });
  return { ok: true };
}

/**
 * Descarga un respaldo (el volcado completo .dump) EN STREAMING: el
 * archivo nunca se carga entero en memoria del proceso de Node/Bun.
 */
export async function descargarRespaldo(id: string): Promise<{
  flujo: ReadableStream<Uint8Array>;
  archivo: string;
  tamanoBytes: number;
}> {
  const respaldo = await db.respaldoBD.findUnique({ where: { id } });
  if (!respaldo) throw new ErrorNegocio("RESPALDO_NO_EXISTE", 404);
  const archivo = rutaRespaldo(respaldo.archivo);
  if (!fs.existsSync(archivo)) throw new ErrorNegocio("ARCHIVO_NO_DISPONIBLE", 409);
  const tamanoBytes = fs.statSync(archivo).size;
  const flujo = Readable.toWeb(createReadStream(archivo)) as ReadableStream<Uint8Array>;
  return { flujo, archivo: respaldo.archivo, tamanoBytes };
}

// ============================================================
// ESTADO DEL MÓDULO (LISTA + LIMPIEZA + SINCRONIZACIÓN)
// ============================================================

export type EstadoReversion = {
  puedeRevertir: boolean;
  segundosRestantes: number | null;
  motivo: "NINGUNO" | "SIN_RESTAURACION" | "EN_PROGRESO" | "FALLIDA" | "YA_REVERTIDA" | "VENTANA_EXPIRADA" | "SNAPSHOT_NO_DISPONIBLE";
};

export type EstadoRespaldo = {
  respaldos: FilaRespaldo[];
  ultimaRestauracion: FilaRestauracion | null;
  reversion: EstadoReversion;
  autoPendiente: boolean;
  totalRegistrosVivos: number;
  tamanoBaseBytes: number;
};

/** Marca como FALLIDA cualquier restauración huérfana EN_PROGRESO.
 *  Resistente: si la bitácora tuviera datos ilegibles, no bloquea el módulo. */
async function limpiarInterrumpidas() {
  try {
    const limite = new Date(Date.now() - MIN_EN_PROGRESO * 60_000);
    await db.restauracionBD.updateMany({
      where: { estado: "EN_PROGRESO", iniciadaEn: { lt: limite } },
      data: { estado: "FALLIDA", error: "INTERRUMPIDA" },
    });
  } catch {
    /* bitácora ilegible: el resto del módulo sigue operando */
  }
}

/** Limpieza de archivos: snapshots viejos, rotación de automáticos,
 *  registros sin archivo. Los respaldos MANUALES nunca se borran solos. */
async function limpiezaRespaldos() {
  const carpeta = carpetaRespaldos();
  const filas = await db.respaldoBD.findMany({ orderBy: { creadoEn: "desc" } });

  // 0. Temporales de subidas interrumpidas (>1 h): fuera
  try {
    for (const nombre of fs.readdirSync(carpeta)) {
      if (!nombre.startsWith(".") || !nombre.endsWith(".tmp")) continue;
      const ruta = path.join(carpeta, nombre);
      if (Date.now() - fs.statSync(ruta).mtimeMs > 3600_000) fs.rmSync(ruta, { force: true });
    }
  } catch {
    /* la carpeta es inaccesible: el resto de la limpieza sigue */
  }

  // 1. Registros cuyo archivo desapareció (borrado externo)
  for (const f of filas) {
    if (!fs.existsSync(rutaRespaldo(f.archivo))) {
      await db.respaldoBD.delete({ where: { id: f.id } }).catch(() => undefined);
    }
  }

  // 2. Snapshots pre-restauración: viven HORAS_VIDA_SNAPSHOT (margen
  //    sobre la ventana de 24 h) y luego se retiran
  const limiteSnapshot = new Date(Date.now() - HORAS_VIDA_SNAPSHOT * 3600_000);
  for (const f of filas) {
    if (f.tipo !== "PRE_RESTAURACION" || f.creadoEn >= limiteSnapshot) continue;
    if (!fs.existsSync(rutaRespaldo(f.archivo))) continue;
    try {
      fs.unlinkSync(rutaRespaldo(f.archivo));
    } catch {
      continue;
    }
    await db.respaldoBD.delete({ where: { id: f.id } }).catch(() => undefined);
  }

  // 3. Rotación de automáticos: conservar los últimos N
  const automaticos = filas
    .filter((f) => f.tipo === "AUTOMATICO" && fs.existsSync(rutaRespaldo(f.archivo)))
    .sort((a, b) => b.creadoEn.getTime() - a.creadoEn.getTime());
  for (const f of automaticos.slice(MAX_RESPALDOS_AUTOMATICOS)) {
    try {
      fs.unlinkSync(rutaRespaldo(f.archivo));
    } catch {
      continue;
    }
    await db.respaldoBD.delete({ where: { id: f.id } }).catch(() => undefined);
  }
}

/** Detecta archivos .dump en la carpeta sin registro y los incorpora
 *  (validando integridad y esquema) como respaldos DETECTADO. */
async function sincronizarCarpeta() {
  const carpeta = carpetaRespaldos();
  const existentes = new Set(
    (await db.respaldoBD.findMany({ select: { archivo: true } })).map((r) => r.archivo),
  );
  const enDisco = fs
    .readdirSync(carpeta)
    .filter((n) => n.toLowerCase().endsWith(EXTENSION_RESPALDO) && !existentes.has(n));

  for (const nombre of enDisco) {
    let compatible = true;
    let totalRegistros = 0;
    try {
      // Validación ligera: cabecera + esquema declarado (pg_restore --list)
      totalRegistros = await validarArchivoRespaldo(nombre);
    } catch {
      compatible = false;
    }
    await db.respaldoBD
      .create({
        data: {
          archivo: nombre,
          tipo: "DETECTADO",
          etiqueta: null,
          tamanoBytes: fs.statSync(rutaRespaldo(nombre)).size,
          totalRegistros,
          compatible,
          creadoPor: null,
        },
      })
      .catch(() => undefined);
  }
}

/** Lectura resistente de la bitácora de restauraciones: ante una fila
 *  ilegible devuelve null en lugar de tumbar el módulo completo. */
async function leerRestauraciones<T>(
  consulta: () => Promise<T | null>,
): Promise<T | null> {
  try {
    return await consulta();
  } catch {
    return null;
  }
}

/**
 * Tamaño en bytes de la base de datos viva según el SERVIDOR
 * (pg_database_size; consulta de catálogo sin entrada de usuario).
 * BigInt → Number: los tamaños de esta escala caben en double.
 */
async function tamanoBaseDatos(): Promise<number> {
  try {
    const filas = await db.$queryRaw<Array<{ tamano: bigint }>>(
      Prisma.sql`SELECT pg_database_size(current_database()) AS tamano`,
    );
    return Number(filas[0]?.tamano ?? 0);
  } catch {
    /* catálogo inaccesible: se reporta 0 */
    return 0;
  }
}

/** Estado completo del módulo (con limpieza previa) */
export async function obtenerEstadoRespaldo(): Promise<EstadoRespaldo> {
  await limpiarInterrumpidas();
  await conCandado(async () => {
    await limpiezaRespaldos();
    await sincronizarCarpeta();
  });

  const [respaldos, ultima] = await Promise.all([
    db.respaldoBD.findMany({ orderBy: { creadoEn: "desc" } }).catch(() => []),
    leerRestauraciones(() => db.restauracionBD.findFirst({ orderBy: { iniciadaEn: "desc" } })),
  ]);

  // ¿Reversión disponible? (última restauración exitosa y no revertida)
  const revertible = await leerRestauraciones(() =>
    db.restauracionBD.findFirst({
      where: { estado: "COMPLETADA", revertidaEn: null },
      orderBy: { iniciadaEn: "desc" },
    }),
  );
  let reversion: EstadoReversion = {
    puedeRevertir: false,
    segundosRestantes: null,
    motivo: "SIN_RESTAURACION",
  };
  if (revertible) {
    const restante = revertible.ventanaReversaHasta
      ? Math.floor((new Date(revertible.ventanaReversaHasta).getTime() - Date.now()) / 1000)
      : -1;
    if (restante <= 0) {
      reversion = { puedeRevertir: false, segundosRestantes: 0, motivo: "VENTANA_EXPIRADA" };
    } else if (!revertible.snapshotPre || !fs.existsSync(rutaRespaldo(revertible.snapshotPre))) {
      reversion = {
        puedeRevertir: false,
        segundosRestantes: restante,
        motivo: "SNAPSHOT_NO_DISPONIBLE",
      };
    } else {
      reversion = { puedeRevertir: true, segundosRestantes: restante, motivo: "NINGUNO" };
    }
  }

  // ¿Respaldo automático pendiente? (ninguno manual/automático en 24 h)
  const ultimoUtil = await db.respaldoBD.findFirst({
    where: { tipo: { in: ["MANUAL", "AUTOMATICO"] } },
    orderBy: { creadoEn: "desc" },
  });
  const autoPendiente =
    !ultimoUtil || Date.now() - ultimoUtil.creadoEn.getTime() >= 24 * 3600_000;

  return {
    respaldos: respaldos.map(aRespaldo),
    ultimaRestauracion: ultima ? aRestauracion(ultima) : null,
    reversion,
    autoPendiente,
    totalRegistrosVivos: await contarRegistros(db),
    tamanoBaseBytes: await tamanoBaseDatos(),
  };
}

/**
 * Respaldo automático diario: lo crea si no hay ningún respaldo
 * (manual o automático) de las últimas 24 h. Lo dispara la UI al
 * abrir el módulo; el servidor re-valida la condición.
 */
export async function respaldoAutomaticoSiProcede(usuario: string): Promise<FilaRespaldo | null> {
  return conCandado(async () => {
    const ultimoUtil = await db.respaldoBD.findFirst({
      where: { tipo: { in: ["MANUAL", "AUTOMATICO"] } },
      orderBy: { creadoEn: "desc" },
    });
    if (ultimoUtil && Date.now() - ultimoUtil.creadoEn.getTime() < 24 * 3600_000) return null;
    return crearRespaldo({ tipo: "AUTOMATICO", usuario });
  });
}
