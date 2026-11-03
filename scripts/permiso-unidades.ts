/**
 * MIGRACIÓN PUNTUAL (v1.0.0): habilita el módulo de Unidades de Medida
 * en la base de datos existente, añadiendo el permiso «unidades.gestionar».
 *
 * Asignación provisional (el mapa completo de roles lo define el usuario;
 * las unidades son catálogo maestro del almacén):
 *   unidades.gestionar → ADMIN, TI, JEFE_ALMACEN
 *
 * Además siembra el catálogo base de unidades (idempotente) para que la
 * instalación existente arranque con las equivalencias listas.
 *
 * Uso: bun scripts/permiso-unidades.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ASIGNACIONES: Array<{ permiso: string; roles: string[] }> = [
  { permiso: "unidades.gestionar", roles: ["ADMIN", "TI", "JEFE_ALMACEN"] },
];

/** Catálogo base de unidades del sistema (espejo de UNIDADES_SISTEMA).
 *  El factor de contenido NO vive aquí: la cantidad que lleva cada
 *  paquete se configura por producto. */
const UNIDADES_SISTEMA: Array<{
  codigo: string;
  nombre: string;
  nombreEn: string;
  tipo: string;
  unidadBase?: string;
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
  { codigo: "CJA", nombre: "Caja", nombreEn: "Box", tipo: "PAQUETE", unidadBase: "PZA" },
  { codigo: "PAQ", nombre: "Paquete", nombreEn: "Package", tipo: "PAQUETE", unidadBase: "PZA" },
  { codigo: "BULTO", nombre: "Bulto", nombreEn: "Bundle", tipo: "PAQUETE", unidadBase: "PZA" },
];

async function main() {
  // ===== Permisos =====
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

  // ===== Catálogo base de unidades (idempotente) =====
  console.log("\n▸ Catálogo de unidades de medida");
  let sembradas = 0;
  for (const u of UNIDADES_SISTEMA) {
    const existente = await db.unidadMedida.findUnique({ where: { codigo: u.codigo } });
    if (existente) {
      console.log(`· ${u.codigo} ya existe`);
      continue;
    }
    await db.unidadMedida.create({
      data: {
        codigo: u.codigo,
        nombre: u.nombre,
        nombreEn: u.nombreEn,
        tipo: u.tipo,
        unidadBase: u.unidadBase ?? null,
        activo: true,
        esSistema: true,
      },
    });
    console.log(`✔ ${u.codigo} sembrada`);
    sembradas++;
  }
  if (sembradas === 0) console.log("· Catálogo ya estaba completo");

  console.log("\nMigración de Unidades de Medida completada.");
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
