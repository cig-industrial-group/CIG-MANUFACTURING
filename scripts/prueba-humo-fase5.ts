/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * PRUEBA DE HUMO — FASE 5 (auditoría de cadena de suministro, ADR-008)
 * ============================================================================
 * Verifica EMPIRÍRICAMENTE el paso de auditoría del Dockerfile:
 *
 *   1. `bun` existe y su versión es exactamente la fijada en el Dockerfile
 *      (FROM oven/bun:<versión>-debian): reproducibilidad del entorno de
 *      la puerta de seguridad.
 *   2. `bun audit` existe como subcomando y documenta `--audit-level`
 *      (hecho empírico que motiva ADR-008: NO existe bandera `--severity`;
 *      el umbral nativo de bun — igual que npm — es `--audit-level`).
 *   3. Estructura del Dockerfile: la etapa `RUN bun audit --audit-level=high`
 *      está DESPUÉS de `bun install --frozen-lockfile` y ANTES de
 *      `bun run build` (fail-fast sobre el árbol que va a compilar).
 *   4. Sentido POSITIVO del contrato: sobre el árbol actual del proyecto,
 *      `bun audit --audit-level=high` sale con código 0 y sin avisos
 *      high/critical (dependencias limpias: la puerta pasa).
 *   5. Sentido NEGATIVO del contrato (determinista): en un proyecto
 *      efímero con una dependencia conocida-vulnerable (minimatch 3.0.4,
 *      ReDoS high, avisos publicados y estables), `bun audit
 *      --audit-level=high` sale con código 1 y nombra el paquete y el
 *      GHSA — exactamente lo que DETIENE `docker build`.
 *
 * No toca la base de datos ni el .env: es una prueba de herramienta y
 * de configuración. Idempotente: el proyecto efímero se crea en un
 * directorio temporal y se purga al salir.
 *
 * Ejecutar: bun scripts/prueba-humo-fase5.ts
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUTA_DOCKERFILE = path.join(RAIZ, "Dockerfile");

let fallas = 0;
function afirmar(condicion: boolean, mensaje: string) {
  console.log(`  ${condicion ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!condicion) fallas++;
}

interface Resultado {
  codigo: number | null;
  salida: string;
}

/** Ejecuta un comando y devuelve código de salida + salida combinada. */
function ejecutar(comando: string, args: string[], opciones: { cwd?: string } = {}): Resultado {
  const r = spawnSync(comando, args, {
    cwd: opciones.cwd ?? RAIZ,
    encoding: "utf8",
    timeout: 180_000,
  });
  return {
    codigo: r.status,
    salida: `${r.stdout ?? ""}${r.stderr ?? ""}`,
  };
}

function main(): void {
  console.log("PRUEBA DE HUMO — FASE 5: auditoría de cadena de suministro (ADR-008)\n");

  // ---------- 1) Versión de bun = pin del Dockerfile ----------
  console.log("Entorno (reproducibilidad):");
  const dockerfile = fs.readFileSync(RUTA_DOCKERFILE, "utf8");
  const mPin = dockerfile.match(/^FROM oven\/bun:([0-9.]+)-debian$/m);
  afirmar(mPin !== null, "el Dockerfile fija la versión de bun (FROM oven/bun:<versión>-debian)");
  const versionBun = ejecutar("bun", ["--version"]).salida.trim();
  if (mPin) {
    afirmar(
      versionBun === mPin[1],
      `bun local (${versionBun}) = versión fijada en el Dockerfile (${mPin[1]})`,
    );
  }

  // ---------- 2) bun audit existe y su umbral es --audit-level ----------
  console.log("\nHerramienta (existencia y banderas):");
  const ayuda = ejecutar("bun", ["audit", "--help"]);
  afirmar(ayuda.codigo === 0, "`bun audit` existe como subcomando (--help → 0)");
  afirmar(
    ayuda.salida.includes("--audit-level"),
    "documenta `--audit-level` (umbral nativo: low|moderate|high|critical)",
  );
  afirmar(
    !ayuda.salida.includes("--severity"),
    "NO existe `--severity` (hecho que motiva la decisión de ADR-008)",
  );

  // ---------- 3) Orden de las etapas en el Dockerfile ----------
  console.log("\nDockerfile (ubicación de la etapa de auditoría):");
  const posInstall = dockerfile.indexOf("RUN bun install --frozen-lockfile");
  const posAudit = dockerfile.indexOf("RUN bun audit --audit-level=high");
  const posBuild = dockerfile.indexOf("bun run build");
  afirmar(posAudit !== -1, "existe la etapa `RUN bun audit --audit-level=high`");
  afirmar(
    posInstall !== -1 && posAudit !== -1 && posAudit > posInstall,
    "la auditoría va DESPUÉS de `bun install --frozen-lockfile` (mismo árbol que compilará)",
  );
  afirmar(
    posBuild !== -1 && posAudit !== -1 && posAudit < posBuild,
    "la auditoría va ANTES de `bun run build` (fail-fast)",
  );

  // ---------- 4) Sentido positivo: árbol actual limpio a High/Crítica ----------
  console.log("\nContrato del exit code — sentido POSITIVO (árbol del proyecto):");
  const alta = ejecutar("bun", ["audit", "--audit-level=high"]);
  afirmar(alta.codigo === 0, `\`bun audit --audit-level=high\` → código 0 (obtenido: ${alta.codigo})`);
  const tieneAvisosAltos = /^\s+(high|critical):/m.test(alta.salida);
  afirmar(!tieneAvisosAltos, "sin avisos high/critical en la salida");

  // ---------- 5) Sentido negativo determinista ----------
  console.log("\nContrato del exit code — sentido NEGATIVO (proyecto efímero vulnerable):");
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "cig-fase5-audit-"));
  try {
    fs.writeFileSync(
      path.join(dirTmp, "package.json"),
      JSON.stringify(
        {
          name: "prueba-audit-fase5",
          private: true,
          // minimatch 3.0.4: avisos ReDoS high publicados y estables
          // (corregidos en 3.1.x); sirve de caso negativo determinista.
          dependencies: { minimatch: "3.0.4" },
        },
        null,
        2,
      ),
    );
    const instalacion = ejecutar("bun", ["install"], { cwd: dirTmp });
    afirmar(instalacion.codigo === 0, "proyecto efímero con minimatch@3.0.4 instalado");
    const negativo = ejecutar("bun", ["audit", "--audit-level=high"], { cwd: dirTmp });
    afirmar(
      negativo.codigo === 1,
      `\`bun audit --audit-level=high\` con dependencia vulnerable → código 1 (obtenido: ${negativo.codigo})`,
    );
    afirmar(
      negativo.salida.includes("minimatch"),
      "la salida nombra el paquete vulnerable (diagnóstico operativo)",
    );
    afirmar(
      negativo.salida.includes("GHSA-"),
      "la salida referencia el identificador del advisory (GHSA-…)",
    );
    // Y a nivel moderate el propio proyecto mantiene 1 aviso aceptado
    // (ADR-008): el sentido negativo también es observable sin proyecto
    // efímero, pero el caso determinista es el canónico.
  } finally {
    fs.rmSync(dirTmp, { recursive: true, force: true });
    afirmar(!fs.existsSync(dirTmp), "proyecto efímero purgado");
  }

  console.log(
    fallas
      ? `\n✗ PRUEBA DE HUMO FALLIDA (${fallas} afirmaciones)`
      : `\n✔ PRUEBA DE HUMO COMPLETA: puerta de auditoría verificada (versión pinneada, bandera correcta, orden install→audit→build, código 0 con árbol limpio y código 1 determinista con dependencia vulnerable)`,
  );
  process.exitCode = fallas ? 1 : 0;
}

main();
