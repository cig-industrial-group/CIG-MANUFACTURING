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
 * MÓDULO: CATÁLOGO
 * Punto de entrada del módulo. Define sus secciones y las renderiza
 * según la sección activa del sistema.
 */
import { Boxes, Hash } from "lucide-react";
import type { DefinicionSeccion } from "@/modulos/nucleo/registro";
import { GestionModelos } from "./componentes/GestionModelos";
import { GestionPartes } from "./componentes/GestionPartes";

/** Secciones del módulo catálogo (el orden define la navegación) */
export const SECCIONES_CATALOGO: DefinicionSeccion[] = [
  {
    id: "modelos",
    claveEtiqueta: "nav.modelos",
    claveDescripcion: "nav.descripcionModelos",
    claveGrupo: "nav.catalogos",
    icono: Boxes,
  },
  {
    id: "partes",
    claveEtiqueta: "nav.numerosParte",
    claveDescripcion: "nav.descripcionNumerosParte",
    claveGrupo: "nav.catalogos",
    icono: Hash,
  },
];

/** Renderiza la sección activa del módulo catálogo */
export function ModuloCatalogo({ seccionId }: { seccionId: string }) {
  switch (seccionId) {
    case "partes":
      return <GestionPartes />;
    case "modelos":
    default:
      return <GestionModelos />;
  }
}
