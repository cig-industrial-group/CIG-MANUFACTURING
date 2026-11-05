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
 * LÓGICA DE SERVIDOR DEL MÓDULO PAPELERA
 * Eliminación segura en dos etapas:
 *   1. DELETE  → el registro sale de su tabla original y entra a la
 *      papelera con un snapshot completo (restaurable 30 días).
 *   2. Purga   → manual o automática al expirar; los datos se descartan
 *      pero la fila sobrevive para siempre como bitácora inmutable.
 *
 * Los movimientos referencian las entidades de forma suave (sin FK):
 * su historial sobrevive intacto y se re-vincula solo si la entidad
 * se restaura con el mismo id.
 */
import { db } from "@/lib/db";
import { transaccion } from "@/lib/reintentos";
import { aDecimal } from "@/lib/numerico";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import { sanearEmpaqueProducto } from "@/modulos/unidades/servicios/nucleo";

/** Ventana de restauración en días */
export const DIAS_RESTAURACION = 30;

const MS_DIA = 24 * 60 * 60 * 1000;

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export interface UsuarioAccion {
  id: string;
  nombre: string;
}

type Entidad = "PRODUCTO" | "ALMACEN" | "MODELO" | "NUMERO_PARTE" | "USUARIO" | "CLIENTE";

// ============================================================
// ENVÍO A PAPELERA (etapa 1)
// ============================================================

async function registrarEnPapeleraTx(
  tx: PrismaTx,
  args: {
    entidad: Entidad;
    entidadId: string;
    identificador: string;
    nombre: string;
    datos: unknown;
    usuario: UsuarioAccion;
  },
) {
  await tx.papelera.create({
    data: {
      entidad: args.entidad,
      entidadId: args.entidadId,
      identificador: args.identificador,
      nombre: args.nombre,
      datos: JSON.stringify(args.datos),
      estado: "EN_PAPELERA",
      usuarioId: args.usuario.id,
      usuarioNombre: args.usuario.nombre,
      eliminadoEn: new Date(),
      expiraEn: new Date(Date.now() + DIAS_RESTAURACION * MS_DIA),
    },
  });
}

/** Producto → papelera. Incluye snapshot de su stock por almacén. */
export async function enviarProductoAPapelera(id: string, usuario: UsuarioAccion) {
  await transaccion(async (tx) => {
    const producto = await tx.producto.findUnique({ where: { id }, include: { stocks: true } });
    if (!producto) throw new ErrorNegocio("NO_ENCONTRADO", 404);

    const { stocks, ...datos } = producto;
    await registrarEnPapeleraTx(tx, {
      entidad: "PRODUCTO",
      entidadId: id,
      identificador: producto.sku,
      nombre: producto.nombre,
      datos: {
        ...datos,
        stocks: stocks.map((s) => ({ almacenId: s.almacenId, cantidad: s.cantidad })),
      },
      usuario,
    });

    // Borrado real de la tabla original; el stock se va en cascada
    await tx.producto.delete({ where: { id } });
  });
}

/** Almacén → papelera. Incluye snapshot de su stock por producto. */
export async function enviarAlmacenAPapelera(id: string, usuario: UsuarioAccion) {
  await transaccion(async (tx) => {
    const almacen = await tx.almacen.findUnique({ where: { id }, include: { stocks: true } });
    if (!almacen) throw new ErrorNegocio("NO_ENCONTRADO", 404);

    const { stocks, ...datos } = almacen;
    await registrarEnPapeleraTx(tx, {
      entidad: "ALMACEN",
      entidadId: id,
      identificador: almacen.codigo,
      nombre: almacen.nombre,
      datos: {
        ...datos,
        stocks: stocks.map((s) => ({ productoId: s.productoId, cantidad: s.cantidad })),
      },
      usuario,
    });

    await tx.almacen.delete({ where: { id } });
  });
}

/** Modelo → papelera. Incluye sus números de parte asociados. */
export async function enviarModeloAPapelera(id: string, usuario: UsuarioAccion) {
  await transaccion(async (tx) => {
    const modelo = await tx.modelo.findUnique({
      where: { id },
      include: { partes: { include: { numeroParte: true } } },
    });
    if (!modelo) throw new ErrorNegocio("NO_ENCONTRADO", 404);

    const { partes, ...datos } = modelo;
    await registrarEnPapeleraTx(tx, {
      entidad: "MODELO",
      entidadId: id,
      identificador: modelo.codigo,
      nombre: modelo.nombre,
      datos: {
        ...datos,
        partes: partes.map((p) => ({ numeroParteId: p.numeroParteId, numero: p.numeroParte.numero })),
      },
      usuario,
    });

    // Las asociaciones N:M se eliminan en cascada
    await tx.modelo.delete({ where: { id } });
  });
}

/** Número de parte → papelera. Incluye sus modelos asociados. */
export async function enviarParteAPapelera(id: string, usuario: UsuarioAccion) {
  await transaccion(async (tx) => {
    const parte = await tx.numeroParte.findUnique({
      where: { id },
      include: { modelos: { include: { modelo: true } } },
    });
    if (!parte) throw new ErrorNegocio("NO_ENCONTRADO", 404);

    const { modelos, ...datos } = parte;
    await registrarEnPapeleraTx(tx, {
      entidad: "NUMERO_PARTE",
      entidadId: id,
      identificador: parte.numero,
      nombre: parte.nombre,
      datos: {
        ...datos,
        modelos: modelos.map((m) => ({ modeloId: m.modeloId, codigo: m.modelo.codigo })),
      },
      usuario,
    });

    await tx.numeroParte.delete({ where: { id } });
  });
}

/** Usuario → papelera. Conserva su hash de contraseña para que pueda
 *  volver a iniciar sesión tal cual al restaurarse. */
export async function enviarUsuarioAPapelera(id: string, usuario: UsuarioAccion) {
  await transaccion(async (tx) => {
    const objetivo = await tx.usuario.findUnique({ where: { id }, include: { rol: true } });
    if (!objetivo) throw new ErrorNegocio("NO_ENCONTRADO", 404);

    const { rol, ...datos } = objetivo;
    await registrarEnPapeleraTx(tx, {
      entidad: "USUARIO",
      entidadId: id,
      identificador: objetivo.correo,
      nombre: objetivo.nombre,
      datos: { ...datos, rolClave: rol.clave },
      usuario,
    });

    // Los restablecimientos pendientes se eliminan en cascada (son efímeros)
    await tx.usuario.delete({ where: { id } });
  });
}

/** Cliente → papelera. Su historial de salidas (movimientos con snapshot
 *  clienteCodigo/clienteNombre) sobrevive intacto y queda marcado como
 *  «eliminado» hasta que el cliente se restaure con el mismo id. */
export async function enviarClienteAPapelera(id: string, usuario: UsuarioAccion) {
  await transaccion(async (tx) => {
    const cliente = await tx.cliente.findUnique({ where: { id } });
    if (!cliente) throw new ErrorNegocio("NO_ENCONTRADO", 404);

    await registrarEnPapeleraTx(tx, {
      entidad: "CLIENTE",
      entidadId: id,
      identificador: cliente.codigo,
      nombre: cliente.nombre,
      datos: cliente,
      usuario,
    });

    await tx.cliente.delete({ where: { id } });
  });
}

// ============================================================
// RESTAURACIÓN (dentro de la ventana de 30 días)
// ============================================================

interface DatosPapelera {
  id: string;
  createdAt: string;
  // Producto / Almacén / Modelo / Parte / Usuario
  sku?: string;
  codigo?: string;
  nombre?: string;
  descripcion?: string | null;
  categoria?: string;
  unidad?: string;
  unidadPaquete?: string | null;
  // Decimales del snapshot: texto decimal exacto (nuevos) o número (snapshots
  // legados de la era float): se normalizan al restaurar (aDecimal)
  contenidoPaquete?: string | number | null;
  stockMinimo?: string | number;
  costoUnitario?: string | number | null;
  ubicacion?: string | null;
  tipo?: string;
  responsable?: string | null;
  numero?: string;
  correo?: string;
  passwordHash?: string;
  rolId?: string;
  debeCambiarPassword?: boolean;
  ultimoAcceso?: string | null;
  activo?: boolean;
  stocks?: Array<{ almacenId?: string; productoId?: string; cantidad: string | number }>;
  partes?: Array<{ numeroParteId: string; numero: string }>;
  modelos?: Array<{ modeloId: string; codigo: string }>;
  // Cliente
  contacto?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  notas?: string | null;
}

/** Re-crea las filas de stock cuyas dos puntas siguen vivas.
 *  `productoFijo` / `almacenFijo` completan la punta que no viaja en la
 *  fila: al restaurar un producto se fija su productoId; al restaurar un
 *  almacén se fija su almacenId. */
async function recrearStockTx(
  tx: PrismaTx,
  filas: Array<{ almacenId?: string; productoId?: string; cantidad: string | number }>,
  productoFijo?: string,
  almacenFijo?: string,
) {
  for (const s of filas) {
    const productoId = s.productoId ?? productoFijo;
    const almacenId = s.almacenId ?? almacenFijo;
    if (!productoId || !almacenId) continue;
    const almacenVivo = await tx.almacen.findUnique({ where: { id: almacenId } });
    if (!almacenVivo) continue;
    const productoVivo = await tx.producto.findUnique({ where: { id: productoId } });
    if (!productoVivo) continue;
    // Normalización Decimal del snapshot (legado numérico o texto exacto)
    const cantidad = aDecimal(s.cantidad);
    const existente = await tx.stock.findUnique({
      where: { productoId_almacenId: { productoId, almacenId } },
    });
    if (!existente && cantidad?.isPositive()) {
      await tx.stock.create({ data: { productoId, almacenId, cantidad: cantidad.toString() } });
    }
  }
}

async function restaurarProductoTx(tx: PrismaTx, datos: DatosPapelera) {
  const skuOcupado = await tx.producto.findUnique({ where: { sku: datos.sku! } });
  if (skuOcupado) throw new ErrorNegocio("IDENTIFICADOR_EN_USO", 409);

  // El empaque del snapshot se sanea: si la unidad de paquete que usaba
  // ya no existe/está inactiva o dejó de ser compatible con la unidad
  // base, se restaura sin empaque (captura directa en unidad base).
  const unidad = datos.unidad ?? "PZA";
  const empaque = await sanearEmpaqueProducto(unidad, {
    unidadPaquete: datos.unidadPaquete ?? null,
    // Snapshot legado (número) o texto decimal: se normaliza a texto exacto
    contenidoPaquete: aDecimal(datos.contenidoPaquete)?.toString() ?? null,
  });

  await tx.producto.create({
    data: {
      id: datos.id,
      sku: datos.sku!,
      nombre: datos.nombre!,
      descripcion: datos.descripcion ?? null,
      categoria: datos.categoria ?? "MATERIA_PRIMA",
      unidad,
      unidadPaquete: empaque.unidadPaquete,
      contenidoPaquete: empaque.contenidoPaquete,
      stockMinimo: aDecimal(datos.stockMinimo ?? 0)?.toString() ?? "0",
      costoUnitario: aDecimal(datos.costoUnitario)?.toString() ?? null,
      // Se restaura visible: quien lo trae de vuelta quiere verlo
      activo: true,
      createdAt: new Date(datos.createdAt),
    },
  });
  await recrearStockTx(tx, datos.stocks ?? [], datos.id, undefined);
}

async function restaurarAlmacenTx(tx: PrismaTx, datos: DatosPapelera) {
  const codigoOcupado = await tx.almacen.findUnique({ where: { codigo: datos.codigo! } });
  if (codigoOcupado) throw new ErrorNegocio("IDENTIFICADOR_EN_USO", 409);
  await tx.almacen.create({
    data: {
      id: datos.id,
      codigo: datos.codigo!,
      nombre: datos.nombre!,
      ubicacion: datos.ubicacion ?? null,
      tipo: datos.tipo ?? "GENERAL",
      responsable: datos.responsable ?? null,
      activo: true,
      createdAt: new Date(datos.createdAt),
    },
  });
  await recrearStockTx(tx, datos.stocks ?? [], undefined, datos.id);
}

async function restaurarModeloTx(tx: PrismaTx, datos: DatosPapelera) {
  const codigoOcupado = await tx.modelo.findUnique({ where: { codigo: datos.codigo! } });
  if (codigoOcupado) throw new ErrorNegocio("IDENTIFICADOR_EN_USO", 409);
  await tx.modelo.create({
    data: {
      id: datos.id,
      codigo: datos.codigo!,
      nombre: datos.nombre!,
      descripcion: datos.descripcion ?? null,
      activo: true,
      createdAt: new Date(datos.createdAt),
    },
  });
  for (const p of datos.partes ?? []) {
    const parteViva = await tx.numeroParte.findUnique({ where: { id: p.numeroParteId } });
    if (!parteViva) continue;
    const existente = await tx.modeloParte.findUnique({
      where: { modeloId_numeroParteId: { modeloId: datos.id, numeroParteId: p.numeroParteId } },
    });
    if (!existente) {
      await tx.modeloParte.create({ data: { modeloId: datos.id, numeroParteId: p.numeroParteId } });
    }
  }
}

async function restaurarParteTx(tx: PrismaTx, datos: DatosPapelera) {
  const numeroOcupado = await tx.numeroParte.findUnique({ where: { numero: datos.numero! } });
  if (numeroOcupado) throw new ErrorNegocio("IDENTIFICADOR_EN_USO", 409);
  await tx.numeroParte.create({
    data: {
      id: datos.id,
      numero: datos.numero!,
      nombre: datos.nombre!,
      descripcion: datos.descripcion ?? null,
      activo: true,
      createdAt: new Date(datos.createdAt),
    },
  });
  for (const m of datos.modelos ?? []) {
    const modeloVivo = await tx.modelo.findUnique({ where: { id: m.modeloId } });
    if (!modeloVivo) continue;
    const existente = await tx.modeloParte.findUnique({
      where: { modeloId_numeroParteId: { modeloId: m.modeloId, numeroParteId: datos.id } },
    });
    if (!existente) {
      await tx.modeloParte.create({ data: { modeloId: m.modeloId, numeroParteId: datos.id } });
    }
  }
}

async function restaurarUsuarioTx(tx: PrismaTx, datos: DatosPapelera) {
  const correoOcupado = await tx.usuario.findUnique({ where: { correo: datos.correo! } });
  if (correoOcupado) throw new ErrorNegocio("IDENTIFICADOR_EN_USO", 409);

  // El rol original puede haber desaparecido: se asigna OPERADOR como
  // alternativa segura de solo-consulta; el administrador puede cambiarlo.
  let rolId: string | null = datos.rolId ?? null;
  const rolOriginal = rolId ? await tx.rol.findUnique({ where: { id: rolId } }) : null;
  if (!rolOriginal) {
    const respaldo = await tx.rol.findUnique({ where: { clave: "OPERADOR" } });
    rolId = respaldo?.id ?? null;
  }
  if (!rolId) throw new ErrorNegocio("ERROR_INTERNO", 500);

  await tx.usuario.create({
    data: {
      id: datos.id,
      nombre: datos.nombre!,
      correo: datos.correo!,
      // Conserva su contraseña: puede iniciar sesión tal cual al volver
      passwordHash: datos.passwordHash!,
      rolId,
      activo: true,
      debeCambiarPassword: datos.debeCambiarPassword ?? false,
      ultimoAcceso: datos.ultimoAcceso ? new Date(datos.ultimoAcceso) : null,
      createdAt: new Date(datos.createdAt),
    },
  });
}

async function restaurarClienteTx(tx: PrismaTx, datos: DatosPapelera) {
  const codigoOcupado = await tx.cliente.findUnique({ where: { codigo: datos.codigo! } });
  if (codigoOcupado) throw new ErrorNegocio("IDENTIFICADOR_EN_USO", 409);
  await tx.cliente.create({
    data: {
      id: datos.id,
      codigo: datos.codigo!,
      nombre: datos.nombre!,
      contacto: datos.contacto ?? null,
      correo: datos.correo ?? null,
      telefono: datos.telefono ?? null,
      direccion: datos.direccion ?? null,
      notas: datos.notas ?? null,
      // Se restaura visible: quien lo trae de vuelta quiere verlo
      activo: true,
      createdAt: new Date(datos.createdAt),
    },
  });
}

/** Restaura un registro desde la papelera (mismo id → re-vinculado). */
export async function restaurarDePapelera(idPapelera: string, usuario: UsuarioAccion) {
  return transaccion(async (tx) => {
    const entrada = await tx.papelera.findUnique({ where: { id: idPapelera } });
    if (!entrada) throw new ErrorNegocio("PAPELERA_NO_EXISTE", 404);
    if (entrada.estado !== "EN_PAPELERA") throw new ErrorNegocio("PAPELERA_YA_PROCESADA", 409);

    let datos: DatosPapelera | null = null;
    try {
      datos = entrada.datos ? (JSON.parse(entrada.datos) as DatosPapelera) : null;
    } catch {
      datos = null;
    }
    if (!datos) throw new ErrorNegocio("PAPELERA_SIN_DATOS", 409);

    switch (entrada.entidad as Entidad) {
      case "PRODUCTO":
        await restaurarProductoTx(tx, datos);
        break;
      case "ALMACEN":
        await restaurarAlmacenTx(tx, datos);
        break;
      case "MODELO":
        await restaurarModeloTx(tx, datos);
        break;
      case "NUMERO_PARTE":
        await restaurarParteTx(tx, datos);
        break;
      case "USUARIO":
        await restaurarUsuarioTx(tx, datos);
        break;
      case "CLIENTE":
        await restaurarClienteTx(tx, datos);
        break;
      default:
        throw new ErrorNegocio("ERROR_INTERNO", 500);
    }

    await tx.papelera.update({
      where: { id: idPapelera },
      data: { estado: "RESTAURADO", restauradoEn: new Date(), restauradoPor: usuario.id },
    });

    return { entidad: entrada.entidad, identificador: entrada.identificador, nombre: entrada.nombre };
  });
}

// ============================================================
// PURGA (etapa 2 — manual o automática)
// ============================================================

/** Purga manual: descarta los datos de forma definitiva e irrecuperable.
 *  La fila sobrevive como bitácora. */
export async function purgarDePapelera(idPapelera: string, usuario: UsuarioAccion) {
  const entrada = await db.papelera.findUnique({ where: { id: idPapelera } });
  if (!entrada) throw new ErrorNegocio("PAPELERA_NO_EXISTE", 404);
  if (entrada.estado !== "EN_PAPELERA") throw new ErrorNegocio("PAPELERA_YA_PROCESADA", 409);

  await db.papelera.update({
    where: { id: idPapelera },
    data: { estado: "PURGADO", purgadoEn: new Date(), purgadoPor: usuario.nombre, datos: null },
  });
  return { entidad: entrada.entidad, identificador: entrada.identificador };
}

/** Purga perezosa de entradas expiradas (se llama al listar la papelera
 *  y en cada envío). Devuelve cuántas expiraron. */
export async function purgarExpirados(): Promise<number> {
  const vencidas = await db.papelera.findMany({
    where: { estado: "EN_PAPELERA", expiraEn: { lt: new Date() } },
    select: { id: true },
  });
  if (vencidas.length === 0) return 0;
  await db.papelera.updateMany({
    where: { id: { in: vencidas.map((v) => v.id) } },
    data: { estado: "PURGADO", purgadoEn: new Date(), datos: null },
  });
  return vencidas.length;
}

// ============================================================
// LISTADO / BITÁCORA
// ============================================================

export interface EntradaPapelera {
  id: string;
  entidad: string;
  entidadId: string;
  identificador: string;
  nombre: string;
  estado: string;
  usuarioNombre: string | null;
  eliminadoEn: string;
  expiraEn: string;
  diasRestantes: number;
  restauradoEn: string | null;
  purgadoEn: string | null;
  purgadoPor: string | null;
}

function mapearEntrada(e: {
  id: string;
  entidad: string;
  entidadId: string;
  identificador: string;
  nombre: string;
  estado: string;
  usuarioNombre: string | null;
  eliminadoEn: Date;
  expiraEn: Date;
  restauradoEn: Date | null;
  purgadoEn: Date | null;
  purgadoPor: string | null;
}): EntradaPapelera {
  const diasRestantes = Math.max(0, Math.ceil((e.expiraEn.getTime() - Date.now()) / MS_DIA));
  return {
    id: e.id,
    entidad: e.entidad,
    entidadId: e.entidadId,
    identificador: e.identificador,
    nombre: e.nombre,
    estado: e.estado,
    usuarioNombre: e.usuarioNombre,
    eliminadoEn: e.eliminadoEn.toISOString(),
    expiraEn: e.expiraEn.toISOString(),
    diasRestantes,
    restauradoEn: e.restauradoEn?.toISOString() ?? null,
    purgadoEn: e.purgadoEn?.toISOString() ?? null,
    purgadoPor: e.purgadoPor,
  };
}

/** Registros restaurables (purga expirados primero). */
export async function listarPapelera(): Promise<EntradaPapelera[]> {
  await purgarExpirados();
  const entradas = await db.papelera.findMany({
    where: { estado: "EN_PAPELERA" },
    orderBy: { expiraEn: "asc" },
  });
  return entradas.map(mapearEntrada);
}

/** Bitácora completa: cada eliminación, restauración y purga, para siempre. */
export async function listarBitacora(): Promise<EntradaPapelera[]> {
  await purgarExpirados();
  const entradas = await db.papelera.findMany({
    orderBy: { eliminadoEn: "desc" },
    take: 500,
  });
  return entradas.map(mapearEntrada);
}
