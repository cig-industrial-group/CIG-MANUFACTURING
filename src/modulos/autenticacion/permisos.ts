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
 * MÓDULO: AUTENTICACIÓN — Catálogo de permisos
 * Los roles agrupan permisos; la UI y las APIs los validan contra esta lista.
 */

export const PERMISOS = [
  "almacen.ver",
  "almacen.gestionar",
  "movimientos.crear",
  "movimientos.corregir",
  "inventario.ajustar",
  // ===== Unidades de medida =====
  // Catálogo de unidades y equivalencias de paquete (cuántas piezas
  // lleva cada caja o paquete) para contar en unitarias y paquetes.
  "unidades.gestionar",
  "catalogo.ver",
  "catalogo.gestionar",
  "clientes.ver",
  "clientes.gestionar",
  // ===== OQC (Calidad de Salida) =====
  // Módulo operativo: liberaciones de material a clientes (descuentan
  // stock de almacén), registro de scrap y rechazos, y corrección de los
  // registros de salida (partida individual o salida completa) con
  // bitácora inmutable.
  "oqc.ver",
  "oqc.liberar",
  "oqc.gestionar",
  "usuarios.gestionar",
  "ajustes.gestionar",
  // ===== Respaldo (administración) =====
  // Respaldo completo y restauración EN CALIENTE de la base de datos
  // con rollback transaccional y ventana de reversión de 24 h.
  "respaldo.gestionar",
  "papelera.ver",
  "papelera.gestionar",
] as const;

export type Permiso = (typeof PERMISOS)[number];

/** Agrupación de permisos para la matriz de edición de roles */
export const PERMISOS_AGRUPADOS: Array<{
  grupoEs: string;
  grupoEn: string;
  permisos: Array<{ clave: Permiso; es: string; en: string }>;
}> = [
  {
    grupoEs: "Almacén",
    grupoEn: "Warehouse",
    permisos: [
      { clave: "almacen.ver", es: "Consultar almacén e inventario", en: "View warehouse and inventory" },
      { clave: "almacen.gestionar", es: "Gestionar catálogos (almacenes y productos)", en: "Manage catalogs (warehouses and products)" },
      { clave: "unidades.gestionar", es: "Gestionar unidades de medida y equivalencias de paquete", en: "Manage units of measure and package equivalences" },
      { clave: "movimientos.crear", es: "Registrar movimientos (entradas, salidas, traslados)", en: "Register movements (inbound, outbound, transfers)" },
      { clave: "movimientos.corregir", es: "Corregir o eliminar registros de movimientos", en: "Correct or delete movement records" },
      { clave: "inventario.ajustar", es: "Ajustar inventario", en: "Adjust inventory" },
    ],
  },
  {
    grupoEs: "Catálogo",
    grupoEn: "Catalog",
    permisos: [
      { clave: "catalogo.ver", es: "Consultar catálogo de modelos y números de parte", en: "View catalog of models and part numbers" },
      { clave: "catalogo.gestionar", es: "Gestionar catálogo (modelos, números de parte y asociaciones)", en: "Manage catalog (models, part numbers and associations)" },
    ],
  },
  {
    grupoEs: "Clientes",
    grupoEn: "Customers",
    permisos: [
      { clave: "clientes.ver", es: "Consultar el catálogo de clientes", en: "View the customer catalog" },
      { clave: "clientes.gestionar", es: "Gestionar el catálogo de clientes", en: "Manage the customer catalog" },
    ],
  },
  {
    grupoEs: "OQC (Calidad de Salida)",
    grupoEn: "OQC (Outgoing Quality)",
    permisos: [
      { clave: "oqc.ver", es: "Consultar salidas, scrap y rechazos de OQC", en: "View OQC releases, scrap and rejections" },
      { clave: "oqc.liberar", es: "Liberar material de salida a clientes (descuenta stock de almacén)", en: "Release outbound material to customers (deducts warehouse stock)" },
      { clave: "oqc.gestionar", es: "Corregir o eliminar registros de salida, gestionar scrap y rechazos", en: "Correct or delete release records, manage scrap and rejections" },
    ],
  },
  {
    grupoEs: "Administración",
    grupoEn: "Administration",
    permisos: [
      { clave: "usuarios.gestionar", es: "Gestionar usuarios y roles", en: "Manage users and roles" },
      { clave: "ajustes.gestionar", es: "Gestionar ajustes del sistema", en: "Manage system settings" },
      { clave: "respaldo.gestionar", es: "Respaldar, restaurar y revertir la base de datos", en: "Back up, restore and roll back the database" },
      { clave: "papelera.ver", es: "Consultar la papelera y la bitácora de eliminaciones", en: "View the recycle bin and deletion log" },
      { clave: "papelera.gestionar", es: "Restaurar o purgar definitivamente registros de la papelera", en: "Restore or permanently purge records from the recycle bin" },
    ],
  },
];

/** Verifica si una lista de permisos incluye el permiso solicitado */
export function tienePermiso(permisos: string[] | undefined, permiso: string): boolean {
  return Boolean(permisos?.includes(permiso));
}
