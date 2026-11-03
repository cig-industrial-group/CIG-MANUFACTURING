/**
 * MIGRACIÓN PUNTUAL (v1.0.0): habilita el módulo de Clientes en la base
 * de datos existente:
 *   1. Crea el rol OQC (Calidad de Salida) si no existe.
 *   2. Añade los permisos nuevos a los roles ya existentes.
 *
 * La semilla no sobrescribe permisos de roles existentes (se gestionan
 * desde la app), por eso los roles precargados requieren este ajuste único.
 * Otros roles pueden recibir los permisos desde «Sistema → Roles y Permisos».
 *
 * Asignación provisional (el usuario aún define el mapa completo de roles
 * que pueden liberar material de salida; por ahora: Almacén y OQC):
 *   clientes.ver       → ADMIN, TI, JEFE_ALMACEN, ALMACENERO, OQC
 *   clientes.gestionar → ADMIN, TI, JEFE_ALMACEN
 *   salidas.liberar    → ADMIN, TI, JEFE_ALMACEN, ALMACENERO, OQC
 *
 * Uso: bun scripts/permiso-clientes.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ROL_OQC = {
  clave: "OQC",
  nombre: "OQC (Calidad de Salida)",
  nombreEn: "OQC (Outgoing Quality Control)",
  descripcion: "Inspección de salida: libera material a clientes con el módulo de Clientes.",
  permisos: JSON.stringify([
    "almacen.ver",
    "movimientos.crear",
    "catalogo.ver",
    "clientes.ver",
    "salidas.liberar",
  ]),
  sistema: false,
};

const ASIGNACIONES: Array<{ permiso: string; roles: string[] }> = [
  { permiso: "clientes.ver", roles: ["ADMIN", "TI", "JEFE_ALMACEN", "ALMACENERO", "OQC"] },
  { permiso: "clientes.gestionar", roles: ["ADMIN", "TI", "JEFE_ALMACEN"] },
  { permiso: "salidas.liberar", roles: ["ADMIN", "TI", "JEFE_ALMACEN", "ALMACENERO", "OQC"] },
];

async function main() {
  // ===== 1. Rol OQC (upsert: no toca permisos si ya existe) =====
  await db.rol.upsert({
    where: { clave: ROL_OQC.clave },
    create: ROL_OQC,
    update: {},
  });
  console.log(`✔ Rol asegurado: ${ROL_OQC.clave}`);

  // ===== 2. Permisos nuevos para roles existentes =====
  for (const { permiso, roles } of ASIGNACIONES) {
    console.log(`\n▸ Permiso: ${permiso}`);
    for (const clave of roles) {
      const rol = await db.rol.findUnique({ where: { clave } });
      if (!rol) {
        console.log(`· Rol no encontrado (se omite): ${clave}`);
        continue;
      }
      const permisos = JSON.parse(rol.permisos) as string[];
      if (permisos.includes(permiso)) {
        console.log(`· ${clave} ya tenía el permiso`);
        continue;
      }
      permisos.push(permiso);
      await db.rol.update({
        where: { id: rol.id },
        data: { permisos: JSON.stringify(permisos) },
      });
      console.log(`✔ Añadido a ${clave}`);
    }
  }
  console.log("\nMigración de permisos de Clientes completada.");
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
