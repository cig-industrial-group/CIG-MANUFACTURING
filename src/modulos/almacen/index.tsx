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
 * MÓDULO: ALMACÉN
 * Punto de entrada del módulo. Define sus secciones y las renderiza
 * según la sección activa del sistema.
 */
import {
  LayoutDashboard,
  Warehouse,
  Package,
  Boxes,
  PackagePlus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Repeat,
  History,
  QrCode,
} from "lucide-react";
import type { DefinicionSeccion } from "@/modulos/nucleo/registro";
import { PanelGeneral } from "./componentes/PanelGeneral";
import { GestionAlmacenes } from "./componentes/GestionAlmacenes";
import { GestionProductos } from "./componentes/GestionProductos";
import { GestionUnidades } from "@/modulos/unidades/componentes/GestionUnidades";
import {
  EntradaProductos,
  RecepcionMateriaPrima,
  SalidaMateriales,
  Traslados,
} from "./componentes/operaciones";
import { Inventario } from "./componentes/Inventario";
import { HistorialMovimientos } from "./componentes/HistorialMovimientos";
import { GeneracionQr } from "./componentes/GeneracionQr";

/** Secciones del módulo almacén (el orden define la navegación) */
export const SECCIONES_ALMACEN: DefinicionSeccion[] = [
  {
    id: "panel",
    claveEtiqueta: "nav.panelGeneral",
    claveDescripcion: "nav.descripcionPanel",
    claveGrupo: "nav.general",
    icono: LayoutDashboard,
  },
  {
    id: "almacenes",
    claveEtiqueta: "nav.almacenes",
    claveDescripcion: "nav.descripcionAlmacenes",
    claveGrupo: "nav.catalogos",
    icono: Warehouse,
  },
  {
    id: "productos",
    claveEtiqueta: "nav.productos",
    claveDescripcion: "nav.descripcionProductos",
    claveGrupo: "nav.catalogos",
    icono: Package,
  },
  {
    id: "unidades",
    claveEtiqueta: "nav.unidades",
    claveDescripcion: "nav.descripcionUnidades",
    claveGrupo: "nav.catalogos",
    icono: Boxes,
    permiso: "unidades.gestionar",
  },
  {
    id: "entradas",
    claveEtiqueta: "nav.entradas",
    claveDescripcion: "nav.descripcionEntradas",
    claveGrupo: "nav.operaciones",
    icono: PackagePlus,
  },
  {
    id: "recepcion",
    claveEtiqueta: "nav.recepcionMp",
    claveDescripcion: "nav.descripcionRecepcionMp",
    claveGrupo: "nav.operaciones",
    icono: ArrowDownToLine,
  },
  {
    id: "salidas",
    claveEtiqueta: "nav.salidas",
    claveDescripcion: "nav.descripcionSalidas",
    claveGrupo: "nav.operaciones",
    icono: ArrowUpFromLine,
  },
  {
    id: "traslados",
    claveEtiqueta: "nav.traslados",
    claveDescripcion: "nav.descripcionTraslados",
    claveGrupo: "nav.operaciones",
    icono: Repeat,
  },
  {
    id: "inventario",
    claveEtiqueta: "nav.inventario",
    claveDescripcion: "nav.descripcionInventario",
    claveGrupo: "nav.control",
    icono: Boxes,
  },
  {
    id: "historial",
    claveEtiqueta: "nav.historial",
    claveDescripcion: "nav.descripcionHistorial",
    claveGrupo: "nav.control",
    icono: History,
  },
  {
    id: "qr",
    claveEtiqueta: "nav.qr",
    claveDescripcion: "nav.descripcionQr",
    claveGrupo: "nav.herramientas",
    icono: QrCode,
  },
];

/** Renderiza la sección activa del módulo almacén */
export function ModuloAlmacen({ seccionId }: { seccionId: string }) {
  switch (seccionId) {
    case "almacenes":
      return <GestionAlmacenes />;
    case "productos":
      return <GestionProductos />;
    case "unidades":
      return <GestionUnidades />;
    case "entradas":
      return <EntradaProductos />;
    case "recepcion":
      return <RecepcionMateriaPrima />;
    case "salidas":
      return <SalidaMateriales />;
    case "traslados":
      return <Traslados />;
    case "inventario":
      return <Inventario />;
    case "historial":
      return <HistorialMovimientos />;
    case "qr":
      return <GeneracionQr />;
    case "panel":
    default:
      return <PanelGeneral />;
  }
}
