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
 * MIGRACIÓN PUNTUAL (v1.0.0): añade el permiso "movimientos.corregir"
 * a los roles ADMIN y TI ya existentes en la base de datos.
 *
 * La semilla no sobrescribe permisos de roles existentes (se gestionan
 * desde la app), por eso los roles de sistema requieren este ajuste único.
 * Otros roles pueden recibir el permiso desde «Sistema → Roles y Permisos».
 *
 * Uso: bun scripts/permiso-correccion.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const NUEVO_PERMISO = "movimientos.corregir";
const ROLES_CON_TODOS_LOS_PERMISOS = ["ADMIN", "TI"];

async function main() {
  for (const clave of ROLES_CON_TODOS_LOS_PERMISOS) {
    const rol = await db.rol.findUnique({ where: { clave } });
    if (!rol) {
      console.log(`· Rol no encontrado (se omite): ${clave}`);
      continue;
    }
    const permisos = JSON.parse(rol.permisos) as string[];
    if (permisos.includes(NUEVO_PERMISO)) {
      console.log(`· ${clave} ya tenía el permiso`);
      continue;
    }
    permisos.push(NUEVO_PERMISO);
    await db.rol.update({
      where: { id: rol.id },
      data: { permisos: JSON.stringify(permisos) },
    });
    console.log(`✔ Permiso "${NUEVO_PERMISO}" añadido a ${clave}`);
  }
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
