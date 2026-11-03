/**
 * SEMILLA DEL SISTEMA — Roles, usuarios iniciales y configuración.
 * Idempotente: puede ejecutarse varias veces sin duplicar datos.
 * Uso: bun prisma/seed.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

/** Catálogo de permisos del sistema */
export const PERMISOS = [
  "almacen.ver",
  "almacen.gestionar",
  "movimientos.crear",
  "movimientos.corregir",
  "inventario.ajustar",
  "unidades.gestionar",
  "catalogo.ver",
  "catalogo.gestionar",
  "clientes.ver",
  "clientes.gestionar",
  "oqc.ver",
  "oqc.liberar",
  "oqc.gestionar",
  "usuarios.gestionar",
  "ajustes.gestionar",
  "respaldo.gestionar",
  "papelera.ver",
  "papelera.gestionar",
] as const;

const TODOS = [...PERMISOS];

const ROLES: Array<{
  clave: string;
  nombre: string;
  nombreEn: string;
  descripcion: string;
  permisos: string[];
  sistema: boolean;
}> = [
  {
    clave: "ADMIN",
    nombre: "Administrador",
    nombreEn: "Administrator",
    descripcion: "Control total del sistema, incluida la gestión de usuarios y roles.",
    permisos: TODOS,
    sistema: true,
  },
  {
    clave: "TI",
    nombre: "TI (Tecnologías de la Información)",
    nombreEn: "IT (Information Technology)",
    descripcion:
      "Gestión técnica del sistema: usuarios, roles, ajustes, módulo de almacén y corrección de registros.",
    permisos: TODOS,
    sistema: true,
  },
  {
    clave: "JEFE_ALMACEN",
    nombre: "Jefe de Almacén",
    nombreEn: "Warehouse Manager",
    descripcion: "Gestiona catálogos del almacén, movimientos, ajustes de inventario y clientes.",
    permisos: ["almacen.ver", "almacen.gestionar", "movimientos.crear", "movimientos.corregir", "inventario.ajustar", "unidades.gestionar", "catalogo.ver", "catalogo.gestionar", "clientes.ver", "clientes.gestionar", "oqc.ver", "oqc.liberar"],
    sistema: false,
  },
  {
    clave: "ALMACENERO",
    nombre: "Almacenista",
    nombreEn: "Warehouse Keeper",
    descripcion: "Consulta el almacén y registra movimientos de entrada, salida y traslado; libera material a clientes.",
    permisos: ["almacen.ver", "movimientos.crear", "catalogo.ver", "clientes.ver", "oqc.ver", "oqc.liberar"],
    sistema: false,
  },
  {
    clave: "OQC",
    nombre: "OQC (Calidad de Salida)",
    nombreEn: "OQC (Outgoing Quality Control)",
    descripcion: "Inspección de salida: libera material a clientes y corrige sus registros.",
    permisos: ["almacen.ver", "movimientos.crear", "catalogo.ver", "clientes.ver", "oqc.ver", "oqc.liberar", "oqc.gestionar"],
    sistema: false,
  },
  {
    clave: "OPERADOR",
    nombre: "Operador",
    nombreEn: "Operator",
    descripcion: "Acceso de solo consulta al área de almacén.",
    permisos: ["almacen.ver", "catalogo.ver"],
    sistema: false,
  },
];

const USUARIOS: Array<{
  nombre: string;
  correo: string;
  password: string;
  rolClave: string;
}> = [
  { nombre: "Administrador del Sistema", correo: "admin@fabriflow.com", password: "Admin*2024", rolClave: "ADMIN" },
  { nombre: "Departamento de TI", correo: "ti@fabriflow.com", password: "Ti*2024", rolClave: "TI" },
];

const CONFIGURACION: Record<string, string> = {
  // Registro público de usuarios (pantalla de acceso)
  "auth.registroHabilitado": JSON.stringify(true),
  // Recuperación automática de contraseña por código
  "auth.recuperacionHabilitada": JSON.stringify(true),
  // Rol asignado a las cuentas de autocregistro
  "auth.rolRegistro": JSON.stringify("OPERADOR"),
};

async function main() {
  // ===== Roles =====
  for (const rol of ROLES) {
    await db.rol.upsert({
      where: { clave: rol.clave },
      create: {
        clave: rol.clave,
        nombre: rol.nombre,
        nombreEn: rol.nombreEn,
        descripcion: rol.descripcion,
        permisos: JSON.stringify(rol.permisos),
        sistema: rol.sistema,
      },
      update: {
        nombre: rol.nombre,
        nombreEn: rol.nombreEn,
        descripcion: rol.descripcion,
        // No sobrescribir permisos de roles existentes: se gestionan desde la app
      },
    });
  }
  console.log(`✔ ${ROLES.length} roles asegurados`);

  // ===== Usuarios iniciales =====
  for (const u of USUARIOS) {
    const rol = await db.rol.findUnique({ where: { clave: u.rolClave } });
    if (!rol) throw new Error(`Rol no encontrado: ${u.rolClave}`);
    const existente = await db.usuario.findUnique({ where: { correo: u.correo } });
    if (!existente) {
      await db.usuario.create({
        data: {
          nombre: u.nombre,
          correo: u.correo,
          passwordHash: await bcrypt.hash(u.password, 10),
          rolId: rol.id,
          activo: true,
        },
      });
      console.log(`✔ Usuario creado: ${u.correo}`);
    } else {
      console.log(`· Usuario ya existe: ${u.correo}`);
    }
  }

  // ===== Configuración =====
  for (const [clave, valor] of Object.entries(CONFIGURACION)) {
    await db.configuracion.upsert({
      where: { clave },
      create: { clave, valor },
      update: {}, // no sobrescribir cambios hechos desde la app
    });
  }
  console.log("✔ Configuración asegurada");

  const total = await db.usuario.count();
  console.log(`\nSemilla completada. Usuarios en el sistema: ${total}`);
}

main()
  .catch((e) => {
    console.error("Error en la semilla:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
