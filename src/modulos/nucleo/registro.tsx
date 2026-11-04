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
 * REGISTRO DE MÓDULOS DEL SISTEMA
 * Para agregar un módulo nuevo en el futuro:
 *   1. Crea su carpeta en src/modulos/<nombre>/
 *   2. Regístralo aquí (disponible: true)
 * El shell del sistema lo detecta automáticamente.
 *
 * Cada módulo y sección puede declarar el permiso requerido;
 * la navegación filtra lo que el rol del usuario no permite.
 */
import { create } from "zustand";
import {
  Warehouse,
  Factory,
  ShoppingCart,
  ShieldCheck,
  LayoutDashboard,
  BookOpen,
  Building2,
  Package,
  Boxes,
  PackagePlus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Repeat,
  History,
  QrCode,
  Settings2,
  Trash2,
  Users,
  KeyRound,
  DatabaseBackup,
  type LucideIcon,
} from "lucide-react";

export interface DefinicionSeccion {
  id: string;
  claveEtiqueta: string;
  claveDescripcion: string;
  claveGrupo: string;
  icono: LucideIcon;
  /** Permiso requerido para ver la sección (opcional) */
  permiso?: string;
}

export interface DefinicionModulo {
  id: string;
  nombre: { es: string; en: string };
  descripcion: { es: string; en: string };
  icono: LucideIcon;
  disponible: boolean;
  /** Permiso requerido para ver el módulo (opcional) */
  permiso?: string;
  secciones: DefinicionSeccion[];
}

// Las secciones se importan de cada módulo
import { SECCIONES_ALMACEN, ModuloAlmacen } from "@/modulos/almacen";
import { SECCIONES_CATALOGO, ModuloCatalogo } from "@/modulos/catalogo";
import { SECCIONES_CLIENTES, ModuloClientes } from "@/modulos/clientes";
import { SECCIONES_OQC, ModuloOQC } from "@/modulos/oqc";
import { ModuloUsuarios } from "@/modulos/usuarios";
import { ModuloAjustes } from "@/modulos/ajustes";
import { ModuloPapelera } from "@/modulos/papelera";
import { ModuloRespaldo } from "@/modulos/respaldo";

/** Enrutador de secciones del módulo Sistema */
function ModuloSistema({ seccionId }: { seccionId: string }) {
  if (seccionId === "ajustes") return <ModuloAjustes />;
  if (seccionId === "papelera") return <ModuloPapelera />;
  if (seccionId === "respaldo") return <ModuloRespaldo />;
  return <ModuloUsuarios seccionId={seccionId} />;
}

export const MODULOS: Array<
  DefinicionModulo & {
    componente?: React.ComponentType<{ seccionId: string }>;
  }
> = [
  {
    id: "almacen",
    nombre: { es: "Almacén", en: "Warehouse" },
    descripcion: {
      es: "Control y gestión de almacenes, inventario y movimientos",
      en: "Warehouse control and management, inventory and movements",
    },
    icono: Warehouse,
    disponible: true,
    permiso: "almacen.ver",
    secciones: SECCIONES_ALMACEN,
    componente: ModuloAlmacen,
  },
  {
    id: "catalogo",
    nombre: { es: "Catálogo", en: "Catalog" },
    descripcion: {
      es: "Modelos de equipo y números de parte asociados",
      en: "Equipment models and associated part numbers",
    },
    icono: BookOpen,
    disponible: true,
    permiso: "catalogo.ver",
    secciones: SECCIONES_CATALOGO,
    componente: ModuloCatalogo,
  },
  {
    id: "clientes",
    nombre: { es: "Clientes", en: "Customers" },
    descripcion: {
      es: "Catálogo de clientes de la empresa",
      en: "Company customer catalog",
    },
    icono: Building2,
    disponible: true,
    permiso: "clientes.ver",
    secciones: SECCIONES_CLIENTES,
    componente: ModuloClientes,
  },
  {
    id: "oqc",
    nombre: { es: "OQC", en: "OQC" },
    descripcion: {
      es: "Calidad de salida: liberaciones a clientes, scrap y rechazos",
      en: "Outgoing quality: customer releases, scrap and rejections",
    },
    icono: ShieldCheck,
    disponible: true,
    permiso: "oqc.ver",
    secciones: SECCIONES_OQC,
    componente: ModuloOQC,
  },
  {
    id: "sistema",
    nombre: { es: "Sistema", en: "System" },
    descripcion: {
      es: "Usuarios, roles, permisos y ajustes de la plataforma",
      en: "Users, roles, permissions and platform settings",
    },
    icono: Settings2,
    disponible: true,
    secciones: [
      {
        id: "usuarios",
        claveEtiqueta: "nav.usuarios",
        claveDescripcion: "nav.descripcionUsuarios",
        claveGrupo: "nav.administracion",
        icono: Users,
        permiso: "usuarios.gestionar",
      },
      {
        id: "roles",
        claveEtiqueta: "nav.roles",
        claveDescripcion: "nav.descripcionRoles",
        claveGrupo: "nav.administracion",
        icono: KeyRound,
        permiso: "usuarios.gestionar",
      },
      {
        id: "papelera",
        claveEtiqueta: "nav.papelera",
        claveDescripcion: "nav.descripcionPapelera",
        claveGrupo: "nav.administracion",
        icono: Trash2,
        permiso: "papelera.ver",
      },
      {
        id: "ajustes",
        claveEtiqueta: "nav.ajustes",
        claveDescripcion: "nav.descripcionAjustes",
        claveGrupo: "nav.administracion",
        icono: Settings2,
        permiso: "ajustes.gestionar",
      },
      {
        id: "respaldo",
        claveEtiqueta: "nav.respaldo",
        claveDescripcion: "nav.descripcionRespaldo",
        claveGrupo: "nav.administracion",
        icono: DatabaseBackup,
        permiso: "respaldo.gestionar",
      },
    ],
    componente: ModuloSistema,
  },
  {
    id: "produccion",
    nombre: { es: "Producción", en: "Production" },
    descripcion: {
      es: "Órdenes de producción, planeación y eficiencia de líneas",
      en: "Production orders, planning and line efficiency",
    },
    icono: Factory,
    disponible: false,
    secciones: [],
  },
  {
    id: "compras",
    nombre: { es: "Compras", en: "Purchasing" },
    descripcion: {
      es: "Proveedores, requisiciones y órdenes de compra",
      en: "Suppliers, requisitions and purchase orders",
    },
    icono: ShoppingCart,
    disponible: false,
    secciones: [],
  },
  {
    id: "calidad",
    nombre: { es: "Calidad", en: "Quality" },
    descripcion: {
      es: "Inspecciones, no conformidades y trazabilidad",
      en: "Inspections, non-conformities and traceability",
    },
    icono: ShieldCheck,
    disponible: false,
    secciones: [],
  },
];

// ============================================================
// ALMACÉN DE MÓDULO ACTIVO (Zustand)
// ============================================================
const CLAVE_MODULO = "cig-manufacturing.modulo";

interface EstadoModulo {
  moduloId: string;
  cambiarModulo: (id: string) => void;
}

export const useModuloStore = create<EstadoModulo>((set) => ({
  moduloId: "almacen",
  cambiarModulo: (id: string) => {
    set({ moduloId: id });
    try {
      window.localStorage.setItem(CLAVE_MODULO, id);
    } catch {
      /* almacenamiento no disponible */
    }
  },
}));

/** Restaura el módulo persistido (al montar la aplicación) */
export function restaurarModulo() {
  try {
    const guardado = window.localStorage.getItem(CLAVE_MODULO);
    if (guardado && MODULOS.some((m) => m.id === guardado && m.disponible)) {
      useModuloStore.setState({ moduloId: guardado });
    }
  } catch {
    /* almacenamiento no disponible */
  }
}

// ============================================================
// FILTRADO POR PERMISOS
// ============================================================

/** Secciones de un módulo visibles para los permisos dados */
export function seccionesPermitidas(
  modulo: (typeof MODULOS)[number],
  permisos: string[],
): DefinicionSeccion[] {
  if (modulo.permiso && !permisos.includes(modulo.permiso)) return [];
  return modulo.secciones.filter((s) => !s.permiso || permisos.includes(s.permiso));
}

/** Módulos visibles (disponibles y con al menos una sección permitida) */
export function modulosPermitidos(permisos: string[]) {
  return MODULOS.filter((m) => {
    if (!m.disponible) return false;
    if (!m.permiso && m.secciones.length === 0) return false;
    if (m.permiso && !permisos.includes(m.permiso)) return false;
    return m.secciones.length === 0 || seccionesPermitidas(m, permisos).length > 0;
  });
}
