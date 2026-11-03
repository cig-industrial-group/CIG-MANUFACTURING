/**
 * MIGRACIÓN PUNTUAL (v1.0.0): habilita el módulo OQC en la base de
 * datos existente:
 *   1. Retira el permiso «salidas.liberar» (sustituido por oqc.liberar).
 *   2. Añade los permisos del nuevo módulo a los roles.
 *
 * Asignación provisional (el usuario aún define el mapa completo de
 * roles; por ahora liberan material Almacén y OQC):
 *   oqc.ver      → ADMIN, TI, JEFE_ALMACEN, ALMACENERO, OQC
 *   oqc.liberar  → ADMIN, TI, JEFE_ALMACEN, ALMACENERO, OQC
 *   oqc.gestionar → ADMIN, TI, OQC
 *
 * Uso: bun scripts/permisos-oqc.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ASIGNACIONES: Array<{ permiso: string; roles: string[] }> = [
  { permiso: "oqc.ver", roles: ["ADMIN", "TI", "JEFE_ALMACEN", "ALMACENERO", "OQC"] },
  { permiso: "oqc.liberar", roles: ["ADMIN", "TI", "JEFE_ALMACEN", "ALMACENERO", "OQC"] },
  { permiso: "oqc.gestionar", roles: ["ADMIN", "TI", "OQC"] },
];

async function main() {
  // ===== 1. Retirar el permiso sustituido «salidas.liberar» =====
  const roles = await db.rol.findMany();
  for (const rol of roles) {
    const permisos = JSON.parse(rol.permisos) as string[];
    if (!permisos.includes("salidas.liberar")) continue;
    const limpios = permisos.filter((p) => p !== "salidas.liberar");
    await db.rol.update({
      where: { id: rol.id },
      data: { permisos: JSON.stringify(limpios) },
    });
    console.log(`· ${rol.clave}: retirado «salidas.liberar»`);
  }

  // ===== 2. Permisos nuevos =====
  for (const { permiso, roles: claves } of ASIGNACIONES) {
    console.log(`\n▸ Permiso: ${permiso}`);
    for (const clave of claves) {
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
  console.log("\nMigración de permisos de OQC completada.");
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
