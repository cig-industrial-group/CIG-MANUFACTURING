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
 *
 * Esquema de claves (TASK-STR-006 — cierre del hallazgo H3):
 *  · La clave PRINCIPAL de bloqueo es SIEMPRE POR CUENTA
 *    (login:cta:{correo}, conf:cta:{correo}, rec:cta:{correo}), SIN
 *    componente de IP: rotar la cabecera X-Forwarded-For (o cambiar de
 *    red) NO evade el límite de una cuenta objetivo.
 *  · La clave login:ip:{ip} sobrevive SOLO como límite secundario de
 *    volumen (varias cuentas desde una misma IP), nunca como candado de
 *    una cuenta concreta.
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
  /** Login por CUENTA (clave login:cta:{correo}, sin IP): 5 fallos en
   *  15 min → bloqueo 15 min. Clave principal del hallazgo H3. */
  login: { maxFallos: 5, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 },
  /** Login por IP (clave login:ip:{ip}): límite SECUNDARIO de volumen
   *  contra rociado de credenciales sobre varias cuentas desde una misma
   *  IP: 20 fallos/15 min → bloqueo 15 min. */
  loginIp: { maxFallos: 20, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 },
  /**
   * Solicitud de código de recuperación: 3 por CUENTA (correo) en 15 min.
   * La clave es rec:cta:{correo} (ver claveRecuperacion): sin componente
   * de IP — la rotación de X-Forwarded-For no evade el límite
   * (TASK-STR-004, cierre del hallazgo H1).
   */
  recuperacion: { maxFallos: 3, ventanaMs: 15 * 60 * 1000, bloqueoMs: 15 * 60 * 1000 },
  /** Confirmación de código: 5 intentos fallidos por CUENTA (clave
   *  conf:cta:{correo}, sin IP — TASK-STR-006). */
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
 * Clave PRINCIPAL de bloqueo de login (TASK-STR-006 — cierre del hallazgo
 * H3): EXCLUSIVAMENTE por cuenta, login:cta:{correo}, SIN componente de
 * IP. Con el esquema anterior (login:cta:{ip}:{correo}) un atacante evadía
 * el bloqueo rotando la cabecera X-Forwarded-For y podía sondear una misma
 * cuenta sin restricción efectiva. El correo debe llegar ya normalizado
 * en minúsculas (el endpoint lo hace antes de consultar).
 *
 * Contrapartida asumida (igual que en claveRecuperacion): un tercero puede
 * bloquear con 5 intentos el acceso de una cuenta ajena durante el
 * enfriamiento (15 min). Se prefiere este riesgo — acotado y temporal —
 * frente a la evasión del límite por rotación de IP.
 */
export function claveLoginCuenta(correo: string): string {
  return `login:cta:${correo}`;
}

/**
 * Clave SECUNDARIA de volumen de login (TASK-STR-006 — H3): por IP,
 * login:ip:{ip}. NO protege cuentas concretas (la cabecera es suplantable
 * si se confía en un proxy mal configurado); solo acota el rociado de
 * credenciales sobre MUCHAS cuentas desde una MISMA IP. La IP proviene de
 * ipPeticion(), que es fail-closed (ver su documentación).
 */
export function claveLoginIp(ip: string): string {
  return `login:ip:${ip}`;
}

/**
 * Clave de límite de la CONFIRMACIÓN del código de recuperación
 * (TASK-STR-006 — misma lógica que TASK-STR-004 aplicó a la solicitud):
 * EXCLUSIVAMENTE por cuenta, conf:cta:{correo}, SIN componente de IP.
 * Con el esquema anterior (conf:{correo}:{ip}) la rotación de
 * X-Forwarded-For permitía sondear códigos de 6 dígitos sin límite
 * efectivo sobre una misma cuenta. El correo debe llegar ya normalizado
 * en minúsculas (el endpoint lo hace antes de consultar).
 */
export function claveConfirmacion(correo: string): string {
  return `conf:cta:${correo}`;
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
 * IP de origen de la petición — FAIL-CLOSED (TASK-STR-006, hallazgo H3).
 *
 * Devuelve "local" SALVO que PROXY_DE_CONFIANZA=1. La cabecera
 * X-Forwarded-For es un DATO CONTROLADO POR EL CLIENTE: cualquiera puede
 * enviarla con el valor que quiera. La versión anterior la leía sin
 * condición, así que un atacante podía (a) fabricar IPs inexistentes para
 * evadir los límites por IP y (b) colapsar el mapa de limitación con
 * miles de claves basura. Ahora solo se honra cuando el OPERADOR declara
 * explícitamente que la app vive tras el proxy inverso oficial (Caddy),
 * que SOBRESCRIBE X-Forwarded-For con la IP real del cliente y por tanto
 * la cabecera que llega ya no es controlable desde el navegador.
 *
 *  · PROXY_DE_CONFIANZA !== "1" (por defecto): la cabecera se IGNORA y
 *    toda petición cuenta como "local". Coste asumido: detrás de un
 *    proxy sin configurar la variable, el límite secundario por IP
 *    (login:ip:local) agrupa a todos los clientes — el bloqueo por
 *    CUENTA (clave principal) sigue siendo correcto. Es un requisito
 *    operativo documentado en README-DEPLOY.md y .env.example.
 *  · PROXY_DE_CONFIANZA === "1": primera posición de X-Forwarded-For
 *    (la que fija Caddy); sin cabecera, "local".
 *
 * Solo se usa como clave de limitación; nunca para auditoría forense.
 */
export function ipPeticion(request: Request): string {
  if (process.env.PROXY_DE_CONFIANZA !== "1") return "local";
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
