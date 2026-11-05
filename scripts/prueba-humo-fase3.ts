/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * PRUEBA DE HUMO — FASE 3 (envoltorio de reintentos para errores
 * transitorios de la capa de datos)
 * ============================================================================
 * Ejercita el MÓDULO REAL (src/lib/reintentos.ts) contra la BD de
 * desarrollo y afirma que:
 *   1. esErrorTransitorio() clasifica correctamente la matriz de errores
 *      (transitorios: SQLITE_BUSY/LOCKED/BUSY_SNAPSHOT, P2034, P2024,
 *      mensajes del motor, causa anidada; NO transitorios: P2002,
 *      errores genéricos, null/undefined).
 *   2. conReintentos() devuelve sin reintentar cuando todo va bien.
 *   3. Un error NO transitorio se propaga en el 1.er intento (fallo
 *      rápido: jamás se reintenta un error de negocio/integridad).
 *   4. El agotamiento de intentos lanza el último error transitorio.
 *   5. Un error transitorio en el 1.er intento se recupera en el 2.º.
 *   6. transaccion() re-ejecuta la transacción COMPLETA: el intento
 *      fallido se descarta por rollback (cero escrituras parciales) y
 *      el reintento parte del estado original (prueba con BD real).
 *   7. Un cerrojo REAL de un proceso externo (transacción de escritura
 *      de un segundo cliente, como un mantenimiento con sqlite3 CLI)
 *      que excede el busy_timeout reducido de la prueba es absorbido
 *      por los reintentos: la escritura termina bien.
 *   8. Tras todo lo anterior la BD sigue íntegra (quick_check), en WAL
 *      y con su busy_timeout de operación restaurado (5000 ms).
 *
 * NOTA: esta prueba baja TEMPORALMENTE el busy_timeout de la conexión
 * de la app a 150 ms (para que el cerrojo externo de §7 exceda el
 * tiempo de espera interno y se ejerza el reintento) y lo RESTAURA a
 * 5000 ms al terminar. Idempotente: puede reejecutarse.
 *
 * Ejecutar: bun scripts/prueba-humo-fase3.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// ============================================================
// CARGA EXPLÍCITA DEL .env DEL PROYECTO (antes de importar los
// módulos bajo prueba, que leen DATABASE_URL al cargarse). La
// resolución automática de bun puede preferir el .env de un
// directorio superior: aquí se fija la real (patrón fase 2).
// ============================================================
function cargarEnvProyecto(): void {
  const directorioScript = path.dirname(fileURLToPath(import.meta.url));
  const rutaEnv = path.resolve(directorioScript, "..", ".env");
  for (const linea of fs.readFileSync(rutaEnv, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== "") process.env[m[1]] = m[2];
  }
}
cargarEnvProyecto();

// Importación DINÁMICA: se ejecuta tras fijar el entorno.
const { db, BUSY_TIMEOUT_MS, prepararConexionBD } = await import("../src/lib/db");
const {
  esErrorTransitorio,
  conReintentos,
  transaccion,
} = await import("../src/lib/reintentos");

let fallas = 0;
function afirmar(condicion: boolean, mensaje: string) {
  console.log(`  ${condicion ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!condicion) fallas++;
}

/** Ruta absoluta del archivo de BD viva (misma resolución que Respaldo). */
function rutaBaseDatos(): string {
  const url = process.env.DATABASE_URL ?? "";
  const limpia = url.replace(/^file:/, "").split("?")[0];
  return path.isAbsolute(limpia) ? limpia : path.resolve(process.cwd(), limpia);
}

/** Error con forma de PrismaClientKnownRequestError (code + message). */
function errorPrisma(codigo: string, mensaje: string): Error & { code: string } {
  const e = new Error(mensaje) as Error & { code: string };
  e.code = codigo;
  return e;
}

const PREFIJO_SMOKE = `SMOKE-FASE3-${new Date().toISOString().slice(0, 10)}`;

async function main() {
  const archivoBD = rutaBaseDatos();
  console.log(`== FASE 3 · Prueba de humo ==`);
  console.log(`== BD: ${path.basename(archivoBD)} · URL del proyecto cargada explícitamente ==\n`);

  // Bootstrap de fase 2 (garantiza WAL + busy_timeout=5000 antes de empezar)
  await prepararConexionBD();

  // Limpieza de restos de ejecuciones previas (idempotencia)
  await db.rol.deleteMany({ where: { clave: { startsWith: "SMOKE-FASE3-" } } });

  console.log("== 1) Clasificación esErrorTransitorio (matriz) ==");
  afirmar(esErrorTransitorio(errorPrisma("P1008", "Socket timeout (the database failed to respond to a query within the configured timeout)")), "P1008 (socket timeout: forma real del SQLITE_BUSY agotado, medida en §7) → transitorio");
  afirmar(esErrorTransitorio(errorPrisma("P2034", "Transaction failed due to a write conflict or a deadlock. Please retry your transaction")), "P2034 (conflicto de escritura) → transitorio");
  afirmar(esErrorTransitorio(errorPrisma("P2024", "Timed out fetching a new connection from the connection pool")), "P2024 (timeout del pool; la operación nunca empezó) → transitorio");
  afirmar(esErrorTransitorio(errorPrisma(String(5), "database is locked")), "código SQLite 5 (SQLITE_BUSY) → transitorio");
  afirmar(esErrorTransitorio(errorPrisma(String(6), "database table is locked")), "código SQLite 6 (SQLITE_LOCKED) → transitorio");
  afirmar(esErrorTransitorio(errorPrisma(String(517), "database is locked")), "código SQLite 517 (BUSY_SNAPSHOT) → transitorio");
  afirmar(esErrorTransitorio(errorPrisma("SQLITE_BUSY", "database is locked")), "código textual SQLITE_BUSY → transitorio");
  afirmar(esErrorTransitorio(new Error("Error code 5: The database file is locked")), "mensaje «database is locked» sin código → transitorio");
  afirmar(esErrorTransitorio(new Error("database table is locked")), "mensaje «database table is locked» → transitorio");
  const anidado = new Error("falla del driver", { cause: errorPrisma(String(5), "database is locked") });
  afirmar(esErrorTransitorio(anidado), "causa anidada (cause → código 5) → transitorio");
  const anidadoProfundo = new Error("a", { cause: new Error("b", { cause: new Error("SQLITE_BUSY: database is locked") }) });
  afirmar(esErrorTransitorio(anidadoProfundo), "cadena de causas profunda → transitorio");
  // NO transitorios: fallan rápido, jamás se reintenta un error real.
  afirmar(!esErrorTransitorio(errorPrisma("P2028", "Transaction already closed: expired")), "P2028 (la transacción excedió SU timeout de trabajo; no es un cerrojo) → NO transitorio");
  afirmar(!esErrorTransitorio(errorPrisma("P2002", "Unique constraint failed")), "P2002 (unicidad) → NO transitorio");
  afirmar(!esErrorTransitorio(errorPrisma("P2025", "Record not found")), "P2025 (no existe) → NO transitorio");
  afirmar(!esErrorTransitorio(new Error("STOCK_INSUFICIENTE")), "error de negocio → NO transitorio");
  afirmar(!esErrorTransitorio(new Error("boom")), "error genérico → NO transitorio");
  afirmar(!esErrorTransitorio(null), "null → NO transitorio (y no lanza)");
  afirmar(!esErrorTransitorio(undefined), "undefined → NO transitorio (y no lanza)");
  afirmar(!esErrorTransitorio("solo texto"), "valor no-objeto → NO transitorio (y no lanza)");

  console.log("\n== 2) Éxito a la primera: cero reintentos ==");
  let intentos2 = 0;
  const resultado2 = await conReintentos(async () => {
    intentos2++;
    return 42;
  });
  afirmar(resultado2 === 42 && intentos2 === 1, `resultado ${resultado2} con ${intentos2} intento (esperado 42 / 1)`);

  console.log("\n== 3) Error NO transitorio: propagación inmediata ==");
  let intentos3 = 0;
  const errorNegocio = new Error("STOCK_INSUFICIENTE");
  let lanzado3: unknown = null;
  try {
    await conReintentos(async () => {
      intentos3++;
      throw errorNegocio;
    });
  } catch (e) {
    lanzado3 = e;
  }
  afirmar(lanzado3 === errorNegocio, "el error original se propaga intacto");
  afirmar(intentos3 === 1, `se ejecutó ${intentos3} intento (esperado 1: sin reintentos inútiles)`);

  console.log("\n== 4) Agotamiento de intentos: lanza el último error ==");
  let intentos4 = 0;
  const transitorio4 = errorPrisma("P2034", "write conflict");
  let lanzado4: unknown = null;
  const t4a = Date.now();
  try {
    await conReintentos(
      async () => {
        intentos4++;
        throw transitorio4;
      },
      { intentos: 2, retardoBaseMs: 50, retardoMaximoMs: 100 },
    );
  } catch (e) {
    lanzado4 = e;
  }
  const duracion4 = Date.now() - t4a;
  afirmar(lanzado4 === transitorio4, "tras agotar intentos lanza el último error transitorio");
  afirmar(intentos4 === 2, `se ejecutaron ${intentos4} intentos (esperado 2)`);
  afirmar(duracion4 >= 20, `hubo espera de retroceso (${duracion4} ms >= 20 ms)`);

  console.log("\n== 5) Transitorio en el 1.er intento, éxito en el 2.º ==");
  let intentos5 = 0;
  const resultado5 = await conReintentos(
    async () => {
      intentos5++;
      if (intentos5 === 1) throw errorPrisma(String(5), "database is locked");
      return "ok";
    },
    { intentos: 3, retardoBaseMs: 25, retardoMaximoMs: 50 },
  );
  afirmar(resultado5 === "ok" && intentos5 === 2, `recuperación en el 2.º intento (resultado=${resultado5}, intentos=${intentos5})`);

  console.log("\n== 6) transaccion(): la transacción se re-ejecuta COMPLETA (BD real) ==");
  const claveRol = `${PREFIJO_SMOKE}-TX`;
  let ejecuciones6 = 0;
  await transaccion(
    async (tx) => {
      ejecuciones6++;
      await tx.rol.create({
        data: { clave: claveRol, nombre: "Prueba Fase 3", nombreEn: "Phase 3 test", permisos: "[]" },
      });
      // El 1.er intento falla DESPUÉS de escribir: prueba que el rollback
      // del intento fallido descarta la escritura parcial y el reintento
      // parte del estado original (idempotencia estructural).
      if (ejecuciones6 === 1) throw errorPrisma("SQLITE_BUSY", "database is locked");
    },
    undefined,
    { intentos: 3, retardoBaseMs: 25, retardoMaximoMs: 50 },
  );
  const roles6 = await db.rol.findMany({ where: { clave: claveRol } });
  afirmar(ejecuciones6 === 2, `el callback se ejecutó ${ejecuciones6} veces (esperado 2: reintento integral)`);
  afirmar(roles6.length === 1, `exactamente 1 rol creado (hubo ${roles6.length}): el intento fallido NO dejó escritura parcial (rollback)`);
  await db.rol.deleteMany({ where: { clave: claveRol } });

  console.log("\n== 7) Cerrojo REAL de proceso externo que excede el busy_timeout ==");
  // Cliente EXTERNO independiente (simula un proceso ajeno a la app, como
  // un mantenimiento con sqlite3 CLI): su propia conexión, connection_limit=1.
  const externo = new PrismaClient({
    datasources: { db: { url: `file:${archivoBD}?connection_limit=1` } },
  });
  // La conexión de la app baja su busy_timeout a 150 ms SOLO durante esta
  // sección: así el cerrojo externo (1 500 ms) lo excede y se ejerce el
  // reintento (en operación real: busy_timeout=5000 y cerrojos más largos).
  await db.$queryRawUnsafe("PRAGMA busy_timeout=150;");
  // Cerrojo: transacción interactiva del cliente externo que ESCRIBE y
  // mantiene el cerrojo de escritura de SQLite (en WAL solo hay un
  // escritor a la vez) durante 1 500 ms.
  const claveRolExt = `${PREFIJO_SMOKE}-EXT`;
  const bloqueo = externo.$transaction(async (extTx) => {
    await extTx.rol.create({
      data: { clave: claveRolExt, nombre: "Cerrojo externo", nombreEn: "External lock", permisos: "[]" },
    });
    await new Promise((r) => setTimeout(r, 1500));
  });
  // Margen para que el externo adquiera el cerrojo antes de la escritura.
  await new Promise((r) => setTimeout(r, 250));
  let intentos7 = 0;
  const t7 = Date.now();
  const claveRol7 = `${PREFIJO_SMOKE}-LOCK`;
  let exito7 = false;
  try {
    await conReintentos(
      async () => {
        intentos7++;
        return db.rol.create({
          data: { clave: claveRol7, nombre: "Prueba Fase 3 lock", nombreEn: "Phase 3 lock test", permisos: "[]" },
        });
      },
      { intentos: 8, retardoBaseMs: 150, retardoMaximoMs: 500 },
    );
    exito7 = true;
  } finally {
    await bloqueo; // el externo libera el cerrojo (commit) pase lo que pase
  }
  const duracion7 = Date.now() - t7;
  const rol7 = exito7 ? await db.rol.findFirst({ where: { clave: claveRol7 } }) : null;
  afirmar(
    exito7 && rol7 !== null,
    `la escritura terminó bien pese al cerrojo externo de 1 500 ms (${duracion7} ms totales)`,
  );
  afirmar(
    intentos7 >= 2,
    `hubo reintento real (${intentos7} intentos: el busy_timeout de 150 ms fue excedido y el envoltorio recuperó)`,
  );
  await db.rol.deleteMany({ where: { clave: claveRol7 } });
  await db.rol.deleteMany({ where: { clave: claveRolExt } });

  console.log("\n== 8) Estado final de la BD: intacta ==");
  await db.$queryRawUnsafe(`PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`);
  const timeoutFinal = await db.$queryRawUnsafe<Array<{ timeout: bigint }>>("PRAGMA busy_timeout;");
  afirmar(
    Number(timeoutFinal[0]?.timeout) === BUSY_TIMEOUT_MS,
    `busy_timeout restaurado: ${Number(timeoutFinal[0]?.timeout)} ms (esperado ${BUSY_TIMEOUT_MS})`,
  );
  const modoFinal = await db.$queryRawUnsafe<Array<{ journal_mode: string }>>("PRAGMA journal_mode;");
  afirmar(modoFinal[0]?.journal_mode === "wal", `journal_mode sigue en WAL (${modoFinal[0]?.journal_mode})`);
  const integridad = await db.$queryRawUnsafe<Array<{ quick_check: string }>>("PRAGMA quick_check;");
  afirmar(integridad[0]?.quick_check === "ok", `PRAGMA quick_check → ${integridad[0]?.quick_check}`);
  const restos = await db.rol.count({ where: { clave: { startsWith: "SMOKE-FASE3-" } } });
  afirmar(restos === 0, `sin filas de prueba residuales (hubo ${restos})`);
  await externo.$disconnect();

  console.log(
    fallas
      ? `\n✗ PRUEBA DE HUMO FALLIDA (${fallas} afirmaciones)`
      : `\n✔ PRUEBA DE HUMO COMPLETA: envoltorio de reintentos verificado (clasificación + fallo rápido + retroceso + reintento integral + cerrojo externo real)`,
  );
  process.exitCode = fallas ? 1 : 0;
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exitCode = 1;
});
