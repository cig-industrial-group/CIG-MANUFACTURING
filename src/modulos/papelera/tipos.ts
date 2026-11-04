/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

/** Tipos del módulo Papelera (cliente) */

export interface EntradaPapelera {
  id: string;
  entidad: "PRODUCTO" | "ALMACEN" | "MODELO" | "NUMERO_PARTE" | "USUARIO" | "CLIENTE" | string;
  entidadId: string;
  identificador: string;
  nombre: string;
  estado: "EN_PAPELERA" | "RESTAURADO" | "PURGADO" | string;
  usuarioNombre: string | null;
  eliminadoEn: string;
  expiraEn: string;
  diasRestantes: number;
  restauradoEn: string | null;
  purgadoEn: string | null;
  purgadoPor: string | null;
}

export type VistaPapelera = "activa" | "bitacora";
