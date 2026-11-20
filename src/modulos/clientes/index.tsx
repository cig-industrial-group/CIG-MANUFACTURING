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
 * MÓDULO: CLIENTES
 * Punto de entrada del módulo. Define sus secciones y las renderiza
 * según la sección activa del sistema.
 *
 * Este módulo se encarga ÚNICAMENTE de la gestión (CRUD) del catálogo
 * de clientes: crear, editar, desactivar/reactivar y enviar a la
 * papelera. La liberación de material de salida y su historial viven
 * fuera de este módulo (por definir).
 */
import { Building2 } from "lucide-react";
import type { DefinicionSeccion } from "@/modulos/nucleo/registro";
import { GestionClientes } from "./componentes/GestionClientes";

/** Secciones del módulo clientes (el orden define la navegación) */
export const SECCIONES_CLIENTES: DefinicionSeccion[] = [
  {
    id: "catalogo",
    claveEtiqueta: "nav.clientes",
    claveDescripcion: "nav.descripcionClientes",
    claveGrupo: "nav.catalogos",
    icono: Building2,
    permiso: "clientes.ver",
  },
];

/** Renderiza la sección activa del módulo clientes */
export function ModuloClientes({ seccionId }: { seccionId: string }) {
  switch (seccionId) {
    case "catalogo":
    default:
      return <GestionClientes />;
  }
}
