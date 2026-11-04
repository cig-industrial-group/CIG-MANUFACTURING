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
 * Ver también: src/modulos/autenticacion/servicios/seguridad.ts
 * (validación perezosa como defensa en profundidad).
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
    return;
  }

  if (esProduccion()) {
    // Arranque de producción con secreto inválido: DETENER el proceso.
    // console.error (no incluye el valor del secreto).
    console.error(mensajeErrorAuthSecret(validacion.razon as string));
    throw new Error("Configuración de seguridad inválida: AUTH_SECRET no es apto para producción.");
  }

  console.warn(
    `[seguridad] ${validacion.razon}. Modo desarrollo: se continuará con un secreto efímero aleatorio.`,
  );
}
