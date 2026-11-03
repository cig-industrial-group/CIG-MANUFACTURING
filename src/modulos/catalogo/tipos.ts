/**
 * MÓDULO: CATÁLOGO — Tipos del dominio
 * Modelos de equipo/producto y números de parte con asociación N:M.
 */

/** Resumen de un número de parte (para listas embebidas) */
export interface ParteResumen {
  id: string;
  numero: string;
  nombre: string;
}

/** Resumen de un modelo (para listas embebidas) */
export interface ModeloResumen {
  id: string;
  codigo: string;
  nombre: string;
}

/** Modelo completo con sus números de parte asociados */
export interface Modelo {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  createdAt: string;
  partes: ParteResumen[];
}

/** Número de parte completo con sus modelos asociados */
export interface NumeroParte {
  id: string;
  numero: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  createdAt: string;
  modelos: ModeloResumen[];
}

/** Cuerpo para crear/editar un modelo (partesIds sincroniza la asociación N:M) */
export interface CuerpoModelo {
  codigo: string;
  nombre: string;
  descripcion: string;
  /** IDs de números de parte a asociar (reemplaza las asociaciones actuales) */
  partesIds?: string[];
}

/** Cuerpo para crear/editar un número de parte (modelosIds sincroniza la asociación N:M) */
export interface CuerpoParte {
  numero: string;
  nombre: string;
  descripcion: string;
  /** IDs de modelos a asociar (reemplaza las asociaciones actuales) */
  modelosIds?: string[];
}
