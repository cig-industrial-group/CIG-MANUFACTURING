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
 * MÓDULO: OQC (CALIDAD DE SALIDA)
 * Punto de entrada del módulo. Define sus secciones y las renderiza
 * según la sección activa del sistema.
 *
 *   · Liberar: liberación de material a clientes agrupada bajo un folio
 *     de salida único (descuenta stock del almacén de origen).
 *   · Salidas: historial de salidas agrupadas, donde el inspector puede
 *     corregir o eliminar una partida individual o la salida completa
 *     (con reversión de stock y bitácora inmutable).
 *   · Scrap: registro de material desechado (descuenta stock).
 *   · Rechazos: material no conforme detectado en inspección (documental).
 *
 * Por ahora liberan material los departamentos de Almacén y OQC
 * (permiso «oqc.liberar»); el mapa de roles es extensible desde
 * Sistema → Roles y Permisos.
 */
import { CircleX, History, PackageCheck, TriangleAlert } from "lucide-react";
import type { DefinicionSeccion } from "@/modulos/nucleo/registro";
import { GestionRechazos } from "./componentes/GestionRechazos";
import { GestionScrap } from "./componentes/GestionScrap";
import { HistorialSalidas } from "./componentes/HistorialSalidas";
import { LiberarSalidas } from "./componentes/LiberarSalidas";

/** Secciones del módulo OQC (el orden define la navegación) */
export const SECCIONES_OQC: DefinicionSeccion[] = [
  {
    id: "liberar",
    claveEtiqueta: "nav.oqcLiberar",
    claveDescripcion: "nav.descripcionOqcLiberar",
    claveGrupo: "nav.operaciones",
    icono: PackageCheck,
    permiso: "oqc.liberar",
  },
  {
    id: "salidas",
    claveEtiqueta: "nav.oqcSalidas",
    claveDescripcion: "nav.descripcionOqcSalidas",
    claveGrupo: "nav.operaciones",
    icono: History,
    permiso: "oqc.ver",
  },
  {
    id: "scrap",
    claveEtiqueta: "nav.oqcScrap",
    claveDescripcion: "nav.descripcionOqcScrap",
    claveGrupo: "nav.calidad",
    icono: TriangleAlert,
    permiso: "oqc.ver",
  },
  {
    id: "rechazos",
    claveEtiqueta: "nav.oqcRechazos",
    claveDescripcion: "nav.descripcionOqcRechazos",
    claveGrupo: "nav.calidad",
    icono: CircleX,
    permiso: "oqc.ver",
  },
];

/** Renderiza la sección activa del módulo OQC */
export function ModuloOQC({ seccionId }: { seccionId: string }) {
  switch (seccionId) {
    case "liberar":
      return <LiberarSalidas />;
    case "salidas":
      return <HistorialSalidas />;
    case "scrap":
      return <GestionScrap />;
    case "rechazos":
      return <GestionRechazos />;
    default:
      return <HistorialSalidas />;
  }
}
