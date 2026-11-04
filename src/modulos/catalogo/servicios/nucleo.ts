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
 * MÓDULO: CATÁLOGO — Utilidades de servidor
 * Serialización de registros Prisma a las respuestas JSON del módulo.
 */
import type { Modelo, NumeroParte, ParteResumen, ModeloResumen } from "../tipos";

type ModeloConPartes = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  createdAt: Date;
  partes: Array<{ numeroParte: { id: string; numero: string; nombre: string } }>;
};

type ParteConModelos = {
  id: string;
  numero: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  createdAt: Date;
  modelos: Array<{ modelo: { id: string; codigo: string; nombre: string } }>;
};

/** Convierte un modelo Prisma (con partes) a la respuesta JSON */
export function aModelo(m: ModeloConPartes): Modelo {
  return {
    id: m.id,
    codigo: m.codigo,
    nombre: m.nombre,
    descripcion: m.descripcion,
    activo: m.activo,
    createdAt: m.createdAt.toISOString(),
    partes: m.partes.map((p) => p.numeroParte),
  };
}

/** Convierte un número de parte Prisma (con modelos) a la respuesta JSON */
export function aParte(p: ParteConModelos): NumeroParte {
  return {
    id: p.id,
    numero: p.numero,
    nombre: p.nombre,
    descripcion: p.descripcion,
    activo: p.activo,
    createdAt: p.createdAt.toISOString(),
    modelos: p.modelos.map((m) => m.modelo),
  };
}

export type { ParteResumen, ModeloResumen };
