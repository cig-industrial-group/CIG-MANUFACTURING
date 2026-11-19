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
 * CLIENTE PRISMA PARA POSTGRESQL
 * ==============================
 *
 * Migración de motor de archivo local → PostgreSQL (v1.1.1). La
 * aplicación sigue siendo agnóstica al motor: todo el mundo importa `db`
 * y consulta modelos. Este módulo ya NO contiene la lógica de
 * endurecimiento propia del motor anterior (modo de bitácora WAL,
 * tiempo de espera de bloqueo, pool forzado a 1): esos controles
 * dejaron de aplicar y se eliminaron por completo (cero código muerto).
 *
 * Con PostgreSQL la concurrencia y la resiliencia se resuelven así:
 *
 *  · POOL DE CONEXIONES: administrado NATIVAMENTE por Prisma y el
 *    servidor PostgreSQL. El pool por defecto de Prisma (num_cpus*2+1
 *    conexiones) se respeta: PostgreSQL es un servidor multi-conexión
 *    con MVCC; ya no existe el motivo del pool=1 (evitar errores de
 *    base ocupada dentro de la app). Si el operador desea acotarlo, declara
 *    `connection_limit` en la propia DATABASE_URL (visible para
 *    Prisma, el CLI y las herramientas pg_*).
 *
 *  · CONTENCIÓN DE ESCRITURA: la serialización de escritores que el
 *    motor anterior imponía físicamente ahora la garantiza el servidor con
 *    bloqueos de fila y el nivel de aislamiento Serializable de las
 *    transacciones de negocio (ver src/lib/reintentos.ts, que además
 *    reintenta las anomalías 40001/40P01 que SSI puede reportar).
 *
 *  · VERIFICACIÓN AL ARRANQUE: verificarConexionBD() ejecuta un
 *    SELECT 1 ligerísimo; la llama src/instrumentation.ts ANTES de
 *    atender peticiones. Si la base no está disponible, el arranque
 *    falla (fail-fast): mejor un contenedor reiniciando que un
 *    sistema "vivo" que rompe cada petición.
 *
 * Referencias: NIST SP 800-53 SC-5 (protección contra denegación:
 * pool dimensionado por el servidor en lugar de cola artificial),
 * SI-10 (prediccibilidad de la capa de datos); ISO 27001 A.8.6
 * (gestión de capacidad) y A.12.1.2 (control de cambios: eliminación
 * auditada de los controles del motor de archivo anterior); OWASP ASVS 5.4.1 (integridad).
 */
import { PrismaClient } from "@prisma/client";
import path from "node:path";

/** Esquemas de URL aceptados para PostgreSQL. */
const ESQUEMAS_PG = new Set(["postgresql:", "postgres:"]);

/**
 * ¿La URL de conexión apunta a un servidor PostgreSQL? Se valida al
 * cargar el módulo: detectar aquí un .env con sintaxis de otro motor
 * (p. ej. `file:` heredada de la era del motor de archivo) evita errores
 * crípticos del driver más adelante.
 */
export function esURLPostgreSQL(url: string | undefined): url is string {
  if (typeof url !== "string" || url.length === 0) return false;
  try {
    return ESQUEMAS_PG.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/**
 * Raíz de los archivos locales de la máquina (respaldos, branding,
 * credenciales) — variable de entorno DATA_DIR (metodología 12-Factor:
 * la configuración vive en el entorno; defecto ./db para desarrollo).
 * NUNCA se infiere de DATABASE_URL: la URL de PostgreSQL no describe
 * un archivo local. Fuente canónica: la usan el módulo de respaldo y
 * el de branding para resolver sus rutas de forma idéntica.
 */
export function directorioDatos(): string {
  const configurado = process.env.DATA_DIR?.trim();
  if (!configurado) return path.resolve(process.cwd(), "db");
  return path.isAbsolute(configurado) ? configurado : path.resolve(process.cwd(), configurado);
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  verificacionBD: Promise<void> | undefined;
};

// Fail-fast temprano: DATABASE_URL debe ser una URL de PostgreSQL.
// Sin DATABASE_URL se delega en PrismaClient (error claro de arranque).
if (
  typeof process.env.DATABASE_URL === "string" &&
  process.env.DATABASE_URL.length > 0 &&
  !esURLPostgreSQL(process.env.DATABASE_URL)
) {
  throw new Error(
    "[bd] DATABASE_URL no es una URL de PostgreSQL (esperado postgresql://usuario:clave@host:puerto/base). " +
      "Si conservas una URL file: del motor de archivo anterior, actualiza tu .env a partir de .env.example.",
  );
}

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Verificación de conectividad al ARRANQUE. Idempotente (una vez por
 * proceso; la promesa se cachea a nivel global, sobrevive al HMR de
 * dev). Ejecuta un SELECT 1 parametrizado (tag template: sin entrada
 * de usuario, sin concatenación). La ejecuta src/instrumentation.ts
 * ANTES de que el servidor atienda peticiones; si la base no está
 * disponible, el error burbujea y el arranque se detiene.
 */
export function verificarConexionBD(): Promise<void> {
  if (!globalForPrisma.verificacionBD) {
    globalForPrisma.verificacionBD = db.$queryRaw`SELECT 1`.then(() => undefined);
  }
  return globalForPrisma.verificacionBD;
}
