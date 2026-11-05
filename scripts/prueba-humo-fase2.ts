/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * PRUEBA DE HUMO — FASE 2 (concurrencia SQLite: WAL + pool de 1 conexión)
 * ============================================================================
 * Ejercita el MÓDULO REAL (src/lib/db.ts) contra la BD de desarrollo y
 * afirma que:
 *   1. prepararConexionBD() reporta journal_mode=wal y busy_timeout=5000.
 *   2. El modo WAL queda efectivo en la conexión (PRAGMA journal_mode).
 *   3. urlSQLiteSegura() fuerza connection_limit=1 SOLO en SQLite y no
 *      toca URLs de otros motores (agnosticismo al motor).
 *   4. El pool mantiene EXACTAMENTE 1 conexión (conteo de fd en /proc).
 *   5. VACUUM INTO (respaldo en caliente del módulo Respaldo) funciona
 *      bajo WAL y produce un archivo íntegro.
 *   6. PRAGMA wal_checkpoint(PASSIVE) ejecuta la maquinaria de WAL.
 *   7. Una escritura real genera el satélite -wal; el cierre limpio lo
 *      elimina (checkpoint automático: copia en frío segura).
 *
 * NOTA: esta prueba DEJA la BD de desarrollo en modo WAL (cambio
 * persistente deseado de la remediación). Idempotente: puede reejecutarse.
 *
 * Ejecutar: bun scripts/prueba-humo-fase2.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// ============================================================
// CARGA EXPLÍCITA DEL .env DEL PROYECTO (antes de importar el
// módulo bajo prueba, que lee DATABASE_URL al cargarse).
// La resolución automática de bun puede preferir el .env de un
// directorio superior (p. ej. la raíz del repositorio), que no es
// la configuración de esta aplicación: aquí se fija la real.
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
const { db, prepararConexionBD, urlSQLiteSegura, BUSY_TIMEOUT_MS } = await import(
  "../src/lib/db"
);

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

/** N.º de file descriptors del proceso apuntando al archivo dado. */
function fdsHacia(ruta: string): number {
  let n = 0;
  for (const fd of fs.readdirSync("/proc/self/fd")) {
    try {
      if (fs.readlinkSync(`/proc/self/fd/${fd}`) === ruta) n++;
    } catch {
      /* fd cerrado entre readdir y readlink */
    }
  }
  return n;
}

async function main() {
  const archivoBD = rutaBaseDatos();
  console.log(`== FASE 2 · Prueba de humo ==`);
  console.log(`== BD: ${path.basename(archivoBD)} · URL de conexión del proyecto cargada explícitamente ==\n`);

  console.log("== 1) Endurecimiento al arranque (prepararConexionBD) ==");
  const info = await prepararConexionBD();
  afirmar(info.motor === "sqlite", `motor detectado: ${info.motor}`);
  afirmar(info.modoJournal === "wal", `journal_mode tras bootstrap: ${info.modoJournal}`);
  afirmar(
    info.busyTimeoutMs === BUSY_TIMEOUT_MS,
    `busy_timeout: ${info.busyTimeoutMs}ms (esperado ${BUSY_TIMEOUT_MS})`,
  );

  console.log("\n== 2) Lectura directa de los PRAGMA en la conexión ==");
  const modo = await db.$queryRawUnsafe<Array<{ journal_mode: string }>>(
    "PRAGMA journal_mode;",
  );
  afirmar(modo[0]?.journal_mode === "wal", `PRAGMA journal_mode → ${modo[0]?.journal_mode}`);
  const timeout = await db.$queryRawUnsafe<Array<{ timeout: bigint }>>(
    "PRAGMA busy_timeout;",
  );
  afirmar(
    Number(timeout[0]?.timeout) === BUSY_TIMEOUT_MS,
    `PRAGMA busy_timeout → ${Number(timeout[0]?.timeout)}ms`,
  );

  console.log("\n== 3) Normalización de URL (agnóstica al motor) ==");
  afirmar(
    urlSQLiteSegura("file:/tmp/app.db") === "file:/tmp/app.db?connection_limit=1",
    "SQLite sin parámetros → añade ?connection_limit=1",
  );
  afirmar(
    urlSQLiteSegura("file:/tmp/app.db?socket_timeout=10") ===
      "file:/tmp/app.db?socket_timeout=10&connection_limit=1",
    "SQLite con otros parámetros → añade &connection_limit=1",
  );
  afirmar(
    urlSQLiteSegura("file:/tmp/app.db?connection_limit=1") === "file:/tmp/app.db?connection_limit=1",
    "SQLite ya configurada → se respeta (idempotente)",
  );
  afirmar(
    urlSQLiteSegura("postgresql://usuario:clave@host:5432/produccion") ===
      "postgresql://usuario:clave@host:5432/produccion",
    "PostgreSQL → INTACTA (sin ramificaciones de motor fuera de db.ts)",
  );
  afirmar(urlSQLiteSegura(undefined) === undefined, "URL ausente → undefined (delegado a Prisma)");

  console.log("\n== 4) Pool de exactamente UNA conexión ==");
  await db.rol.count(); // materializa la conexión del pool
  const fds = fdsHacia(archivoBD);
  afirmar(fds === 1, `fd abiertos hacia la BD: ${fds} (esperado 1)`);

  console.log("\n== 5) Respaldo en caliente bajo WAL (VACUUM INTO) ==");
  const dirRespaldos = path.join(path.dirname(archivoBD), "backups");
  fs.mkdirSync(dirRespaldos, { recursive: true });
  const respaldoPrueba = path.join(dirRespaldos, `smoke-fase2-${Date.now()}.db`);
  await db.$executeRawUnsafe(`VACUUM INTO '${respaldoPrueba.replace(/'/g, "''")}'`);
  const integro = (() => {
    try {
      const cabecera = fs.readFileSync(respaldoPrueba).subarray(0, 15).toString();
      return cabecera === "SQLite format 3";
    } catch {
      return false;
    }
  })();
  afirmar(
    fs.existsSync(respaldoPrueba) && fs.statSync(respaldoPrueba).size > 0 && integro,
    "VACUUM INTO produce un archivo SQLite válido bajo WAL",
  );
  fs.rmSync(respaldoPrueba, { force: true });

  console.log("\n== 6) Checkpoint de WAL ==");
  const checkpoint = await db.$queryRawUnsafe<
    Array<{ busy: number | bigint; log: number | bigint; checkpointed: number | bigint }>
  >("PRAGMA wal_checkpoint(PASSIVE);");
  afirmar(
    checkpoint.length === 1,
    `wal_checkpoint(PASSIVE) responde: busy=${Number(checkpoint[0]?.busy)}, log=${Number(
      checkpoint[0]?.log,
    )}, checkpointed=${Number(checkpoint[0]?.checkpointed)}`,
  );

  console.log("\n== 7) Escritura real → satélite -wal → limpieza al cerrar ==");
  const rolTemporal = await db.rol.create({
    data: {
      clave: `SMOKE-FASE2-${Date.now()}`,
      nombre: "Prueba de humo Fase 2",
      nombreEn: "Phase 2 smoke test",
      permisos: "[]",
    },
  });
  const walPresente = fs.existsSync(archivoBD + "-wal");
  await db.rol.delete({ where: { id: rolTemporal.id } });
  afirmar(walPresente, "el archivo -wal aparece durante escrituras activas");
  await db.$disconnect();
  await new Promise((r) => setTimeout(r, 300));
  afirmar(
    !fs.existsSync(archivoBD + "-wal"),
    "el -wal se integra y elimina al cerrar la conexión (copia en frío segura)",
  );

  console.log("\n== 8) Persistencia del modo WAL en el archivo (reapertura) ==");
  const verificador = new PrismaClient({
    datasources: { db: { url: `file:${archivoBD}?connection_limit=1` } },
  });
  const reabierto = await verificador.$queryRawUnsafe<Array<{ journal_mode: string }>>(
    "PRAGMA journal_mode;",
  );
  afirmar(
    reabierto[0]?.journal_mode === "wal",
    `una conexión NUEVA lee journal_mode=${reabierto[0]?.journal_mode} (modo persistente en el archivo)`,
  );
  await verificador.$disconnect();

  console.log(
    fallas
      ? `\n✗ PRUEBA DE HUMO FALLIDA (${fallas} afirmaciones)`
      : "\n✔ PRUEBA DE HUMO COMPLETA: SQLite endurecida (WAL + busy_timeout + pool de 1)",
  );
  process.exitCode = fallas ? 1 : 0;
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exitCode = 1;
});
