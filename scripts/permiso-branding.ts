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
 * MIGRACIÓN PUNTUAL (Fase 14): habilita el módulo de Branding (Identidad
 * Visual) en una base de datos existente:
 *   1. Añade el permiso nuevo «ajustes.branding» a los roles ya existentes.
 *
 * La semilla no sobrescribe permisos de roles existentes (se gestionan
 * desde la app), por eso los roles precargados requieren este ajuste único.
 * Otros roles pueden recibir el permiso desde «Sistema → Roles y Permisos».
 *
 * Asignación (identidad visual = administración técnica del sistema):
 *   ajustes.branding → ADMIN, TI
 *
 * Uso: bun scripts/permiso-branding.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ASIGNACIONES: Array<{ permiso: string; roles: string[] }> = [
  { permiso: "ajustes.branding", roles: ["ADMIN", "TI"] },
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
  console.log("\nMigración de permisos de Branding completada.");
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
