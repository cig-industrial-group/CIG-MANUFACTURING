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
 * MÓDULO: AUTENTICACIÓN — Límites de intentos (anti-fuerza bruta)
 *
 * Limitador en memoria por clave arbitraria (IP, cuenta de correo o
 * combinación de ambas). Pensado para el modelo de despliegue del sistema
 * (instancia única: un contenedor + base de datos local), donde no se
 * necesita estado compartido entre procesos.
 *
 * Comportamiento:
 *  · Ventana deslizante simple: N fallos dentro de la ventana → la clave
 *    queda BLOQUEADA durante un enfriamiento (responder 429 + Retry-After).
 *  · Mientras la clave está bloqueada, nuevos fallos NO extienden el
 *    bloqueo (corre su curso; evita bloqueos perpetuos por sondeo continuo).
 *  · Un intento exitoso limpia el contador de esa clave.
 *  · Limpieza perezosa de entradas viejas: el mapa no crece sin límite.
 *  · Nunca registra valores sensibles: solo la clave de limitación
 *    (IP / correo), que ya es información conocida por el cliente.
 */
interface EstadoClave {
  fallos: number;
  ventanaInicio: number;
  bloqueadoHasta: number;
}

const registro = new Map<string, EstadoClave>();
const MAX_ENTRADAS = 10_000;

function ahora(): number {
  return Date.now();
}

function purgarExpirados(): void {
  if (registro.size <= MAX_ENTRADAS) return;
  const t = ahora();
  for (const [clave, estado] of registro) {
    // Sin bloqueo activo y ventana vieja (> 24 h): fuera.
    if (estado.bloqueadoHasta <= t && estado.ventanaInicio + 24 * 60 * 60 * 1000 < t) {
      registro.delete(clave);
    }
  }
}

export interface PoliticaLimite {
  /** Fallos tolerados dentro de la ventana antes de bloquear. */
  maxFallos: number;
  /** Tamaño de la ventana en ms. */
  ventanaMs: number;
  /** Tiempo de bloqueo tras agotar los fallos (ms). */
  bloqueoMs: number;
}

/** Políticas del sistema (documento vivo: ajustar aquí). */
export const POLITICAS = {
  /** Login por IP+cuenta: 5 fallos en 15 min → bloqueo 15 min. */
  login: { maxFallos: 5, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 },
  /** Login por IP (varias cuentas): 20 fallos/15 min → bloqueo 15 min. */
  loginIp: { maxFallos: 20, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 },
  /**
   * Solicitud de código de recuperación: 3 por CUENTA (correo) en 15 min.
   * La clave es rec:cta:{correo} (ver claveRecuperacion): sin componente
   * de IP — la rotación de X-Forwarded-For no evade el límite
   * (TASK-STR-004, cierre del hallazgo H1).
   */
  recuperacion: { maxFallos: 3, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 },
  /** Confirmación de código: 5 intentos fallidos por correo+IP. */
  confirmacion: { maxFallos: 5, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 },
  /** Autoregistro: 5 cuentas por IP por hora. */
  registro: { maxFallos: 5, ventanaMs: 60 * 60 * 1000, bloqueoMs: 60 * 60 * 1000 },
} as const satisfies Record<string, PoliticaLimite>;

/**
 * Clave de limitación de las solicitudes de código de recuperación
 * (TASK-STR-004 — cierre del hallazgo H1).
 *
 * EXCLUSIVAMENTE por cuenta: rec:cta:{correo}. NO incluye la IP de la
 * petición: con el esquema anterior (rec:{correo}:{ip}) un atacante
 * evadía el límite rotando la cabecera X-Forwarded-For y podía solicitar
 * códigos sin restricción sobre una misma cuenta. El correo debe llegar
 * ya normalizado en minúsculas (el endpoint lo hace antes de consultar).
 *
 * Contrapartida asumida: un tercero puede agotar con 3 peticiones el
 * cupo de recuperación de una cuenta ajena durante el enfriamiento
 * (15 min). Se prefiere este riesgo — acotado, temporal y sin efecto
 * sobre el inicio de sesión — frente a la evasión del límite por
 * rotación de IP.
 */
export function claveRecuperacion(correo: string): string {
  return `rec:cta:${correo}`;
}

/**
 * Registra un FALLO para la clave bajo una política.
 * Devuelve true si la clave queda bloqueada por este fallo.
 */
export function registrarFallo(clave: string, politica: PoliticaLimite): boolean {
  const t = ahora();
  const estado = registro.get(clave);

  // Bloqueo activo: corre su curso, no se extiende.
  if (estado && estado.bloqueadoHasta > t) return true;

  // Ventana nueva (primera vez o vencida): reiniciar contador.
  if (!estado || t - estado.ventanaInicio >= politica.ventanaMs) {
    registro.set(clave, { fallos: 1, ventanaInicio: t, bloqueadoHasta: 0 });
    purgarExpirados();
    return false;
  }

  estado.fallos += 1;
  if (estado.fallos >= politica.maxFallos) {
    estado.bloqueadoHasta = t + politica.bloqueoMs;
    return true;
  }
  return false;
}

/** ¿La clave está bloqueada ahora mismo? */
export function estaBloqueada(clave: string): boolean {
  const estado = registro.get(clave);
  if (!estado) return false;
  return estado.bloqueadoHasta > ahora();
}

/** Milisegundos restantes de bloqueo (0 si no hay bloqueo). */
export function msRestantes(clave: string): number {
  const estado = registro.get(clave);
  if (!estado) return 0;
  const restante = estado.bloqueadoHasta - ahora();
  return restante > 0 ? restante : 0;
}

/** Limpia la clave tras un intento EXITOSO (no arrastrar fallos viejos). */
export function limpiar(clave: string): void {
  registro.delete(clave);
}

/**
 * IP de origen de la petición (mejor esfuerzo): primera posición de
 * X-Forwarded-For. Tras el proxy inverso oficial (Caddy, que SOBRESCRIBE
 * la cabecera con la IP real del cliente) es fiable; en conexión directa
 * devuelta "local". Solo se usa como clave de limitación.
 */
export function ipPeticion(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const primera = xff.split(",")[0]?.trim();
    if (primera) return primera;
  }
  return "local";
}

/** Respuesta 429 estándar con Retry-After (en segundos). */
export function respuestaLimite(msRestante: number): Response {
  return new Response(
    JSON.stringify({ error: "DEMASIADOS_INTENTOS" }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(Math.max(1, Math.ceil(msRestante / 1000))),
      },
    },
  );
}
