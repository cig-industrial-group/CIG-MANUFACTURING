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
