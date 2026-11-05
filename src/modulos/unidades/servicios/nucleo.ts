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
 * LÓGICA DE SERVIDOR DEL MÓDULO UNIDADES DE MEDIDA
 *
 * Catálogo configurable de unidades:
 *
 * · Unidades base (CONTEO | PESO | LONGITUD | VOLUMEN | OTRO): la
 *   magnitud en la que vive el stock de cada producto (PZA, KG, M...).
 *
 * · Unidades de paquete (PAQUETE): múltiplo de una unidad base usado
 *   para CONTEAR (CJA, PAQ, BULTO...). El catálogo SOLO define la
 *   relación de unidad base (p. ej. PAQUETE→PZA): cuántas piezas lleva
 *   cada paquete VARÍA POR PRODUCTO y se configura al registrar el
 *   producto (Producto.unidadPaquete + contenidoPaquete).
 *   El stock SIEMPRE queda en la unidad base; el paquete es solo una
 *   forma de capturar y desplegar el conteo (2 PAQ × 10 + 3 PZA = 23 PZA).
 *
 * `resolverConteoTx` es la ÚNICA fuente de verdad de la conversión:
 * valida la unidad de conteo contra el EMPAQUE CONFIGURADO DEL PRODUCTO
 * y calcula la cantidad en unidad base. Así el cliente nunca decide la
 * aritmética del inventario.
 *
 * La primera consulta siembra el catálogo base del sistema (idempotente),
 * de modo que cualquier instalación —nueva o existente— arranca con las
 * unidades estándar de fábrica listas para ajustarse.
 */
import { db } from "@/lib/db";
import { CERO, type Decimal, aDecimal, desdeBD, esMayorQueCero } from "@/lib/numerico";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import type { ParteConteo, TipoUnidad, Unidad, CuerpoUnidad } from "../tipos";
import { TIPOS_UNIDAD, TIPOS_UNIDAD_BASE } from "../tipos";

type PrismaTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** Aritmética EXACTA (Decimal): el EPSILON de la era float desaparece
 *  porque las comparaciones de conteo ya no arrastran ruido binario. */

/** Código corto en mayúsculas: letra inicial, hasta 12 caracteres */
const PATRON_CODIGO = /^[A-Z][A-Z0-9._-]{0,11}$/;

// ============================================================
// CATÁLOGO BASE DEL SISTEMA (siembra idempotente)
// ============================================================

const UNIDADES_SISTEMA: Array<{
  codigo: string;
  nombre: string;
  nombreEn: string;
  tipo: TipoUnidad;
  unidadBase?: string;
  notas?: string;
}> = [
  { codigo: "PZA", nombre: "Pieza", nombreEn: "Piece", tipo: "CONTEO" },
  { codigo: "PAR", nombre: "Par", nombreEn: "Pair", tipo: "CONTEO" },
  { codigo: "JGO", nombre: "Juego", nombreEn: "Set", tipo: "CONTEO" },
  { codigo: "ROLLO", nombre: "Rollo", nombreEn: "Roll", tipo: "CONTEO" },
  { codigo: "KG", nombre: "Kilogramo", nombreEn: "Kilogram", tipo: "PESO" },
  { codigo: "G", nombre: "Gramo", nombreEn: "Gram", tipo: "PESO" },
  { codigo: "M", nombre: "Metro", nombreEn: "Meter", tipo: "LONGITUD" },
  { codigo: "CM", nombre: "Centímetro", nombreEn: "Centimeter", tipo: "LONGITUD" },
  { codigo: "L", nombre: "Litro", nombreEn: "Liter", tipo: "VOLUMEN" },
  { codigo: "ML", nombre: "Mililitro", nombreEn: "Milliliter", tipo: "VOLUMEN" },
  {
    codigo: "CJA",
    nombre: "Caja",
    nombreEn: "Box",
    tipo: "PAQUETE",
    unidadBase: "PZA",
    notas: "El contenido (cuántas piezas lleva) se configura en cada producto.",
  },
  {
    codigo: "PAQ",
    nombre: "Paquete",
    nombreEn: "Package",
    tipo: "PAQUETE",
    unidadBase: "PZA",
    notas: "El contenido (cuántas piezas lleva) se configura en cada producto.",
  },
  {
    codigo: "BULTO",
    nombre: "Bulto",
    nombreEn: "Bundle",
    tipo: "PAQUETE",
    unidadBase: "PZA",
    notas: "El contenido (cuántas piezas lleva) se configura en cada producto.",
  },
];

/**
 * Garantiza que el catálogo base exista (idempotente). Se llama desde
 * la lectura del catálogo y desde la validación de productos, así una
 * instalación existente obtiene las unidades sin pasos manuales.
 * También normaliza las notas de las unidades de paquete sembradas por
 * versiones anteriores (cuando el factor vivía en el catálogo).
 */
export async function asegurarUnidadesBase(): Promise<void> {
  const total = await db.unidadMedida.count();
  if (total === 0) {
    await db.unidadMedida.createMany({
      data: UNIDADES_SISTEMA.map((u) => ({
        codigo: u.codigo,
        nombre: u.nombre,
        nombreEn: u.nombreEn,
        tipo: u.tipo,
        unidadBase: u.unidadBase ?? null,
        notas: u.notas ?? null,
        activo: true,
        esSistema: true,
      })),
    });
    return;
  }
  // Migración ligera: las semillas viejas hablaban de un «factor» que
  // hoy vive en el producto. La nota se actualiza una sola vez.
  await db.unidadMedida.updateMany({
    where: { esSistema: true, tipo: "PAQUETE", notas: { contains: "factor" } },
    data: { notas: "El contenido (cuántas piezas lleva) se configura en cada producto." },
  });
}

// ============================================================
// VALIDACIONES
// ============================================================

function normalizarCodigo(crudo: unknown): string {
  return String(crudo ?? "").trim().toUpperCase();
}

/** Valida el cuerpo de una unidad (crear o actualizar); devuelve los datos listos */
async function validarCuerpo(
  cuerpo: CuerpoUnidad,
  { ignorarId }: { ignorarId?: string } = {},
) {
  const codigo = normalizarCodigo(cuerpo.codigo);
  const nombre = String(cuerpo.nombre ?? "").trim();
  const nombreEn = String(cuerpo.nombreEn ?? "").trim() || nombre;
  const tipo = cuerpo.tipo as TipoUnidad;

  if (!PATRON_CODIGO.test(codigo)) throw new ErrorNegocio("UNIDAD_CODIGO_INVALIDO");
  if (!nombre || nombre.length > 60) throw new ErrorNegocio("UNIDAD_NOMBRE_INVALIDO");
  if (nombreEn.length > 60) throw new ErrorNegocio("UNIDAD_NOMBRE_INVALIDO");
  if (!TIPOS_UNIDAD.includes(tipo)) throw new ErrorNegocio("UNIDAD_TIPO_INVALIDO");

  // Unicidad del código
  const duplicada = await db.unidadMedida.findUnique({ where: { codigo } });
  if (duplicada && duplicada.id !== ignorarId) throw new ErrorNegocio("UNIDAD_DUPLICADA", 409);

  let unidadBase: string | null = null;

  if (tipo === "PAQUETE") {
    // Un paquete solo declara DE QUÉ unidad base es múltiplo: cuántas
    // unidades lleva cada paquete varía por producto y se configura al
    // registrar el producto (no aquí).
    unidadBase = normalizarCodigo(cuerpo.unidadBase);
    if (!unidadBase) throw new ErrorNegocio("UNIDAD_BASE_REQUERIDA");
    if (unidadBase === codigo) throw new ErrorNegocio("UNIDAD_BASE_INVALIDA");
    const base = await db.unidadMedida.findUnique({ where: { codigo: unidadBase } });
    if (!base) throw new ErrorNegocio("UNIDAD_BASE_INVALIDA");
    if (base.tipo === "PAQUETE") throw new ErrorNegocio("UNIDAD_BASE_INVALIDA");
  }

  return {
    codigo,
    nombre,
    nombreEn,
    tipo,
    unidadBase,
    notas: String(cuerpo.notas ?? "").trim() || null,
  };
}

/** ¿Está el código referenciado por productos (unidad base o empaque)
 * o como base de otras unidades? */
async function codigoEnUso(codigo: string): Promise<boolean> {
  const [productosBase, productosEmpaque, dependientes] = await Promise.all([
    db.producto.findFirst({ where: { unidad: codigo }, select: { id: true } }),
    db.producto.findFirst({ where: { unidadPaquete: codigo }, select: { id: true } }),
    db.unidadMedida.findFirst({ where: { unidadBase: codigo }, select: { id: true } }),
  ]);
  return Boolean(productosBase || productosEmpaque || dependientes);
}

// ============================================================
// PROYECCIÓN
// ============================================================

function aUnidad(
  u: {
    id: string;
    codigo: string;
    nombre: string;
    nombreEn: string;
    tipo: string;
    unidadBase: string | null;
    notas: string | null;
    activo: boolean;
    esSistema: boolean;
    createdAt: Date;
  },
  usadaComoBase: number,
  productosAsociados: number,
): Unidad {
  return {
    id: u.id,
    codigo: u.codigo,
    nombre: u.nombre,
    nombreEn: u.nombreEn,
    tipo: TIPOS_UNIDAD.includes(u.tipo as TipoUnidad) ? (u.tipo as TipoUnidad) : "OTRO",
    unidadBase: u.unidadBase,
    notas: u.notas,
    activo: u.activo,
    esSistema: u.esSistema,
    createdAt: u.createdAt.toISOString(),
    usadaComoBase,
    productosAsociados,
  };
}

// ============================================================
// OPERACIONES DEL CATÁLOGO
// ============================================================

export async function listarUnidades(opciones?: { incluirInactivos?: boolean }): Promise<Unidad[]> {
  await asegurarUnidadesBase();
  const unidades = await db.unidadMedida.findMany({
    where: opciones?.incluirInactivos ? {} : { activo: true },
    orderBy: [{ tipo: "asc" }, { codigo: "asc" }],
  });

  // Agregados de uso (para advertencias en la gestión): productos que
  // usan la unidad como base de stock o como empaque de conteo.
  const [bases, productosBase, productosEmpaque] = await Promise.all([
    db.unidadMedida.groupBy({ by: ["unidadBase"], _count: { _all: true } }),
    db.producto.groupBy({ by: ["unidad"], _count: { _all: true } }),
    db.producto.groupBy({ by: ["unidadPaquete"], _count: { _all: true } }),
  ]);
  const conteoBases = new Map(
    bases.filter((b) => b.unidadBase).map((b) => [b.unidadBase as string, b._count._all]),
  );
  const conteoProductos = new Map<string, number>();
  for (const p of productosBase) conteoProductos.set(p.unidad, (conteoProductos.get(p.unidad) ?? 0) + p._count._all);
  for (const p of productosEmpaque) {
    if (p.unidadPaquete) conteoProductos.set(p.unidadPaquete, (conteoProductos.get(p.unidadPaquete) ?? 0) + p._count._all);
  }

  return unidades.map((u) =>
    aUnidad(u, conteoBases.get(u.codigo) ?? 0, conteoProductos.get(u.codigo) ?? 0),
  );
}

export async function crearUnidad(cuerpo: CuerpoUnidad): Promise<Unidad> {
  const datos = await validarCuerpo(cuerpo);
  const creada = await db.unidadMedida.create({ data: { ...datos, activo: true, esSistema: false } });
  return aUnidad(creada, 0, 0);
}

export async function actualizarUnidad(id: string, cuerpo: Partial<CuerpoUnidad> & { activo?: boolean }): Promise<Unidad> {
  const actual = await db.unidadMedida.findUnique({ where: { id } });
  if (!actual) throw new ErrorNegocio("UNIDAD_NO_EXISTE", 404);

  // El código de una unidad del sistema es identidad del sistema: no cambia.
  const codigoNuevo = normalizarCodigo(cuerpo.codigo ?? actual.codigo);
  if (actual.esSistema && codigoNuevo !== actual.codigo) {
    throw new ErrorNegocio("UNIDAD_CODIGO_BLOQUEADO");
  }
  // Cambiar el código de una unidad en uso rompería referencias vivas.
  if (codigoNuevo !== actual.codigo && (await codigoEnUso(actual.codigo))) {
    throw new ErrorNegocio("UNIDAD_EN_USO", 409);
  }
  // El tipo de una unidad del sistema tampoco cambia (PZA seguirá siendo
  // CONTEO): las equivalencias dependen de su naturaleza.
  const tipoNuevo = (cuerpo.tipo ?? actual.tipo) as TipoUnidad;
  if (actual.esSistema && tipoNuevo !== actual.tipo) {
    throw new ErrorNegocio("UNIDAD_TIPO_BLOQUEADO");
  }
  // Una unidad usada como base por paquetes no puede volverse PAQUETE.
  if (tipoNuevo === "PAQUETE" && actual.tipo !== "PAQUETE") {
    const dependientes = await db.unidadMedida.findFirst({
      where: { unidadBase: actual.codigo },
      select: { id: true },
    });
    if (dependientes) throw new ErrorNegocio("UNIDAD_EN_USO", 409);
  }

  const datos = await validarCuerpo(
    {
      codigo: codigoNuevo,
      nombre: cuerpo.nombre ?? actual.nombre,
      nombreEn: cuerpo.nombreEn ?? actual.nombreEn,
      tipo: tipoNuevo,
      unidadBase: cuerpo.unidadBase !== undefined ? cuerpo.unidadBase : actual.unidadBase,
      notas: (cuerpo.notas !== undefined ? cuerpo.notas : actual.notas) ?? undefined,
    },
    { ignorarId: id },
  );

  const actualizada = await db.unidadMedida.update({
    where: { id },
    data: { ...datos, ...(cuerpo.activo !== undefined && { activo: cuerpo.activo }) },
  });
  return aUnidad(actualizada, 0, 0);
}

export async function eliminarUnidad(id: string): Promise<{ codigo: string }> {
  const actual = await db.unidadMedida.findUnique({ where: { id } });
  if (!actual) throw new ErrorNegocio("UNIDAD_NO_EXISTE", 404);
  if (actual.esSistema) throw new ErrorNegocio("UNIDAD_SISTEMA", 409);
  if (await codigoEnUso(actual.codigo)) throw new ErrorNegocio("UNIDAD_EN_USO", 409);

  await db.unidadMedida.delete({ where: { id } });
  return { codigo: actual.codigo };
}

// ============================================================
// EMPAQUE POR PRODUCTO (validación compartida)
// ============================================================

/** Configuración de empaque de un producto, tal como se recibe del cliente */
export interface EmpaqueProducto {
  /** código de la unidad de paquete del catálogo (PAQ, CJA...); null = sin empaque */
  unidadPaquete: string | null;
  /** unidades base que contiene cada paquete ("10"; decimal exacto) */
  contenidoPaquete: string | null;
}

/**
 * Valida el empaque de conteo configurado en el registro de un producto.
 * Reglas:
 *   · Sin unidad de paquete → sin empaque (ambos null).
 *   · La unidad de paquete debe existir en el catálogo, estar ACTIVA y
 *     ser de tipo PAQUETE.
 *   · Su unidad base debe coincidir con la unidad base del producto
 *     (un producto en PZA no puede empacarse en un paquete de KG).
 *   · El contenido debe ser un número finito mayor a 0.
 */
export async function validarEmpaqueProducto(
  unidadBaseProducto: string,
  crudo: { unidadPaquete?: unknown; contenidoPaquete?: unknown },
): Promise<EmpaqueProducto> {
  const codigo = String(crudo.unidadPaquete ?? "").trim().toUpperCase();
  if (!codigo || codigo === "NULL") {
    return { unidadPaquete: null, contenidoPaquete: null };
  }

  await asegurarUnidadesBase();
  const unidad = await db.unidadMedida.findUnique({ where: { codigo } });
  if (!unidad || unidad.tipo !== "PAQUETE" || !unidad.activo) {
    throw new ErrorNegocio("PAQUETE_UNIDAD_INVALIDA", 400);
  }
  if (unidad.unidadBase !== unidadBaseProducto) {
    throw new ErrorNegocio("PAQUETE_INCOMPATIBLE", 400);
  }

  const contenido = aDecimal(crudo.contenidoPaquete);
  // Corrección Fase 3: el contenido debe ser > 0 — isPositive() de
  // decimal.js incluye el cero y dejaba pasar empaques «1 PAQ = 0 PZA».
  if (!esMayorQueCero(contenido)) {
    throw new ErrorNegocio("PAQUETE_CONTENIDO_INVALIDO", 400);
  }

  return { unidadPaquete: unidad.codigo, contenidoPaquete: contenido.toString() };
}

/**
 * ¿Sigue siendo válido el empaque vigente de un producto frente a un
 * cambio de unidad base? (p. ej. pasar el producto de PZA a KG deja
 * obsoleto un empaque en PAQ→PZA). Devuelve el empaque saneado.
 */
export async function sanearEmpaqueProducto(
  unidadBaseProducto: string,
  empaque: EmpaqueProducto,
): Promise<EmpaqueProducto> {
  if (!empaque.unidadPaquete || !empaque.contenidoPaquete) {
    return { unidadPaquete: null, contenidoPaquete: null };
  }
  const unidad = await db.unidadMedida.findUnique({
    where: { codigo: empaque.unidadPaquete },
  });
  if (!unidad || !unidad.activo || unidad.tipo !== "PAQUETE" || unidad.unidadBase !== unidadBaseProducto) {
    return { unidadPaquete: null, contenidoPaquete: null };
  }
  return empaque;
}

// ============================================================
// CONTEO EN PAQUETES (conversión a unidad base)
// ============================================================

/** Captura de conteo tal como llega del cliente */
export interface CapturaConteo {
  /** código de la unidad de conteo (la del empaque del producto) */
  unidad: string;
  /** paquetes completos (entero; se acepta texto de clientes legados) */
  paquetes?: number | string;
  /** unidades sueltas de la base (piezas fuera de paquete; decimal exacto) */
  sueltas?: number | string;
}

/**
 * Valida la captura en paquetes y calcula la cantidad en la UNIDAD BASE
 * del producto. Devuelve null cuando la captura es directa (sin paquetes).
 *
 * La conversión se hace contra el EMPAQUE CONFIGURADO DEL PRODUCTO
 * (unidadPaquete + contenidoPaquete): el catálogo solo define la
 * naturaleza de la unidad; la cantidad que lleva cada paquete varía
 * por producto. Reglas:
 *   · Captura directa (unidad === unidad base): cantidad = sueltas.
 *   · Captura en paquetes: la unidad debe ser EXACTAMENTE la unidad de
 *     empaque del producto, estar activa y ser compatible con su base.
 *   · paquetes/sueltas ≥ 0 y al menos uno > 0.
 *   · cantidad = paquetes × contenidoPaquete + sueltas (unidad base).
 */
export async function resolverConteoTx(
  tx: PrismaTx,
  producto: {
    unidad: string;
    unidadPaquete: string | null;
    contenidoPaquete: string | null;
  },
  captura: CapturaConteo | null | undefined,
): Promise<{ cantidad: Decimal; partes: ParteConteo[] } | null> {
  if (!captura || !captura.unidad) return null;

  const codigoCaptura = normalizarCodigo(captura.unidad);
  const paquetes = aDecimal(captura.paquetes ?? 0);
  const sueltas = aDecimal(captura.sueltas ?? 0);
  if (!paquetes || !sueltas || paquetes.isNeg() || sueltas.isNeg()) {
    throw new ErrorNegocio("CONTEO_INVALIDO");
  }

  // Nombre de la unidad base para el snapshot (fallback: el propio código)
  const base = producto.unidad
    ? await tx.unidadMedida.findUnique({ where: { codigo: producto.unidad } })
    : null;

  // ===== Captura directa en la unidad base del producto =====
  if (codigoCaptura === producto.unidad) {
    if (!paquetes.isZero()) throw new ErrorNegocio("CONTEO_UNIDAD_INVALIDA");
    // > 0 estricto (Fase 3): la captura directa de 0 unidades es inválida.
    if (!esMayorQueCero(sueltas)) throw new ErrorNegocio("CONTEO_INVALIDO");
    return {
      cantidad: sueltas,
      partes: [
        {
          unidad: producto.unidad,
          nombre: base?.nombre ?? producto.unidad,
          factor: "1",
          cantidad: sueltas.toString(),
        },
      ],
    };
  }

  // ===== Captura en paquetes: contra el empaque configurado del producto =====
  if (!producto.unidadPaquete || !producto.contenidoPaquete) {
    // El producto no tiene empaque: solo se captura en su unidad base.
    throw new ErrorNegocio("CONTEO_UNIDAD_INVALIDA");
  }
  if (codigoCaptura !== producto.unidadPaquete) {
    // No es la unidad de empaque configurada para ESTE producto.
    throw new ErrorNegocio("CONTEO_UNIDAD_INVALIDA");
  }

  const unidad = await tx.unidadMedida.findUnique({ where: { codigo: codigoCaptura } });
  if (!unidad) throw new ErrorNegocio("CONTEO_UNIDAD_NO_EXISTE");
  if (unidad.tipo !== "PAQUETE" || !unidad.activo) throw new ErrorNegocio("CONTEO_UNIDAD_INVALIDA");
  if (unidad.unidadBase !== producto.unidad) throw new ErrorNegocio("CONTEO_UNIDAD_INCOMPATIBLE");

  const contenido = aDecimal(producto.contenidoPaquete);
  // > 0 estricto (Fase 3): un empaque con contenido 0 no puede usarse
  // para capturar en paquetes (0 × N = 0 unidades).
  if (!esMayorQueCero(contenido)) {
    throw new ErrorNegocio("CONTEO_UNIDAD_INVALIDA");
  }

  // Aritmética EXACTA: cantidad = paquetes × contenido + sueltas (unidad base)
  const cantidad = paquetes.times(contenido).plus(sueltas);
  // > 0 estricto (Fase 3): un conteo total de 0 unidades es inválido.
  if (!esMayorQueCero(cantidad)) throw new ErrorNegocio("CONTEO_INVALIDO");

  const partes: ParteConteo[] = [];
  // > 0 estricto (Fase 3): las filas en 0 no se listan (semántica de la
  // era float: «2 PAQ + 0 sueltas» muestra solo la fila de PAQ).
  if (esMayorQueCero(paquetes)) {
    partes.push({
      unidad: unidad.codigo,
      nombre: unidad.nombre,
      factor: contenido.toString(),
      cantidad: paquetes.toString(),
    });
  }
  if (esMayorQueCero(sueltas)) {
    partes.push({
      unidad: producto.unidad,
      nombre: base?.nombre ?? producto.unidad,
      factor: "1",
      cantidad: sueltas.toString(),
    });
  }

  return { cantidad, partes };
}

/**
 * Fusiona varias capturas del MISMO producto (p. ej. varias líneas de
 * una liberación OQC): suma paquetes por código de unidad y conserva
 * el factor/nombre del snapshot. Devuelve el detalle agregado y el
 * total en unidad base.
 */
export function fusionarPartesConteo(partes: ParteConteo[]): { partes: ParteConteo[]; cantidad: Decimal } {
  const fusion = new Map<string, ParteConteo>();
  let cantidad = CERO;
  for (const parte of partes) {
    const cantidadParte = desdeBD(String(parte.cantidad), "ParteConteo.cantidad");
    const factorParte = desdeBD(String(parte.factor), "ParteConteo.factor");
    const previa = fusion.get(parte.unidad);
    if (previa) {
      previa.cantidad = desdeBD(String(previa.cantidad), "ParteConteo.cantidad")
        .plus(cantidadParte)
        .toString();
    } else {
      fusion.set(parte.unidad, { ...parte });
    }
    // Aritmética EXACTA: nunca mezclar float en la fusión multi-línea
    cantidad = cantidad.plus(cantidadParte.times(factorParte));
  }
  // Paquetes primero, unidades sueltas de la base al final
  const lista = [...fusion.values()].sort((a, b) =>
    desdeBD(String(b.factor), "ParteConteo.factor").cmp(desdeBD(String(a.factor), "ParteConteo.factor")),
  );
  return {
    partes: lista.filter((p) => esMayorQueCero(desdeBD(String(p.cantidad), "ParteConteo.cantidad"))),
    cantidad,
  };
}
