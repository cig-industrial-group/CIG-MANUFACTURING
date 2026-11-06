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
 * ENVOLTORIO DE REINTENTOS PARA ERRORES TRANSITORIOS (PostgreSQL)
 * =================================================================
 *
 * Migración de motor de archivo local → PostgreSQL (v1.1.1). Este módulo
 * conservó su contrato público (conReintentos / transaccion /
 * esErrorTransitorio) y cambió SOLO la taxonomía de errores transitorios:
 * los códigos de base ocupada/bloqueada del motor anterior fueron
 * reemplazados por los SQLSTATE de PostgreSQL.
 *
 * Qué se reintenta (solo errores TRANSITORIOS, todo lo demás falla rápido):
 *
 *   · SQLSTATE 40001 (serialization_failure): PostgreSQL Serializable
 *     (SSI) reporta anomalías de serialización DESCRIBIÉNDOLAS como
 *     error; el tratamiento correcto es re-ejecutar la transacción
 *     completa. Las transacciones de negocio corren en Serializable
 *     (ver transaccion()), de modo que este código ES el camino normal
 *     de resolución de contención de escritura.
 *   · SQLSTATE 40P01 (deadlock_detected): el servidor abortó a una de
 *     las transacciones interbloqueadas; Prisma lo superficie también
 *     como P2034. Re-ejecutar es el remedio estándar documentado.
 *   · SQLSTATE 53300 (too_many_connections): el servidor saturó su
 *     límite de conexiones; tras el retroceso acotado suele liberarse
 *     una conexión y el reintento entra.
 *   · SQLSTATE 57P03 (cannot_connect_now): el servidor está arrancando
 *     o apagándose (p. ej. reinicio del contenedor de BD).
 *   · SQLSTATE 55P03 (lock_not_available): un bloqueo NOWAIT no pudo
 *     adquirirse de inmediato (condición liberable).
 *   · Clase SQLSTATE 08* (excepciones de conexión: 08000, 08003,
 *     08006, 08001, 08004, 08007): caídas/rechazos de conexión
 *     transitorios (reinicios de red o del servidor de BD).
 *   · Prisma P1008 («Socket timeout») / P1001 / P1002 (servidor
 *     inalcanzable o tardo en responder): condiciones de red que se
 *     re-absorben con el retroceso acotado.
 *   · Prisma P2034 («Transaction failed due to a write conflict or a
 *     deadlock. Please retry your transaction»): envoltorio de los
 *     40001/40P01 de PostgreSQL; el propio motor recomienda reintentar.
 *   · Prisma P2024 (timeout del pool): la operación NUNCA LLEGÓ A EMPEZAR
 *     (no obtuvo conexión del pool), por lo que re-ejecutarla es seguro.
 *
 * NO se reintentan (fallo rápido): P2028 (la transacción excedió SU PROPIO
 * timeout de trabajo — re-ejecutarla triplica el tiempo de un trabajo que
 * ya es demasiado largo) y cualquier error de integridad o de negocio
 * (P2002, P2003, P2025, ErrorNegocio…).
 *
 * Regla de oro de las transacciones interactivas: se reintenta la
 * TRANSACCIÓN COMPLETA (el callback se re-ejecuta desde su inicio sobre
 * una transacción nueva). JAMÁS se reintenta una query aislada DENTRO de
 * una transacción viva: ante 40001 la transacción ya está abortada y el
 * único camino correcto es re-empezarla. Por eso `transaccion()` es el
 * único punto de entrada para reintentar escrituras compuestas.
 *
 * Requisito para los callbacks: solo trabajo de base de datos. Si un
 * callback tuviera efectos externos (archivos, red, correo), su
 * re-ejecución los duplicaría. Hoy TODOS los call sites cumplen
 * (verificados); `transaccion()` lo exige por contrato documentado.
 *
 * SANEAMIENTO DE LOGS (refinamiento de seguridad): ningún mensaje que
 * este módulo imprima incluye la cadena de conexión (DATABASE_URL) ni
 * secretos: `sanearParaLog` redacta URLs con esquema de BD y pares
 * usuario:contraseña antes de registrar. Aplica también al módulo de
 * respaldo, que importa la misma función.
 *
 * Referencias: NIST SP 800-53 SC-5 (resiliencia ante contención, degradar
 * con espera acotada en lugar de fallar), SI-11 (respuesta a errores sin
 * exponer información sensible); ISO 27001 A.8.6 (gestión de capacidad);
 * OWASP ASVS 5.4.1 (integridad). El jitter evita sincronización de
 * reintentos entre las conexiones concurrentes del pool.
 */
// Import de VALOR (no «import type»): Prisma.TransactionIsolationLevel se
// usa en tiempo de EJECUCIÓN (transaccion() fija Serializable por defecto);
// un import de solo-tipo sería eliminado por el compilador y la constante
// dejaría de existir en runtime (ReferenceError).
import { Prisma } from "@prisma/client";

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
 * Códigos de error de Prisma que representan condiciones transitorias
 * sobre PostgreSQL:
 *
 * · P1008 — «Socket timeout»: la operación no obtuvo respuesta a tiempo
 *   (red saturada, servidor momentáneamente cargado). Re-ejecutar tras
 *   un retroceso acotado es seguro.
 * · P1001 / P1002 — servidor inalcanzable / tardo en aceptar la
 *   conexión: transitorios durante reinicios del servidor de BD.
 * · P2034 — conflicto de escritura/interbloqueo: el propio motor pide
 *   reintentar la transacción (envoltorio de SQLSTATE 40001/40P01).
 * · P2024 — timeout del pool: la operación NUNCA LLEGÓ A EMPEZAR (no
 *   obtuvo conexión); re-ejecutarla es seguro.
 */
const CODIGOS_PRISMA_TRANSITORIOS: ReadonlySet<string> = new Set([
  "P1008",
  "P1001",
  "P1002",
  "P2034",
  "P2024",
]);

/**
 * SQLSTATE de PostgreSQL que indican una condición ocupada/abortada
 * AHORA, pero liberable con un reintento:
 *   · 40001 serialization_failure (Serializable SSI: re-ejecutar)
 *   · 40P01 deadlock_detected (el servidor abortó a una víctima)
 *   · 53300 too_many_connections
 *   · 57P03 cannot_connect_now (arranque/parada del servidor)
 *   · 55P03 lock_not_available (NOWAIT)
 *   · Clase 08*: excepciones de conexión (08000, 08001, 08003,
 *     08004, 08006, 08007).
 * Llegan como `code` del error original (el driver pg expone el
 * SQLSTATE) o anidados en `cause`.
 */
const SQLSTATE_POSTGRES_TRANSITORIOS: ReadonlySet<string> = new Set([
  "40001",
  "40P01",
  "53300",
  "57P03",
  "55P03",
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
]);

/**
 * Patrón de mensaje de los errores transitorios tal como los emite el
 * servidor PostgreSQL a través del driver («deadlock detected», «could
 * not serialize access due to read/update dependencies between
 * transactions», «too many clients», …). La detección por mensaje cubre
 * envolturas que no propagan el SQLSTATE numérico.
 */
const PATRON_MENSAJE_TRANSITORIO =
  /deadlock detected|could not serialize access|too many clients|too many connections|terminating connection due to|connection terminated unexpectedly|connection refused|server closed the connection unexpectedly|database system is (?:starting up|shutting down)/i;

/**
 * Patrón de fuga de credenciales en mensajes de error: URLs de conexión
 * con esquema de base de datos (postgresql://usuario:clave@host/…,
 * file:…). Prisma y los drivers a veces incluyen la URL de la fuente de
 * datos en mensajes de validación/conexión; registrarla expondría el
 * secreto en los logs (refinamiento de seguridad #3).
 */
const PATRON_URL_CONEXION = /\b(?:postgresql|postgres|file):\/\/[^\s'"`]+|\bfile:[^\s'"`]+/gi;

/** ¿Parece un objeto con forma de error (código/mensaje/causa)? */
interface FormaDeError {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
}

/**
 * Redacta información sensible de un texto de error ANTES de registrarlo:
 * sustituye URLs de conexión (incluyen usuario:contraseña) por un
 * marcador y recorta a una sola línea. Pura función sin efectos.
 */
export function sanearParaLog(texto: string): string {
  return texto.replace(PATRON_URL_CONEXION, "[URL-REDACTADA]");
}

/**
 * ¿El error es transitorio (contención / interbloqueo / conexión)?
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
    if (SQLSTATE_POSTGRES_TRANSITORIOS.has(codigo)) return true;
    if (typeof message === "string" && PATRON_MENSAJE_TRANSITORIO.test(message)) return true;
    if (cause === undefined || cause === null) return false;
    actual = cause;
  }
  return false;
}

/** Resumen corto y seguro del error para los avisos (sin stack, sin
 * datos, sin URLs de conexión — ver sanearParaLog; una sola línea: los
 * mensajes de Prisma traen saltos que romperían el log). */
function resumenError(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  const plano = sanearParaLog(mensaje).replace(/\s+/g, " ").trim();
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
 * de modo que un fallo transitorio (SQLSTATE 40001/40P01, P2034, P2024,
 * caída de conexión) re-ejecute `fn` COMPLETA sobre una transacción
 * nueva. El estado de un intento fallido se descartó por rollback, así
 * que la re-ejecución parte de los datos originales: idempotencia
 * estructural.
 *
 * AISLAMIENTO POR DEFECTO — Serializable: el motor anterior, con pool
 * de 1 conexión, serializaba FÍSICAMENTE a todos los escritores (ninguna
 * actualización perdida era posible). PostgreSQL ejecuta transacciones
 * en paralelo y, bajo el aislamiento por defecto (Read Committed), dos
 * transacciones que leen-modifican-escriben la misma fila (stock,
 * SecuenciaFolio) pueden perder la actualización de una de ellas sin
 * error alguno. Serializable (SSI) preserva la garantía del sistema
 * original: el servidor detecta la anomalía, aborta con 40001 y ESTE
 * envoltorio re-ejecuta la transacción completa. El llamador puede
 * fijar otro nivel explícito en `opcionesPrisma` (se respeta).
 *
 * CONTRATO del callback `fn`:
 *   · SOLO trabajo de base de datos con `tx` (sin archivos, red, correo
 *     u otros efectos externos: se re-ejecutarían).
 *   · Sin capturar errores de contención dentro: que burbujen hasta aquí.
 *
 * `opcionesPrisma` se pasa a `db.$transaction` (p. ej. el
 * `timeout: 120_000` de la restauración del módulo Respaldo), con el
 * nivel de aislamiento rellenado si el llamador no lo fijó.
 */
export async function transaccion<T>(
  fn: (tx: PrismaTx) => Promise<T>,
  opcionesPrisma?: OpcionesTransaccion,
  reintentos?: OpcionesReintentos,
): Promise<T> {
  const opciones = opcionesPrisma ?? {};
  const efectivas: OpcionesTransaccion = opciones.isolationLevel
    ? opciones
    : { ...opciones, isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
  return conReintentos(
    () => db.$transaction(fn, efectivas),
    reintentos,
  );
}
