/**
 * TIPOS DEL MÓDULO CLIENTES
 * Contratos de datos compartidos entre el frontend y las APIs.
 * Este módulo solo gestiona el catálogo de clientes (CRUD).
 */

export interface Cliente {
  id: string;
  codigo: string;
  nombre: string;
  contacto: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  createdAt: string;
}

export interface CuerpoCliente {
  codigo: string;
  nombre: string;
  contacto?: string;
  correo?: string;
  telefono?: string;
  direccion?: string;
  notas?: string;
}
