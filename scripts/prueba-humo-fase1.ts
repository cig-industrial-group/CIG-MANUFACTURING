/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * PRUEBA DE HUMO — FASE 1 (integridad numérica Decimal)
 * ============================================================================
 * Ejercita el NÚCLEO REAL de negocio (registrarMovimientoTx / resolverConteoTx)
 * con los decimales que ROMPEN float64, y afirma que:
 *   1. La acumulación de stock es EXACTA (0.1 × 3 = 0.3, no 0.30000000000000004).
 *   2. Las entradas con artefactos float heredados se RECHAZAN (fail-closed).
 *   3. El conteo en paquetes (paquetes × factor + sueltas) es exacto.
 *   4. Los snapshots del ledger (cantidadDespues) son exactos.
 *   5. La clase de almacenamiento en SQLite es TEXT (nunca REAL).
 *   6. Las salidas que exceden el stock se rechazan exactamente.
 *
 * Ejecutar: bun scripts/prueba-humo-fase1.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { registrarMovimientoTx, ErrorNegocio } from "../src/modulos/almacen/servicios/nucleo";

// ============================================================
// CARGA EXPLÍCITA DEL .env DEL PROYECTO (patrón adoptado en la Fase 2):
// el entorno del shell puede traer un DATABASE_URL heredado ajeno a la
// app (export de otra sesión) que bun NO sobreescribe con el .env; aquí
// se fija la configuración real ANTES de crear el cliente.
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

const db = new PrismaClient();

let fallas = 0;
function afirmar(condicion: boolean, mensaje: string) {
  console.log(`  ${condicion ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!condicion) fallas++;
}

async function main() {
  console.log("== Preparación: producto y almacén de prueba ==");
  await db.movimiento.deleteMany({ where: { productoId: "smoke-f1-p1" } });
  await db.stock.deleteMany({ where: { productoId: "smoke-f1-p1" } });
  await db.producto.deleteMany({ where: { id: "smoke-f1-p1" } });
  await db.almacen.deleteMany({ where: { id: "smoke-f1-a1" } });
  await db.almacen.create({
    data: { id: "smoke-f1-a1", codigo: "SMOKE-1", nombre: "Almacén prueba humo", tipo: "GENERAL" },
  });
  // Sembrar el catálogo de unidades que usa la prueba (igual que
  // asegurarUnidadesBase(): PZA base + PAQ→PZA como empaque de conteo)
  await db.unidadMedida.upsert({
    where: { codigo: "PZA" },
    create: { codigo: "PZA", nombre: "Pieza", nombreEn: "Piece", tipo: "CONTEO", esSistema: true },
    update: { activo: true },
  });
  await db.unidadMedida.upsert({
    where: { codigo: "PAQ" },
    create: { codigo: "PAQ", nombre: "Paquete", nombreEn: "Package", tipo: "PAQUETE", unidadBase: "PZA", esSistema: true },
    update: { activo: true, unidadBase: "PZA" },
  });
  await db.producto.create({
    data: {
      id: "smoke-f1-p1",
      sku: "SMOKE-0001",
      nombre: "Producto prueba humo Fase 1",
      unidad: "PZA",
      unidadPaquete: "PAQ",
      contenidoPaquete: "2.5", // PAQ con contenido fraccionario
      stockMinimo: "0.05",
      costoUnitario: "0.1",
    },
  });

  console.log("\n== 1) Acumulación exacta: 3 entradas de 0.1 = 0.3 exacto ==");
  for (let i = 0; i < 3; i++) {
    await db.$transaction((tx) =>
      registrarMovimientoTx(tx, {
        tipo: "ENTRADA",
        productoId: "smoke-f1-p1",
        almacenDestinoId: "smoke-f1-a1",
        cantidad: new Prisma.Decimal("0.1"),
        usuarioId: "smoke",
        usuarioNombre: "Prueba de humo",
      }),
    );
  }
  const stockTrasEntradas = await db.stock.findFirst({
    where: { productoId: "smoke-f1-p1", almacenId: "smoke-f1-a1" },
  });
  afirmar(
    stockTrasEntradas?.cantidad === "0.3",
    `Stock.cantidad = "${stockTrasEntradas?.cantidad}" (float64 daría 0.30000000000000004)`,
  );

  console.log("\n== 2) Fail-closed: entrada con artefacto float heredado se RECHAZA ==");
  let rechazado = false;
  try {
    await db.$transaction((tx) =>
      registrarMovimientoTx(tx, {
        tipo: "ENTRADA",
        productoId: "smoke-f1-p1",
        almacenDestinoId: "smoke-f1-a1",
        cantidad: new Prisma.Decimal("0.30000000000000004"), // 17 decimales: ilegal
        usuarioId: "smoke",
        usuarioNombre: "Prueba de humo",
      }),
    );
  } catch (e) {
    rechazado = e instanceof ErrorNegocio && e.message === "QUANTIDAD_INVALIDA";
  }
  afirmar(rechazado, "0.30000000000000004 (17 dp) rechazado con QUANTIDAD_INVALIDA");

  console.log("\n== 3) Salida exacta y snapshot del ledger ==");
  const movSalida = await db.$transaction((tx) =>
    registrarMovimientoTx(tx, {
      tipo: "SALIDA",
      productoId: "smoke-f1-p1",
      almacenOrigenId: "smoke-f1-a1",
      cantidad: new Prisma.Decimal("0.1"),
      usuarioId: "smoke",
      usuarioNombre: "Prueba de humo",
    }),
  );
  afirmar(movSalida.cantidad === "0.1", `Movimiento.cantidad = "${movSalida.cantidad}"`);
  afirmar(movSalida.cantidadDespues === "0.2", `Snapshot cantidadDespues = "${movSalida.cantidadDespues}" (0.3 − 0.1 exacto)`);

  console.log("\n== 4) Conteo en paquetes: 3 PAQ × 2.5 + 0.5 sueltas = 8 PZA exactas ==");
  const movConteo = await db.$transaction((tx) =>
    registrarMovimientoTx(tx, {
      tipo: "ENTRADA",
      productoId: "smoke-f1-p1",
      almacenDestinoId: "smoke-f1-a1",
      cantidad: new Prisma.Decimal("1"), // ignorado: el conteo manda
      conteo: { unidad: "PAQ", paquetes: "3", sueltas: "0.5" },
      usuarioId: "smoke",
      usuarioNombre: "Prueba de humo",
    }),
  );
  afirmar(movConteo.cantidad === "8", `Cantidad en unidad base = "${movConteo.cantidad}" (3×2.5 + 0.5)`);
  afirmar(movConteo.cantidadDespues === "8.2", `Snapshot = "${movConteo.cantidadDespues}" (0.2 + 8 exacto)`);
  const partes = movConteo.conteoDetalle ? JSON.parse(movConteo.conteoDetalle) : null;
  afirmar(
    Array.isArray(partes) &&
      partes.some((p) => p.unidad === "PAQ" && p.factor === "2.5" && p.cantidad === "3") &&
      partes.some((p) => p.unidad === "PZA" && p.factor === "1" && p.cantidad === "0.5"),
    "conteoDetalle preserva el detalle con factores/cantidades en texto exacto",
  );

  console.log("\n== 5) Ajuste firmado exacto ==");
  const movAjuste = await db.$transaction((tx) =>
    registrarMovimientoTx(tx, {
      tipo: "AJUSTE",
      productoId: "smoke-f1-p1",
      almacenDestinoId: "smoke-f1-a1",
      cantidad: new Prisma.Decimal("-0.15"),
      motivo: "Conteo físico",
      usuarioId: "smoke",
      usuarioNombre: "Prueba de humo",
    }),
  );
  afirmar(movAjuste.cantidad === "-0.15", `Ajuste conserva signo: "${movAjuste.cantidad}"`);
  afirmar(movAjuste.cantidadDespues === "8.05", `Stock final = "${movAjuste.cantidadDespues}" (8.2 − 0.15 exacto)`);

  console.log("\n== 6) Rechazo exacto de salida sin stock ==");
  let sinStock = false;
  try {
    await db.$transaction((tx) =>
      registrarMovimientoTx(tx, {
        tipo: "SALIDA",
        productoId: "smoke-f1-p1",
        almacenOrigenId: "smoke-f1-a1",
        cantidad: new Prisma.Decimal("8.06"), // excede por 0.01 exactos
        usuarioId: "smoke",
        usuarioNombre: "Prueba de humo",
      }),
    );
  } catch (e) {
    sinStock = e instanceof ErrorNegocio && e.message === "STOCK_INSUFICIENTE";
  }
  afirmar(sinStock, "SALIDA de 8.06 con stock 8.05 → STOCK_INSUFICIENTE (comparación exacta)");

  console.log("\n== 7) Clase de almacenamiento SQLite ==");
  const tipos = (await db.$queryRawUnsafe(
    'SELECT typeof("cantidad") AS clase FROM Stock WHERE "productoId" = \'smoke-f1-p1\' UNION ALL SELECT typeof("cantidad") FROM Movimiento LIMIT 5',
  )) as Array<{ clase: string }>;
  afirmar(
    tipos.every((t) => t.clase === "text"),
    `todas las filas persisten como TEXT (${[...new Set(tipos.map((t) => t.clase))].join(", ")})`,
  );

  console.log("\n== 8) Limpieza ==");
  await db.movimiento.deleteMany({ where: { productoId: "smoke-f1-p1" } });
  await db.stock.deleteMany({ where: { productoId: "smoke-f1-p1" } });
  await db.producto.deleteMany({ where: { id: "smoke-f1-p1" } });
  await db.almacen.deleteMany({ where: { id: "smoke-f1-a1" } });
  console.log("  ✔ Datos de prueba eliminados");

  console.log(
    fallas === 0
      ? "\n✔ PRUEBA DE HUMO COMPLETA: integridad numérica Decimal de extremo a extremo"
      : `\n✗ PRUEBA DE HUMO FALLIDA: ${fallas} afirmaciones incorrectas`,
  );
  if (fallas > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("ERROR DE LA PRUEBA:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
