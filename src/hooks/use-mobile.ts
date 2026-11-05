/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import * as React from "react"

const MOBILE_BREAKPOINT = 768
const CONSULTA_MOVIL = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Suscripción al almacén externo (el media query): registra el
 * notificador y devuelve la función de baja.
 */
function suscribir(notificar: () => void) {
  const mql = window.matchMedia(CONSULTA_MOVIL)
  mql.addEventListener("change", notificar)
  return () => mql.removeEventListener("change", notificar)
}

export function useIsMobile() {
  // useSyncExternalStore (patrón recomendado por React para estado que
  // vive fuera del componente): el valor se lee durante el render en vez
  // de replicarse con setState dentro de un efecto
  // (regla react-hooks/set-state-in-effect, promovida a error por
  // eslint-config-next 16.4.5). El snapshot del servidor (false) mantiene
  // la hidratación segura y coincide con el comportamiento previo en SSR.
  return React.useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA_MOVIL).matches,
    () => false
  )
}
