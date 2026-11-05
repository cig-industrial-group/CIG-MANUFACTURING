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
 * CLIENTE PRISMA + ENDURECIMIENTO DE CONEXIÓN (remediación Fase 2)
 * ==================================================================
 *
 * Toda la especificidad de motor vive SOLO en este módulo, con compuerta
 * por esquema de URL (`file:` = SQLite). El resto de la aplicación
 * importa `db` y consulta modelos sin conocer el motor: al migrar a
 * PostgreSQL (producción) basta cambiar DATABASE_URL — este módulo se
 * vuelve no-op y ningún otro archivo se toca (agnóstico al motor).
 *
 * Controles aplicados (verificados empíricamente contra Prisma 6.11.1,
 * ver scripts/prueba-humo-fase2.ts):
 *
 *  1. `connection_limit=1` — el pool mantiene EXACTAMENTE una conexión.
 *     Las peticiones concurrentes forman cola en el pool (medido: una
 *     consulta durante una transacción de 4 s espera y sale bien; jamás
 *     se abre una 2.ª conexión). Elimina SQLITE_BUSY *dentro* de la app.
 *     Se fuerza aquí por código (defensa en profundidad: aunque alguien
 *     olvide el parámetro en el .env, la app lo aplica) y además se
 *     declara en .env / Dockerfile / docker-compose por visibilidad de
 *     despliegue. Si el operador fija OTRO connection_limit explícito,
 *     se respeta su criterio.
 *
 *  2. `PRAGMA journal_mode=WAL` — Write-Ahead Logging. Persiste EN EL
 *     ARCHIVO (una vez activo sobrevive a reinicios, scripts y al CLI
 *     de Prisma). Los lectores externos (CLI de operaciones, monitoreo,
 *     respaldo en frío de un contenedor detenido) dejan de bloquear al
 *     escritor. El respaldo en caliente de la app (`VACUUM INTO`,
 *     módulo Respaldo) produce una copia consistente completa bajo WAL
 *     (verificado). La restauración es copia de datos por SQL en una
 *     transacción: nunca reemplaza el archivo, así que el modo no se
 *     pierde; y si alguien restaura un archivo ajeno por fuera, el
 *     bootstrap del arranque re-aplica WAL (auto-sanación).
 *
 *  3. `PRAGMA busy_timeout=5000` — por CONEXIÓN. Con pool=1 no hay
 *     contienda interna; protege la única conexión contra cerrojos de
 *     escritura de procesos EXTERNOS (mantenimiento con sqlite3 CLI,
 *     despliegue): el motor espera hasta 5 s internamente en lugar de
 *     devolver SQLITE_BUSY de inmediato. Complementa (no sustituye) al
 *     envoltorio de reintentos de la Fase 3.
 *
 * Decisiones explícitas (lo que NO se toca y por qué):
 *  · `PRAGMA synchronous` — permanece FULL (valor por defecto). En WAL,
 *    FULL hace fsync del WAL en cada commit: no se relaja durabilidad
 *    a cambio de rendimiento en un sistema de inventario.
 *  · `PRAGMA wal_autocheckpoint` — por defecto (1000 páginas ≈ 4 MB):
 *    el archivo -wal permanece acotado y se integra solo. Al cerrar la
 *    última conexión, SQLite hace checkpoint y elimina -wal (verificado:
 *    la copia en frío de un contenedor detenido sigue siendo segura).
 *  · Fallo al EJECUTAR los pragmas (BD inaccesible) → el arranque falla
 *    (fail-fast en instrumentation.ts): mejor contenedor reiniciando
 *    que un sistema "vivo" que rompe cada petición.
 *  · WAL no aplicable (p. ej. sistema de archivos de red sin memoria
 *    compartida) → se ADIERTE y se continúa en journal de reversa:
 *    es degradación de concurrencia, no de integridad.
 *
 * Referencias: NIST SP 800-53 SC-5 (protección contra denegación:
 * colas ordenadas en lugar de errores), SI-10 (prediccibilidad de la
 * capa de datos); ISO 27001 A.8.6/A.8.25 (gestión de capacidad y
 * aprobación de cambios en el entorno); OWASP ASVS 5.4.1 (integridad).
 */
import { PrismaClient } from "@prisma/client";

/** Espera interna de SQLite (ms) ante un cerrojo de escritura externo. */
export const BUSY_TIMEOUT_MS = 5000;

/** Estado de la conexión tras el arranque (sin rutas ni secretos). */
export type InfoConexionBD = {
  motor: "sqlite" | "otro";
  modoJournal: string | null;
  busyTimeoutMs: number | null;
};

/** ¿La URL de conexión apunta a un archivo SQLite (esquema file:)? */
function esSQLite(url: string | undefined): url is string {
  return typeof url === "string" && url.startsWith("file:");
}

/**
 * Normaliza una URL de conexión: en SQLite fuerza el parámetro
 * `connection_limit=1` (pool de una conexión) si no viene declarado.
 * Cualquier otro motor (p. ej. postgresql://) se devuelve INTACTO:
 * aquí vive la única ramificación por motor de toda la app.
 */
export function urlSQLiteSegura(url: string | undefined): string | undefined {
  if (!esSQLite(url) || url.includes("connection_limit=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=1`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  preparacionBD: Promise<InfoConexionBD> | undefined;
};

const urlConfigurada = process.env.DATABASE_URL;

export const db =
  globalForPrisma.prisma ??
  new PrismaClient(
    // Sin DATABASE_URL se delega en PrismaClient (error claro de arranque).
    urlConfigurada
      ? { datasources: { db: { url: urlSQLiteSegura(urlConfigurada) as string } } }
      : undefined,
  );

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/**
 * Endurecimiento de conexión al ARRANQUE. Idempotente (una vez por
 * proceso; la promesa se cachea a nivel global, sobrevive al HMR de
 * dev). No-op para motores distintos de SQLite. La ejecuta
 * src/instrumentation.ts ANTES de que el servidor atienda peticiones.
 */
export function prepararConexionBD(): Promise<InfoConexionBD> {
  if (!esSQLite(process.env.DATABASE_URL)) {
    return Promise.resolve({ motor: "otro", modoJournal: null, busyTimeoutMs: null });
  }
  if (!globalForPrisma.preparacionBD) {
    globalForPrisma.preparacionBD = (async (): Promise<InfoConexionBD> => {
      // 1) WAL: cambia el modo del ARCHIVO (persistente). No puede
      //    ejecutarse dentro de una transacción; por query crudo va fuera.
      const modo = await db.$queryRawUnsafe<Array<{ journal_mode: string }>>(
        "PRAGMA journal_mode=WAL;",
      );
      const modoJournal = modo[0]?.journal_mode ?? "desconocido";
      if (modoJournal !== "wal") {
        console.warn(
          `[bd] journal_mode=WAL no pudo aplicarse (modo actual: ${modoJournal}). ` +
            "La base operará con journal de reversa: los lectores externos bloquean al escritor. " +
            "Revise el sistema de archivos del volumen de datos.",
        );
      }

      // 2) busy_timeout: por conexión. El pool tiene UNA conexión y es
      //    la que la app usará siempre. SQLite devuelve enteros como
      //    BigInt en queries crudos: se normaliza a Number.
      const timeout = await db.$queryRawUnsafe<Array<{ timeout: bigint }>>(
        `PRAGMA busy_timeout=${BUSY_TIMEOUT_MS};`,
      );
      const busyTimeoutMs =
        timeout[0] !== undefined ? Number(timeout[0].timeout) : null;

      return { motor: "sqlite", modoJournal, busyTimeoutMs };
    })();
  }
  return globalForPrisma.preparacionBD;
}
