/**
 * LÓGICA DE SERVIDOR DEL MÓDULO CLIENTES
 * Proyección pública del catálogo de clientes. Este módulo solo gestiona
 * clientes (CRUD); la liberación de material de salida y su historial
 * viven fuera de este módulo (por definir).
 */

// ============================================================
// PROYECCIÓN PÚBLICA
// ============================================================

/** Fila de cliente tal como sale de la base */
export type FilaCliente = {
  id: string;
  codigo: string;
  nombre: string;
  contacto: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  createdAt: Date;
};

/** Proyección pública de un cliente */
export function aCliente(c: FilaCliente) {
  return {
    id: c.id,
    codigo: c.codigo,
    nombre: c.nombre,
    contacto: c.contacto,
    correo: c.correo,
    telefono: c.telefono,
    direccion: c.direccion,
    notas: c.notas,
    activo: c.activo,
    createdAt: c.createdAt.toISOString(),
  };
}
