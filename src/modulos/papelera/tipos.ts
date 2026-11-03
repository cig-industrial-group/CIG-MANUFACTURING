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
