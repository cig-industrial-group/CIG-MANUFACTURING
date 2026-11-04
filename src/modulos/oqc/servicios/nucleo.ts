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
 * LÓGICA DE SERVIDOR DEL MÓDULO OQC (CALIDAD DE SALIDA)
 *
 * · Liberaciones de material a clientes agrupadas de forma ÚNICA en una
 *   SalidaOQC (folio OQC-...) con una partida (Movimiento SALIDA) por
 *   producto, todas ligadas al mismo folio de salida.
 * · Correcciones del inspector: editar o eliminar una partida individual
 *   o la salida completa, siempre con reversión de stock y bitácora
 *   inmutable (CorreccionMovimiento), igual que el resto del sistema.
 * · Registro de scrap: descuenta stock mediante un Movimiento SCRAP y se
 *   corrige/elimina con bitácora. Registro de rechazos: documental, sin
 *   efecto sobre stock.
 */
import { db } from "@/lib/db";
import {
  ErrorNegocio,
  editarMovimientoTx,
  eliminarMovimientoTx,
  fechaCompacta,
  mapearMovimiento,
  registrarMovimientoTx,
  reservarNumeroSerie,
  type FilaMovimiento,
} from "@/modulos/almacen/servicios/nucleo";
import {
  fusionarPartesConteo,
  resolverConteoTx,
} from "@/modulos/unidades/servicios/nucleo";
import { parsearConteo, type ParteConteo } from "@/modulos/unidades/tipos";
import type {
  CuerpoEdicionPartida,
  CuerpoEdicionSalida,
  CuerpoRegistroRechazo,
  CuerpoRegistroScrap,
  DisposicionRechazo,
  LineaSalida,
  PartidaSalida,
  RegistroRechazo,
  RegistroScrap,
  SalidaOQC,
} from "../tipos";

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

const EPSILON = 1e-9;

// ============================================================
// FOLIOS
// ============================================================
// Series monotónicas vía SecuenciaFolio (única autoridad de folios del
// sistema, compartida con Almacén): el número de cada serie jamás se
// reutiliza, aunque se eliminen los registros que lo portaban.

/** Folio único para el agrupador de salida: OQC-20261103-0001 */
async function generarFolioSalida(tx: PrismaTx = db): Promise<string> {
  const serie = `OQC-${fechaCompacta()}`;
  const prefijo = `${serie}-`;
  const numero = await reservarNumeroSerie(tx, serie, async () => {
    const vivas = await tx.salidaOQC.findMany({
      where: { folio: { startsWith: prefijo } },
      select: { folio: true },
    });
    const archivadas = await tx.correccionMovimiento.findMany({
      where: { salidaFolio: { startsWith: prefijo } },
      select: { salidaFolio: true },
    });
    return Math.max(
      0,
      ...vivas.map((s) => Number(s.folio.slice(prefijo.length)) || 0),
      ...archivadas.flatMap((c) => (c.salidaFolio ? [Number(c.salidaFolio.slice(prefijo.length)) || 0] : [])),
    );
  });
  return `${serie}-${String(numero).padStart(4, "0")}`;
}

/** Folio único para los registros de rechazo: RECH-20261103-0001 */
async function generarFolioRechazo(tx: PrismaTx = db): Promise<string> {
  const serie = `RECH-${fechaCompacta()}`;
  const prefijo = `${serie}-`;
  const numero = await reservarNumeroSerie(tx, serie, async () => {
    const vivos = await tx.registroRechazo.findMany({
      where: { folio: { startsWith: prefijo } },
      select: { folio: true },
    });
    return Math.max(0, ...vivos.map((r) => Number(r.folio.slice(prefijo.length)) || 0));
  });
  return `${serie}-${String(numero).padStart(4, "0")}`;
}

// ============================================================
// PROYECCIONES PÚBLICAS
// ============================================================

/** Fila de SalidaOQC tal como sale de la base */
export type FilaSalidaOQC = {
  id: string;
  folio: string;
  clienteId: string | null;
  clienteCodigo: string | null;
  clienteNombre: string | null;
  almacenOrigenId: string | null;
  almacenOrigenCodigo: string | null;
  almacenOrigenNombre: string | null;
  referencia: string | null;
  responsable: string | null;
  notas: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  estado: string;
  eliminadaEn: Date | null;
  eliminadaPor: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Proyección de una salida con sus partidas agrupadas */
export function aSalidaOQC(
  s: FilaSalidaOQC,
  partidas: PartidaSalida[] = [],
  clienteExiste = true,
): SalidaOQC {
  return {
    id: s.id,
    folio: s.folio,
    clienteId: s.clienteId,
    clienteCodigo: s.clienteCodigo,
    clienteNombre: s.clienteNombre,
    clienteExiste,
    almacenOrigenId: s.almacenOrigenId,
    almacenOrigenCodigo: s.almacenOrigenCodigo,
    almacenOrigenNombre: s.almacenOrigenNombre,
    referencia: s.referencia,
    responsable: s.responsable,
    notas: s.notas,
    usuarioId: s.usuarioId,
    usuarioNombre: s.usuarioNombre,
    estado: s.estado === "ELIMINADA" ? "ELIMINADA" : "EMITIDA",
    eliminadaEn: s.eliminadaEn?.toISOString() ?? null,
    eliminadaPor: s.eliminadaPor,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    partidas,
    totalPartidas: partidas.length,
    totalUnidades: partidas.reduce((acc, p) => acc + Math.abs(p.cantidad), 0),
  };
}

/** Convierte filas de movimiento en partidas ligadas a su salida */
function aPartida(m: FilaMovimiento & { salidaId: string | null; salidaFolio: string | null }) {
  const base = mapearMovimiento(m);
  return { ...base, salidaId: m.salidaId, salidaFolio: m.salidaFolio } as PartidaSalida;
}

/** Proyección de un registro de scrap */
export function aRegistroScrap(r: {
  id: string;
  folio: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  productoUnidad: string;
  almacenId: string | null;
  almacenCodigo: string | null;
  almacenNombre: string | null;
  cantidad: number;
  motivo: string;
  notas: string | null;
  responsable: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  movimientoId: string | null;
  conteoDetalle: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RegistroScrap {
  return {
    ...r,
    conteo: parsearConteo(r.conteoDetalle),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** Proyección de un registro de rechazo */
export function aRegistroRechazo(r: {
  id: string;
  folio: string;
  productoId: string;
  productoSku: string;
  productoNombre: string;
  productoUnidad: string;
  clienteId: string | null;
  clienteCodigo: string | null;
  clienteNombre: string | null;
  salidaId: string | null;
  salidaFolio: string | null;
  cantidad: number;
  motivo: string;
  disposicion: string;
  notas: string | null;
  responsable: string | null;
  usuarioId: string | null;
  usuarioNombre: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RegistroRechazo {
  const disposiciones: DisposicionRechazo[] = ["PENDIENTE", "RETRABAJO", "SCRAP", "LIBERADO"];
  const disposicion = disposiciones.includes(r.disposicion as DisposicionRechazo)
    ? (r.disposicion as DisposicionRechazo)
    : "PENDIENTE";
  return {
    ...r,
    disposicion,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

// ============================================================
// LIBERACIÓN DE MATERIAL (SALIDA AGRUPADA)
// ============================================================

/**
 * Libera material de salida a un cliente (transaccional):
 *   · Crea UNA SalidaOQC con folio único que agrupa toda la operación.
 *   · Registra un movimiento SALIDA por partida, todos ligados al mismo
 *     folio de salida (referencia suave + snapshots).
 *   · Descuenta el stock del almacén de origen: si cualquier partida
 *     excede el disponible, toda la liberación se rechaza y nada cambia.
 */
export async function liberarSalidaOQC(args: {
  clienteId: string;
  almacenOrigenId: string;
  lineas: LineaSalida[];
  referencia?: string;
  responsable?: string;
  notas?: string;
  usuario: { id: string; nombre: string };
}): Promise<SalidaOQC> {
  return db.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUnique({ where: { id: args.clienteId } });
    if (!cliente) throw new ErrorNegocio("CLIENTE_NO_EXISTE", 404);
    if (!cliente.activo) throw new ErrorNegocio("CLIENTE_INACTIVO", 409);

    if (!args.almacenOrigenId) throw new ErrorNegocio("ALMACEN_ORIGEN_REQUERIDO");
    const almacen = await tx.almacen.findUnique({ where: { id: args.almacenOrigenId } });
    if (!almacen || !almacen.activo) throw new ErrorNegocio("ALMACEN_INVALIDO");

    // Fusionar partidas duplicadas y validar cantidades. Cada línea puede
    // capturarse DIRECTA (cantidad en unidad base) o EN PAQUETES (conteo);
    // el total se calcula de forma autoritativa contra el catálogo de
    // unidades y las capturas del mismo producto se agregan.
    interface Acumulado {
      cantidad: number;
      partes: ParteConteo[];
      unidadBase: string;
      nombreBase: string;
    }
    const acumulados = new Map<string, Acumulado>();
    for (const linea of args.lineas) {
      if (!linea?.productoId) throw new ErrorNegocio("QUANTIDAD_INVALIDA");
      const producto = await tx.producto.findUnique({ where: { id: linea.productoId } });
      if (!producto) throw new ErrorNegocio("PRODUCTO_NO_EXISTE", 404);

      // Conteo en paquetes (opcional por línea): valida contra el empaque
      // configurado del producto (unidadPaquete + contenidoPaquete)
      const conteo = await resolverConteoTx(tx, producto, linea.conteo);
      let cantidad = conteo ? conteo.cantidad : Math.abs(Number(linea?.cantidad));
      if (!Number.isFinite(cantidad) || cantidad <= EPSILON) {
        throw new ErrorNegocio("QUANTIDAD_INVALIDA");
      }

      const previo = acumulados.get(linea.productoId) ?? {
        cantidad: 0,
        partes: [],
        unidadBase: producto.unidad,
        nombreBase: producto.unidad,
      };
      previo.cantidad += cantidad;
      if (conteo) {
        previo.partes.push(...conteo.partes);
      } else if (previo.partes.length > 0) {
        // Línea directa mezclada con líneas en paquetes: se registra como
        // unidades sueltas de la base para que el detalle siga sumando.
        previo.partes.push({
          unidad: previo.unidadBase,
          nombre: previo.nombreBase,
          factor: 1,
          cantidad,
        });
      }
      acumulados.set(linea.productoId, previo);
    }
    if (acumulados.size === 0) throw new ErrorNegocio("SALIDA_SIN_LINEAS");

    // Agrupador único de la salida
    const folioSalida = await generarFolioSalida(tx);
    const salida = await tx.salidaOQC.create({
      data: {
        folio: folioSalida,
        clienteId: cliente.id,
        clienteCodigo: cliente.codigo,
        clienteNombre: cliente.nombre,
        almacenOrigenId: almacen.id,
        almacenOrigenCodigo: almacen.codigo,
        almacenOrigenNombre: almacen.nombre,
        referencia: args.referencia?.trim() || null,
        responsable: args.responsable?.trim() || args.usuario.nombre,
        notas: args.notas?.trim() || null,
        usuarioId: args.usuario.id,
        usuarioNombre: args.usuario.nombre,
      },
    });

    // Una partida (movimiento SALIDA) por producto, ligada al folio.
    // Las capturas en paquetes del mismo producto viajan fusionadas.
    const partidas: PartidaSalida[] = [];
    for (const [productoId, acumulado] of acumulados) {
      const fusion =
        acumulado.partes.length > 0 ? fusionarPartesConteo(acumulado.partes) : null;
      const mov = await registrarMovimientoTx(tx, {
        tipo: "SALIDA",
        productoId,
        almacenOrigenId: almacen.id,
        cantidad: fusion ? fusion.cantidad : acumulado.cantidad,
        referencia: args.referencia?.trim() || folioSalida,
        responsable: args.responsable?.trim() || args.usuario.nombre,
        usuarioId: args.usuario.id,
        usuarioNombre: args.usuario.nombre,
        clienteId: cliente.id,
        clienteCodigo: cliente.codigo,
        clienteNombre: cliente.nombre,
        salidaId: salida.id,
        salidaFolio: folioSalida,
        ...(fusion && { conteoResuelto: fusion }),
      });
      partidas.push(aPartida(mov));
    }

    return aSalidaOQC(salida, partidas);
  });
}

/** Valida que la salida exista, esté EMITIDA y devuelve sus partidas */
async function salidaEmitidaConPartidas(tx: PrismaTx, id: string) {
  const salida = await tx.salidaOQC.findUnique({ where: { id } });
  if (!salida) throw new ErrorNegocio("SALIDA_OQC_NO_EXISTE", 404);
  if (salida.estado !== "EMITIDA") throw new ErrorNegocio("SALIDA_OQC_ELIMINADA", 409);
  const partidas = await tx.movimiento.findMany({ where: { salidaId: id } });
  return { salida, partidas };
}

/**
 * Corrige una partida individual de una salida (transaccional):
 * revierte el efecto original, aplica el corregido y deja bitácora.
 * El folio de la partida, su tipo y su vínculo a la salida no cambian.
 *
 * La remisión (PL) y el responsable NO se corrigen aquí: viven en la
 * CABECERA de la salida y la partida siempre refleja sus valores
 * vigentes, de modo que corregir la cantidad o el producto jamás pierde
 * esa información ni la desincroniza del historial de movimientos.
 */
export async function corregirPartidaSalidaOQC(
  salidaId: string,
  partidaId: string,
  cuerpo: CuerpoEdicionPartida,
  meta: { usuarioId: string; usuarioNombre: string },
) {
  return db.$transaction(async (tx) => {
    const { salida, partidas } = await salidaEmitidaConPartidas(tx, salidaId);
    const partida = partidas.find((p) => p.id === partidaId);
    if (!partida) throw new ErrorNegocio("PARTIDA_NO_EXISTE", 404);

    const actualizado = await editarMovimientoTx(
      tx,
      partidaId,
      {
        productoId: cuerpo.productoId,
        almacenOrigenId: cuerpo.almacenOrigenId ?? salida.almacenOrigenId ?? undefined,
        cantidad: cuerpo.cantidad,
        motivo: cuerpo.motivo,
        // Espejo de la cabecera (mismas reglas que al liberar): si la
        // remisión está vacía, la partida muestra el folio de la salida;
        // si el responsable está vacío, firma quien liberó.
        referencia: salida.referencia ?? salida.folio,
        responsable: salida.responsable ?? salida.usuarioNombre ?? undefined,
      },
      {
        motivoCorreccion: cuerpo.motivoCorreccion,
        usuarioId: meta.usuarioId,
        usuarioNombre: meta.usuarioNombre,
      },
    );
    return aPartida(actualizado);
  });
}

/**
 * Elimina una partida individual de una salida (transaccional):
 * devuelve el material al almacén y deja bitácora. La salida y sus
 * demás partidas permanecen intactas.
 */
export async function eliminarPartidaSalidaOQC(
  salidaId: string,
  partidaId: string,
  meta: { motivoCorreccion: string; usuarioId: string; usuarioNombre: string },
) {
  return db.$transaction(async (tx) => {
    const { partidas } = await salidaEmitidaConPartidas(tx, salidaId);
    const partida = partidas.find((p) => p.id === partidaId);
    if (!partida) throw new ErrorNegocio("PARTIDA_NO_EXISTE", 404);

    const { folio } = await eliminarMovimientoTx(tx, partidaId, {
      motivoCorreccion: meta.motivoCorreccion,
      usuarioId: meta.usuarioId,
      usuarioNombre: meta.usuarioNombre,
    });
    return { folio };
  });
}

/**
 * Edita la cabecera de una salida EMITIDA (referencia, responsable,
 * notas) y PROPAGA la remisión y el responsable a todas sus partidas
 * vivas: el historial de movimientos debe reflejar SIEMPRE la cabecera
 * vigente de la salida. La edición queda documentada en la bitácora de
 * correcciones (auditoría de fábrica) como «Edición de cabecera».
 * El cliente y el almacén de origen no se alteran: para eso se elimina
 * la salida completa y se registra una nueva.
 */
export async function editarSalidaOQC(
  id: string,
  cuerpo: CuerpoEdicionSalida,
  meta: { usuarioId: string; usuarioNombre: string },
) {
  if (!cuerpo.motivoCorreccion?.trim()) throw new ErrorNegocio("MOTIVO_CORRECCION_REQUERIDO");

  return db.$transaction(async (tx) => {
    const { salida } = await salidaEmitidaConPartidas(tx, id);

    const antes = {
      folio: salida.folio,
      referencia: salida.referencia,
      responsable: salida.responsable,
      notas: salida.notas,
    };

    const actualizada = await tx.salidaOQC.update({
      where: { id },
      data: {
        ...(cuerpo.referencia !== undefined && { referencia: cuerpo.referencia?.trim() || null }),
        ...(cuerpo.responsable !== undefined && { responsable: cuerpo.responsable?.trim() || null }),
        ...(cuerpo.notas !== undefined && { notas: cuerpo.notas?.trim() || null }),
      },
    });

    // Propagar a las partidas vivas, con las mismas reglas que al liberar:
    // remisión vacía → la partida muestra el folio de la salida;
    // responsable vacío → firma quien liberó la salida.
    if (cuerpo.referencia !== undefined || cuerpo.responsable !== undefined) {
      await tx.movimiento.updateMany({
        where: { salidaId: id },
        data: {
          ...(cuerpo.referencia !== undefined && {
            referencia: actualizada.referencia ?? actualizada.folio,
          }),
          ...(cuerpo.responsable !== undefined && {
            responsable: actualizada.responsable ?? actualizada.usuarioNombre ?? null,
          }),
        },
      });
    }

    // Bitácora de la corrección de cabecera (movimientoId null = cabecera)
    await tx.correccionMovimiento.create({
      data: {
        movimientoId: null,
        folio: salida.folio,
        salidaId: salida.id,
        salidaFolio: salida.folio,
        accion: "EDICION",
        antes: JSON.stringify(antes),
        despues: JSON.stringify({
          folio: actualizada.folio,
          referencia: actualizada.referencia,
          responsable: actualizada.responsable,
          notas: actualizada.notas,
        }),
        motivo: cuerpo.motivoCorreccion.trim(),
        usuarioId: meta.usuarioId,
        usuarioNombre: meta.usuarioNombre?.trim() || null,
      },
    });

    const partidas = await tx.movimiento.findMany({ where: { salidaId: id } });
    return aSalidaOQC(actualizada, partidas.map(aPartida));
  });
}

/**
 * Elimina la salida COMPLETA (transaccional): devuelve todo el material
 * de sus partidas al almacén (una bitácora de eliminación por partida,
 * con el motivo indicado) y marca la salida como ELIMINADA. La fila de
 * la salida sobrevive como bitácora. Si el stock ya no alcanza para
 * alguna reversión, la operación completa se rechaza.
 */
export async function eliminarSalidaOQC(
  id: string,
  meta: { motivoCorreccion: string; usuarioId: string; usuarioNombre: string },
) {
  return db.$transaction(async (tx) => {
    const { salida, partidas } = await salidaEmitidaConPartidas(tx, id);

    for (const partida of partidas) {
      await eliminarMovimientoTx(tx, partida.id, {
        motivoCorreccion: meta.motivoCorreccion,
        usuarioId: meta.usuarioId,
        usuarioNombre: meta.usuarioNombre,
      });
    }

    const eliminada = await tx.salidaOQC.update({
      where: { id },
      data: {
        estado: "ELIMINADA",
        eliminadaEn: new Date(),
        eliminadaPor: meta.usuarioNombre,
      },
    });
    return aSalidaOQC(eliminada, []);
  });
}

// ============================================================
// SCRAP
// ============================================================

/**
 * Registra scrap de material (transaccional): descuenta el stock del
 * almacén con un Movimiento SCRAP cuyo folio es el mismo del registro,
 * de modo que registro, movimiento y bitácora comparten identidad.
 */
export async function registrarScrapOQC(
  cuerpo: CuerpoRegistroScrap,
  usuario: { id: string; nombre: string },
) {
  return db.$transaction(async (tx) => {
    if (!cuerpo.productoId) throw new ErrorNegocio("PRODUCTO_REQUERIDO");
    if (!cuerpo.almacenId) throw new ErrorNegocio("ALMACEN_ORIGEN_REQUERIDO");
    if (!cuerpo.motivo?.trim()) throw new ErrorNegocio("MOTIVO_SCRAP_REQUERIDO");

    // Con conteo en paquetes la cantidad en unidad base la calcula
    // registrarMovimientoTx (autoritativo); sin conteo se valida aquí.
    if (!cuerpo.conteo?.unidad) {
      const cantidad = Math.abs(Number(cuerpo.cantidad));
      if (!Number.isFinite(cantidad) || cantidad <= EPSILON) throw new ErrorNegocio("QUANTIDAD_INVALIDA");
    }

    // El movimiento SCRAP genera el folio SCR-... (el conteo en paquetes,
    // si viene, se valida y calcula de forma autoritativa ahí)
    const mov = await registrarMovimientoTx(tx, {
      tipo: "SCRAP",
      productoId: cuerpo.productoId,
      almacenOrigenId: cuerpo.almacenId,
      cantidad: Math.abs(Number(cuerpo.cantidad)) || 0,
      motivo: cuerpo.motivo.trim(),
      responsable: cuerpo.responsable?.trim() || usuario.nombre,
      usuarioId: usuario.id,
      usuarioNombre: usuario.nombre,
      ...(cuerpo.conteo?.unidad && { conteo: cuerpo.conteo }),
    });

    const registro = await tx.registroScrap.create({
      data: {
        folio: mov.folio,
        productoId: mov.productoId,
        productoSku: mov.productoSku,
        productoNombre: mov.productoNombre,
        productoUnidad: mov.productoUnidad,
        almacenId: mov.almacenOrigenId,
        almacenCodigo: mov.almacenOrigenCodigo,
        almacenNombre: mov.almacenOrigenNombre,
        cantidad: mov.cantidad,
        motivo: cuerpo.motivo.trim(),
        notas: cuerpo.notas?.trim() || null,
        responsable: cuerpo.responsable?.trim() || usuario.nombre,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        movimientoId: mov.id,
        // Snapshot del conteo en paquetes (si se capturó así)
        conteoDetalle: mov.conteoDetalle,
      },
    });
    return aRegistroScrap(registro);
  });
}

/**
 * Corrige un registro de scrap (transaccional): revierte y reaplica el
 * movimiento SCRAP (con bitácora) y refleja los cambios en el registro.
 */
export async function corregirScrapOQC(
  id: string,
  cuerpo: {
    productoId?: string;
    almacenId?: string;
    cantidad?: number;
    motivo?: string;
    notas?: string;
    responsable?: string;
    motivoCorreccion: string;
  },
  usuario: { id: string; nombre: string },
) {
  return db.$transaction(async (tx) => {
    const registro = await tx.registroScrap.findUnique({ where: { id } });
    if (!registro) throw new ErrorNegocio("SCRAP_NO_EXISTE", 404);
    if (!registro.movimientoId) throw new ErrorNegocio("REGISTRO_HISTORICO", 409);

    const productoId = cuerpo.productoId ?? registro.productoId;
    const almacenId = cuerpo.almacenId ?? registro.almacenId ?? undefined;
    const cantidad = cuerpo.cantidad !== undefined ? Number(cuerpo.cantidad) : registro.cantidad;

    const actualizado = await editarMovimientoTx(
      tx,
      registro.movimientoId,
      {
        productoId,
        almacenOrigenId: almacenId,
        cantidad,
        motivo: cuerpo.motivo ?? registro.motivo,
        referencia: undefined,
        responsable: cuerpo.responsable ?? registro.responsable ?? undefined,
      },
      {
        motivoCorreccion: cuerpo.motivoCorreccion,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
      },
    );

    const registroActualizado = await tx.registroScrap.update({
      where: { id },
      data: {
        productoId: actualizado.productoId,
        productoSku: actualizado.productoSku,
        productoNombre: actualizado.productoNombre,
        productoUnidad: actualizado.productoUnidad,
        almacenId: actualizado.almacenOrigenId,
        almacenCodigo: actualizado.almacenOrigenCodigo,
        almacenNombre: actualizado.almacenOrigenNombre,
        cantidad: actualizado.cantidad,
        motivo: cuerpo.motivo?.trim() ?? registro.motivo,
        notas: cuerpo.notas !== undefined ? cuerpo.notas?.trim() || null : registro.notas,
        responsable: cuerpo.responsable !== undefined ? cuerpo.responsable?.trim() || null : registro.responsable,
        // La corrección se expresa en unidad base: el conteo original queda
        // preservado en la bitácora del movimiento (antes/después)
        conteoDetalle: null,
      },
    });
    return aRegistroScrap(registroActualizado);
  });
}

/**
 * Elimina un registro de scrap (transaccional): devuelve el material al
 * almacén (reversión del movimiento, con bitácora) y retira el registro.
 */
export async function eliminarScrapOQC(
  id: string,
  meta: { motivoCorreccion: string; usuarioId: string; usuarioNombre: string },
) {
  return db.$transaction(async (tx) => {
    const registro = await tx.registroScrap.findUnique({ where: { id } });
    if (!registro) throw new ErrorNegocio("SCRAP_NO_EXISTE", 404);
    if (registro.movimientoId) {
      await eliminarMovimientoTx(tx, registro.movimientoId, {
        motivoCorreccion: meta.motivoCorreccion,
        usuarioId: meta.usuarioId,
        usuarioNombre: meta.usuarioNombre,
      });
    }
    await tx.registroScrap.delete({ where: { id } });
    return { folio: registro.folio };
  });
}

// ============================================================
// RECHAZOS
// ============================================================

const DISPOSICIONES: DisposicionRechazo[] = ["PENDIENTE", "RETRABAJO", "SCRAP", "LIBERADO"];

/** Registra un rechazo de inspección (documental, sin efecto en stock) */
export async function registrarRechazoOQC(
  cuerpo: CuerpoRegistroRechazo,
  usuario: { id: string; nombre: string },
) {
  return db.$transaction(async (tx) => {
    if (!cuerpo.productoId) throw new ErrorNegocio("PRODUCTO_REQUERIDO");
    const cantidad = Math.abs(Number(cuerpo.cantidad));
    if (!Number.isFinite(cantidad) || cantidad <= EPSILON) throw new ErrorNegocio("QUANTIDAD_INVALIDA");
    if (!cuerpo.motivo?.trim()) throw new ErrorNegocio("MOTIVO_RECHAZO_REQUERIDO");

    const producto = await tx.producto.findUnique({ where: { id: cuerpo.productoId } });
    if (!producto) throw new ErrorNegocio("PRODUCTO_NO_EXISTE", 404);

    let cliente: { id: string; codigo: string; nombre: string } | null = null;
    if (cuerpo.clienteId) {
      const c = await tx.cliente.findUnique({ where: { id: cuerpo.clienteId } });
      if (!c) throw new ErrorNegocio("CLIENTE_NO_EXISTE", 404);
      cliente = { id: c.id, codigo: c.codigo, nombre: c.nombre };
    }

    let salidaFolio: string | null = null;
    if (cuerpo.salidaId) {
      const s = await tx.salidaOQC.findUnique({ where: { id: cuerpo.salidaId } });
      if (!s) throw new ErrorNegocio("SALIDA_OQC_NO_EXISTE", 404);
      salidaFolio = s.folio;
    }

    const disposicion =
      cuerpo.disposicion && DISPOSICIONES.includes(cuerpo.disposicion)
        ? cuerpo.disposicion
        : "PENDIENTE";

    const folio = await generarFolioRechazo(tx);
    const registro = await tx.registroRechazo.create({
      data: {
        folio,
        productoId: producto.id,
        productoSku: producto.sku,
        productoNombre: producto.nombre,
        productoUnidad: producto.unidad,
        clienteId: cliente?.id ?? null,
        clienteCodigo: cliente?.codigo ?? null,
        clienteNombre: cliente?.nombre ?? null,
        salidaId: cuerpo.salidaId?.trim() || null,
        salidaFolio,
        cantidad,
        motivo: cuerpo.motivo.trim(),
        disposicion,
        notas: cuerpo.notas?.trim() || null,
        responsable: cuerpo.responsable?.trim() || usuario.nombre,
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
      },
    });
    return aRegistroRechazo(registro);
  });
}

/** Edita un registro de rechazo (documental) */
export async function editarRechazoOQC(id: string, cuerpo: {
  productoId?: string;
  clienteId?: string | null;
  cantidad?: number;
  motivo?: string;
  disposicion?: DisposicionRechazo;
  notas?: string;
  responsable?: string;
}) {
  return db.$transaction(async (tx) => {
    const registro = await tx.registroRechazo.findUnique({ where: { id } });
    if (!registro) throw new ErrorNegocio("RECHAZO_NO_EXISTE", 404);

    let cliente: { id: string; codigo: string; nombre: string } | null = null;
    const clienteId = cuerpo.clienteId !== undefined ? cuerpo.clienteId : registro.clienteId;
    if (clienteId) {
      const c = await tx.cliente.findUnique({ where: { id: clienteId } });
      if (!c) throw new ErrorNegocio("CLIENTE_NO_EXISTE", 404);
      cliente = { id: c.id, codigo: c.codigo, nombre: c.nombre };
    }

    // El producto puede corregirse (si el inspector se equivocó)
    let producto = null as
      | { id: string; sku: string; nombre: string; unidad: string }
      | null
      | undefined;
    if (cuerpo.productoId !== undefined && cuerpo.productoId !== registro.productoId) {
      if (!cuerpo.productoId) throw new ErrorNegocio("PRODUCTO_REQUERIDO");
      const p = await tx.producto.findUnique({ where: { id: cuerpo.productoId } });
      if (!p) throw new ErrorNegocio("PRODUCTO_NO_EXISTE", 404);
      producto = { id: p.id, sku: p.sku, nombre: p.nombre, unidad: p.unidad };
    }

    const cantidad =
      cuerpo.cantidad !== undefined ? Math.abs(Number(cuerpo.cantidad)) : registro.cantidad;
    if (!Number.isFinite(cantidad) || cantidad <= EPSILON) throw new ErrorNegocio("QUANTIDAD_INVALIDA");

    const disposicion =
      cuerpo.disposicion && DISPOSICIONES.includes(cuerpo.disposicion)
        ? cuerpo.disposicion
        : registro.disposicion as DisposicionRechazo;

    const actualizado = await tx.registroRechazo.update({
      where: { id },
      data: {
        ...(producto && {
          productoId: producto.id,
          productoSku: producto.sku,
          productoNombre: producto.nombre,
          productoUnidad: producto.unidad,
        }),
        clienteId: cliente?.id ?? null,
        clienteCodigo: cliente?.codigo ?? null,
        clienteNombre: cliente?.nombre ?? null,
        cantidad,
        ...(cuerpo.motivo !== undefined && { motivo: cuerpo.motivo?.trim() || registro.motivo }),
        disposicion,
        ...(cuerpo.notas !== undefined && { notas: cuerpo.notas?.trim() || null }),
        ...(cuerpo.responsable !== undefined && { responsable: cuerpo.responsable?.trim() || null }),
      },
    });
    return aRegistroRechazo(actualizado);
  });
}

/** Elimina un registro de rechazo (documental, sin efecto en stock) */
export async function eliminarRechazoOQC(id: string) {
  const registro = await db.registroRechazo.findUnique({ where: { id } });
  if (!registro) throw new ErrorNegocio("RECHAZO_NO_EXISTE", 404);
  await db.registroRechazo.delete({ where: { id } });
  return { folio: registro.folio };
}

// ============================================================
// CONSULTAS AGRUPADAS (para las rutas GET)
// ============================================================

/** Lista las salidas con sus partidas agrupadas y el estado del cliente */
export async function listarSalidasOQC(filtro?: { clienteId?: string; incluirEliminadas?: boolean }) {
  const salidas = await db.salidaOQC.findMany({
    where: {
      ...(filtro?.clienteId && { clienteId: filtro.clienteId }),
      ...(filtro?.incluirEliminadas ? {} : { estado: "EMITIDA" }),
    },
    orderBy: { createdAt: "desc" },
  });
  if (salidas.length === 0) return [];

  const ids = salidas.map((s) => s.id);
  const movimientos = await db.movimiento.findMany({
    where: { salidaId: { in: ids } },
    orderBy: { createdAt: "asc" },
  });

  const idsClientes = [...new Set(salidas.map((s) => s.clienteId).filter((c): c is string => !!c))];
  const clientesVivos = idsClientes.length
    ? new Set(
        (
          await db.cliente.findMany({ where: { id: { in: idsClientes } }, select: { id: true } })
        ).map((c) => c.id),
      )
    : new Set<string>();

  const partidasPorSalida = new Map<string, PartidaSalida[]>();
  for (const mov of movimientos) {
    const lista = partidasPorSalida.get(mov.salidaId!) ?? [];
    lista.push(aPartida(mov));
    partidasPorSalida.set(mov.salidaId!, lista);
  }

  return salidas.map((s) =>
    aSalidaOQC(s, partidasPorSalida.get(s.id) ?? [], s.clienteId ? clientesVivos.has(s.clienteId) : true),
  );
}

/** Detalle de una salida con partidas y bitácora de sus correcciones.
 *  La bitácora se liga por `salidaId` (clave estable, jamás reutilizada):
 *  cada corrección guarda el id de la SalidaOQC afectada, de modo que las
 *  correcciones de partidas eliminadas —cuyo movimiento ya no existe—
 *  siguen siendo visibles sin depender de coincidencias de folio. */
export async function detalleSalidaOQC(id: string) {
  const salida = await db.salidaOQC.findUnique({ where: { id } });
  if (!salida) throw new ErrorNegocio("SALIDA_OQC_NO_EXISTE", 404);

  const partidas = await db.movimiento.findMany({
    where: { salidaId: id },
    orderBy: { createdAt: "asc" },
  });

  const correcciones = await db.correccionMovimiento.findMany({
    where: { salidaId: id },
    orderBy: { createdAt: "desc" },
  });

  const clienteExiste = salida.clienteId
    ? Boolean(await db.cliente.findUnique({ where: { id: salida.clienteId } }))
    : true;

  return {
    salida: aSalidaOQC(salida, partidas.map(aPartida), clienteExiste),
    correcciones: correcciones.map((c) => ({
      id: c.id,
      folio: c.folio,
      accion: c.accion,
      /** true = edición de la CABECERA de la salida (no de una partida) */
      esCabecera: c.movimientoId === null,
      motivo: c.motivo,
      usuarioNombre: c.usuarioNombre,
      createdAt: c.createdAt.toISOString(),
      antes: JSON.parse(c.antes) as Record<string, unknown>,
      despues: c.despues ? (JSON.parse(c.despues) as Record<string, unknown>) : null,
    })),
  };
}
