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
 * SERVICIO HTTP DEL MÓDULO ALMACÉN (cliente)
 * Centraliza todas las peticiones al backend y traduce errores.
 */
import type {
  Almacen,
  CuerpoAlmacen,
  CuerpoEdicionMovimiento,
  CuerpoMovimiento,
  CuerpoProducto,
  DetalleMovimiento,
  Estadisticas,
  FilaStock,
  MovimientoResumen,
  Producto,
  RespuestaMovimientos,
} from "../tipos";

export class ErrorApi extends Error {
  codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.codigo = codigo;
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!resp.ok) {
    let codigo = "ERROR_INTERNO";
    try {
      const cuerpo = await resp.json();
      if (cuerpo?.error) codigo = cuerpo.error;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ErrorApi(codigo);
  }
  return resp.json() as Promise<T>;
}

// ===== Almacenes =====
export const listarAlmacenes = (incluirInactivos = false) =>
  pedir<Almacen[]>(`/api/almacen/almacenes?incluirInactivos=${incluirInactivos}`);
export const crearAlmacen = (cuerpo: CuerpoAlmacen) =>
  pedir<Almacen>("/api/almacen/almacenes", { method: "POST", body: JSON.stringify(cuerpo) });
export const actualizarAlmacen = (id: string, cuerpo: Partial<CuerpoAlmacen> & { activo?: boolean }) =>
  pedir<Almacen>(`/api/almacen/almacenes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(cuerpo),
  });
/** Eliminación real (borrado permanente); para desactivar usar actualizarAlmacen({ activo: false }) */
export const eliminarAlmacen = (id: string) =>
  pedir<{ ok: boolean }>(`/api/almacen/almacenes/${id}`, { method: "DELETE" });

// ===== Productos =====
export const listarProductos = (incluirInactivos = false) =>
  pedir<Producto[]>(`/api/almacen/productos?incluirInactivos=${incluirInactivos}`);
export const crearProducto = (cuerpo: CuerpoProducto) =>
  pedir<Producto>("/api/almacen/productos", { method: "POST", body: JSON.stringify(cuerpo) });
export const actualizarProducto = (id: string, cuerpo: Partial<CuerpoProducto> & { activo?: boolean }) =>
  pedir<Producto>(`/api/almacen/productos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(cuerpo),
  });
/** Eliminación real (borrado permanente); para desactivar usar actualizarProducto({ activo: false }) */
export const eliminarProducto = (id: string) =>
  pedir<{ ok: boolean }>(`/api/almacen/productos/${id}`, { method: "DELETE" });

// ===== Movimientos =====
export interface FiltrosMovimientos {
  tipo?: string;
  almacenId?: string;
  productoId?: string;
  clienteId?: string;
  q?: string;
  desde?: string;
  hasta?: string;
  pagina?: number;
  porPagina?: number;
}

export const listarMovimientos = (filtros: FiltrosMovimientos = {}) => {
  const params = new URLSearchParams();
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  if (filtros.almacenId) params.set("almacenId", filtros.almacenId);
  if (filtros.productoId) params.set("productoId", filtros.productoId);
  if (filtros.clienteId) params.set("clienteId", filtros.clienteId);
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  if (filtros.pagina) params.set("pagina", String(filtros.pagina));
  if (filtros.porPagina) params.set("porPagina", String(filtros.porPagina));
  return pedir<RespuestaMovimientos>(`/api/almacen/movimientos?${params.toString()}`);
};

export const crearMovimiento = (cuerpo: CuerpoMovimiento) =>
  pedir<MovimientoResumen>("/api/almacen/movimientos", {
    method: "POST",
    body: JSON.stringify(cuerpo),
  });

/** Detalle de un registro + su bitácora de correcciones */
export const obtenerDetalleMovimiento = (id: string) =>
  pedir<DetalleMovimiento>(`/api/almacen/movimientos/${id}`);

/** Corrige un registro: el stock se recalcula y la acción queda en la bitácora */
export const actualizarMovimiento = (id: string, cuerpo: CuerpoEdicionMovimiento) =>
  pedir<MovimientoResumen>(`/api/almacen/movimientos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(cuerpo),
  });

/** Elimina un registro (requiere motivo) y restaura el stock */
export const eliminarMovimiento = (id: string, motivoCorreccion: string) =>
  pedir<{ ok: boolean; folio: string }>(`/api/almacen/movimientos/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ motivoCorreccion }),
  });

// ===== Inventario =====
export interface FiltrosInventario {
  almacenId?: string;
  productoId?: string;
  q?: string;
  conStock?: boolean;
}

export const listarInventario = (filtros: FiltrosInventario = {}) => {
  const params = new URLSearchParams();
  if (filtros.almacenId) params.set("almacenId", filtros.almacenId);
  if (filtros.productoId) params.set("productoId", filtros.productoId);
  if (filtros.q) params.set("q", filtros.q);
  if (filtros.conStock === false) params.set("conStock", "false");
  return pedir<FilaStock[]>(`/api/almacen/inventario?${params.toString()}`);
};

// ===== Estadísticas =====
export const obtenerEstadisticas = () => pedir<Estadisticas>("/api/almacen/estadisticas");
