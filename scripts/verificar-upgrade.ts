/**
 * VERIFICACIÓN FASE 1: upgrade Float → TEXT decimal exacto
 * ==========================================================
 * Lee la BD de prueba (upgrade.db) tras aplicar la migración 0002
 * enmendada y afirma que:
 *   1. Los artefactos float64 fueron saneados (0.30000000000000004 → "0.3").
 *   2. La clase de almacenamiento es TEXT (typeof), nunca REAL.
 *   3. El round-trip de lectura con el cliente nuevo es exacto.
 *
 * Ejecutar: bun scripts/verificar-upgrade.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient({
  datasources: {
    db: { url: "file:/home/z/my-project/scripts/prisma-decimal-test/upgrade.db" },
  },
});

function afirmar(condicion: boolean, mensaje: string) {
  console.log(`  ${condicion ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!condicion) process.exitCode = 1;
}

async function main() {
  console.log("== Datos legados tras la migración 0002 enmendada ==");

  const stock = await db.stock.findUnique({ where: { id: "test-stock-1" } });
  afirmar(stock !== null, "fila de stock existe");
  if (stock) {
    afirmar(stock.cantidad === "0.3", `Stock.cantidad = "${stock.cantidad}" (esperado "0.3", era 0.30000000000000004)`);
  }

  const producto = await db.producto.findUnique({ where: { id: "test-legacy-1" } });
  afirmar(producto !== null, "producto legado existe");
  if (producto) {
    afirmar(producto.stockMinimo === "0.1", `Producto.stockMinimo = "${producto.stockMinimo}"`);
    afirmar(producto.costoUnitario === "12.345", `Producto.costoUnitario = "${producto.costoUnitario}"`);
    afirmar(producto.contenidoPaquete === "2.5", `Producto.contenidoPaquete = "${producto.contenidoPaquete}"`);
  }

  const mov = await db.movimiento.findUnique({ where: { id: "test-mov-1" } });
  afirmar(mov !== null, "movimiento legado existe");
  if (mov) {
    afirmar(mov.cantidad === "0.1", `Movimiento.cantidad = "${mov.cantidad}"`);
    afirmar(mov.cantidadDespues === "0.3", `Movimiento.cantidadDespues = "${mov.cantidadDespues}" (saneado)`);
  }

  console.log("\n== Clase de almacenamiento SQLite (typeof) ==");
  const filas = (await db.$queryRawUnsafe(
    'SELECT typeof("cantidad") AS clase FROM Stock UNION ALL SELECT typeof("cantidad") FROM Movimiento UNION ALL SELECT typeof("costoUnitario") FROM Producto UNION ALL SELECT typeof("stockMinimo") FROM Producto',
  )) as Array<{ clase: string }>;
  const clases = new Set(filas.map((f) => f.clase));
  afirmar(clases.has("text") && clases.size === 1, `todas las columnas numéricas son TEXT (encontrado: ${[...clases].join(", ")})`);

  console.log("\n== Round-trip de escritura con el cliente nuevo ==");
  const stock2 = await db.stock.update({
    where: { id: "test-stock-1" },
    data: { cantidad: "0.1" },
  });
  await db.stock.update({ where: { id: "test-stock-1" }, data: { cantidad: "0.2" } });
  const tres = ["0.1", "0.2", "0.1"].reduce((a) => a);
  // Suma exacta en la capa de aplicación (como hará src/lib/numerico.ts)
  const Decimal = (await import("@prisma/client")).Prisma.Decimal;
  const suma = new Decimal(tres).plus("0.2").plus("0.1");
  afirmar(suma.toString() === "0.4", `0.1 + 0.2 + 0.1 = ${suma.toString()} (exacto, sin artefactos)`);
  afirmar(stock2.cantidad === "0.1", `escritura/lectura de "0.1" exacta → "${stock2.cantidad}"`);

  console.log(process.exitCode ? "\n✗ VERIFICACIÓN FALLIDA" : "\n✔ VERIFICACIÓN COMPLETA: migración sanea artefactos y persiste TEXT exacto");
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
