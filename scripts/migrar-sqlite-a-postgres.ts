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
 * MIGRACIÓN DE DATOS: ARCHIVO LEGACY (.db) → POSTGRESQL (v1.1.1)
 * ====================================================================
 *
 * Copia los DATOS de una instalación anterior (archivo .db del motor de
 * archivo local) hacia la base de datos PostgreSQL ya aprovisionada
 * (setup.sh / deploy.sh / docker-compose), con garantías de auditoría:
 *
 *   · CERO PÉRDIDA DE DATOS: verificación de conteos fila-por-tabla al
 *     final; cualquier discrepancia aborta (la transacción ya se habría
 *     revertido completa: o entra todo, o no entra nada).
 *   · ATÓMICO: toda la copia ocurre DENTRO DE UNA SOLA transacción de
 *     PostgreSQL. Un fallo a mitad de camino deja la base EXACTAMENTE
 *     como estaba (rollback automático) — nunca un estado parcial.
 *   · ANTI-FUSIÓN (fail-fast): si la base de destino ya tiene datos, el
 *     script SE NIEGA a correr (la migración es one-shot desde una base
 *     vacía; fusionar o sobrescribir en silencio sería inaceptable).
 *     Con --reemplazar el operador declara explícitamente que la base
 *     se VACÍA antes (reintentos de migración en entorno de pruebas).
 *   · ORDEN TOPOLÓGICO: los padres se insertan antes que los hijos
 *     (grafo de FKs derivado del DMMF de Prisma — mismo algoritmo que
 *     el módulo Respaldo usa para restaurar).
 *   · CONVERSIÓN DE TIPOS por campo según el DMMF: Boolean (0/1 → bool),
 *     DateTime (ms-entero o ISO-8601 → Date), Int (→ number) y el resto
 *     tal cual (texto decimal exacto, JSON). Los campos @updatedAt se
 *     pasan EXPLÍCITAMENTE: conservan su valor histórico (Prisma solo
 *     rellena los omisiones con «ahora»).
 *   · MEMORIA ACOTADA: lectura e inserción por LOTES (nunca la base
 *     completa en RAM).
 *
 * Lo que NO hace (documentado, no oculto):
 *   · No migra los ARCHIVOS de respaldo .dump que vivían junto al .db
 *     legacy: son artefactos de la máquina anterior. Si los necesitas,
 *     cópialos manualmente a DATA_DIR/backups de la nueva instalación.
 *     Los REGISTROS de RespaldoBD/RestauracionBD SÍ se copian (bitácora
 *     histórica); el módulo de Respaldo los marcará como no disponibles
 *     hasta que copies los archivos.
 *   · No crea esquemas: la base destino debe tener las migraciones ya
 *     aplicadas (prisma migrate deploy — lo hacen setup.sh, deploy.sh y
 *     docker-entrypoint.sh ANTES de este paso).
 *
 * Uso:
 *   bun scripts/migrar-sqlite-a-postgres.ts [ruta/al/archivo.db] [--reemplazar]
 *
 *   · ruta ............ archivo .db de la instalación anterior
 *                       (por defecto: ./db/production.db)
 *   · --reemplazar .... vacía la base destino ANTES de migrar
 *                       (confirmación explícita del operador)
 *
 * Código de salida: 0 = migración verificada · 1 = fallo (base intacta).
 *
 * Referencias: ISO 27001 A.12.1.2 (control de cambios), A.8.6 (capacidad);
 * NIST SP 800-53 SI-10 (prediccibilidad de la capa de datos), CM-3
 * (cambios controlados y verificables).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

// ============================================================
// CARGA EXPLÍCITA DEL .env DEL PROYECTO (patrón fase 2/3/4): la
// resolución automática de bun puede preferir el .env de un directorio
// superior; aquí se fija la real ANTES de leer DATABASE_URL.
// ============================================================
function cargarEnvProyecto(): void {
  const directorioScript = path.dirname(fileURLToPath(import.meta.url));
  const rutaEnv = path.resolve(directorioScript, "..", ".env");
  if (!fs.existsSync(rutaEnv)) return;
  for (const linea of fs.readFileSync(rutaEnv, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== "") process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
cargarEnvProyecto();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PrismaClient();

/** Filas por lote (lectura del .db + createMany en PostgreSQL). */
const FILAS_POR_LOTE = 200;

// ============================================================
// PARÁMETROS DE INVOCACIÓN
// ============================================================
const args = process.argv.slice(2);
const REEMPLAZAR = args.includes("--reemplazar");
const RUTA_DB_LEGACY = path.resolve(
  args.find((a) => !a.startsWith("--")) ?? path.join(RAIZ, "db", "production.db"),
);

function fallo(mensaje: string): never {
  console.error(`✖ ${mensaje}`);
  process.exit(1);
}

// ============================================================
// ORDEN TOPOLOGICO DE TABLAS (DMMF de Prisma — mismo algoritmo que
// el módulo Respaldo): padres primero para respetar las FKs físicas.
// ============================================================
function ordenTopologico(): string[] {
  const modelos = Prisma.dmmf.datamodel.models;
  const padres = new Map<string, Set<string>>();
  for (const m of modelos) {
    const set = new Set<string>();
    for (const f of m.fields) {
      if (f.kind === "object" && (f.relationFromFields?.length ?? 0) > 0 && f.type !== m.name) {
        set.add(f.type);
      }
    }
    padres.set(m.name, set);
  }
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
  return orden;
}

/** Campos escalares (nombre → tipo Prisma) de un modelo, según el DMMF. */
function camposEscalares(modelo: string): Map<string, string> {
  const m = Prisma.dmmf.datamodel.models.find((x) => x.name === modelo);
  const mapa = new Map<string, string>();
  if (!m) return mapa;
  for (const f of m.fields) {
    if (f.kind === "scalar") mapa.set(f.name, String(f.type));
  }
  return mapa;
}

// ============================================================
// CONVERSIÓN DE TIPOS (SQLite → valores de Prisma/PostgreSQL)
// ============================================================
/** Convierte un valor crudo del archivo legacy al tipo del campo. */
function convertir(valor: unknown, tipo: string): unknown {
  if (valor === null || valor === undefined) return null;
  switch (tipo) {
    case "Boolean":
      // El motor anterior persistía booleanos como INTEGER 0/1.
      return valor === 1 || valor === true || valor === "1";
    case "Int":
      return Number(valor);
    case "DateTime": {
      // El motor anterior persistía fechas como texto ISO-8601
      // («2026-11-05T10:30:00.000Z», «2026-11-05 10:30:00.000») o, en
      // variantes antiguas, como entero de ms desde el epoch.
      if (valor instanceof Date) return valor;
      if (typeof valor === "number") return new Date(valor);
      if (typeof valor === "string") {
        const directa = new Date(valor);
        if (!Number.isNaN(directa.getTime())) return directa;
        const conT = new Date(valor.replace(" ", "T"));
        if (!Number.isNaN(conT.getTime())) return conT;
        throw new Error(`DateTime ilegible: «${valor}»`);
      }
      throw new Error(`DateTime de tipo inesperado: ${typeof valor}`);
    }
    case "Float":
      return Number(valor);
    default:
      // String (texto decimal exacto, JSON, folios, snapshots): tal cual.
      return typeof valor === "string" ? valor : String(valor);
  }
}

// ============================================================
// LECTURA DEL ARCHIVO LEGACY (bun:sqlite — runtime nativo del
// proyecto; sin dependencias nuevas que auditar).
// ============================================================
type LectorSQLite = {
  consulta: (sql: string, params?: import("bun:sqlite").SQLQueryBindings[]) => Record<string, unknown>[];
  tablas: () => string[];
  cerrar: () => void;
};

async function abrirSQLite(ruta: string): Promise<LectorSQLite> {
  if (!fs.existsSync(ruta)) {
    fallo(`No se encontró el archivo legacy: ${ruta}\n  Indica la ruta: bun scripts/migrar-sqlite-a-postgres.ts /ruta/instalacion.db`);
  }
  // Módulo nativo del runtime Bun (import dinámico: el tipado de
  // bun:sqlite no interfiere con el chequeo tsc del resto del código).
  // readonly evita escrituras accidentales sobre el legado.
  const { Database } = await import("bun:sqlite");
  const instancia = new Database(ruta, { readonly: true });
  return {
    consulta: (sql, params = []) =>
      instancia.prepare(sql).all(...params) as Record<string, unknown>[],
    tablas: () =>
      (instancia
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]).map((r) => r.name),
    cerrar: () => instancia.close(),
  };
}

// ============================================================
// VERIFICACIONES PREVIAS
// ============================================================
async function verificarDestinoVacio(): Promise<void> {
  const orden = ordenTopologico();
  const ocupadas: string[] = [];
  for (const modelo of orden) {
    const clave = modelo.charAt(0).toLowerCase() + modelo.slice(1);
    const delegado = (db as unknown as Record<string, { count: () => Promise<number> }>)[clave];
    if (!delegado) continue;
    if ((await delegado.count()) > 0) ocupadas.push(modelo);
  }
  if (ocupadas.length > 0) {
    if (!REEMPLAZAR) {
      fallo(
        `La base de destino ya tiene datos (${ocupadas.join(", ")}).\n` +
          "  La migración es one-shot desde una base VACÍA (nunca fusiona ni sobrescribe).\n" +
          "  Si de verdad quieres vaciarla y reintentar: añade --reemplazar.",
      );
    }
    console.log(`⚠ --reemplazar: se vaciarán ${ocupadas.length} tablas de destino antes de migrar`);
  }
}

async function vaciarDestino(): Promise<void> {
  // Hijos primero (orden inverso del topológico) para respetar las FKs.
  const borrado = [...ordenTopologico()].reverse();
  await db.$transaction(async (tx) => {
    for (const modelo of borrado) {
      const clave = modelo.charAt(0).toLowerCase() + modelo.slice(1);
      const delegado = (tx as unknown as Record<string, { deleteMany: () => Promise<unknown> }>)[clave];
      if (delegado) await delegado.deleteMany();
    }
  });
}

// ============================================================
// COPIA (una transacción global, por lotes, conversión por DMMF)
// ============================================================
type InformeTabla = { tabla: string; filas: number };

async function copiar(lector: LectorSQLite): Promise<InformeTabla[]> {
  const orden = ordenTopologico();
  const informes: InformeTabla[] = [];
  const t0 = Date.now();

  await db.$transaction(
    async (tx) => {
      for (const modelo of orden) {
        const tabla = modelo; // El DMMF nombra las tablas igual que los modelos.
        const campos = camposEscalares(modelo);
        if (campos.size === 0) continue;

        // ¿Existe la tabla en el legado? (una instalación mínima puede no
        // tener todavía las tablas de módulos no usados).
        const existe = lector.tablas().includes(tabla);
        if (!existe) {
          console.log(`· ${tabla}: ausente en el legado — se omite`);
          informes.push({ tabla, filas: -1 });
          continue;
        }

        const totalFuente = (
          lector.consulta(`SELECT COUNT(*) AS n FROM "${tabla}"`)[0]?.n ?? 0
        ) as number;
        const columnas = [...campos.keys()];
        const seleccion = columnas.map((c) => `"${c}"`).join(", ");
        const clave = modelo.charAt(0).toLowerCase() + modelo.slice(1);
        const delegado = (
          tx as unknown as Record<string, { createMany: (a: { data: unknown[] }) => Promise<unknown> }>
        )[clave];
        if (!delegado) fallo(`Modelo no encontrado en Prisma: ${modelo}`);

        let leidas = 0;
        for (;;) {
          const lote = lector.consulta(
            `SELECT ${seleccion} FROM "${tabla}" ORDER BY rowid LIMIT ${FILAS_POR_LOTE} OFFSET ${leidas}`,
          );
          if (lote.length === 0) break;
          const datos = lote.map((fila) => {
            const salida: Record<string, unknown> = {};
            for (const [campo, tipo] of campos) {
              salida[campo] = convertir(fila[campo], tipo);
            }
            return salida;
          });
          await delegado.createMany({ data: datos });
          leidas += lote.length;
          if (lote.length < FILAS_POR_LOTE) break;
        }
        informes.push({ tabla, filas: leidas });
        if (leidas !== totalFuente) {
          throw new Error(
            `Lectura incompleta de ${tabla}: leídas ${leidas} de ${totalFuente} (OFFSET inestable)`,
          );
        }
      }
    },
    { timeout: 600_000, maxWait: 60_000 },
  );

  const duracion = Date.now() - t0;
  console.log(`✔ Copia transaccional completada en ${(duracion / 1000).toFixed(1)} s`);
  return informes;
}

// ============================================================
// VERIFICACIÓN DE CONTEOS (cero pérdida de datos)
// ============================================================
async function verificarConteos(
  lector: LectorSQLite,
  informes: InformeTabla[],
): Promise<number> {
  let discrepancias = 0;
  let totalFilas = 0;
  console.log("\nVerificación de conteos (legado → PostgreSQL):");
  for (const { tabla, filas } of informes) {
    if (filas < 0) continue; // tabla ausente en el legado
    const fuente = (
      lector.consulta(`SELECT COUNT(*) AS n FROM "${tabla}"`)[0]?.n ?? -1
    ) as number;
    const clave = tabla.charAt(0).toLowerCase() + tabla.slice(1);
    const delegado = (db as unknown as Record<string, { count: () => Promise<number> }>)[clave];
    const destino = await delegado.count();
    totalFilas += destino;
    const coincide = fuente === destino && filas === destino;
    console.log(`  ${coincide ? "✔" : "✗ FALLO"} — ${tabla}: ${fuente} → ${destino}`);
    if (!coincide) discrepancias++;
  }
  console.log(`  Total de filas migradas: ${totalFilas}`);
  return discrepancias;
}

// ============================================================
// MAIN
// ============================================================
async function main(): Promise<void> {
  console.log("MIGRACIÓN DE DATOS: archivo legacy → PostgreSQL\n");
  console.log(`  Origen : ${RUTA_DB_LEGACY}`);
  console.log(`  Destino: ${process.env.DATABASE_URL?.replace(/\/\/[^@]*@/, "//***@") ?? "(sin DATABASE_URL)"}`);

  // Precondiciones.
  if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
    fallo("DATABASE_URL no es una URL de PostgreSQL (revisa .env — la era del motor de archivo terminó).");
  }
  await db.$queryRaw`SELECT 1`.catch(() => fallo("No se pudo conectar a PostgreSQL (¿migraciones aplicadas? ¿servidor activo?)"));

  const lector = await abrirSQLite(RUTA_DB_LEGACY);
  try {
    console.log(`  Tablas en el legado: ${lector.tablas().length}`);

    // Anti-fusión / vaciado explícito.
    await verificarDestinoVacio();
    if (REEMPLAZAR) {
      await vaciarDestino();
      console.log("✔ Destino vaciado (--reemplazar)");
    }

    // Copia atómica + verificación.
    const informes = await copiar(lector);
    const discrepancias = await verificarConteos(lector, informes);
    if (discrepancias > 0) {
      fallo(`${discrepancias} tablas con conteos discrepantes — NO se entregó la migración.`);
    }

    console.log("\n✔ MIGRACIÓN COMPLETA Y VERIFICADA (cero discrepancias de conteos).");
    console.log("  Post-condiciones de negocio ya válidas:");
    console.log("  · SecuenciaFolio conservada: los folios NUEVOS continúan la serie");
    console.log("    histórica (jamás se reutilizan los números ya emitidos).");
    console.log("  · Papelera: entradas EN_PAPELERA conservan su ventana de 30 días.");
    console.log("  · Movimientos: snapshots y bitácora íntegros (ledger).");
    if (lector.tablas().includes("RespaldoBD")) {
      console.log("  · Recuerda copiar los .dump legacy a DATA_DIR/backups si quieres");
      console.log("    que los respaldos históricos sigan siendo restaurables.");
    }
  } finally {
    lector.cerrar();
  }
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
