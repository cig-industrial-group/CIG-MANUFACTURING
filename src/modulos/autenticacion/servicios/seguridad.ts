/**
 * MÓDULO: AUTENTICACIÓN — Validación de secretos de firmado
 *
 * Política de AUTH_SECRET (secreto HS256 con el que se firman las sesiones):
 *
 * · PRODUCCIÓN (NODE_ENV=production): OBLIGATORIO y válido. Si falta, está
 *   vacío, es demasiado corto o coincide con un valor publicado en el
 *   repositorio (fallbacks históricos, ejemplos de documentación, secretos
 *   de pruebas), el arranque SE DETIENE con un error explícito. Una
 *   instalación de producción jamás debe poder ejecutarse con una clave
 *   conocida, vacía o ausente.
 *
 * · DESARROLLO (NODE_ENV≠production): si no hay secreto válido se genera uno
 *   EFÍMERO aleatorio por proceso (las sesiones se pierden al reiniciar,
 *   que es el comportamiento esperable en desarrollo). Nunca se usa un
 *   valor conocido. Si se proporciona uno inválido, se avisa y también se
 *   genera uno efímero.
 *
 * El contenido del secreto NUNCA se incluye en mensajes de error ni logs:
 * los mensajes describen el problema y cómo corregirlo, no el valor.
 */

/** Longitud mínima: 32 bytes ≈ 256 bits de entropía para HS256. */
export const AUTH_SECRET_MIN_CARACTERES = 32;
/** Longitud máxima razonable (evita configuraciones absurdas). */
export const AUTH_SECRET_MAX_CARACTERES = 512;

/**
 * Valores cuya presencia en el repositorio los hace inutilizables como
 * secretos: fallbacks históricos del código, ejemplos de plantillas y
 * secretos de entornos de prueba (deben generarse aleatorios también allí,
 * pero se bloquean por si alguien los copia a producción).
 */
const SECRETOS_PROHIBIDOS = new Set([
  // Fallback históricos del código fuente (ya eliminados)
  "cig-manufacturing-secreto-desarrollo-2024-cambiar-en-produccion",
  "fabriflow-secreto-desarrollo-2024-cambiar-en-produccion",
  // Plantillas y documentación
  "cambia-esta-clave-por-una-aleatoria-de-64-caracteres",
  "cambia-esta-clave-con-openssl-rand-hex-32",
  "pega-aqui-tu-clave-aleatoria",
  // Secretos de pruebas históricos
  "ci-clave-efimera-solo-pruebas",
  "clave-local-solo-pruebas",
]);

export interface ResultadoValidacion {
  valido: boolean;
  /** Motivo técnico (sin revelar el valor). null cuando es válido. */
  razon: string | null;
}

/** Valida un valor candidato como AUTH_SECRET de producción. */
export function validarAuthSecret(valor: string | undefined | null): ResultadoValidacion {
  if (valor === undefined || valor === null) {
    return { valido: false, razon: "AUTH_SECRET no está definido" };
  }
  const limpio = valor.trim();
  if (limpio.length === 0) {
    return { valido: false, razon: "AUTH_SECRET está vacío" };
  }
  if (limpio.length !== valor.length || /\s/.test(valor)) {
    return { valido: false, razon: "AUTH_SECRET no debe contener espacios al inicio, al final ni en medio" };
  }
  if (valor.length < AUTH_SECRET_MIN_CARACTERES) {
    return {
      valido: false,
      razon: `AUTH_SECRET es demasiado corto (${valor.length} caracteres; mínimo ${AUTH_SECRET_MIN_CARACTERES} ≈ 256 bits)`,
    };
  }
  if (valor.length > AUTH_SECRET_MAX_CARACTERES) {
    return { valido: false, razon: `AUTH_SECRET excede ${AUTH_SECRET_MAX_CARACTERES} caracteres` };
  }
  if (SECRETOS_PROHIBIDOS.has(valor)) {
    return { valido: false, razon: "AUTH_SECRET coincide con un valor publicado (plantilla/ejemplo/prueba) y no puede usarse" };
  }
  return { valido: true, razon: null };
}

/** true cuando el proceso corre en modo producción. */
export function esProduccion(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Mensaje de error estándar (sin el valor del secreto) con instrucciones.
 * Se usa desde instrumentation.ts, auth.ts y los scripts de arranque.
 */
export function mensajeErrorAuthSecret(razon: string): string {
  return [
    `✖ Configuración de seguridad inválida: ${razon}.`,
    "  La aplicación NO puede iniciar en producción sin un secreto de firmado válido.",
    "  Genera uno aleatorio con:  openssl rand -hex 32",
    "  y defínelo en la variable de entorno AUTH_SECRET (o en .env / el orquestador).",
  ].join("\n");
}

/**
 * Resuelve el secreto de firmado según el entorno.
 *
 * · Producción: exige AUTH_SECRET válido o lanza Error (detiene el arranque).
 * · Desarrollo: usa AUTH_SECRET si es válido; si no, genera uno efímero
 *   aleatorio y avisa por consola (nunca un valor conocido).
 */
export function obtenerSecretoFirmado(): Uint8Array {
  const valor = process.env.AUTH_SECRET;
  const validacion = validarAuthSecret(valor);

  if (validacion.valido) {
    return new TextEncoder().encode(valor as string);
  }

  if (esProduccion()) {
    // Sin fallback: la configuración inválida detiene el proceso.
    throw new Error(mensajeErrorAuthSecret(validacion.razon as string));
  }

  // Desarrollo: secreto efímero aleatorio (sesiones no sobreviven reinicios).
  // Web Crypto: funciona en cualquier runtime (Node/Bun/edge) sin
  // dependencias de módulos de Node.
  console.warn(
    `[seguridad] ${validacion.razon}. Modo desarrollo: se usará un secreto EFÍMERO aleatorio ` +
      "(las sesiones se perderán al reiniciar). Define AUTH_SECRET para sesiones estables.",
  );
  const efimero = new Uint8Array(48);
  crypto.getRandomValues(efimero);
  return efimero;
}
