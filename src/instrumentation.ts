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
 * INSTRUMENTATION — Validación de configuración crítica al ARRANQUE.
 *
 * Next.js ejecuta register() una sola vez cuando el servidor levanta
 * (dev, producción y standalone). Es el punto donde se rechaza una
 * configuración inválida ANTES de que el proceso atienda peticiones:
 *
 * · PRODUCCIÓN: AUTH_SECRET ausente/vacío/corto/known → el proceso MUERE
 *   con código ≠ 0 (docker/systemd lo reportan como arranque fallido).
 *   Nunca se imprime el valor del secreto, solo la causa y la corrección.
 *
 * · DESARROLLO: solo se avisa (el módulo de seguridad genera un secreto
 *   efímero aleatorio, nunca un valor conocido).
 *
 * · BASE DE DATOS (remediación Fase 2): tras validar el secreto se
 *   endurece la conexión SQLite (WAL + busy_timeout + pool de 1)
 *   mediante prepararConexionBD(). Si la base no está disponible, el
 *   arranque FALLA aquí (fail-fast): mejor un contenedor reiniciando
 *   que un sistema "vivo" que rompe cada petición con 500. Para
 *   motores no SQLite es un no-op (código agnóstico al motor).
 *
 * Ver también: src/modulos/autenticacion/servicios/seguridad.ts
 * (validación perezosa como defensa en profundidad) y src/lib/db.ts
 * (toda la especificidad de motor vive allí).
 */
export async function register(): Promise<void> {
  const { validarAuthSecret, esProduccion, mensajeErrorAuthSecret } = await import(
    "@/modulos/autenticacion/servicios/seguridad"
  );

  const validacion = validarAuthSecret(process.env.AUTH_SECRET);

  if (validacion.valido) {
    if (esProduccion() && process.env.COOKIE_INSEGURA_HTTP === "1") {
      console.warn(
        "[seguridad] COOKIE_INSEGURA_HTTP=1 en producción: la cookie de sesión viajará por HTTP claro. " +
          "Úsalo solo en redes internas de confianza sin TLS.",
      );
    }
  } else if (esProduccion()) {
    // Arranque de producción con secreto inválido: DETENER el proceso.
    // console.error (no incluye el valor del secreto).
    console.error(mensajeErrorAuthSecret(validacion.razon as string));
    throw new Error("Configuración de seguridad inválida: AUTH_SECRET no es apto para producción.");
  } else {
    console.warn(
      `[seguridad] ${validacion.razon}. Modo desarrollo: se continuará con un secreto efímero aleatorio.`,
    );
  }

  // FASE 2 — Endurecimiento de conexión a la base de datos ANTES de
  // atender la primera petición (idempotente; no-op si no es SQLite).
  const { prepararConexionBD } = await import("@/lib/db");
  const info = await prepararConexionBD();
  if (info.motor === "sqlite") {
    console.log(
      `[bd] SQLite endurecida: journal_mode=${info.modoJournal}, ` +
        `busy_timeout=${info.busyTimeoutMs}ms, pool=1 conexión`,
    );
  }
}
