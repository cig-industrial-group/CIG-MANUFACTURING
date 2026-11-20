/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * PRUEBA DE HUMO — FASE 6 (migración de motor + PostgreSQL end-to-end)
 * ============================================================================
 * Valida EMPIRÍRICAMENTE, contra el servidor PostgreSQL 16 real del
 * entorno, el ciclo completo de la migración SQLite → PostgreSQL:
 *
 *   A. PRECONDICIONES: conectividad (SELECT 1), cliente pg_dump/pg_restore
 *      presente y con versión >= la del servidor (requisito del módulo
 *      Respaldo), columnas decimales persistidas como text.
 *   B. FIXTURE LEGADO: construye un archivo .db de la era anterior con
 *      el esquema DERIVADO del DMMF de Prisma y datos representativos
 *      (roles, usuarios, catálogos, movimientos con folios de AYER y de
 *      HOY, bitácora de un folio eliminado, SecuenciaFolio, papelera con
 *      ventana viva, decimales exactos tipo "12.50").
 *   C. MIGRACIÓN REAL: ejecuta scripts/migrar-sqlite-a-postgres.ts como
 *      SUBPROCESO (el mismo artefacto que usará el operador) con
 *      --reemplazar; exige código de salida 0.
 *   D. FIDELIDAD DE DATOS: conteos por tabla, folios textuales EXACTOS,
 *      decimales String sin coerción ("70", "12.50"), booleanos y fechas
 *      convertidos, snapshot JSON de papelera legible.
 *   E. FOLIOS MONOTÓNICOS: el nuevo folio de HOY CONTINÚA la serie
 *      migrada (ENT-<hoy>-0004); tras eliminar ese movimiento (bitácora)
 *      el siguiente es 0005 — el número eliminado NO se reutiliza; una
 *      serie nueva del día arranca en 0001.
 *   F. PAPELERA (3 niveles): producto → papelera (borrado + snapshot),
 *      restauración con el MISMO id y su stock, entrada queda
 *      RESTAURADO.
 *   G. RESPALDO/RESTAURACIÓN (ciclo completo): pg_dump (.dump con
 *      cabecera PGDMP), mutación post-respaldo, restauración EN CALIENTE
 *      (base transitoria + transacción única → la mutación desaparece),
 *      REVERSIÓN dentro de la ventana de 24 h (la mutación regresa).
 *
 * La prueba NO deja estado sucio de sí misma: el fixture la reinicia
 * (--reemplazar) y el ciclo de respaldo/reversión devuelve la base al
 * estado migrado + datos de prueba declarados en el resumen final.
 *
 * Requisitos del entorno: PostgreSQL 16+ accesible por DATABASE_URL del
 * .env del proyecto, pg_dump/pg_restore/psql en el PATH, rol con
 * CREATEDB (restauración en caliente).
 *
 * Ejecutar: bun scripts/prueba-humo-postgres.ts
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Prisma } from "@prisma/client";

// ============================================================
// CARGA EXPLÍCITA DEL .env DEL PROYECTO (patrón fase 2/3/4): la
// resolución automática de bun puede preferir el .env de un directorio
// superior; aquí se fija la real ANTES de importar los módulos.
// ============================================================
function cargarEnvProyecto(): void {
  const directorioScript = path.dirname(fileURLToPath(import.meta.url));
  const rutaEnv = path.resolve(directorioScript, "..", ".env");
  if (!fs.existsSync(rutaEnv)) {
    console.error("✖ No existe .env en la raíz del proyecto (cópialo de .env.example).");
    process.exit(1);
  }
  for (const linea of fs.readFileSync(rutaEnv, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== "") process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
cargarEnvProyecto();

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUTA_MIGRADOR = path.join(RAIZ, "scripts", "migrar-sqlite-a-postgres.ts");

// Importación DINÁMICA (tras fijar el entorno).
const { db, verificarConexionBD, directorioDatos } = await import("../src/lib/db");
const { transaccion } = await import("../src/lib/reintentos");
const {
  registrarMovimientoTx,
  eliminarMovimientoTx,
  fechaCompacta,
} = await import("../src/modulos/almacen/servicios/nucleo");
// Fábricas de tipos nominales: los ids del fixture pasan por la misma
// validación de formato que la frontera HTTP del sistema real.
const { comoIdAlmacen, comoIdMovimiento, comoIdProducto } = await import(
  "../src/lib/tipos-dominio"
);
const { enviarProductoAPapelera, restaurarDePapelera } = await import(
  "../src/modulos/papelera/servicios/nucleo"
);
const { crearRespaldo, restaurarRespaldo, revertirUltimaRestauracion } = await import(
  "../src/modulos/respaldo/servicios/nucleo"
);

let fallas = 0;
function afirmar(condicion: boolean, mensaje: string) {
  console.log(`  ${condicion ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!condicion) fallas++;
}

const USUARIO = { id: "usr-fixture-admin", nombre: "Admin Fixture" };
const HOY = fechaCompacta(); // AAAAMMDD de la serie del día en curso

// ============================================================
// B. FIXTURE LEGADO (.db de la era anterior, esquema derivado del DMMF)
// ============================================================

/** Orden topológico (padres primero) según el grafo de FKs del DMMF. */
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
    if (enPila.has(nombre)) throw new Error(`Ciclo de FKs: ${nombre}`);
    enPila.add(nombre);
    for (const p of padres.get(nombre) ?? []) if (padres.has(p)) visitar(p);
    enPila.delete(nombre);
    visitados.add(nombre);
    orden.push(nombre);
  };
  for (const m of modelos) visitar(m.name);
  return orden;
}

/**
 * DDL del legado derivado del DMMF: String→TEXT, Boolean/Int→INTEGER,
 * DateTime→DATETIME, PK del campo @id, uniques de @@unique y FKs inline
 * (los padres ya existen por el orden topológico).
 */
function ddlLegado(): string[] {
  const sentencias: string[] = [];
  for (const nombre of ordenTopologico()) {
    const m = Prisma.dmmf.datamodel.models.find((x) => x.name === nombre)!;
    const defs: string[] = [];
    const fks: string[] = [];
    for (const f of m.fields) {
      if (f.kind === "scalar") {
        const tipo =
          f.type === "String" ? "TEXT" : f.type === "DateTime" ? "DATETIME" : "INTEGER";
        defs.push(`"${f.name}" ${tipo}${f.isId ? " PRIMARY KEY" : ""}`);
      } else if (f.kind === "object" && (f.relationFromFields?.length ?? 0) > 0) {
        const columnas = (f.relationFromFields ?? []).map((c) => `"${c}"`).join(", ");
        fks.push(`FOREIGN KEY (${columnas}) REFERENCES "${f.type}"("id")`);
      }
    }
    for (const u of m.uniqueFields ?? []) {
      defs.push(`UNIQUE (${u.map((c) => `"${c}"`).join(", ")})`);
    }
    sentencias.push(`CREATE TABLE "${nombre}" (${[...defs, ...fks].join(", ")});`);
  }
  return sentencias;
}

/** Inserta filas (sentencias preparadas — sin concatenación). */
function insertar(
  instancia: import("bun:sqlite").Database,
  tabla: string,
  filas: Record<string, unknown>[],
): void {
  for (const fila of filas) {
    const columnas = Object.keys(fila);
    const sql =
      `INSERT INTO "${tabla}" (${columnas.map((c) => `"${c}"`).join(", ")}) VALUES (` +
      columnas.map(() => "?").join(", ") +
      `)`;
    const valores = columnas.map(
      (c) => (fila[c] === undefined ? null : fila[c]) as import("bun:sqlite").SQLQueryBindings,
    );
    instancia.prepare(sql).run(...valores);
  }
}

async function construirFixture(ruta: string): Promise<Record<string, number>> {
  const { Database } = await import("bun:sqlite");
  fs.rmSync(ruta, { force: true });
  const instancia = new Database(ruta);
  try {
    for (const ddl of ddlLegado()) instancia.run(ddl);

    const T = (iso: string) => iso; // legibilidad: fechas ISO del legado
    const AYER = "2026-11-05";

    insertar(instancia, "Rol", [
      {
        id: "rol-fixture-admin", clave: "ADMIN", nombre: "Administrador",
        nombreEn: "Administrator", descripcion: null,
        permisos: '["almacen.ver","respaldo.gestionar","papelera.gestionar"]',
        sistema: 1, createdAt: T("2026-10-01T09:00:00.000Z"), updatedAt: T("2026-10-01T09:00:00.000Z"),
      },
      {
        id: "rol-fixture-oper", clave: "OPERADOR", nombre: "Operador",
        nombreEn: "Operator", descripcion: null,
        permisos: '["almacen.ver","catalogo.ver"]',
        sistema: 0, createdAt: T("2026-10-01T09:00:00.000Z"), updatedAt: T("2026-10-01T09:00:00.000Z"),
      },
    ]);

    insertar(instancia, "Usuario", [
      {
        id: USUARIO.id, nombre: "Admin Fixture", correo: "admin@fixture.local",
        passwordHash: "$2a$10$fixtureNoEsUnHashRealSoloPrueba0000000000",
        rolId: "rol-fixture-admin", activo: 1, debeCambiarPassword: 0, ultimoAcceso: null,
        createdAt: T("2026-10-01T09:05:00.000Z"), updatedAt: T("2026-10-01T09:05:00.000Z"),
      },
    ]);

    insertar(instancia, "Configuracion", [
      { clave: "auth.registroHabilitado", valor: "false" },
      { clave: "auth.recuperacionHabilitada", valor: "false" },
    ]);

    insertar(instancia, "UnidadMedida", [
      { id: "unm-pza", codigo: "PZA", nombre: "Pieza", nombreEn: "Piece", tipo: "CONTEO",
        unidadBase: null, notas: null, activo: 1, esSistema: 1,
        createdAt: T("2026-10-01T09:10:00.000Z"), updatedAt: T("2026-10-01T09:10:00.000Z") },
      { id: "unm-cja", codigo: "CJA", nombre: "Caja", nombreEn: "Box", tipo: "PAQUETE",
        unidadBase: "PZA", notas: "12 por caja", activo: 1, esSistema: 1,
        createdAt: T("2026-10-01T09:10:00.000Z"), updatedAt: T("2026-10-01T09:10:00.000Z") },
    ]);

    insertar(instancia, "Almacen", [
      { id: "alm-fixture-01", codigo: "ALM-F01", nombre: "Almacén Fixture Uno",
        ubicacion: "Nave A", tipo: "GENERAL", responsable: "Responsable Uno", activo: 1,
        createdAt: T("2026-10-02T08:00:00.000Z"), updatedAt: T("2026-10-02T08:00:00.000Z") },
      { id: "alm-fixture-02", codigo: "ALM-F02", nombre: "Almacén Fixture Dos",
        ubicacion: null, tipo: "PRODUCTO_TERMINADO", responsable: null, activo: 1,
        createdAt: T("2026-10-02T08:00:00.000Z"), updatedAt: T("2026-10-02T08:00:00.000Z") },
    ]);

    insertar(instancia, "Cliente", [
      { id: "cli-fixture-01", codigo: "CLI-0001", nombre: "Cliente Fixture S.A.",
        contacto: "Contacto Uno", correo: "contacto@fixture.local", telefono: "664-123-4567",
        direccion: "Av. Fixture 123", notas: "Cliente activo del fixture", activo: 1,
        createdAt: T("2026-10-03T10:00:00.000Z"), updatedAt: T("2026-10-03T10:00:00.000Z") },
    ]);

    insertar(instancia, "Producto", [
      { id: "prd-fixture-01", sku: "PRB-0001", nombre: "Producto Fixture Uno",
        descripcion: "Materia prima de prueba", categoria: "MATERIA_PRIMA", unidad: "PZA",
        unidadPaquete: null, contenidoPaquete: null, stockMinimo: "0", costoUnitario: "12.50",
        activo: 1, createdAt: T("2026-10-04T09:00:00.000Z"), updatedAt: T("2026-10-04T09:00:00.000Z") },
      { id: "prd-fixture-02", sku: "PRB-0002", nombre: "Producto Fixture Dos",
        descripcion: null, categoria: "MATERIA_PRIMA", unidad: "PZA",
        unidadPaquete: "CJA", contenidoPaquete: "12", stockMinimo: "5", costoUnitario: "3.75",
        activo: 1, createdAt: T("2026-10-04T09:05:00.000Z"), updatedAt: T("2026-10-04T09:05:00.000Z") },
      { id: "prd-fixture-03", sku: "PRB-0003", nombre: "Producto Fixture Tres",
        descripcion: null, categoria: "MATERIAL", unidad: "KG",
        unidadPaquete: null, contenidoPaquete: null, stockMinimo: "2.5", costoUnitario: null,
        activo: 1, createdAt: T("2026-10-04T09:10:00.000Z"), updatedAt: T("2026-10-04T09:10:00.000Z") },
    ]);

    insertar(instancia, "Modelo", [
      { id: "mod-fixture-01", codigo: "MOD-F01", nombre: "Modelo Fixture",
        descripcion: null, activo: 1,
        createdAt: T("2026-10-05T09:00:00.000Z"), updatedAt: T("2026-10-05T09:00:00.000Z") },
    ]);
    insertar(instancia, "NumeroParte", [
      { id: "np-fixture-01", numero: "80101-06129", nombre: "Parte de fixture",
        descripcion: "Número de parte fixture", activo: 1,
        createdAt: T("2026-10-05T09:05:00.000Z"), updatedAt: T("2026-10-05T09:05:00.000Z") },
    ]);
    insertar(instancia, "ModeloParte", [
      { modeloId: "mod-fixture-01", numeroParteId: "np-fixture-01",
        createdAt: T("2026-10-05T09:10:00.000Z") },
    ]);

    // Stock: estado ACTUAL coherente con el historial del fixture.
    insertar(instancia, "Stock", [
      { id: "stk-f01", productoId: "prd-fixture-01", almacenId: "alm-fixture-01", cantidad: "70",
        updatedAt: T(`${AYER}T10:05:00.000Z`) },
      { id: "stk-f02", productoId: "prd-fixture-02", almacenId: "alm-fixture-02", cantidad: "50",
        updatedAt: T(`${AYER}T10:10:00.000Z`) },
      { id: "stk-f03", productoId: "prd-fixture-03", almacenId: "alm-fixture-01", cantidad: "80.5",
        updatedAt: T(`${AYER}T10:15:00.000Z`) },
    ]);

    insertar(instancia, "SalidaOQC", [
      { id: "sal-fixture-01", folio: "OQC-20261105-0001",
        clienteId: "cli-fixture-01", clienteCodigo: "CLI-0001", clienteNombre: "Cliente Fixture S.A.",
        almacenOrigenId: "alm-fixture-01", almacenOrigenCodigo: "ALM-F01",
        almacenOrigenNombre: "Almacén Fixture Uno",
        referencia: "REM-0001", responsable: "Responsable OQC", notas: null,
        usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre,
        estado: "EMITIDA", eliminadaEn: null, eliminadaPor: null,
        createdAt: T(`${AYER}T11:00:00.000Z`), updatedAt: T(`${AYER}T11:00:00.000Z`) },
    ]);

    // Movimientos: series de AYER y de HOY (continuidad del folio).
    insertar(instancia, "Movimiento", [
      { id: "mov-f01", folio: "ENT-20261105-0001",
        tipo: "ENTRADA", productoId: "prd-fixture-01", almacenOrigenId: null,
        almacenDestinoId: "alm-fixture-01", cantidad: "100", cantidadDespues: "100",
        motivo: "Compra inicial", referencia: "FACT-001", responsable: "Responsable Uno",
        usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre, editado: 0,
        createdAt: T(`${AYER}T10:00:00.000Z`),
        productoSku: "PRB-0001", productoNombre: "Producto Fixture Uno", productoUnidad: "PZA",
        almacenOrigenCodigo: null, almacenOrigenNombre: null,
        almacenDestinoCodigo: "ALM-F01", almacenDestinoNombre: "Almacén Fixture Uno",
        clienteId: null, clienteCodigo: null, clienteNombre: null,
        salidaId: null, salidaFolio: null, conteoDetalle: null },
      { id: "mov-f02", folio: "ENT-20261105-0002", tipo: "ENTRADA",
        productoId: "prd-fixture-02", almacenOrigenId: null, almacenDestinoId: "alm-fixture-02",
        cantidad: "50", cantidadDespues: "50", motivo: "Reabasto", referencia: "FACT-002",
        responsable: "Responsable Uno", usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre,
        editado: 0, createdAt: T(`${AYER}T10:10:00.000Z`),
        productoSku: "PRB-0002", productoNombre: "Producto Fixture Dos", productoUnidad: "PZA",
        almacenOrigenCodigo: null, almacenOrigenNombre: null,
        almacenDestinoCodigo: "ALM-F02", almacenDestinoNombre: "Almacén Fixture Dos",
        clienteId: null, clienteCodigo: null, clienteNombre: null,
        salidaId: null, salidaFolio: null, conteoDetalle: null },
      { id: "mov-f03", folio: "SAL-20261105-0001", tipo: "SALIDA",
        productoId: "prd-fixture-01", almacenOrigenId: "alm-fixture-01", almacenDestinoId: null,
        cantidad: "30", cantidadDespues: "70", motivo: "Consumo línea 1", referencia: "REM-0001",
        responsable: "Responsable OQC", usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre,
        editado: 0, createdAt: T(`${AYER}T11:00:00.000Z`),
        productoSku: "PRB-0001", productoNombre: "Producto Fixture Uno", productoUnidad: "PZA",
        almacenOrigenCodigo: "ALM-F01", almacenOrigenNombre: "Almacén Fixture Uno",
        almacenDestinoCodigo: null, almacenDestinoNombre: null,
        clienteId: "cli-fixture-01", clienteCodigo: "CLI-0001", clienteNombre: "Cliente Fixture S.A.",
        salidaId: "sal-fixture-01", salidaFolio: "OQC-20261105-0001", conteoDetalle: null },
      { id: "mov-f04", folio: `ENT-${HOY}-0001`, tipo: "ENTRADA",
        productoId: "prd-fixture-03", almacenOrigenId: null, almacenDestinoId: "alm-fixture-01",
        cantidad: "80.5", cantidadDespues: "80.5", motivo: "Recepción del día", referencia: null,
        responsable: null, usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre, editado: 0,
        createdAt: T("2026-11-06T09:00:00.000Z"),
        productoSku: "PRB-0003", productoNombre: "Producto Fixture Tres", productoUnidad: "KG",
        almacenOrigenCodigo: null, almacenOrigenNombre: null,
        almacenDestinoCodigo: "ALM-F01", almacenDestinoNombre: "Almacén Fixture Uno",
        clienteId: null, clienteCodigo: null, clienteNombre: null,
        salidaId: null, salidaFolio: null, conteoDetalle: null },
      { id: "mov-f05", folio: `ENT-${HOY}-0002`, tipo: "ENTRADA",
        productoId: "prd-fixture-01", almacenOrigenId: null, almacenDestinoId: "alm-fixture-01",
        cantidad: "0.5", cantidadDespues: "70.5", motivo: "Ajuste de recepción", referencia: null,
        responsable: null, usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre, editado: 0,
        createdAt: T("2026-11-06T09:30:00.000Z"),
        productoSku: "PRB-0001", productoNombre: "Producto Fixture Uno", productoUnidad: "PZA",
        almacenOrigenCodigo: null, almacenOrigenNombre: null,
        almacenDestinoCodigo: "ALM-F01", almacenDestinoNombre: "Almacén Fixture Uno",
        clienteId: null, clienteCodigo: null, clienteNombre: null,
        salidaId: null, salidaFolio: null, conteoDetalle: null },
      { id: "mov-f06", folio: `ENT-${HOY}-0003`, tipo: "ENTRADA",
        productoId: "prd-fixture-02", almacenOrigenId: null, almacenDestinoId: "alm-fixture-02",
        cantidad: "25", cantidadDespues: "75", motivo: "Reabasto del día", referencia: null,
        responsable: null, usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre, editado: 0,
        createdAt: T("2026-11-06T10:00:00.000Z"),
        productoSku: "PRB-0002", productoNombre: "Producto Fixture Dos", productoUnidad: "PZA",
        almacenOrigenCodigo: null, almacenOrigenNombre: null,
        almacenDestinoCodigo: "ALM-F02", almacenDestinoNombre: "Almacén Fixture Dos",
        clienteId: null, clienteCodigo: null, clienteNombre: null,
        salidaId: null, salidaFolio: null, conteoDetalle: null },
    ]);

    // Bitácora: un folio SAL-20261105-0002 EMITIDO Y ELIMINADO (su número
    // jamás debe reutilizarse — la serie llega a 2).
    insertar(instancia, "CorreccionMovimiento", [
      { id: "cor-f01", movimientoId: "mov-eliminado-f01", folio: "SAL-20261105-0002",
        salidaId: null, salidaFolio: null, accion: "ELIMINACION",
        antes: JSON.stringify({ folio: "SAL-20261105-0002", cantidad: "5", tipo: "SALIDA" }),
        despues: null, motivo: "Error de captura",
        usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre,
        createdAt: T(`${AYER}T12:00:00.000Z`) },
    ]);

    insertar(instancia, "SecuenciaFolio", [
      { id: "seq-ent-ayer", clave: "ENT-20261105", ultimo: 2,
        updatedAt: T(`${AYER}T12:00:00.000Z`) },
      { id: "seq-sal-ayer", clave: "SAL-20261105", ultimo: 2,
        updatedAt: T(`${AYER}T12:00:00.000Z`) },
      { id: "seq-ent-hoy", clave: `ENT-${HOY}`, ultimo: 3,
        updatedAt: T("2026-11-06T10:00:00.000Z") },
    ]);

    // Papelera: cliente eliminado ayer, DENTRO de su ventana de 30 días.
    insertar(instancia, "Papelera", [
      { id: "pap-f01", entidad: "CLIENTE", entidadId: "cli-fixture-02",
        identificador: "CLI-0002", nombre: "Cliente Eliminado Fixture",
        datos: JSON.stringify({
          id: "cli-fixture-02", codigo: "CLI-0002", nombre: "Cliente Eliminado Fixture",
          contacto: null, correo: "eliminado@fixture.local", telefono: null, direccion: null,
          notas: null, activo: true,
          createdAt: "2026-10-03T10:00:00.000Z", updatedAt: "2026-11-05T11:00:00.000Z",
        }),
        estado: "EN_PAPELERA", usuarioId: USUARIO.id, usuarioNombre: USUARIO.nombre,
        eliminadoEn: T(`${AYER}T11:00:00.000Z`), expiraEn: T("2026-12-05T11:00:00.000Z"),
        restauradoEn: null, restauradoPor: null, purgadoEn: null, purgadoPor: null },
    ]);

    // Conteos del fixture para las verificaciones posteriores.
    const conteos: Record<string, number> = {};
    for (const tabla of ordenTopologico()) {
      conteos[tabla] = (
        instancia.prepare(`SELECT COUNT(*) AS n FROM "${tabla}"`).get() as { n: number }
      ).n;
    }
    return conteos;
  } finally {
    instancia.close();
  }
}

// ============================================================
// MAIN
// ============================================================
async function main(): Promise<void> {
  // Identificadores nominales del fixture (los crea la sección B más
  // abajo). Si un literal no cumpliera el formato, fallar de inmediato;
  // declarados DENTRO de main() para que el estrechamiento de la guardia
  // aplique a todo el flujo secuencial de la prueba.
  const idProductoF1 = comoIdProducto("prd-fixture-01");
  const idProductoF2 = comoIdProducto("prd-fixture-02");
  const idAlmacenF1 = comoIdAlmacen("alm-fixture-01");
  const idAlmacenF2 = comoIdAlmacen("alm-fixture-02");
  if (!idProductoF1 || !idProductoF2 || !idAlmacenF1 || !idAlmacenF2) {
    throw new Error("Identificadores del fixture con formato inválido");
  }

  console.log("PRUEBA DE HUMO — FASE 6: migración de motor + PostgreSQL end-to-end\n");
  const t0 = Date.now();

  // ---------- A. Precondiciones ----------
  console.log("A) Precondiciones del entorno:");
  await verificarConexionBD();
  afirmar(true, "PostgreSQL acepta conexiones (SELECT 1 al arranque — fail-fast de instrumentation)");

  const versiones = spawnSync("pg_dump", ["--version"], { encoding: "utf8" });
  afirmar(versiones.status === 0, `pg_dump disponible: ${String(versiones.stdout).trim()}`);
  const dumpVersion = /(\d+)\./.exec(String(versiones.stdout))?.[1] ?? "0";
  const servidor = (await db.$queryRaw<{ version: string }[]>`SELECT version()`)[0].version;
  const servidorMayor = /PostgreSQL (\d+)\./.exec(servidor)?.[1] ?? "0";
  afirmar(
    Number(dumpVersion) >= Number(servidorMayor),
    `cliente pg_dump ${dumpVersion} >= servidor ${servidorMayor} (requisito del módulo Respaldo)`,
  );

  const tiposColumnas = await db.$queryRaw<Array<{ data_type: string }>>(
    Prisma.sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'Stock' AND column_name = 'cantidad'`,
  );
  afirmar(
    tiposColumnas[0]?.data_type === "text",
    `columna Stock.cantidad persiste como text (ADR decimales String/TEXT)`,
  );

  // ---------- B. Fixture legado ----------
  console.log("\nB) Construyendo el fixture legado (.db de la era anterior):");
  const dirTmp = fs.mkdtempSync(path.join(os.tmpdir(), "cig-fase6-"));
  const rutaFixture = path.join(dirTmp, "production.db");
  const conteosFixture = await construirFixture(rutaFixture);
  afirmar(fs.existsSync(rutaFixture), `fixture creado: ${rutaFixture}`);
  const tablasPobladas = Object.entries(conteosFixture).filter(([, n]) => n > 0);
  console.log(
    `  · ${Object.keys(conteosFixture).length} tablas (${tablasPobladas.length} con datos: ` +
      tablasPobladas.map(([t, n]) => `${t}=${n}`).join(", ") + ")",
  );

  // ---------- C. Migración real (subproceso) ----------
  console.log("\nC) Migración real (scripts/migrar-sqlite-a-postgres.ts --reemplazar):");
  const migracion = spawnSync(
    "bun",
    [RUTA_MIGRADOR, rutaFixture, "--reemplazar"],
    { cwd: RAIZ, encoding: "utf8", timeout: 300_000 },
  );
  for (const linea of String(migracion.stdout ?? "").split("\n")) {
    if (linea.trim()) console.log(`    │ ${linea}`);
  }
  afirmar(migracion.status === 0, `migrador terminó con código 0 (obtenido: ${migracion.status})`);
  if (migracion.status !== 0) {
    console.error(String(migracion.stderr ?? ""));
    return resumen(t0, dirTmp);
  }

  // ---------- D. Fidelidad de datos ----------
  console.log("\nD) Fidelidad de los datos migrados:");
  let discrepancias = 0;
  for (const [tabla, esperado] of Object.entries(conteosFixture)) {
    const clave = tabla.charAt(0).toLowerCase() + tabla.slice(1);
    const delegado = (db as unknown as Record<string, { count: () => Promise<number> }>)[clave];
    const obtenido = await delegado.count();
    if (obtenido !== esperado) {
      discrepancias++;
      console.log(`  ✗ FALLO — ${tabla}: esperado ${esperado}, obtenido ${obtenido}`);
    }
  }
  afirmar(discrepancias === 0, `conteos por tabla idénticos al fixture (${discrepancias} discrepancias)`);

  const rol = await db.rol.findUnique({ where: { clave: "ADMIN" } });
  afirmar(rol !== null && rol.sistema === true, "Booleano migrado: Rol.ADMIN.sistema === true (INTEGER 1 → bool)");
  afirmar(
    rol instanceof Object && rol!.createdAt instanceof Date,
    "DateTime migrado: Rol.createdAt es Date (ISO del legado → Date)",
  );

  const stockP1 = await db.stock.findUnique({
    where: { productoId_almacenId: { productoId: "prd-fixture-01", almacenId: "alm-fixture-01" } },
  });
  afirmar(stockP1?.cantidad === "70", `decimal String exacto: Stock.cantidad === "70" (obtenido: ${stockP1?.cantidad})`);

  const prod3 = await db.producto.findUnique({ where: { id: "prd-fixture-03" } });
  afirmar(prod3?.stockMinimo === "2.5", `decimal String exacto: Producto.stockMinimo === "2.5" (obtenido: ${prod3?.stockMinimo})`);

  const movHoy = await db.movimiento.findUnique({ where: { id: "mov-f05" } });
  afirmar(movHoy?.folio === `ENT-${HOY}-0002`, `folio textual exacto: ${movHoy?.folio}`);
  afirmar(movHoy?.cantidad === "0.5" && movHoy?.cantidadDespues === "70.5", "decimales del ledger exactos (0.5 / 70.5)");

  const serieHoy = await db.secuenciaFolio.findUnique({ where: { clave: `ENT-${HOY}` } });
  afirmar(serieHoy?.ultimo === 3, `SecuenciaFolio migrada: ENT-${HOY}.ultimo === 3 (obtenido: ${serieHoy?.ultimo})`);
  const serieSalAyer = await db.secuenciaFolio.findUnique({ where: { clave: "SAL-20261105" } });
  afirmar(serieSalAyer?.ultimo === 2, "Serie SAL-20261105.ultimo === 2 (incluye el folio eliminado en bitácora)");

  const papeleraMigrada = await db.papelera.findUnique({ where: { id: "pap-f01" } });
  let datosLegibles = false;
  try {
    datosLegibles =
      JSON.parse(papeleraMigrada?.datos ?? "{}").codigo === "CLI-0002" &&
      papeleraMigrada?.estado === "EN_PAPELERA";
  } catch {
    datosLegibles = false;
  }
  afirmar(datosLegibles, "papelera migrada: snapshot JSON legible + estado EN_PAPELERA");
  afirmar(
    papeleraMigrada !== null && papeleraMigrada.expiraEn > new Date(),
    "ventana de restauración de 30 días conservada (expiraEn > hoy)",
  );

  // ---------- E. Folios monotónicos ----------
  console.log("\nE) Folios monotónicos (continuidad post-migración):");
  const movContinuo = await transaccion((tx) =>
    registrarMovimientoTx(tx, {
      tipo: "ENTRADA",
      productoId: idProductoF1,
      almacenDestinoId: idAlmacenF1,
      cantidad: new Prisma.Decimal("10"),
      motivo: "Prueba de humo Fase 6: continuidad de folio",
      usuarioId: USUARIO.id,
      usuarioNombre: USUARIO.nombre,
    }),
  );
  afirmar(
    movContinuo.folio === `ENT-${HOY}-0004`,
    `la serie de HOY CONTINÚA tras la migración: ${movContinuo.folio} (esperado ENT-${HOY}-0004)`,
  );
  afirmar(
    movContinuo.cantidadDespues === "80",
    `snapshot del ledger exacto: 70 + 10 = "${movContinuo.cantidadDespues}"`,
  );

  // Identificador nominal del movimiento recién registrado (id generado
  // por la base; la conversión no puede fallar — defensa en profundidad).
  const idMovContinuo = comoIdMovimiento(movContinuo.id);
  if (!idMovContinuo) throw new Error("El movimiento registrado no produjo un id válido");
  const { folio: folioEliminado } = await transaccion((tx) =>
    eliminarMovimientoTx(tx, idMovContinuo, {
      motivoCorreccion: "Prueba de humo Fase 6: folio no reutilizable",
      usuarioId: USUARIO.id,
      usuarioNombre: USUARIO.nombre,
    }),
  );
  afirmar(folioEliminado === `ENT-${HOY}-0004`, "movimiento eliminado (bitácora de corrección creada)");

  const movPosterior = await transaccion((tx) =>
    registrarMovimientoTx(tx, {
      tipo: "ENTRADA",
      productoId: idProductoF1,
      almacenDestinoId: idAlmacenF1,
      cantidad: new Prisma.Decimal("1"),
      motivo: "Prueba de humo Fase 6: número liberado no se reutiliza",
      usuarioId: USUARIO.id,
      usuarioNombre: USUARIO.nombre,
    }),
  );
  afirmar(
    movPosterior.folio === `ENT-${HOY}-0005`,
    `el folio ELIMINADO no se reutiliza: ${movPosterior.folio} (esperado ENT-${HOY}-0005)`,
  );

  const movSerieNueva = await transaccion((tx) =>
    registrarMovimientoTx(tx, {
      tipo: "SALIDA",
      productoId: idProductoF2,
      almacenOrigenId: idAlmacenF2,
      cantidad: new Prisma.Decimal("5"),
      motivo: "Prueba de humo Fase 6: serie nueva del día",
      usuarioId: USUARIO.id,
      usuarioNombre: USUARIO.nombre,
    }),
  );
  afirmar(
    movSerieNueva.folio === `SAL-${HOY}-0001`,
    `serie NUEVA del día arranca en 0001: ${movSerieNueva.folio}`,
  );

  // ---------- F. Papelera (ciclo completo) ----------
  console.log("\nF) Papelera: producto → papelera → restauración (mismo id + stock):");
  await db.stock.deleteMany({ where: { productoId: "smoke-f6-p9" } });
  await db.producto.deleteMany({ where: { id: "smoke-f6-p9" } });
  await db.producto.create({
    data: {
      id: "smoke-f6-p9", sku: "SMOKE-F6-0009", nombre: "Producto prueba humo Fase 6",
      categoria: "MATERIA_PRIMA", unidad: "PZA", stockMinimo: "0", costoUnitario: "9.99",
    },
  });
  await db.stock.create({
    data: { productoId: "smoke-f6-p9", almacenId: "alm-fixture-01", cantidad: "25" },
  });

  await enviarProductoAPapelera("smoke-f6-p9", USUARIO);
  const productoTrasEnvio = await db.producto.findUnique({ where: { id: "smoke-f6-p9" } });
  const entradaPapelera = await db.papelera.findFirst({
    where: { entidad: "PRODUCTO", entidadId: "smoke-f6-p9", estado: "EN_PAPELERA" },
    orderBy: { eliminadoEn: "desc" },
  });
  afirmar(productoTrasEnvio === null, "el producto desaparece de la tabla viva");
  afirmar(entradaPapelera !== null, "entrada EN_PAPELERA con snapshot completo (datos JSON)");
  let snapshotStock = false;
  try {
    snapshotStock =
      JSON.parse(entradaPapelera?.datos ?? "{}").stocks?.[0]?.cantidad === "25";
  } catch {
    snapshotStock = false;
  }
  afirmar(snapshotStock, "el snapshot conserva el stock («25» exacto)");

  const restaurado = await restaurarDePapelera(entradaPapelera!.id, USUARIO);
  afirmar(
    restaurado.entidad === "PRODUCTO" && restaurado.identificador === "SMOKE-F6-0009",
    `restauración declarada: ${restaurado.entidad} ${restaurado.identificador}`,
  );
  const productoRestaurado = await db.producto.findUnique({
    where: { id: "smoke-f6-p9" },
    include: { stocks: true },
  });
  afirmar(productoRestaurado !== null, "el producto REGRESA con el MISMO id (re-vinculación)");
  afirmar(
    productoRestaurado?.stocks.find((s) => s.almacenId === "alm-fixture-01")?.cantidad === "25",
    "el stock se recrea exacto («25»)",
  );
  const entradaTrasRestaurar = await db.papelera.findUnique({ where: { id: entradaPapelera!.id } });
  afirmar(entradaTrasRestaurar?.estado === "RESTAURADO", "la entrada queda RESTAURADO (bitácora)");

  // ---------- G. Respaldo / restauración / reversión ----------
  console.log("\nG) Respaldo: pg_dump → restauración en caliente → reversión:");
  const respaldo = await crearRespaldo({
    tipo: "MANUAL",
    etiqueta: "prueba-humo-fase6",
    usuario: "prueba-humo@cig.local",
  });
  const rutaDump = path.join(directorioDatos(), "backups", respaldo.archivo);
  afirmar(fs.existsSync(rutaDump), `archivo .dump creado: ${respaldo.archivo}`);
  afirmar(
    fs.statSync(rutaDump).size > 0 && fs.readFileSync(rutaDump).subarray(0, 5).toString() === "PGDMP",
    "cabecera PGDMP presente (volcado custom de pg_dump)",
  );
  afirmar(respaldo.totalRegistros > 0, `total de registros volcados: ${respaldo.totalRegistros}`);

  // Mutación POST-respaldo (debe desaparecer al restaurar y regresar al revertir).
  await db.stock.deleteMany({ where: { productoId: "smoke-f6-p10" } });
  await db.producto.deleteMany({ where: { id: "smoke-f6-p10" } });
  await db.producto.create({
    data: {
      id: "smoke-f6-p10", sku: "SMOKE-F6-0010", nombre: "Producto mutado post-respaldo",
      categoria: "MATERIA_PRIMA", unidad: "PZA", stockMinimo: "0", costoUnitario: "1.00",
    },
  });
  afirmar(
    (await db.producto.findUnique({ where: { id: "smoke-f6-p10" } })) !== null,
    "mutación post-respaldo aplicada (producto smoke-f6-p10 existe)",
  );

  const restauracion = await restaurarRespaldo(respaldo.id, "prueba-humo@cig.local");
  afirmar(
    restauracion.restauracion.estado === "COMPLETADA",
    `restauración en caliente COMPLETADA (${restauracion.resumen.totalRegistros} registros, ${restauracion.resumen.duracionMs} ms)`,
  );
  afirmar(
    restauracion.restauracion.ventanaReversaHasta !== null,
    "ventana de reversión de 24 h registrada",
  );
  afirmar(
    (await db.producto.findUnique({ where: { id: "smoke-f6-p10" } })) === null,
    "la mutación DESAPARECE: la base volvió al estado del respaldo",
  );
  const movF05TrasRestaurar = await db.movimiento.findUnique({ where: { id: "mov-f05" } });
  afirmar(
    movF05TrasRestaurar?.folio === `ENT-${HOY}-0002`,
    "los datos del fixture siguen íntegros tras la restauración",
  );

  const reversion = await revertirUltimaRestauracion("prueba-humo@cig.local");
  afirmar(
    reversion.restauracion.estado === "COMPLETADA" && reversion.restauracion.tipo === "REVERSION",
    "reversión COMPLETADA (snapshot pre-restauración)",
  );
  afirmar(
    (await db.producto.findUnique({ where: { id: "smoke-f6-p10" } })) !== null,
    "la mutación REGRESA: la base volvió al estado pre-restauración",
  );

  const bitacoraRespaldo = await db.restauracionBD.findMany({
    orderBy: { iniciadaEn: "asc" },
  });
  const exitosas = bitacoraRespaldo.filter((r) => r.estado === "COMPLETADA");
  afirmar(
    exitosas.length >= 2 &&
      exitosas.some((r) => r.tipo === "RESTAURACION") &&
      exitosas.some((r) => r.tipo === "REVERSION"),
    `bitácora de respaldo: ${exitosas.length} operaciones COMPLETADAS (RESTAURACIÓN + REVERSIÓN)`,
  );

  return resumen(t0, dirTmp);
}

function resumen(t0: number, dirTmp: string): void {
  fs.rmSync(dirTmp, { recursive: true, force: true });
  console.log(
    fallas
      ? `\n✗ PRUEBA DE HUMO FALLIDA (${fallas} afirmaciones)`
      : `\n✔ PRUEBA DE HUMO COMPLETA: migración de datos verificada (cero discrepancias), ` +
          `folios monotónicos continúan la serie migrada, papelera restaurable y ciclo ` +
          `respaldo → restauración en caliente → reversión operativos sobre PostgreSQL`,
  );
  console.log(`  Duración total: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exitCode = fallas ? 1 : 0;
}

main()
  .catch((e) => {
    console.error("ERROR DE LA PRUEBA:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) console.error(e.stack.split("\n").slice(0, 6).join("\n"));
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
