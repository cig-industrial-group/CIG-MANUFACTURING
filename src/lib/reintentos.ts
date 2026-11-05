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
 * ENVOLTORIO DE REINTENTOS PARA ERRORES TRANSITORIOS (remediación Fase 3)
 * =====================================================================
 *
 * Complementa — no sustituye — a los controles de conexión de la Fase 2
 * (src/lib/db.ts: pool de 1 conexión + WAL + busy_timeout=5000):
 *
 *   · Pool de 1 conexión: las peticiones de la app se serializan; no hay
 *     contienda INTERNA que reintentar.
 *   · busy_timeout: SQLite espera internamente hasta 5 s cuando el cerrojo
 *     lo mantiene un proceso EXTERNO (mantenimiento con sqlite3 CLI,
 *     respaldo en frío, despliegue). Absorbe los bloqueos cortos.
 *   · ESTE módulo: absorbe los bloqueos que EXCEDEN el busy_timeout (o que
 *     SQLite no puede esperar) reintentando la operación completa con
 *     retroceso exponencial + jitter, hasta un límite de intentos.
 *
 * Qué se reintenta (solo errores TRANSITORIOS, todo lo demás falla rápido):
 *
 *   · Prisma P1008 («Socket timeout»): forma REAL y dominante en que el
 *     driver superficie el SQLITE_BUSY agotado (verificado empíricamente:
 *     cerrojo externo de 8 s → P1008 a los ~5 s, tanto en queries sueltas
 *     como en transacciones interactivas; el reintento posterior sale bien
 *     en cuanto el cerrojo se libera).
 *   · SQLITE_BUSY (5) / SQLITE_LOCKED (6) / SQLITE_BUSY_SNAPSHOT (517):
 *     el archivo o la tabla están ocupados por otro proceso, o la
 *     transacción en WAL no puede ascender de cerrojo de lectura a
 *     escritura (snapshot obsoleto → hay que re-ejecutarla desde cero).
 *   · Prisma P2034 («Transaction failed due to a write conflict or a
 *     deadlock. Please retry your transaction»): conflicto de escritura;
 *     el propio motor recomienda el reintento.
 *   · Prisma P2024 (timeout del pool): la operación NUNCA LLEGÓ A EMPEZAR
 *     (no obtuvo conexión), por lo que re-ejecutarla es seguro. Con pool=1
 *     ocurre si una transacción larga (p. ej. restauración, timeout 120 s)
 *     ocupa la única conexión más tiempo del que otra petición esperó.
 *
 * Regla de oro de las transacciones interactivas: se reintenta la
 * TRANSACCIÓN COMPLETA (el callback se re-ejecuta desde su inicio sobre
 * una transacción nueva). JAMÁS se reintenta una query aislada DENTRO de
 * una transacción viva: en BUSY_SNAPSHOT la transacción ya está condenada
 * y el único camino correcto es re-empezarla. Por eso `transaccion()` es
 * el único punto de entrada para reintentar escrituras compuestas.
 *
 * Requisito para los callbacks: solo trabajo de base de datos. Si un
 * callback tuviera efectos externos (archivos, red, correo), su
 * re-ejecución los duplicaría. Hoy TODOS los call sites cumplen
 * (verificados); `transaccion()` lo exige por contrato documentado.
 *
 * Referencias: NIST SP 800-53 SC-5 (resiliencia ante contención, degradar
 * con espera acotada en lugar de fallar), SI-11 (respuesta a errores sin
 * exponer información sensible); ISO 27001 A.8.6 (gestión de capacidad);
 * OWASP ASVS 5.4.1 (integridad). El jitter evita sincronización de
 * reintentos si algún día hay más de una instancia de la app.
 */
import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

// ============================================================
// Configuración por defecto (sin variables de entorno: los
// límites son de diseño, no de operación).
// ============================================================

/** Límite de intentos totales (1.º incluido). */
export const INTENTOS_POR_DEFECTO = 3;
/** Retardo base del retroceso exponencial (ms). */
export const RETARDO_BASE_MS = 200;
/** Techo del retardo entre intentos (ms). */
export const RETARDO_MAXIMO_MS = 1500;
/** Piso del retardo (evita reintentos en ráfaga a velocidad de bucle). */
export const RETARDO_MINIMO_MS = 25;
/** Profundidad máxima al inspeccionar la cadena de causas. */
export const PROFUNDIDAD_CAUSAS = 5;

/** Ajustes del reintento. Todos opcionales; los ausentes usan el defecto. */
export type OpcionesReintentos = {
  /** Intentos totales incluido el primero (>= 1). Defecto: 3. */
  intentos?: number;
  /** Retardo base del retroceso exponencial en ms. Defecto: 200. */
  retardoBaseMs?: number;
  /** Techo del retardo en ms. Defecto: 1500. */
  retardoMaximoMs?: number;
};

/**
 * Códigos de error de Prisma que representan condiciones transitorias.
 * Verificados EMPÍRICAMENTE contra Prisma 6.19.2 + SQLite + WAL + pool=1
 * (scripts/prueba-humo-fase3.ts §7 y experimentos de la Fase 3):
 *
 * · P1008 — «Socket timeout»: así superficie el driver el SQLITE_BUSY que
 *   devuelve SQLite cuando el busy_timeout se agota esperando un cerrojo
 *   EXTERNO (medido: cerrojo de 8 s → P1008 a los 5 311 ms en query simple
 *   y a los 5 006 ms en transacción interactiva; el reintento inmediato
 *   posterior salió bien en cuanto el cerrojo se liberó). Con un archivo
 *   local no hay red que pierda la respuesta: la query nunca llegó a
 *   ejecutarse, re-ejecutarla es seguro.
 * · P2034 — conflicto de escritura/interbloqueo: el propio motor pide
 *   reintentar la transacción.
 * · P2024 — timeout del pool: la operación NUNCA LLEGÓ A EMPEZAR (no
 *   obtuvo conexión); re-ejecutarla es seguro. Con pool=1 ocurre si una
 *   transacción larga (p. ej. restauración, timeout 120 s) ocupa la única
 *   conexión más tiempo del que otra petición esperó.
 *
 * NO se reintentan (fallo rápido): P2028 (la transacción excedió SU PROPIO
 * timeout de trabajo — no es un cerrojo; re-ejecutarla triplica el tiempo
 * de un trabajo que ya es demasiado largo) y cualquier error de integridad
 * o de negocio (P2002, P2003, P2025, ErrorNegocio…).
 */
const CODIGOS_PRISMA_TRANSITORIOS: ReadonlySet<string> = new Set(["P1008", "P2034", "P2024"]);

/**
 * Códigos de resultado de SQLite que indican cerrojo ocupado ahora,
 * pero liberable: SQLITE_BUSY (5), SQLITE_LOCKED (6) y su variante WAL
 * SQLITE_BUSY_SNAPSHOT (517). Llegan como `code` numérico o textual
 * según cómo los envuelva el driver.
 */
const CODIGOS_SQLITE_TRANSITORIOS: ReadonlySet<string> = new Set([
  "5",
  "6",
  "517",
  "SQLITE_BUSY",
  "SQLITE_LOCKED",
  "SQLITE_BUSY_SNAPSHOT",
]);

/**
 * Patrón de mensaje de los errores transitorios tal como los emite el
 * motor SQLite a través de Prisma («database is locked», «database
 * file is locked», «database table is locked», …). La detección por
 * mensaje cubre envolturas que no propagan el código numérico.
 */
const PATRON_MENSAJE_TRANSITORIO =
  /database (?:is|file is|table is) locked|database is busy|sqlite_busy|sqlite_locked|write conflict|deadlock/i;

/** ¿Parece un objeto con forma de error (código/mensaje/causa)? */
interface FormaDeError {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
}

/**
 * ¿El error es transitorio (cerrojo ocupado / conflicto de escritura)?
 * Inspecciona el error y su cadena de `cause` (los drivers anidan).
 * No lanza, no registra, no modifica: pura clasificación.
 */
export function esErrorTransitorio(error: unknown): boolean {
  let actual: unknown = error;
  for (let profundidad = 0; profundidad < PROFUNDIDAD_CAUSAS; profundidad++) {
    if (actual === null || actual === undefined) return false;
    if (typeof actual !== "object") return false;
    const { code, message, cause } = actual as FormaDeError;
    const codigo = code === undefined || code === null ? "" : String(code);
    if (CODIGOS_PRISMA_TRANSITORIOS.has(codigo)) return true;
    if (CODIGOS_SQLITE_TRANSITORIOS.has(codigo)) return true;
    if (typeof message === "string" && PATRON_MENSAJE_TRANSITORIO.test(message)) return true;
    if (cause === undefined || cause === null) return false;
    actual = cause;
  }
  return false;
}

/** Resumen corto y seguro del error para los avisos (sin stack, sin datos,
 * una sola línea: los mensajes de Prisma traen saltos que romperían el log). */
function resumenError(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  const plano = mensaje.replace(/\s+/g, " ").trim();
  return plano.length > 120 ? `${plano.slice(0, 117)}…` : plano;
}

/**
 * Retardo del intento N (1-indexado) con retroceso exponencial y
 * «jitter completo»: un valor aleatorio entre el piso y el techo del
 * escalón. El escalón es base * 2^(intento-1) acotado por retardoMaximoMs.
 */
function calcularRetardo(intento: number, base: number, maximo: number): number {
  const techo = Math.min(maximo, base * 2 ** (intento - 1));
  const piso = Math.min(RETARDO_MINIMO_MS, techo);
  return Math.floor(piso + Math.random() * (techo - piso));
}

/** Normaliza las opciones con validación defensiva de rangos. */
function opcionesEfectivas(opciones?: OpcionesReintentos): Required<OpcionesReintentos> {
  const base = opciones?.retardoBaseMs ?? RETARDO_BASE_MS;
  const maximo = opciones?.retardoMaximoMs ?? RETARDO_MAXIMO_MS;
  const intentos = opciones?.intentos ?? INTENTOS_POR_DEFECTO;
  return {
    intentos: Number.isFinite(intentos) ? Math.max(1, Math.floor(intentos)) : INTENTOS_POR_DEFECTO,
    retardoBaseMs: Number.isFinite(base) ? Math.max(0, base) : RETARDO_BASE_MS,
    retardoMaximoMs: Number.isFinite(maximo) ? Math.max(0, maximo) : RETARDO_MAXIMO_MS,
  };
}

/**
 * Ejecuta `operacion` reintentándola SOLO si falla con un error
 * transitorio (ver `esErrorTransitorio`). Cualquier otro error se
 * propaga en el primer intento (fallo rápido: un error de validación o
 * de integridad no se arregla repitiéndolo).
 *
 * `operacion` debe ser una fábrica completa del trabajo a re-ejecutar:
 * para transacciones interactivas, envuelve la llamada ENTERA a
 * `db.$transaction` (o usa `transaccion()`), nunca una query suelta
 * del interior.
 */
export async function conReintentos<T>(
  operacion: () => Promise<T>,
  opciones?: OpcionesReintentos,
): Promise<T> {
  const { intentos, retardoBaseMs, retardoMaximoMs } = opcionesEfectivas(opciones);
  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      return await operacion();
    } catch (error) {
      ultimoError = error;
      if (intento === intentos || !esErrorTransitorio(error)) throw error;
      const retardo = calcularRetardo(intento, retardoBaseMs, retardoMaximoMs);
      console.warn(
        `[bd] error transitorio en intento ${intento}/${intentos}; ` +
          `reintentando en ${retardo} ms — ${resumenError(error)}`,
      );
      await new Promise((resolver) => setTimeout(resolver, retardo));
    }
  }
  // Inalcanzable: el bucle termina por return o por throw.
  throw ultimoError;
}

// ============================================================
// Transacciones interactivas con reintento integral
// ============================================================

/** Handle transaccional de Prisma (mismo tipo que usan los módulos). */
export type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Opciones de `db.$transaction` (forma estructural de la sobrecarga de
 * callback: maxWait/timeout/isolationLevel). Declarada aquí para no
 * depender de un nombre interno del cliente generado.
 */
export type OpcionesTransaccion = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

/**
 * Transacción interactiva con reintentos: envuelve `db.$transaction(fn)`
 * de modo que un fallo transitorio (SQLITE_BUSY agotado, P2034, P2024)
 * re-ejecute `fn` COMPLETA sobre una transacción nueva. El estado de un
 * intento fallido se descartó por rollback, así que la re-ejecución
 * parte de los datos originales: idempotencia estructural.
 *
 * CONTRATO del callback `fn`:
 *   · SOLO trabajo de base de datos con `tx` (sin archivos, red, correo
 *     u otros efectos externos: se re-ejecutarían).
 *   · Sin capturar errores de cerrojo dentro: que burbujen hasta aquí.
 *
 * `opcionesPrisma` se pasa intacto a `db.$transaction` (p. ej. el
 * `timeout: 120_000` de la restauración del módulo Respaldo).
 */
export async function transaccion<T>(
  fn: (tx: PrismaTx) => Promise<T>,
  opcionesPrisma?: OpcionesTransaccion,
  reintentos?: OpcionesReintentos,
): Promise<T> {
  return conReintentos(
    () => db.$transaction(fn, opcionesPrisma),
    reintentos,
  );
}
