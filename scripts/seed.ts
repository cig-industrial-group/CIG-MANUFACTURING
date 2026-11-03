/**
 * SEMILLA DE DATOS - Módulo Almacén
 * Crea almacenes, productos y un historial de movimientos realista
 * Ejecutar con: bun scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

type TipoMov = "ENTRADA" | "RECEPCION" | "SALIDA" | "TRASLADO" | "AJUSTE";

const PREFIJOS: Record<TipoMov, string> = {
  ENTRADA: "ENT",
  RECEPCION: "REC",
  SALIDA: "SAL",
  TRASLADO: "TRA",
  AJUSTE: "AJU",
};

// Contador de folio por (prefijo + fecha)
const contadores = new Map<string, number>();
function generarFolio(tipo: TipoMov, fecha: Date): string {
  const d = fecha.toISOString().slice(0, 10).replace(/-/g, "");
  const clave = `${PREFIJOS[tipo]}-${d}`;
  const n = (contadores.get(clave) ?? 0) + 1;
  contadores.set(clave, n);
  return `${clave}-${String(n).padStart(4, "0")}`;
}

async function aplicarMovimiento(params: {
  tipo: TipoMov;
  sku: string;
  almacenOrigenCodigo?: string;
  almacenDestinoCodigo?: string;
  cantidad: number;
  fecha: Date;
  motivo?: string;
  referencia?: string;
  responsable?: string;
}) {
  const { tipo, sku, cantidad, fecha } = params;
  const producto = await db.producto.findUnique({ where: { sku } });
  if (!producto) throw new Error(`Producto ${sku} no existe`);
  const origen = params.almacenOrigenCodigo
    ? await db.almacen.findUnique({ where: { codigo: params.almacenOrigenCodigo } })
    : null;
  const destino = params.almacenDestinoCodigo
    ? await db.almacen.findUnique({ where: { codigo: params.almacenDestinoCodigo } })
    : null;

  let cantidadDespues: number | null = null;

  if (tipo === "ENTRADA" || tipo === "RECEPCION") {
    if (!destino) throw new Error(`${tipo} requiere almacén destino`);
    const stock = await db.stock.upsert({
      where: { productoId_almacenId: { productoId: producto.id, almacenId: destino.id } },
      create: { productoId: producto.id, almacenId: destino.id, cantidad },
      update: { cantidad: { increment: cantidad } },
    });
    cantidadDespues = stock.cantidad;
  } else if (tipo === "SALIDA") {
    if (!origen) throw new Error("SALIDA requiere almacén origen");
    const stock = await db.stock.upsert({
      where: { productoId_almacenId: { productoId: producto.id, almacenId: origen.id } },
      create: { productoId: producto.id, almacenId: origen.id, cantidad: 0 },
      update: {},
    });
    const nuevo = stock.cantidad - cantidad;
    if (nuevo < 0) throw new Error(`Stock insuficiente para ${sku} en ${origen.codigo}`);
    await db.stock.update({ where: { id: stock.id }, data: { cantidad: nuevo } });
    cantidadDespues = nuevo;
  } else if (tipo === "TRASLADO") {
    if (!origen || !destino) throw new Error("TRASLADO requiere origen y destino");
    const stockO = await db.stock.upsert({
      where: { productoId_almacenId: { productoId: producto.id, almacenId: origen.id } },
      create: { productoId: producto.id, almacenId: origen.id, cantidad: 0 },
      update: {},
    });
    const nuevoO = stockO.cantidad - cantidad;
    if (nuevoO < 0) throw new Error(`Stock insuficiente para ${sku} en ${origen.codigo}`);
    await db.stock.update({ where: { id: stockO.id }, data: { cantidad: nuevoO } });
    const stockD = await db.stock.upsert({
      where: { productoId_almacenId: { productoId: producto.id, almacenId: destino.id } },
      create: { productoId: producto.id, almacenId: destino.id, cantidad },
      update: { cantidad: { increment: cantidad } },
    });
    cantidadDespues = stockD.cantidad;
  } else if (tipo === "AJUSTE") {
    if (!destino) throw new Error("AJUSTE requiere almacén destino");
    const stock = await db.stock.upsert({
      where: { productoId_almacenId: { productoId: producto.id, almacenId: destino.id } },
      create: { productoId: producto.id, almacenId: destino.id, cantidad: 0 },
      update: {},
    });
    const nuevo = stock.cantidad + cantidad; // cantidad puede ser negativa
    if (nuevo < 0) throw new Error(`Ajuste deja stock negativo para ${sku}`);
    await db.stock.update({ where: { id: stock.id }, data: { cantidad: nuevo } });
    cantidadDespues = nuevo;
  }

  await db.movimiento.create({
    data: {
      folio: generarFolio(tipo, fecha),
      tipo,
      productoId: producto.id,
      almacenOrigenId: origen?.id ?? null,
      almacenDestinoId: destino?.id ?? null,
      // Los ajustes conservan el signo; el resto siempre es positivo
      cantidad: tipo === "AJUSTE" ? cantidad : Math.abs(cantidad),
      cantidadDespues,
      motivo: params.motivo,
      referencia: params.referencia,
      responsable: params.responsable,
      createdAt: fecha,
    },
  });
}

// Fecha helpers (relativas a hoy, hacia atrás)
function hace(dias: number, hora = 9, min = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(hora, min, 0, 0);
  return d;
}

async function main() {
  console.log("Limpiando datos previos...");
  await db.movimiento.deleteMany();
  await db.stock.deleteMany();
  await db.producto.deleteMany();
  await db.almacen.deleteMany();

  console.log("Creando almacenes...");
  await db.almacen.createMany({
    data: [
      { codigo: "ALM-MP-01", nombre: "Almacén de Materia Prima", ubicacion: "Nave A - Pasillos 1-4", tipo: "MATERIA_PRIMA", responsable: "María González" },
      { codigo: "ALM-PT-01", nombre: "Almacén de Producto Terminado", ubicacion: "Nave B - Zona de Embarque", tipo: "PRODUCTO_TERMINADO", responsable: "Carlos Ramírez" },
      { codigo: "ALM-INS-01", nombre: "Almacén de Insumos", ubicacion: "Nave A - Bodega 2", tipo: "GENERAL", responsable: "Ana Torres" },
      { codigo: "ALM-TRA-01", nombre: "Almacén Transitorio (WIP)", ubicacion: "Nave C - Piso de Producción", tipo: "GENERAL", responsable: "Luis Fernández" },
    ],
  });

  console.log("Creando productos...");
  await db.producto.createMany({
    data: [
      { sku: "MP-0001", nombre: "Lámina de Acero CR Cal. 14", descripcion: "Lámina de acero laminado en frío, calibre 14, 1.22 x 2.44 m", categoria: "MATERIA_PRIMA", unidad: "KG", stockMinimo: 800, costoUnitario: 28.5 },
      { sku: "MP-0002", nombre: "Lámina Galvanizada Cal. 16", descripcion: "Lámina galvanizada 1.22 x 2.44 m", categoria: "MATERIA_PRIMA", unidad: "KG", stockMinimo: 500, costoUnitario: 32.0 },
      { sku: "MP-0003", nombre: 'Tubo Estructural 2" x 2"', descripcion: "Tubo cuadrado negro cal. 14, 6 m", categoria: "MATERIA_PRIMA", unidad: "M", stockMinimo: 300, costoUnitario: 95.0 },
      { sku: "MP-0004", nombre: 'Perfil Ángulo 1.5" x 1/8"', descripcion: "Perfil angular de acero, 6 m", categoria: "MATERIA_PRIMA", unidad: "M", stockMinimo: 200, costoUnitario: 68.0 },
      { sku: "MP-0005", nombre: "Pintura Epóxica Blanca", descripcion: "Cubeta 19 L, acabado industrial", categoria: "MATERIA_PRIMA", unidad: "L", stockMinimo: 60, costoUnitario: 210.0 },
      { sku: "MP-0006", nombre: "Pintura Epóxica Gris Grafito", descripcion: "Cubeta 19 L, acabado industrial", categoria: "MATERIA_PRIMA", unidad: "L", stockMinimo: 60, costoUnitario: 215.0 },
      { sku: "MP-0007", nombre: 'Tornillo Autoperforante 8 x 1"', descripcion: "Cabeza hexagonal con arandela, caja 500 pzas", categoria: "MATERIA_PRIMA", unidad: "PZA", stockMinimo: 2000, costoUnitario: 1.8 },
      { sku: "MP-0008", nombre: "Alambre de Soldadura MIG 0.8 mm", descripcion: "Carrete 15 kg ER70S-6", categoria: "MATERIA_PRIMA", unidad: "KG", stockMinimo: 80, costoUnitario: 74.0 },
      { sku: "MP-0009", nombre: "Caja de Cartón Corrugado 60x40x40", descripcion: "Doble capa, paquete 20 pzas", categoria: "MATERIA_PRIMA", unidad: "PZA", stockMinimo: 400, costoUnitario: 18.5 },
      { sku: "PT-0001", nombre: "Rack Metálico Industrial 3 Niveles", descripcion: "Capacidad 350 kg por nivel, 1.8 m alto", categoria: "PRODUCTO_TERMINADO", unidad: "PZA", stockMinimo: 25, costoUnitario: 2450.0 },
      { sku: "PT-0002", nombre: "Repisa Metálica 90 x 45 cm", descripcion: "Cal. 16 con refuerzos, acabado epóxico", categoria: "PRODUCTO_TERMINADO", unidad: "PZA", stockMinimo: 60, costoUnitario: 385.0 },
      { sku: "PT-0003", nombre: "Tarima Metálica Ligera", descripcion: "1.0 x 1.2 m, patas desmontables", categoria: "PRODUCTO_TERMINADO", unidad: "PZA", stockMinimo: 30, costoUnitario: 1180.0 },
      { sku: "PT-0004", nombre: "Banco de Trabajo Industrial", descripcion: "Encimeras de madera, 2.0 x 0.75 m", categoria: "PRODUCTO_TERMINADO", unidad: "PZA", stockMinimo: 10, costoUnitario: 3200.0 },
      { sku: "IN-0001", nombre: "Guantes de Nitrilo Talla M", descripcion: "Par, resistencia a cortos nivel 3", categoria: "INSUMO", unidad: "PAR", stockMinimo: 100, costoUnitario: 42.0 },
      { sku: "IN-0002", nombre: "Cinta Adhesiva Industrial 48 mm", descripcion: "Rollo 100 m, alta resistencia", categoria: "INSUMO", unidad: "PZA", stockMinimo: 60, costoUnitario: 35.0 },
      { sku: "IN-0003", nombre: 'Disco de Corte 4.5"', descripcion: "Metal inoxidable, paquete 25 pzas", categoria: "INSUMO", unidad: "PZA", stockMinimo: 150, costoUnitario: 22.0 },
    ],
  });

  console.log("Generando movimientos...");
  // ===== Recepciones de materia prima =====
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0001", almacenDestinoCodigo: "ALM-MP-01", cantidad: 2500, fecha: hace(24, 8, 15), referencia: "FACT-A-8421", responsable: "María González", motivo: "Recepción mensual de acero" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0002", almacenDestinoCodigo: "ALM-MP-01", cantidad: 1200, fecha: hace(24, 9, 40), referencia: "FACT-A-8421", responsable: "María González" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0003", almacenDestinoCodigo: "ALM-MP-01", cantidad: 420, fecha: hace(23, 10, 5), referencia: "FACT-B-1173", responsable: "María González" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0007", almacenDestinoCodigo: "ALM-MP-01", cantidad: 6000, fecha: hace(23, 11, 30), referencia: "FACT-B-1174", responsable: "María González" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0005", almacenDestinoCodigo: "ALM-MP-01", cantidad: 120, fecha: hace(22, 8, 50), referencia: "FACT-C-3301", responsable: "María González" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0006", almacenDestinoCodigo: "ALM-MP-01", cantidad: 90, fecha: hace(22, 9, 10), referencia: "FACT-C-3301", responsable: "María González" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0008", almacenDestinoCodigo: "ALM-MP-01", cantidad: 180, fecha: hace(21, 10, 20), referencia: "FACT-C-3302", responsable: "María González" });

  // Insumos
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "IN-0001", almacenDestinoCodigo: "ALM-INS-01", cantidad: 240, fecha: hace(21, 12, 0), referencia: "FACT-D-5540", responsable: "Ana Torres" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "IN-0002", almacenDestinoCodigo: "ALM-INS-01", cantidad: 120, fecha: hace(20, 8, 30), referencia: "FACT-D-5541", responsable: "Ana Torres" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "IN-0003", almacenDestinoCodigo: "ALM-INS-01", cantidad: 300, fecha: hace(20, 9, 5), referencia: "FACT-D-5541", responsable: "Ana Torres" });

  // ===== Producción: traslado MP a almacén transitorio =====
  await aplicarMovimiento({ tipo: "TRASLADO", sku: "MP-0001", almacenOrigenCodigo: "ALM-MP-01", almacenDestinoCodigo: "ALM-TRA-01", cantidad: 800, fecha: hace(19, 7, 45), motivo: "Orden de producción OP-1042", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "TRASLADO", sku: "MP-0007", almacenOrigenCodigo: "ALM-MP-01", almacenDestinoCodigo: "ALM-TRA-01", cantidad: 1200, fecha: hace(19, 8, 0), motivo: "Orden de producción OP-1042", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "TRASLADO", sku: "MP-0005", almacenOrigenCodigo: "ALM-MP-01", almacenDestinoCodigo: "ALM-TRA-01", cantidad: 45, fecha: hace(18, 7, 30), motivo: "Orden de producción OP-1042", responsable: "Luis Fernández" });

  // ===== Consumo de producción (salidas desde transitorio) =====
  await aplicarMovimiento({ tipo: "SALIDA", sku: "MP-0001", almacenOrigenCodigo: "ALM-TRA-01", cantidad: 760, fecha: hace(17, 16, 30), motivo: "Consumo OP-1042", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "MP-0007", almacenOrigenCodigo: "ALM-TRA-01", cantidad: 1150, fecha: hace(17, 16, 35), motivo: "Consumo OP-1042", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "MP-0005", almacenOrigenCodigo: "ALM-TRA-01", cantidad: 42, fecha: hace(16, 16, 40), motivo: "Consumo OP-1042", responsable: "Luis Fernández" });

  // ===== Entradas de producto terminado =====
  await aplicarMovimiento({ tipo: "ENTRADA", sku: "PT-0001", almacenDestinoCodigo: "ALM-PT-01", cantidad: 45, fecha: hace(15, 14, 0), referencia: "OP-1042", motivo: "Producción terminada lote L-1042-A", responsable: "Carlos Ramírez" });
  await aplicarMovimiento({ tipo: "ENTRADA", sku: "PT-0002", almacenDestinoCodigo: "ALM-PT-01", cantidad: 160, fecha: hace(15, 14, 30), referencia: "OP-1042", motivo: "Producción terminada lote L-1042-A", responsable: "Carlos Ramírez" });

  // Segunda ronda producción
  await aplicarMovimiento({ tipo: "TRASLADO", sku: "MP-0002", almacenOrigenCodigo: "ALM-MP-01", almacenDestinoCodigo: "ALM-TRA-01", cantidad: 500, fecha: hace(13, 8, 10), motivo: "Orden de producción OP-1043", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "TRASLADO", sku: "MP-0003", almacenOrigenCodigo: "ALM-MP-01", almacenDestinoCodigo: "ALM-TRA-01", cantidad: 180, fecha: hace(13, 8, 25), motivo: "Orden de producción OP-1043", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "MP-0002", almacenOrigenCodigo: "ALM-TRA-01", cantidad: 480, fecha: hace(12, 17, 0), motivo: "Consumo OP-1043", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "MP-0003", almacenOrigenCodigo: "ALM-TRA-01", cantidad: 165, fecha: hace(12, 17, 5), motivo: "Consumo OP-1043", responsable: "Luis Fernández" });
  await aplicarMovimiento({ tipo: "ENTRADA", sku: "PT-0003", almacenDestinoCodigo: "ALM-PT-01", cantidad: 38, fecha: hace(11, 13, 20), referencia: "OP-1043", motivo: "Producción terminada lote L-1043-A", responsable: "Carlos Ramírez" });
  await aplicarMovimiento({ tipo: "ENTRADA", sku: "PT-0004", almacenDestinoCodigo: "ALM-PT-01", cantidad: 14, fecha: hace(11, 13, 50), referencia: "OP-1043", motivo: "Producción terminada lote L-1043-A", responsable: "Carlos Ramírez" });

  // ===== Salidas de producto terminado (ventas) =====
  await aplicarMovimiento({ tipo: "SALIDA", sku: "PT-0001", almacenOrigenCodigo: "ALM-PT-01", cantidad: 30, fecha: hace(10, 11, 0), referencia: "PED-7781", motivo: "Pedido cliente Ferretería del Norte", responsable: "Carlos Ramírez" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "PT-0002", almacenOrigenCodigo: "ALM-PT-01", cantidad: 95, fecha: hace(9, 10, 15), referencia: "PED-7784", motivo: "Pedido cliente Distribuidora Pax", responsable: "Carlos Ramírez" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "PT-0003", almacenOrigenCodigo: "ALM-PT-01", cantidad: 20, fecha: hace(8, 15, 45), referencia: "PED-7790", motivo: "Pedido cliente Almacenes del Sol", responsable: "Carlos Ramírez" });

  // ===== Insumos: consumo y salidas =====
  await aplicarMovimiento({ tipo: "SALIDA", sku: "IN-0001", almacenOrigenCodigo: "ALM-INS-01", cantidad: 180, fecha: hace(7, 9, 0), motivo: "Dotación mensual de EPP a producción", responsable: "Ana Torres" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "IN-0003", almacenOrigenCodigo: "ALM-INS-01", cantidad: 240, fecha: hace(6, 10, 30), motivo: "Consumo área de corte", responsable: "Ana Torres" });

  // ===== Recepciones recientes =====
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0004", almacenDestinoCodigo: "ALM-MP-01", cantidad: 260, fecha: hace(5, 8, 20), referencia: "FACT-E-9014", responsable: "María González" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0009", almacenDestinoCodigo: "ALM-MP-01", cantidad: 600, fecha: hace(4, 9, 45), referencia: "FACT-E-9015", responsable: "María González" });
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0008", almacenDestinoCodigo: "ALM-MP-01", cantidad: 120, fecha: hace(4, 10, 0), referencia: "FACT-E-9016", responsable: "María González" });

  // ===== Traslado PT a embarque (transitorio) =====
  await aplicarMovimiento({ tipo: "TRASLADO", sku: "PT-0001", almacenOrigenCodigo: "ALM-PT-01", almacenDestinoCodigo: "ALM-TRA-01", cantidad: 12, fecha: hace(3, 12, 10), motivo: "Preparación de embarque PED-7802", responsable: "Carlos Ramírez" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "PT-0001", almacenOrigenCodigo: "ALM-TRA-01", cantidad: 12, fecha: hace(2, 16, 20), referencia: "PED-7802", motivo: "Embarque a cliente", responsable: "Carlos Ramírez" });

  // ===== Ajustes de inventario (físico) =====
  await aplicarMovimiento({ tipo: "AJUSTE", sku: "MP-0006", almacenDestinoCodigo: "ALM-MP-01", cantidad: -4, fecha: hace(2, 17, 30), motivo: "Conteo físico - merma por evaporación", responsable: "María González" });
  await aplicarMovimiento({ tipo: "AJUSTE", sku: "IN-0002", almacenDestinoCodigo: "ALM-INS-01", cantidad: -5, fecha: hace(1, 9, 15), motivo: "Conteo físico - diferencia", responsable: "Ana Torres" });

  // ===== Ayer/hoy: actividad reciente =====
  await aplicarMovimiento({ tipo: "RECEPCION", sku: "MP-0001", almacenDestinoCodigo: "ALM-MP-01", cantidad: 900, fecha: hace(1, 8, 5), referencia: "FACT-F-1201", responsable: "María González" });
  await aplicarMovimiento({ tipo: "ENTRADA", sku: "PT-0002", almacenDestinoCodigo: "ALM-PT-01", cantidad: 80, fecha: hace(1, 14, 40), referencia: "OP-1044", motivo: "Producción terminada lote L-1044-A", responsable: "Carlos Ramírez" });
  await aplicarMovimiento({ tipo: "SALIDA", sku: "MP-0007", almacenOrigenCodigo: "ALM-MP-01", cantidad: 900, fecha: hace(0, 8, 50), motivo: "Consumo directo línea 2", responsable: "Luis Fernández" });

  const resumen = {
    almacenes: await db.almacen.count(),
    productos: await db.producto.count(),
    movimientos: await db.movimiento.count(),
    stocks: await db.stock.count(),
  };
  console.log("Semilla completada:", resumen);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
