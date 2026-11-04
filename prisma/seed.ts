/**
 * SEMILLA DEL SISTEMA — Roles, configuración y administrador inicial.
 *
 * Diseño de seguridad (auditoría C-6):
 *  · Roles y configuración: idempotentes (upsert sin sobrescribir
 *    valores gestionados desde la aplicación). Puede ejecutarse
 *    siempre sin efectos secundarios.
 *  · Usuarios: SOLO se crean en una base de datos SIN usuarios
 *    (primera instalación). Nunca se recrean cuentas eliminadas y
 *    jamás existen contraseñas fijas publicadas:
 *      - ADMIN_PASSWORD del entorno → se valida contra la política
 *        del sistema y se usa como contraseña del administrador.
 *      - Sin ADMIN_PASSWORD → contraseña ALEATORIA (144 bits) que se
 *        escribe UNA VEZ en credenciales-iniciales.txt (permisos 0600,
 *        junto a la base de datos) y obliga a cambiarla en el primer
 *        acceso (debeCambiarPassword=true).
 *    La contraseña NUNCA se imprime por consola.
 *
 * Uso: bun prisma/seed.ts   (ADMIN_PASSWORD=... para fijarla)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const db = new PrismaClient();

/** Mismo criterio que cumplePoliticaPassword() del módulo de autenticación. */
function cumplePolitica(password: string): boolean {
  return (
    password.length >= 8 && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(password) && /[0-9]/.test(password)
  );
}

/** Contraseña aleatoria fuerte (24 chars base64url ≈ 144 bits). */
function passwordAleatoria(): string {
  return randomBytes(18).toString("base64url");
}

/** Ruta del archivo de la BD a partir de DATABASE_URL (file:...). */
function rutaBaseDatos(): string {
  const url = process.env.DATABASE_URL ?? "";
  const limpia = url.replace(/^file:/, "");
  return path.isAbsolute(limpia) ? limpia : path.resolve(process.cwd(), limpia);
}

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

const CORREO_ADMIN = "admin@cig-manufacturing.com";

const CONFIGURACION: Record<string, string> = {
  // Registro público de usuarios: DESHABILITADO por defecto en
  // instalaciones nuevas (auditoría M-1). El administrador puede
  // habilitarlo desde el módulo Ajustes.
  "auth.registroHabilitado": JSON.stringify(false),
  // Recuperación automática por código: DESHABILITADA por defecto
  // (auditoría M-2/C-4: el sistema no tiene SMTP y el código se
  // entrega en la respuesta). Habilitar conscientemente en Ajustes.
  "auth.recuperacionHabilitada": JSON.stringify(false),
  // Rol asignado a las cuentas de autoregistro
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

  // ===== Configuración =====
  for (const [clave, valor] of Object.entries(CONFIGURACION)) {
    await db.configuracion.upsert({
      where: { clave },
      create: { clave, valor },
      update: {}, // no sobrescribir cambios hechos desde la app
    });
  }
  console.log("✔ Configuración asegurada");

  // ===== Administrador inicial: SOLO en una base sin usuarios =====
  const totalUsuarios = await db.usuario.count();
  if (totalUsuarios > 0) {
    console.log(`· Ya existen ${totalUsuarios} usuarios — no se crean cuentas (las existentes se conservan).`);
  } else {
    const rol = await db.rol.findUnique({ where: { clave: "ADMIN" } });
    if (!rol) throw new Error("Rol no encontrado: ADMIN");

    const passwordEntorno = process.env.ADMIN_PASSWORD;
    let password: string;
    let origen: "entorno" | "aleatoria";

    if (passwordEntorno !== undefined && passwordEntorno !== "") {
      if (!cumplePolitica(passwordEntorno)) {
        throw new Error(
          "ADMIN_PASSWORD no cumple la política (mínimo 8 caracteres, al menos una letra y un número).",
        );
      }
      password = passwordEntorno;
      origen = "entorno";
    } else {
      password = passwordAleatoria();
      origen = "aleatoria";
    }

    await db.usuario.create({
      data: {
        nombre: "Administrador del Sistema",
        correo: CORREO_ADMIN,
        passwordHash: await bcrypt.hash(password, 10),
        rolId: rol.id,
        activo: true,
        // Obligar a cambiar la contraseña en el primer acceso.
        debeCambiarPassword: true,
      },
    });

    if (origen === "entorno") {
      console.log(`✔ Usuario administrador creado: ${CORREO_ADMIN} (contraseña: ADMIN_PASSWORD del entorno)`);
    } else {
      // Contraseña aleatoria: escribir UNA VEZ junto a la BD (permisos 600).
      const archivo = path.join(path.dirname(rutaBaseDatos()), "credenciales-iniciales.txt");
      const contenido =
        `CIG-MANUFACTURING — Credenciales iniciales (primera instalación)\n` +
        `Fecha: ${new Date().toISOString()}\n` +
        `Usuario: ${CORREO_ADMIN}\n` +
        `Contraseña: ${password}\n` +
        `\nCAMBIA esta contraseña al iniciar sesión y ELIMINA este archivo.\n` +
        `Este archivo solo se crea cuando la base de datos no tenía usuarios.\n`;
      fs.writeFileSync(archivo, contenido, { mode: 0o600 });
      console.log(`✔ Usuario administrador creado: ${CORREO_ADMIN}`);
      console.log(`✔ Contraseña aleatoria generada y guardada (permisos 600) en: ${archivo}`);
      console.log("  → Cámbiala en el primer inicio de sesión y borra el archivo.");
    }
  }

  const total = await db.usuario.count();
  console.log(`\nSemilla completada. Usuarios en el sistema: ${total}`);
}

main()
  .catch((e) => {
    console.error("Error en la semilla:", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
