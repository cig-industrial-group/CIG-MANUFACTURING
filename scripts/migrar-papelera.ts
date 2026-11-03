/**
 * MIGRACIÓN v1.0.0 — Papelera + snapshots tipo ledger
 * 1) Rellena los snapshots de los movimientos existentes (producto,
 *    almacenes, usuario) a partir de los registros vivos actuales.
 * 2) Rellena usuarioNombre en la bitácora de correcciones.
 * 3) Habilita los permisos papelera.ver / papelera.gestionar en los
 *    roles ADMIN y TI (la semilla no sobrescribe permisos existentes).
 * Idempotente: puede ejecutarse varias veces.
 * Uso: bun scripts/migrar-papelera.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // ===== 1. Snapshots de movimientos =====
  const productos = await db.producto.findMany();
  const porIdProducto = new Map(productos.map((p) => [p.id, p]));
  const almacenes = await db.almacen.findMany();
  const porIdAlmacen = new Map(almacenes.map((a) => [a.id, a]));
  const usuarios = await db.usuario.findMany();
  const porIdUsuario = new Map(usuarios.map((u) => [u.id, u]));

  let actualizados = 0;
  const movimientos = await db.movimiento.findMany();
  for (const m of movimientos) {
    const producto = porIdProducto.get(m.productoId);
    const origen = m.almacenOrigenId ? porIdAlmacen.get(m.almacenOrigenId) : undefined;
    const destino = m.almacenDestinoId ? porIdAlmacen.get(m.almacenDestinoId) : undefined;
    const usuario = m.usuarioId ? porIdUsuario.get(m.usuarioId) : undefined;
    await db.movimiento.update({
      where: { id: m.id },
      data: {
        productoSku: producto?.sku ?? "(desconocido)",
        productoNombre: producto?.nombre ?? "(producto eliminado)",
        productoUnidad: producto?.unidad ?? "PZA",
        almacenOrigenCodigo: origen?.codigo ?? null,
        almacenOrigenNombre: origen?.nombre ?? null,
        almacenDestinoCodigo: destino?.codigo ?? null,
        almacenDestinoNombre: destino?.nombre ?? null,
        usuarioNombre: usuario?.nombre ?? null,
      },
    });
    actualizados++;
  }
  console.log(`✔ Snapshots de movimiento: ${actualizados} registros`);

  // ===== 2. usuarioNombre en bitácora de correcciones =====
  let correcciones = 0;
  const bitacora = await db.correccionMovimiento.findMany({ where: { usuarioNombre: null } });
  for (const c of bitacora) {
    const usuario = c.usuarioId ? porIdUsuario.get(c.usuarioId) : undefined;
    if (usuario) {
      await db.correccionMovimiento.update({
        where: { id: c.id },
        data: { usuarioNombre: usuario.nombre },
      });
      correcciones++;
    }
  }
  console.log(`✔ Bitácora de correcciones: ${correcciones} registros con usuario`);

  // ===== 3. Permisos de papelera para ADMIN y TI =====
  const NUEVOS = ["papelera.ver", "papelera.gestionar"];
  for (const clave of ["ADMIN", "TI"]) {
    const rol = await db.rol.findUnique({ where: { clave } });
    if (!rol) continue;
    const permisos = new Set([...JSON.parse(rol.permisos), ...NUEVOS]);
    await db.rol.update({
      where: { id: rol.id },
      data: { permisos: JSON.stringify([...permisos]) },
    });
    console.log(`✔ Rol ${clave}: ${permisos.size} permisos (incluye papelera)`);
  }
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
