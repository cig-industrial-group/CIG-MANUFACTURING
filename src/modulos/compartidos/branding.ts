/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

"use client";

/**
 * COMPARTIDOS — Versión de branding (invalidación de caché del navegador)
 *
 * /api/branding/{logo,favicon} se sirve con Cache-Control: public,
 * max-age=3600 (1 hora). Para que un cambio de identidad visual se vea
 * de inmediato —sin esperar a que expire la caché— toda la interfaz usa
 * la URL con un parámetro de versión:
 *
 *   /api/branding/logo?v=<marca de tiempo>
 *
 * Tras cada subida/eliminación, la sección «Identidad Visual» publica la
 * nueva versión aquí (localStorage + evento). Los componentes que muestran
 * el logo (Marca del sidebar, encabezado móvil, pantalla de carga, pantalla
 * de acceso) la leen con useVersionBranding() y refrescan al instante,
 * también en otras pestañas abiertas (evento «storage»).
 */
import { useSyncExternalStore } from "react";

const CLAVE_VERSION_BRANDING = "cig-manufacturing.branding.v";
const EVENTO_BRANDING = "cig-branding-actualizado";

/** Publica una nueva versión de branding (tras subir o restaurar) */
export function notificarBrandingActualizado(): void {
  const version = String(Date.now());
  try {
    window.localStorage.setItem(CLAVE_VERSION_BRANDING, version);
  } catch {
    /* almacenamiento no disponible: solo avisa a esta pestaña */
  }
  window.dispatchEvent(new CustomEvent(EVENTO_BRANDING, { detail: version }));
}

/** Versión actual (cadena vacía si nunca se ha personalizado) */
function leerVersion(): string {
  try {
    return window.localStorage.getItem(CLAVE_VERSION_BRANDING) ?? "";
  } catch {
    return "";
  }
}

/** Suscripción a cambios: evento local (misma pestaña) y «storage» (otras) */
function suscribirVersion(alCambiar: () => void): () => void {
  window.addEventListener(EVENTO_BRANDING, alCambiar);
  window.addEventListener("storage", alCambiar);
  return () => {
    window.removeEventListener(EVENTO_BRANDING, alCambiar);
    window.removeEventListener("storage", alCambiar);
  };
}

/** Instantánea del servidor (SSR): sin personalización conocida */
function versionServidor(): string {
  return "";
}

/**
 * Hook reactivo a la versión de branding: cambia cuando se sube/restaura
 * el logo o el favicon (en esta pestaña o en cualquier otra abierta).
 * localStorage + eventos son un almacén externo: useSyncExternalStore
 * lo integra sin estados duplicados ni desincronización de hidratación.
 */
export function useVersionBranding(): string {
  return useSyncExternalStore(suscribirVersion, leerVersion, versionServidor);
}

/** URL del logo vigente, lista para <img src> (con invalidación de caché) */
export function urlLogo(version: string): string {
  return `/api/branding/logo${version ? `?v=${version}` : ""}`;
}

/** URL del favicon vigente (con invalidación de caché) */
export function urlFavicon(version: string): string {
  return `/api/branding/favicon${version ? `?v=${version}` : ""}`;
}
