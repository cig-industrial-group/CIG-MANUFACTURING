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
 * · BASE DE DATOS (PostgreSQL): tras validar el secreto se verifica la
 *   conectividad con un SELECT 1 (verificarConexionBD, en src/lib/db.ts).
 *   Si la base no está disponible, el arranque FALLA aquí (fail-fast):
 *   mejor un contenedor reiniciando que un sistema "vivo" que rompe
 *   cada petición con 500.
 *
 * Ver también: src/modulos/autenticacion/servicios/seguridad.ts
 * (validación perezosa como defensa en profundidad) y src/lib/db.ts
 * (cliente Prisma y verificación de conexión).
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

  // Conectividad a PostgreSQL ANTES de atender la primera petición
  // (idempotente; SELECT 1 parametrizado, sin secretos en el mensaje).
  const { verificarConexionBD } = await import("@/lib/db");
  try {
    await verificarConexionBD();
    console.log("[bd] PostgreSQL operativo (pool administrado nativamente por Prisma)");
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    console.error(
      `[bd] PostgreSQL no está disponible al arranque: ${mensaje
        .replace(/\b(?:postgresql|postgres):\/\/[^\s'"]+/gi, "[URL-REDACTADA]")
        .replace(/\s+/g, " ")
        .slice(0, 200)}`,
    );
    throw new Error("Base de datos inalcanzable al arranque (fail-fast).");
  }
}
