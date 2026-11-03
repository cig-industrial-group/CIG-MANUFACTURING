/**
 * MIGRACIÓN PUNTUAL (v1.0.0): añade los permisos del módulo Catálogo
 * ("catalogo.ver" y "catalogo.gestionar") a los roles ya existentes.
 *
 * La semilla no sobrescribe permisos de roles existentes (se gestionan
 * desde la app), por eso los roles precargados requieren este ajuste único.
 * Otros roles pueden recibir los permisos desde «Sistema → Roles y Permisos».
 *
 * Asignación:
 *   catalogo.ver       → ADMIN, TI, JEFE_ALMACEN, ALMACENERO, OPERADOR
 *   catalogo.gestionar → ADMIN, TI, JEFE_ALMACEN
 *
 * Uso: bun scripts/permiso-catalogo.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ASIGNACIONES: Array<{ permiso: string; roles: string[] }> = [
  { permiso: "catalogo.ver", roles: ["ADMIN", "TI", "JEFE_ALMACEN", "ALMACENERO", "OPERADOR"] },
  { permiso: "catalogo.gestionar", roles: ["ADMIN", "TI", "JEFE_ALMACEN"] },
];

async function main() {
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
  console.log("\nMigración de permisos de Catálogo completada.");
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
