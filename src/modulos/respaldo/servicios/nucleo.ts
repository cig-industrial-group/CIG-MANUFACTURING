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
 * LÓGICA DE SERVIDOR DEL MÓDULO RESPALDO
 *
 * Respaldo completo y restauración EN CALIENTE de la base de datos:
 *
 * · Crear respaldo: instantánea consistente con VACUUM INTO (SQLite).
 *   Funciona con el servidor en operación, sin bloquear a los lectores.
 *
 * · Subir respaldo externo: un archivo .db descargado antes (de esta
 *   u otra instalación con el mismo esquema) se valida —integridad y
 *   esquema— y queda registrado como SUBIDO; desde ahí se restaura
 *   igual que cualquier otro respaldo, con todas las garantías.
 *
 * · Restaurar (en caliente): una ÚNICA transacción borra y reinserta
 *   todas las tablas en orden topológico (hijos primero al borrar,
 *   padres primero al insertar, respetando las FK físicas). Si
 *   cualquier paso falla, la transacción se revierte completa: la base
 *   queda EXACTAMENTE como estaba (rollback automático). Antes de
 *   tocar un solo dato se crea un snapshot pre-restauración y se
 *   valida el respaldo (integridad + esquema compatible): se lee TODO
 *   el contenido ANTES de escribir, así un archivo corrupto o
 *   incompatible jamás alcanza a modificar la base.
 *
 * · Ventana de reversión de 24 h: cada restauración exitosa registra
 *   su snapshot pre-restauración. «Revertir» restaura ese snapshot
 *   (y es a su vez una restauración con su propia ventana), de modo
 *   que incluso un arrepentimiento tardío tiene salida — sin respaldos
 *   manuales intermedios.
 *
 * · Los registros de respaldo/restauración (RespaldoBD/RestauracionBD)
 *   describen archivos de ESTA máquina: se excluyen de la copia para
 *   que el inventario coincida siempre con el contenido de db/backups/.
 */
import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Horas de la ventana para revertir una restauración exitosa */
export const VENTANA_REVERSA_HORAS = 24;
/** Respaldos automáticos conservados (rotación) */
const MAX_RESPALDOS_AUTOMATICOS = 7;
/** Antigüedad (h) a partir de la cual se limpian los snapshots pre-restauración */
const HORAS_VIDA_SNAPSHOT = 48;
/** Una restauración EN_PROGRESO más antigua que esto se considera interrumpida */
const MIN_EN_PROGRESO = 15;
/** Filas por lote de createMany (límite de variables de SQLite) */
const FILAS_POR_LOTE = 200;
/** Tamaño máximo aceptado para un archivo de respaldo subido (1 GB) */
export const TAMANO_MAX_SUBIDA_BYTES = 1024 * 1024 * 1024;
/** Cabecera de todo archivo SQLite válido (primeros 16 bytes) */
const MAGICO_SQLITE = "SQLite format 3\0";

/** Modelos excluidos de la copia al restaurar: registros de esta máquina */
const MODELOS_EXCLUIDOS = new Set(["RespaldoBD", "RestauracionBD"]);

// ============================================================
// RUTAS DE ARCHIVOS
// ============================================================

/** Ruta absoluta del archivo de la base de datos viva */
export function rutaBaseDatos(): string {
  const url = process.env.DATABASE_URL ?? "file:./db/custom.db";
  const limpia = url.replace(/^file:/, "").split("?")[0];
  return path.isAbsolute(limpia) ? limpia : path.resolve(process.cwd(), limpia);
}

/** Carpeta de respaldos (junto a la base); la crea si no existe */
export function carpetaRespaldos(): string {
  const carpeta = path.join(path.dirname(rutaBaseDatos()), "backups");
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

/** Escapa comillas simples para SQL literal (VACUUM INTO '...') */
function escSql(valor: string): string {
  return valor.replace(/'/g, "''");
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
};

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
}): FilaRestauracion {
  return {
    ...r,
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
// CREAR RESPALDO
// ============================================================

/**
 * Crea un respaldo completo y consistente de la base de datos
 * (VACUUM INTO: instantánea atómica aunque haya actividad en curso).
 */
export async function crearRespaldo(args: {
  tipo: "MANUAL" | "AUTOMATICO" | "PRE_RESTAURACION";
  etiqueta?: string;
  usuario: string;
}): Promise<FilaRespaldo> {
  const carpeta = carpetaRespaldos();
  const sufijo = args.tipo === "MANUAL" ? "man" : args.tipo === "AUTOMATICO" ? "aut" : "pre";

  // Nombre único: respaldo-AAAAMMDD-HHmmss-<tipo>.db
  let archivo = `respaldo-${marcaTiempo()}-${sufijo}.db`;
  for (let i = 2; fs.existsSync(path.join(carpeta, archivo)); i++) {
    archivo = `respaldo-${marcaTiempo()}-${sufijo}-${i}.db`;
  }

  await db.$executeRawUnsafe(`VACUUM INTO '${escSql(path.join(carpeta, archivo))}'`);

  const tamanoBytes = fs.statSync(path.join(carpeta, archivo)).size;
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
// VALIDACIÓN Y LECTURA DE UN RESPALDO
// ============================================================

/** Abre un cliente lector sobre el archivo de respaldo */
function lectorDe(archivo: string): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: `file:${rutaRespaldo(archivo)}?connection_limit=1` } },
  });
}

/** Nombres de las tablas presentes en un archivo de respaldo */
async function tablasEnArchivo(lector: PrismaClient): Promise<Set<string>> {
  const tablas = await lector.$queryRawUnsafe<{ name: string }[]>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'",
  );
  return new Set(tablas.map((t) => t.name));
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
 * Validación RÁPIDA de un archivo de respaldo (sin copiar datos):
 * integridad física (quick_check), esquema compatible y conteo de
 * registros. Lanza ErrorNegocio (RESPALDO_CORRUPTO / RESPALDO_INCOMPATIBLE)
 * si el archivo no es utilizable.
 */
async function validarArchivoRespaldo(nombre: string): Promise<number> {
  const lector = lectorDe(nombre);
  try {
    // 1. Integridad física (un archivo ilegible también cae aquí)
    let integro = false;
    try {
      const check = await lector.$queryRawUnsafe<{ quick_check: string }[]>("PRAGMA quick_check");
      integro = check[0]?.quick_check === "ok";
    } catch {
      integro = false;
    }
    if (!integro) throw new ErrorNegocio("RESPALDO_CORRUPTO", 409);

    // 2. Esquema compatible
    let compatible = false;
    try {
      compatible = esquemaCompatible(await tablasEnArchivo(lector));
    } catch {
      compatible = false;
    }
    if (!compatible) throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);

    // 3. Conteo de registros de datos (una sola consulta)
    const conteo = await lector.$queryRawUnsafe<{ total: number | bigint }[]>(
      `SELECT ${ordenTablas().insercion.map((m) => `(SELECT COUNT(*) FROM "${m}")`).join(" + ")} AS total`,
    );
    return Number(conteo[0]?.total ?? 0);
  } finally {
    await lector.$disconnect().catch(() => undefined);
  }
}

/**
 * Valida un archivo de respaldo y devuelve TODO su contenido leído
 * en memoria (orden de inserción). Se llama ANTES de escribir nada:
 * un archivo corrupto o de un esquema incompatible falla aquí, sin
 * tocar la base viva.
 */
async function leerRespaldo(archivo: string): Promise<{ datos: Map<string, object[]>; total: number }> {
  const lector = lectorDe(archivo);
  try {
    // 1. Integridad física + esquema compatible (mismas reglas que al subir)
    let integro = false;
    try {
      const check = await lector.$queryRawUnsafe<{ quick_check: string }[]>("PRAGMA quick_check");
      integro = check[0]?.quick_check === "ok";
    } catch {
      integro = false;
    }
    if (!integro) throw new ErrorNegocio("RESPALDO_CORRUPTO", 409);
    if (!esquemaCompatible(await tablasEnArchivo(lector))) {
      throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);
    }

    // 2. Lectura completa (cualquier divergencia de columnas estalla aquí)
    const datos = new Map<string, object[]>();
    let total = 0;
    for (const modelo of ordenTablas().insercion) {
      const filas = await delegado(lector, modelo).findMany();
      datos.set(modelo, filas);
      total += filas.length;
    }
    return { datos, total };
  } catch (e) {
    if (e instanceof ErrorNegocio) throw e;
    // Error de lectura → esquema distinto o archivo dañado (con detalle en el log)
    console.error(
      `[respaldo] No se pudo leer «${archivo}»: ${e instanceof Error ? e.message : String(e)}`,
    );
    throw new ErrorNegocio("RESPALDO_INCOMPATIBLE", 409);
  } finally {
    await lector.$disconnect().catch(() => undefined);
  }
}

// ============================================================
// SUBIR RESPALDO EXTERNO (ARCHIVO DESCARGADO)
// ============================================================

/**
 * Registra un respaldo subido manualmente (p. ej. un archivo .db
 * descargado antes con «Descargar» y guardado fuera de la máquina).
 *
 * El archivo se valida ANTES de quedar disponible: integridad física,
 * esquema compatible y conteo. Si algo falla, la subida se rechaza con
 * el error concreto y NO queda rastro en la carpeta. Si pasa, se
 * publica como respaldo-<marca>-sub.db y queda en la lista como
 * SUBIDO, restaurable igual que cualquier otro respaldo (en caliente,
 * con snapshot previo y ventana de reversión de 24 h).
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
    if (args.bytes.subarray(0, 16).toString("latin1") !== MAGICO_SQLITE) {
      throw new ErrorNegocio("ARCHIVO_NO_SQLITE", 400);
    }

    // 2. Destino único: respaldo-AAAAMMDD-HHmmss-sub.db
    let archivo = `respaldo-${marcaTiempo()}-sub.db`;
    for (let i = 2; fs.existsSync(path.join(carpeta, archivo)); i++) {
      archivo = `respaldo-${marcaTiempo()}-sub-${i}.db`;
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
        `[respaldo] Subida rechazada «${args.nombreOriginal}»: ${e instanceof Error ? e.message : String(e)}`,
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
};

/**
 * Núcleo de restauración: valida y lee el respaldo, crea el snapshot
 * pre-restauración (punto de reversión) y reemplaza los datos en una
 * única transacción. Si la transacción falla, SQLite revierte todo:
 * la base queda intacta y el intento queda registrado como FALLIDA.
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
  if (path.resolve(archivo) === path.resolve(rutaBaseDatos())) {
    throw new ErrorNegocio("ARCHIVO_INVALIDO", 400);
  }

  // 1. Validar y leer TODO el respaldo (antes de escribir un solo dato)
  const { datos, total } = await leerRespaldo(respaldo.archivo);

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

  const t0 = Date.now();
  try {
    // 4. Reemplazo completo EN UNA TRANSACCIÓN: o entra todo, o no entra nada
    await db.$transaction(
      async (tx) => {
        for (const modelo of ordenTablas().borrado) {
          await delegado(tx, modelo).deleteMany();
        }
        for (const modelo of ordenTablas().insercion) {
          const filas = datos.get(modelo) ?? [];
          for (let i = 0; i < filas.length; i += FILAS_POR_LOTE) {
            await delegado(tx, modelo).createMany({ data: filas.slice(i, i + FILAS_POR_LOTE) });
          }
        }
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (e) {
    // Rollback automático de SQLite: la base quedó intacta
    const fallida = await db.restauracionBD.update({
      where: { id: registro.id },
      data: {
        estado: "FALLIDA",
        duracionMs: Date.now() - t0,
        error: e instanceof Error ? e.message.slice(0, 500) : "ERROR_DESCONOCIDO",
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
    };
  }

  // 5. Éxito: ventana de reversión de 24 h
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

/** Descarga un respaldo (el archivo completo .db) */
export async function descargarRespaldo(id: string): Promise<{ buffer: Buffer; archivo: string }> {
  const respaldo = await db.respaldoBD.findUnique({ where: { id } });
  if (!respaldo) throw new ErrorNegocio("RESPALDO_NO_EXISTE", 404);
  const archivo = rutaRespaldo(respaldo.archivo);
  if (!fs.existsSync(archivo)) throw new ErrorNegocio("ARCHIVO_NO_DISPONIBLE", 409);
  return { buffer: fs.readFileSync(archivo), archivo: respaldo.archivo };
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

/** Detecta archivos .db en la carpeta sin registro y los incorpora
 *  (validando esquema e integridad) como respaldos DETECTADO. */
async function sincronizarCarpeta() {
  const carpeta = carpetaRespaldos();
  const existentes = new Set(
    (await db.respaldoBD.findMany({ select: { archivo: true } })).map((r) => r.archivo),
  );
  const enDisco = fs
    .readdirSync(carpeta)
    .filter((n) => n.toLowerCase().endsWith(".db") && !existentes.has(n));

  for (const nombre of enDisco) {
    let compatible = true;
    let totalRegistros = 0;
    try {
      // Validación ligera: integridad + esquema + conteo en una sola pasada
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

  let tamanoBaseBytes = 0;
  try {
    tamanoBaseBytes = fs.statSync(rutaBaseDatos()).size;
  } catch {
    /* base no accesible por fs: se reporta 0 */
  }

  return {
    respaldos: respaldos.map(aRespaldo),
    ultimaRestauracion: ultima ? aRestauracion(ultima) : null,
    reversion,
    autoPendiente,
    totalRegistrosVivos: await contarRegistros(db),
    tamanoBaseBytes,
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
