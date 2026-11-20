/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * PRUEBA DE HUMO — TIPOS NOMINALES DE DOMINIO (TASK-STR-001)
 * ============================================================================
 * Verifica en TIEMPO DE EJECUCIÓN las fábricas de src/lib/tipos-dominio.ts:
 *   1. Los identificadores válidos (cuid de Prisma, UUID, legados) se
 *      brandean preservando el valor (costo cero: sigue siendo string).
 *   2. Los valores inválidos (vacíos, espacios, inyección, longitud
 *      excesiva, no-ASCII) retornan null — JAMÁS lanzan.
 *   3. El folio de movimiento acepta exactamente las series que emite
 *      generarFolio (ENT/REC/SAL/TRA/AJU/SCR) y rechaza las ajenas (OQC).
 *   4. La fábrica opcional de almacén distingue «ausente» (undefined) de
 *      «vino inválido» (null) para que las rutas rechacen con precisión.
 *
 * Ejecutar: bun scripts/prueba-tipos-nominales.ts
 * (no requiere base de datos: el módulo bajo prueba es puro)
 */
import {
  comoIdAlmacen,
  comoIdAlmacenOpcional,
  comoIdMovimiento,
  comoIdProducto,
  comoFolioMovimiento,
} from "../src/lib/tipos-dominio";

let fallas = 0;
function afirmar(condicion: boolean, mensaje: string) {
  console.log(`  ${condicion ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!condicion) fallas++;
}

async function main() {
  console.log("== 1) Identificadores válidos se brandean sin alterar el valor ==");
  const cuid = "ckx8z1a2b3c4d5e6f7g8h9i0j"; // formato cuid (25 caracteres)
  const uuid = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  const legado = "smoke-f1-p1";
  afirmar(comoIdProducto(cuid) === cuid, "cuid de Prisma aceptado (identidad preservada)");
  afirmar(comoIdAlmacen(uuid) === uuid, "UUID con guiones aceptado");
  afirmar(comoIdMovimiento(legado) === legado, "id legado con guion bajo aceptado");
  afirmar(comoIdProducto("a") !== null, "longitud mínima 1 aceptada");

  console.log("\n== 2) Identificadores inválidos retornan null (nunca lanzan) ==");
  afirmar(comoIdProducto("") === null, "cadena vacía → null");
  afirmar(comoIdProducto("   ") === null, "solo espacios → null");
  afirmar(comoIdProducto(" id con espacio ") === null, "espacios alrededor → null");
  afirmar(comoIdProducto("abc$%^&*()") === null, "caracteres de inyección → null");
  afirmar(comoIdProducto("x".repeat(65)) === null, "longitud 65 (> 64) → null");
  afirmar(comoIdProducto("tab\ttab") === null, "caracteres de control → null");
  afirmar(comoIdProducto("café-123") === null, "caracteres no ASCII → null");

  console.log("\n== 3) Folio de movimiento (series de generarFolio) ==");
  afirmar(comoFolioMovimiento("SAL-20261103-0004") === "SAL-20261103-0004", "folio canónico aceptado");
  afirmar(comoFolioMovimiento("ENT-20261103-12345") !== null, "número de 5 dígitos aceptado");
  afirmar(
    comoFolioMovimiento("OQC-20261103-0001") === null,
    "folio de salida OQC NO es folio de movimiento → null",
  );
  afirmar(comoFolioMovimiento("sal-20261103-0004") === null, "minúsculas rechazadas");
  afirmar(comoFolioMovimiento("SAL-202611-0004") === null, "fecha incompleta rechazada");
  afirmar(comoFolioMovimiento("") === null, "vacío → null");

  console.log("\n== 4) Fábrica opcional de almacén (semántica de tres estados) ==");
  afirmar(comoIdAlmacenOpcional(undefined) === undefined, "ausente → undefined (no vino)");
  afirmar(comoIdAlmacenOpcional(null) === undefined, "null explícito → undefined (no vino)");
  afirmar(
    comoIdAlmacenOpcional("") === undefined,
    "vacío → undefined (trato histórico || undefined)",
  );
  afirmar(comoIdAlmacenOpcional("!!inyeccion") === null, "vino pero inválido → null (rechazar)");
  afirmar(comoIdAlmacenOpcional(cuid) === cuid, "vino y válido → IdAlmacen");

  console.log("\n== 5) Defensa en profundidad contra `any` del JSON de petición ==");
  // Se simula el valor sin tipar que puede colarse desde request.json():
  // la fábrica verifica el tipo en runtime además del formato.
  const valorNoString: unknown = { toString: 42 };
  const colado = comoIdProducto(valorNoString as string);
  afirmar(colado === null, "objeto no-string colado por any → null (no lanza)");

  console.log(
    fallas === 0
      ? "\n✔ PRUEBA DE HUMO COMPLETA: fábricas de tipos nominales íntegras"
      : `\n✗ PRUEBA DE HUMO FALLIDA: ${fallas} afirmaciones incorrectas`,
  );
  if (fallas > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("ERROR DE LA PRUEBA:", e);
  process.exitCode = 1;
});
