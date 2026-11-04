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
 * MIGRACIÓN PUNTUAL (v1.0.0): habilita el módulo de Respaldo en la
 * base de datos existente, añadiendo el permiso «respaldo.gestionar».
 *
 * Asignación provisional (el mapa completo de roles lo define el
 * usuario; respaldar/restaurar la base es una operación crítica de
 * administración):
 *   respaldo.gestionar → ADMIN, TI
 *
 * Uso: bun scripts/permiso-respaldo.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ASIGNACIONES: Array<{ permiso: string; roles: string[] }> = [
  { permiso: "respaldo.gestionar", roles: ["ADMIN", "TI"] },
];

async function main() {
  for (const { permiso, roles: claves } of ASIGNACIONES) {
    console.log(`▸ Permiso: ${permiso}`);
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
  console.log("\nMigración de permisos de Respaldo completada.");
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
