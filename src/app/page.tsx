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
 * PÁGINA RAÍZ — Server Component frontera de la versión (TASK-STR-003).
 *
 * La versión del sistema vive únicamente en package.json (única fuente de
 * verdad, ver @/lib/version). Los componentes de cliente NO la importan
 * (evita empaquetar package.json en el navegador): este Server Component
 * la lee del módulo centralizado y la inyecta al shell cliente como prop,
 * que la distribuye a la pantalla de acceso y a los pies de página.
 */
import { ETIQUETA_VERSION_SISTEMA } from "@/lib/version";
import { SistemaGestionFabrica } from "@/modulos/nucleo";

export default function Home() {
  return <SistemaGestionFabrica versionDelSistema={ETIQUETA_VERSION_SISTEMA} />;
}
