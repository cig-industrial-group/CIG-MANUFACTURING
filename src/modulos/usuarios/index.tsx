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
 * MÓDULO: USUARIOS Y ROLES
 * Punto de entrada. Renderiza la sección activa del módulo del sistema.
 */
import { GestionUsuarios } from "./componentes/GestionUsuarios";
import { GestionRoles } from "./componentes/GestionRoles";

export function ModuloUsuarios({ seccionId }: { seccionId: string }) {
  switch (seccionId) {
    case "roles":
      return <GestionRoles />;
    case "usuarios":
    default:
      return <GestionUsuarios />;
  }
}
