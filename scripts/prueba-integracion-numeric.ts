/**
 * PRUEBA DE INTEGRACIÓN de la migración directa a NUMERIC (TASK-STR-013,
 * ADR-010) contra un PostgreSQL REAL y EFÍMERO:
 *   1. `prisma migrate deploy` (línea base + password + informe + NUMERIC).
 *   2. Semillas (prisma/seed.ts roles/admin + scripts/seed.ts datos) con
 *      escritura Decimal directa.
 *   3. DDL resultante: tipos NUMERIC(15,6)/(15,4) y ausencia de columnas
 *      String numéricas.
 *   4. Contrato JSON: la respuesta serializa Decimal a string.
 *   5. Exactitud: agregados SQL nativos (SUM) sobre NUMERIC.
 *
 * Uso (desarrollo; dependencias efímeras fuera del árbol productivo):
 *   cd /tmp/pgtest && bun add embedded-postgres @embedded-postgres/linux-x64 \
 *     && bun pm trust @embedded-postgres/linux-x64
 *   # psql: apt-get download postgresql-client-17 && dpkg -x *.deb /tmp/pgclient
 *   bun scripts/prueba-integracion-numeric.ts
 * Requiere .env apuntando a la base efímera (el propio script lo crea en
 * variables de entorno; la prueba de humo interna lee ../.env).
 */
// Dependencia dev-only, fuera del árbol productivo (ver cabecera): la
// importación es dinámica para no romper `tsc`/build cuando no está puesta.
const { default: EmbeddedPostgres } = (await import(
  // @ts-expect-error dev-only: la dependencia vive fuera del árbol productivo
  "embedded-postgres"
)) as {
  default: new (opciones: {
    user: string; password: string; database: string; port: number; dataDir: string;
  }) => {
    initialise: () => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    createDatabase: (nombre: string) => Promise<void>;
  };
};
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";

const PROYECTO = "/home/z/my-project/audit2/CIG-MANUFACTURING-main";
const PSQL = "/tmp/pgclient/usr/lib/postgresql/17/bin/psql";
const PUERTO = 55436;
const RAIZ = "/tmp/pgtest/data-int";

let fallas = 0;
function afirmar(cond: boolean, mensaje: string) {
  console.log(`  ${cond ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!cond) fallas++;
}

function psql(sql: string, env: Record<string, string>): string {
  return execFileSync(
    PSQL,
    ["-h", "127.0.0.1", "-p", String(PUERTO), "-U", "cig", "-d", "cig_manufacturing", "-tAc", sql],
    { env: { ...process.env, ...env }, encoding: "utf8" },
  ).trim();
}

async function main() {
  console.log("=".repeat(64));
  console.log("INTEGRACIÓN: migración directa String→NUMERIC (ADR-010)");
  console.log("=".repeat(64));

  fs.rmSync(RAIZ, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    user: "cig", password: "prueba", database: "cig_manufacturing", port: PUERTO, dataDir: RAIZ,
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("cig_manufacturing");
  console.log("✔ PostgreSQL efímero en 127.0.0.1:" + PUERTO);

  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://cig:prueba@127.0.0.1:${PUERTO}/cig_manufacturing?schema=public`,
    PGPASSWORD: "prueba",
    ADMIN_PASSWORD: "Prueba1234",
  };

  try {
    // 1. Migraciones (la USING del ADR-010 incluida)
    execFileSync("bunx", ["prisma", "migrate", "deploy"], { cwd: PROYECTO, env, stdio: "pipe" });
    const aplicadas = psql(
      "SELECT count(*) FROM \"_prisma_migrations\" WHERE finished_at IS NOT NULL", env);
    afirmar(aplicadas === "4", `4 migraciones aplicadas (obtenido: ${aplicadas})`);

    // 2. Semillas: roles/admin + datos con Decimal directo
    execFileSync("bun", ["prisma/seed.ts"], { cwd: PROYECTO, env, stdio: "pipe" });
    execFileSync("bun", ["scripts/seed.ts"], { cwd: PROYECTO, env, stdio: "pipe" });
    console.log("✔ Semillas ejecutadas (roles + datos)");

    // 3. DDL: tipos exactos y SIN columnas String numéricas
    const tipoStock = psql(
      `SELECT data_type||' '||numeric_precision||','||numeric_scale FROM information_schema.columns WHERE table_name='Stock' AND column_name='cantidad'`, env);
    afirmar(tipoStock === "numeric 15,6", `Stock.cantidad = ${tipoStock}`);
    const tipoCosto = psql(
      `SELECT numeric_precision||','||numeric_scale FROM information_schema.columns WHERE table_name='Producto' AND column_name='costoUnitario'`, env);
    afirmar(tipoCosto === "15,4", `Producto.costoUnitario(15,4) = ${tipoCosto}`);
    const tiposTodos = psql(
      `SELECT string_agg(data_type, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_name='Movimiento' AND column_name IN ('cantidad','cantidadDespues')`, env);
    afirmar(tiposTodos === "numeric,numeric", `Movimiento.cantidad/Despues = ${tiposTodos}`);
    const columnasTexto = psql(
      `SELECT count(*) FROM information_schema.columns WHERE table_name IN ('Stock','Movimiento','Producto','RegistroScrap','RegistroRechazo') AND column_name IN ('cantidad','cantidadDespues','stockMinimo','costoUnitario','contenidoPaquete') AND data_type='text'`, env);
    afirmar(columnasTexto === "0", `cero columnas numéricas como TEXT (${columnasTexto})`);

    // 4. Datos sembrados: exactitud de valores con decimales
    const stock01 = psql(
      `SELECT s."cantidad"::text FROM "Stock" s JOIN "Producto" p ON p.id = s."productoId" WHERE p.sku = 'MP-0001' LIMIT 1`, env);
    afirmar(/^\d+(\.\d+)?$/.test(stock01), `MP-0001 cantidad NUMERIC válida: ${stock01}`);
    const decimalSembrado = psql(
      `SELECT count(*) FROM "Producto" WHERE "costoUnitario"::text ~ '\\d\\.\\d'`, env);
    afirmar(Number(decimalSembrado) > 0, `costos decimales sembrados como NUMERIC (${decimalSembrado})`);

    // 5. Exactitud agregada NATIVA (SUM en el motor — antes imposible con TEXT)
    const sumaMov = psql(
      `SELECT SUM("cantidad")::text FROM "Movimiento" WHERE tipo <> 'AJUSTE'`, env);
    afirmar(/^-?\d+(\.\d+)?$/.test(sumaMov), `SUM nativo sobre NUMERIC: ${sumaMov} (operación de motor, imposible con TEXT)`);
    const sumaValor = psql(
      `SELECT ROUND(SUM(s."cantidad" * p."costoUnitario"), 2)::text FROM "Stock" s JOIN "Producto" p ON p.id = s."productoId"`, env);
    afirmar(/^-?\d+(\.\d+)?$/.test(sumaValor), `valoración SUM(cantidad×costo) nativa: ${sumaValor}`);
    const exacto = psql("SELECT 0.1::numeric*3 = 0.3::numeric", env);
    afirmar(exacto === "t", "NUMERIC: 0.1×3 = 0.3 exacto (jamás float)");

    // 6. Contrato JSON: Decimal se serializa a string
    const { Prisma, PrismaClient } = await import(
      `${PROYECTO}/node_modules/@prisma/client/default.js`
    );
    const db = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
    const stock = await db.stock.findFirst({ where: { cantidad: { gt: new Prisma.Decimal(0) } } });
    afirmar(stock !== null, "lectura de stock con NUMERIC");
    if (stock) {
      afirmar(stock.cantidad instanceof Prisma.Decimal, "la lectura llega como Prisma.Decimal");
      const serial = JSON.parse(JSON.stringify({ cantidad: stock.cantidad }));
      afirmar(typeof serial.cantidad === "string", `serializado a string («${serial.cantidad}») — contrato intacto`);
      const mov = await db.movimiento.findFirst({ where: { cantidadDespues: { not: null } } });
      const serialMov = JSON.parse(JSON.stringify({ d: mov?.cantidadDespues }));
      afirmar(typeof serialMov.d === "string", `cantidadDespues serializa a string («${serialMov.d}»)`);
    }
    // Escritura nueva vía núcleo: aDecimal → Decimal directo (fail-closed)
    const { aDecimal } = await import(`${PROYECTO}/src/lib/numerico.ts`);
    const dualNuevo = aDecimal("12.345");
    afirmar(dualNuevo !== null && dualNuevo.toString() === "12.345", "aDecimal valida 15/6 fail-closed");
    afirmar(aDecimal("abc") === null && aDecimal(0.30000000000000004) === null, "entradas corruptas → null (fail-closed)");
    await db.$disconnect();

    // 7. Prueba de humo del PROYECTO (Fase 1: usa el núcleo REAL con NUMERIC)
    console.log("\n→ prueba de humo del proyecto (prueba-humo-fase1)");
    const humo = spawnSync("bun", ["scripts/prueba-humo-fase1.ts"], {
      cwd: PROYECTO, env, encoding: "utf8",
    });
    const salidaHumo = (humo.stdout ?? "") + (humo.stderr ?? "");
    const total = (salidaHumo.match(/✔/g) ?? []).length;
    const fallosHumo = (salidaHumo.match(/✗/g) ?? []).length;
    afirmar(humo.status === 0 && fallosHumo === 0 && total > 0,
      `prueba-humo-fase1: ${total} afirmaciones ✔, ${fallosHumo} ✗ (exit ${humo.status})`);
    if (humo.status !== 0 && fallosHumo === 0) {
      console.log(salidaHumo.slice(-800));
    }
  } finally {
    await pg.stop().catch(() => {});
    fs.rmSync(RAIZ, { recursive: true, force: true });
  }

  console.log("\n" + "=".repeat(64));
  if (fallas === 0) {
    console.log("✔ INTEGRACIÓN COMPLETA: migración directa a NUMERIC verificada end-to-end");
  } else {
    console.log(`✗ ${fallas} fallos de integración`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("Error fatal:", e instanceof Error ? e.message : e);
  process.exit(1);
});
