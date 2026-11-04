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
 * LÓGICA DE SERVIDOR DEL MÓDULO ALMACÉN
 * Folios, validaciones, registro transaccional de movimientos y
 * correcciones (editar / eliminar) con reversión de stock y bitácora
 * inmutable de correcciones. Usado por las rutas API (app/api/almacen/*).
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolverConteoTx } from "@/modulos/unidades/servicios/nucleo";
import { parsearConteo, type ParteConteo } from "@/modulos/unidades/tipos";
import type { TipoMovimiento } from "../tipos";

const PREFIJOS: Record<TipoMovimiento, string> = {
  ENTRADA: "ENT",
  RECEPCION: "REC",
  SALIDA: "SAL",
  TRASLADO: "TRA",
  AJUSTE: "AJU",
  SCRAP: "SCR",
};

/** Fecha compacta AAAAMMDD usada por todas las series de folios */
export function fechaCompacta() {
  const hoy = new Date();
  return (
    hoy.getFullYear() +
    String(hoy.getMonth() + 1).padStart(2, "0") +
    String(hoy.getDate()).padStart(2, "0")
  );
}

/** Extrae el número de un folio dado su prefijo completo ("SAL-20261103-0004" → 4) */
function numeroDeFolio(folio: string, prefijo: string): number {
  return Number(folio.slice(prefijo.length)) || 0;
}

/**
 * Reserva el siguiente número de una serie de folios (clave = prefijo-fecha,
 * p.ej. "SAL-20261103"). Serie monotónica: `SecuenciaFolio` es la única
 * autoridad y su contador JAMÁS retrocede, así que eliminar el registro que
 * portaba un folio NO libera su número (trazabilidad de planta: un folio
 * emitido identifica un único registro durante toda la historia del sistema).
 *
 * Si la serie aún no existe (primera emisión del día), se siembra con
 * `semilla()`: el mayor número ya emitido históricamente según los registros
 * vivos y la bitácora. Así las bases de datos existentes conservan su
 * histórico sin reutilizar folios de registros eliminados.
 */
export async function reservarNumeroSerie(
  tx: PrismaTx,
  clave: string,
  semilla: () => Promise<number>,
): Promise<number> {
  // Camino rápido: la serie ya existe → incremento atómico
  const serie = await tx.secuenciaFolio.findUnique({ where: { clave } });
  if (serie) {
    const fila = await tx.secuenciaFolio.update({
      where: { clave },
      data: { ultimo: { increment: 1 } },
    });
    return fila.ultimo;
  }

  // Serie nueva: sembrar con el máximo histórico ya emitido
  const base = await semilla();
  try {
    const fila = await tx.secuenciaFolio.create({ data: { clave, ultimo: base + 1 } });
    return fila.ultimo;
  } catch (e) {
    // Carrera: otra transacción sembró la serie primero → incrementar sobre ella
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const fila = await tx.secuenciaFolio.update({
        where: { clave },
        data: { ultimo: { increment: 1 } },
      });
      return fila.ultimo;
    }
    throw e;
  }
}

/** Genera un folio único secuencial por tipo y fecha: ENT-20261101-0007.
 *  La numeración es monotónica por serie (prefijo+fecha) y NO se reutiliza
 *  aunque se eliminen movimientos. `tx` permite reservar dentro de la
 *  transacción activa: una liberación con varias partidas crea varios
 *  movimientos seguidos y cada uno ve los números ya reservados. */
export async function generarFolio(tipo: TipoMovimiento, tx: PrismaTx = db): Promise<string> {
  const serie = `${PREFIJOS[tipo]}-${fechaCompacta()}`;
  const prefijo = `${serie}-`;
  const numero = await reservarNumeroSerie(tx, serie, async () => {
    const vivos = await tx.movimiento.findMany({
      where: { folio: { startsWith: prefijo } },
      select: { folio: true },
    });
    const archivados = await tx.correccionMovimiento.findMany({
      where: { folio: { startsWith: prefijo } },
      select: { folio: true },
    });
    return Math.max(
      0,
      ...vivos.map((m) => numeroDeFolio(m.folio, prefijo)),
      ...archivados.map((c) => numeroDeFolio(c.folio, prefijo)),
    );
  });
  return `${serie}-${String(numero).padStart(4, "0")}`;
}

export class ErrorNegocio extends Error {
  codigoHTTP: number;
  constructor(mensaje: string, codigoHTTP = 400) {
    super(mensaje);
    this.codigoHTTP = codigoHTTP;
  }
}

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type AlmacenTx = NonNullable<Awaited<ReturnType<PrismaTx["almacen"]["findUnique"]>>>;

/** Tolerancia para comparaciones de punto flotante en cantidades */
const EPSILON = 1e-9;

/** Relaciones eliminadas: el movimiento es un registro autodescriptivo
 *  (ledger); los datos de producto/almacén/usuario viven en snapshots. */

/** Filas de movimiento tal como salen de la base (autodescriptivas) */
export type FilaMovimiento = {
  id: string;
  folio: string;
  tipo: string;
  cantidad: number;
  cantidadDespues: number | null;
  motivo: string | null;
  referencia: string | null;
  responsable: string | null;
  editado: boolean;
  createdAt: Date;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  productoUnidad: string;
  almacenOrigenId: string | null;
  almacenOrigenCodigo: string | null;
  almacenOrigenNombre: string | null;
  almacenDestinoId: string | null;
  almacenDestinoCodigo: string | null;
  almacenDestinoNombre: string | null;
  clienteId: string | null;
  clienteCodigo: string | null;
  clienteNombre: string | null;
  salidaId: string | null;
  salidaFolio: string | null;
  conteoDetalle: string | null;
};

/** Consulta los ids de producto que siguen vivos (para el distintivo «eliminado») */
export async function productosVivos(ids: string[]): Promise<Set<string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Set();
  const vivos = await db.producto.findMany({ where: { id: { in: unicos } }, select: { id: true } });
  return new Set(vivos.map((v) => v.id));
}

/** Proyección estándar de un movimiento (compartida por todas las rutas) */
export function mapearMovimiento(m: FilaMovimiento, productoExiste = true, clienteExiste = true) {
  return {
    id: m.id,
    folio: m.folio,
    tipo: m.tipo,
    cantidad: m.cantidad,
    cantidadDespues: m.cantidadDespues,
    motivo: m.motivo,
    referencia: m.referencia,
    responsable: m.responsable,
    editado: m.editado,
    createdAt: m.createdAt.toISOString(),
    productoId: m.productoId,
    productoSku: m.productoSku,
    productoNombre: m.productoNombre,
    productoUnidad: m.productoUnidad,
    productoExiste,
    almacenOrigenId: m.almacenOrigenId,
    almacenOrigenCodigo: m.almacenOrigenCodigo,
    almacenOrigenNombre: m.almacenOrigenNombre,
    almacenDestinoId: m.almacenDestinoId,
    almacenDestinoCodigo: m.almacenDestinoCodigo,
    almacenDestinoNombre: m.almacenDestinoNombre,
    clienteId: m.clienteId,
    clienteCodigo: m.clienteCodigo,
    clienteNombre: m.clienteNombre,
    clienteExiste,
    salidaId: m.salidaId,
    salidaFolio: m.salidaFolio,
    /** Cómo se contó (partes de paquetes + sueltas); null = captura directa */
    conteo: parsearConteo(m.conteoDetalle),
  };
}

// ============================================================
// EFECTOS SOBRE EL STOCK
// ============================================================

/**
 * Aplica el efecto de un movimiento sobre los stocks (transaccional):
 * valida reglas de negocio y devuelve los almacenes involucrados junto
 * con el snapshot de stock resultante. Es la única fuente de verdad
 * para ENTRADA / RECEPCION / SALIDA / TRASLADO / AJUSTE.
 */
async function aplicarEfectoStockTx(
  tx: PrismaTx,
  cuerpo: {
    tipo: TipoMovimiento;
    productoId: string;
    almacenOrigenId?: string;
    almacenDestinoId?: string;
    cantidad: number;
  },
) {
  const { tipo, productoId, cantidad } = cuerpo;

  if (!Number.isFinite(cantidad) || Math.abs(cantidad) < EPSILON) {
    throw new ErrorNegocio("QUANTIDAD_INVALIDA");
  }
  if (tipo !== "AJUSTE" && cantidad < 0) {
    throw new ErrorNegocio("QUANTIDAD_INVALIDA");
  }

  const producto = await tx.producto.findUnique({ where: { id: productoId } });
  if (!producto) throw new ErrorNegocio("PRODUCTO_NO_EXISTE", 404);

  let almacenOrigen: AlmacenTx | null = null;
  let almacenDestino: AlmacenTx | null = null;
  let cantidadDespues: number | null = null;

  if (tipo === "ENTRADA" || tipo === "RECEPCION") {
    if (!cuerpo.almacenDestinoId) throw new ErrorNegocio("ALMACEN_DESTINO_REQUERIDO");
    almacenDestino = await tx.almacen.findUnique({ where: { id: cuerpo.almacenDestinoId } });
    if (!almacenDestino || !almacenDestino.activo) throw new ErrorNegocio("ALMACEN_INVALIDO");
    const stock = await tx.stock.upsert({
      where: { productoId_almacenId: { productoId, almacenId: almacenDestino.id } },
      create: { productoId, almacenId: almacenDestino.id, cantidad: Math.abs(cantidad) },
      update: { cantidad: { increment: Math.abs(cantidad) } },
    });
    cantidadDespues = stock.cantidad;
  } else if (tipo === "SALIDA" || tipo === "SCRAP") {
    // La salida y el scrap retiran material del almacén de origen
    if (!cuerpo.almacenOrigenId) throw new ErrorNegocio("ALMACEN_ORIGEN_REQUERIDO");
    almacenOrigen = await tx.almacen.findUnique({ where: { id: cuerpo.almacenOrigenId } });
    if (!almacenOrigen || !almacenOrigen.activo) throw new ErrorNegocio("ALMACEN_INVALIDO");
    const stock = await tx.stock.findUnique({
      where: { productoId_almacenId: { productoId, almacenId: almacenOrigen.id } },
    });
    const disponible = stock?.cantidad ?? 0;
    const retiro = Math.abs(cantidad);
    if (disponible + EPSILON < retiro) throw new ErrorNegocio("STOCK_INSUFICIENTE");
    await tx.stock.update({ where: { id: stock!.id }, data: { cantidad: disponible - retiro } });
    cantidadDespues = disponible - retiro;
  } else if (tipo === "TRASLADO") {
    if (!cuerpo.almacenOrigenId || !cuerpo.almacenDestinoId) {
      throw new ErrorNegocio("TRASLADO_REQUIERE_AMBOS");
    }
    if (cuerpo.almacenOrigenId === cuerpo.almacenDestinoId) {
      throw new ErrorNegocio("ALMACENES_IGUALES");
    }
    almacenOrigen = await tx.almacen.findUnique({ where: { id: cuerpo.almacenOrigenId } });
    almacenDestino = await tx.almacen.findUnique({ where: { id: cuerpo.almacenDestinoId } });
    if (!almacenOrigen?.activo || !almacenDestino?.activo) throw new ErrorNegocio("ALMACEN_INVALIDO");
    const cantidadMov = Math.abs(cantidad);

    const stockOrigen = await tx.stock.findUnique({
      where: { productoId_almacenId: { productoId, almacenId: almacenOrigen.id } },
    });
    const disponible = stockOrigen?.cantidad ?? 0;
    if (disponible + EPSILON < cantidadMov) throw new ErrorNegocio("STOCK_INSUFICIENTE");
    if (stockOrigen) {
      await tx.stock.update({
        where: { id: stockOrigen.id },
        data: { cantidad: disponible - cantidadMov },
      });
    }
    const stockDestino = await tx.stock.upsert({
      where: { productoId_almacenId: { productoId, almacenId: almacenDestino.id } },
      create: { productoId, almacenId: almacenDestino.id, cantidad: cantidadMov },
      update: { cantidad: { increment: cantidadMov } },
    });
    cantidadDespues = stockDestino.cantidad;
  } else if (tipo === "AJUSTE") {
    if (!cuerpo.almacenDestinoId) throw new ErrorNegocio("ALMACEN_DESTINO_REQUERIDO");
    almacenDestino = await tx.almacen.findUnique({ where: { id: cuerpo.almacenDestinoId } });
    if (!almacenDestino?.activo) throw new ErrorNegocio("ALMACEN_INVALIDO");
    const stock = await tx.stock.upsert({
      where: { productoId_almacenId: { productoId, almacenId: almacenDestino.id } },
      create: { productoId, almacenId: almacenDestino.id, cantidad: 0 },
      update: {},
    });
    const nuevo = stock.cantidad + cantidad; // cantidad firmada
    if (nuevo < -EPSILON) throw new ErrorNegocio("AJUSTE_NEGATIVO");
    await tx.stock.update({ where: { id: stock.id }, data: { cantidad: nuevo } });
    cantidadDespues = nuevo;
  } else {
    throw new ErrorNegocio("TIPO_INVALIDO");
  }

  return { almacenOrigen, almacenDestino, cantidadDespues };
}

/**
 * Revierte el efecto de un movimiento sobre los stocks (operación inversa).
 * Si la reversión dejaría el stock en negativo (el material ya fue consumido
 * o trasladado por movimientos posteriores) lanza REVERSION_NEGATIVA.
 */
async function revertirEfectoStockTx(
  tx: PrismaTx,
  mov: {
    tipo: string;
    productoId: string;
    almacenOrigenId: string | null;
    almacenDestinoId: string | null;
    cantidad: number;
  },
) {
  /** Suma `delta` al stock (producto, almacén); `exigir` prohíbe negativos */
  const compensar = async (
    productoId: string,
    almacenId: string | null,
    delta: number,
    exigirNoNegativo: boolean,
  ) => {
    if (!almacenId) return;
    const stock = await tx.stock.findUnique({
      where: { productoId_almacenId: { productoId, almacenId } },
    });
    const actual = stock?.cantidad ?? 0;
    const nuevo = actual + delta;
    if (exigirNoNegativo && nuevo < -EPSILON) {
      throw new ErrorNegocio("REVERSION_NEGATIVA");
    }
    const final = nuevo < EPSILON && nuevo > -EPSILON ? 0 : nuevo;
    if (stock) {
      await tx.stock.update({ where: { id: stock.id }, data: { cantidad: Math.max(0, final) } });
    } else {
      await tx.stock.create({ data: { productoId, almacenId, cantidad: Math.max(0, final) } });
    }
  };

  if (mov.tipo === "ENTRADA" || mov.tipo === "RECEPCION") {
    // Se había sumado al destino: se resta sin permitir negativos
    await compensar(mov.productoId, mov.almacenDestinoId, -Math.abs(mov.cantidad), true);
  } else if (mov.tipo === "SALIDA" || mov.tipo === "SCRAP") {
    // Se había restado del origen: se devuelve
    await compensar(mov.productoId, mov.almacenOrigenId, Math.abs(mov.cantidad), false);
  } else if (mov.tipo === "TRASLADO") {
    // Se restó del origen y sumó al destino: se invierte en ambos
    await compensar(mov.productoId, mov.almacenDestinoId, -Math.abs(mov.cantidad), true);
    await compensar(mov.productoId, mov.almacenOrigenId, Math.abs(mov.cantidad), false);
  } else if (mov.tipo === "AJUSTE") {
    // Ajuste firmado: se resta la cantidad ajustada sin permitir negativos
    await compensar(mov.productoId, mov.almacenDestinoId, -mov.cantidad, true);
  } else {
    throw new ErrorNegocio("TIPO_INVALIDO");
  }
}

// ============================================================
// SNAPSHOTS PARA LA BITÁCORA DE CORRECCIONES
// ============================================================

function snapshotMovimiento(m: {
  folio: string;
  tipo: string;
  cantidad: number;
  cantidadDespues: number | null;
  motivo: string | null;
  referencia: string | null;
  responsable: string | null;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  almacenOrigenCodigo: string | null;
  almacenDestinoCodigo: string | null;
  salidaFolio?: string | null;
  conteoDetalle?: string | null;
}) {
  return {
    folio: m.folio,
    tipo: m.tipo,
    cantidad: m.cantidad,
    cantidadDespues: m.cantidadDespues,
    motivo: m.motivo,
    referencia: m.referencia,
    responsable: m.responsable,
    productoId: m.productoId,
    producto: `${m.productoSku} — ${m.productoNombre}`,
    almacenOrigen: m.almacenOrigenCodigo,
    almacenDestino: m.almacenDestinoCodigo,
    salidaFolio: m.salidaFolio ?? null,
    conteo: parsearConteo(m.conteoDetalle),
  };
}

/** Los movimientos de entidades eliminadas (en papelera o purgadas) son
 *  historia congelada: no se pueden corregir ni eliminar hasta restaurar
 *  la entidad desde la papelera. Protege la integridad del stock vivo. */
async function exigirEntidadesVivasTx(
  tx: PrismaTx,
  mov: { productoId: string; almacenOrigenId: string | null; almacenDestinoId: string | null },
) {
  const producto = await tx.producto.findUnique({ where: { id: mov.productoId } });
  if (!producto) throw new ErrorNegocio("REGISTRO_HISTORICO", 409);
  for (const aid of [mov.almacenOrigenId, mov.almacenDestinoId]) {
    if (!aid) continue;
    const almacen = await tx.almacen.findUnique({ where: { id: aid } });
    if (!almacen) throw new ErrorNegocio("REGISTRO_HISTORICO", 409);
  }
}

// ============================================================
// OPERACIONES DE MOVIMIENTOS
// ============================================================

/**
 * Aplica un movimiento de inventario de forma transaccional:
 * valida reglas de negocio, actualiza stocks y registra la bitácora.
 *
 * Conteo en paquetes: si `cuerpo.conteo` trae una unidad de paquete
 * (CJA, PAQ...), la cantidad se calcula AQUÍ —de forma autoritativa—
 * en la unidad base del producto (paquetes × factor + sueltas) y el
 * detalle de la captura viaja como snapshot en `conteoDetalle`.
 * En los ajustes el signo de `cuerpo.cantidad` define la dirección.
 */
export async function registrarMovimientoTx(
  tx: PrismaTx,
  cuerpo: {
    tipo: TipoMovimiento;
    productoId: string;
    almacenOrigenId?: string;
    almacenDestinoId?: string;
    cantidad: number;
    motivo?: string;
    referencia?: string;
    responsable?: string;
    usuarioId?: string;
    usuarioNombre?: string;
    /** Salida a cliente: referencia suave + snapshots (ledger inmutable) */
    clienteId?: string;
    clienteCodigo?: string;
    clienteNombre?: string;
    /** Agrupador de salida OQC: liga la partida a su salida única */
    salidaId?: string;
    salidaFolio?: string;
    /** Conteo en paquetes: { unidad: "CJA", paquetes: 2, sueltas: 3 } */
    conteo?: { unidad: string; paquetes?: number; sueltas?: number };
    /** Conteo ya resuelto y fusionado (multi-línea OQC): total + partes */
    conteoResuelto?: { cantidad: number; partes: ParteConteo[] };
  },
) {
  // El producto se lee ANTES del efecto: la unidad de conteo se valida
  // contra el empaque configurado del producto.
  const producto = await tx.producto.findUnique({ where: { id: cuerpo.productoId } });
  if (!producto) throw new ErrorNegocio("PRODUCTO_NO_EXISTE", 404);

  // Resolución del conteo (única fuente de verdad de la conversión):
  // conteoResuelto llega pre-calculado (fusión de varias líneas) o se
  // resuelve la captura simple contra el EMPAQUE CONFIGURADO DEL PRODUCTO
  // (la cantidad que lleva cada paquete varía por producto).
  const conteo =
    cuerpo.conteoResuelto ?? (await resolverConteoTx(tx, producto, cuerpo.conteo));
  let cantidad = cuerpo.cantidad;
  let conteoDetalle: string | null = null;
  if (conteo) {
    cantidad =
      cuerpo.tipo === "AJUSTE" ? Math.sign(cuerpo.cantidad || 1) * conteo.cantidad : conteo.cantidad;
    conteoDetalle = JSON.stringify(conteo.partes);
  }

  const { almacenOrigen, almacenDestino, cantidadDespues } = await aplicarEfectoStockTx(tx, {
    ...cuerpo,
    cantidad,
  });

  const folio = await generarFolio(cuerpo.tipo, tx);
  const movimiento = await tx.movimiento.create({
    data: {
      folio,
      tipo: cuerpo.tipo,
      productoId: cuerpo.productoId,
      almacenOrigenId: almacenOrigen?.id ?? null,
      almacenDestinoId: almacenDestino?.id ?? null,
      // Los ajustes conservan el signo; el resto siempre es positivo
      cantidad: cuerpo.tipo === "AJUSTE" ? cantidad : Math.abs(cantidad),
      cantidadDespues,
      motivo: cuerpo.motivo?.trim() || null,
      referencia: cuerpo.referencia?.trim() || null,
      responsable: cuerpo.responsable?.trim() || null,
      usuarioId: cuerpo.usuarioId ?? null,
      usuarioNombre: cuerpo.usuarioNombre?.trim() || null,
      // Snapshots del estado vivo al momento del registro (ledger inmutable)
      productoSku: producto.sku,
      productoNombre: producto.nombre,
      productoUnidad: producto.unidad,
      almacenOrigenCodigo: almacenOrigen?.codigo ?? null,
      almacenOrigenNombre: almacenOrigen?.nombre ?? null,
      almacenDestinoCodigo: almacenDestino?.codigo ?? null,
      almacenDestinoNombre: almacenDestino?.nombre ?? null,
      // Snapshots del cliente que recibe la salida (si aplica)
      clienteId: cuerpo.clienteId ?? null,
      clienteCodigo: cuerpo.clienteCodigo?.trim() || null,
      clienteNombre: cuerpo.clienteNombre?.trim() || null,
      // Agrupador de salida OQC (si la partida pertenece a una)
      salidaId: cuerpo.salidaId ?? null,
      salidaFolio: cuerpo.salidaFolio?.trim() || null,
      // Snapshot del conteo en paquetes (captura original)
      conteoDetalle,
    },
  });

  return movimiento;
}

/**
 * Corrige un movimiento de forma transaccional:
 *   1. Revierte el efecto original sobre los stocks
 *   2. Aplica el efecto con los datos corregidos
 *   3. Actualiza el registro (folio y tipo permanecen intactos)
 *   4. Deja constancia en la bitácora de correcciones (antes/después)
 */
export async function editarMovimientoTx(
  tx: PrismaTx,
  id: string,
  cuerpo: {
    productoId: string;
    almacenOrigenId?: string;
    almacenDestinoId?: string;
    cantidad: number;
    motivo?: string;
    referencia?: string;
    responsable?: string;
  },
  meta: { motivoCorreccion: string; usuarioId: string; usuarioNombre?: string },
) {
  if (!meta.motivoCorreccion?.trim()) throw new ErrorNegocio("MOTIVO_CORRECCION_REQUERIDO");

  const actual = await tx.movimiento.findUnique({ where: { id } });
  if (!actual) throw new ErrorNegocio("MOVIMIENTO_NO_EXISTE", 404);

  // Historia congelada: entidades vivas requeridas para tocar el stock
  await exigirEntidadesVivasTx(tx, actual);

  const antes = snapshotMovimiento(actual);

  // 1. Revertir el efecto original
  await revertirEfectoStockTx(tx, actual);

  // 2. Aplicar el efecto corregido (mismo tipo de movimiento)
  const { almacenOrigen, almacenDestino, cantidadDespues } = await aplicarEfectoStockTx(tx, {
    tipo: actual.tipo as TipoMovimiento,
    productoId: cuerpo.productoId,
    almacenOrigenId: cuerpo.almacenOrigenId,
    almacenDestinoId: cuerpo.almacenDestinoId,
    cantidad: cuerpo.cantidad,
  });
  const producto = await tx.producto.findUnique({ where: { id: cuerpo.productoId } });
  if (!producto) throw new ErrorNegocio("PRODUCTO_NO_EXISTE", 404);

  // 3. Actualizar el registro (con snapshots del estado corregido).
  //    Contrato de los campos de texto opcionales (motivo / referencia /
  //    responsable): `undefined` significa «la vía de corrección no envía
  //    el campo» y se CONSERVA el valor vigente; una cadena vacía ("")
  //    significa «limpiar el campo». Así ninguna corrección parcial puede
  //    borrar por accidente la remisión (PL) o el responsable de un
  //    registro del historial.
  //    El conteo en paquetes se LIMPIA al corregir: la cantidad corregida
  //    se expresa en la unidad base y la captura original queda preservada
  //    en la bitácora (antes/después) — nunca en desacuerdo con el stock.
  const actualizado = await tx.movimiento.update({
    where: { id },
    data: {
      productoId: cuerpo.productoId,
      almacenOrigenId: almacenOrigen?.id ?? null,
      almacenDestinoId: almacenDestino?.id ?? null,
      cantidad: actual.tipo === "AJUSTE" ? cuerpo.cantidad : Math.abs(cuerpo.cantidad),
      cantidadDespues,
      motivo: cuerpo.motivo !== undefined ? cuerpo.motivo?.trim() || null : actual.motivo,
      referencia:
        cuerpo.referencia !== undefined ? cuerpo.referencia?.trim() || null : actual.referencia,
      responsable:
        cuerpo.responsable !== undefined ? cuerpo.responsable?.trim() || null : actual.responsable,
      editado: true,
      conteoDetalle: null,
      productoSku: producto.sku,
      productoNombre: producto.nombre,
      productoUnidad: producto.unidad,
      almacenOrigenCodigo: almacenOrigen?.codigo ?? null,
      almacenOrigenNombre: almacenOrigen?.nombre ?? null,
      almacenDestinoCodigo: almacenDestino?.codigo ?? null,
      almacenDestinoNombre: almacenDestino?.nombre ?? null,
    },
  });

  // 4. Bitácora de corrección (inmutable)
  await tx.correccionMovimiento.create({
    data: {
      movimientoId: actual.id,
      folio: actual.folio,
      salidaId: actual.salidaId ?? null,
      salidaFolio: actual.salidaFolio ?? null,
      accion: "EDICION",
      antes: JSON.stringify(antes),
      despues: JSON.stringify(snapshotMovimiento(actualizado)),
      motivo: meta.motivoCorreccion.trim(),
      usuarioId: meta.usuarioId,
      usuarioNombre: meta.usuarioNombre?.trim() || null,
    },
  });

  return actualizado;
}

/**
 * Elimina un movimiento de forma transaccional:
 *   1. Revierte el efecto original sobre los stocks
 *   2. Elimina el registro
 *   3. Conserva el snapshot en la bitácora de correcciones
 * Si el stock ya fue consumido por movimientos posteriores, la
 * operación se rechaza con REVERSION_NEGATIVA.
 */
export async function eliminarMovimientoTx(
  tx: PrismaTx,
  id: string,
  meta: { motivoCorreccion: string; usuarioId: string; usuarioNombre?: string },
) {
  if (!meta.motivoCorreccion?.trim()) throw new ErrorNegocio("MOTIVO_CORRECCION_REQUERIDO");

  const actual = await tx.movimiento.findUnique({ where: { id } });
  if (!actual) throw new ErrorNegocio("MOVIMIENTO_NO_EXISTE", 404);

  // Historia congelada: entidades vivas requeridas para tocar el stock
  await exigirEntidadesVivasTx(tx, actual);

  const antes = snapshotMovimiento(actual);

  // 1. Devolver el efecto al stock
  await revertirEfectoStockTx(tx, actual);

  // 2. Eliminar el registro
  await tx.movimiento.delete({ where: { id } });

  // 3. Bitácora de corrección (sin FK: sobrevive a la eliminación)
  await tx.correccionMovimiento.create({
    data: {
      movimientoId: actual.id,
      folio: actual.folio,
      salidaId: actual.salidaId ?? null,
      salidaFolio: actual.salidaFolio ?? null,
      accion: "ELIMINACION",
      antes: JSON.stringify(antes),
      despues: null,
      motivo: meta.motivoCorreccion.trim(),
      usuarioId: meta.usuarioId,
      usuarioNombre: meta.usuarioNombre?.trim() || null,
    },
  });

  return { folio: actual.folio };
}
