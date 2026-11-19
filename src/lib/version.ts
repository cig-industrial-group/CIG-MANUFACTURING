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
 * VERSIÓN DEL SISTEMA — ÚNICA FUENTE DE VERDAD (SSOT) (TASK-STR-003)
 * ====================================================================
 *
 * La versión del sistema vive EXCLUSIVAMENTE en el campo "version" de
 * package.json; este módulo la exporta al resto del sistema. Queda
 * PROHIBIDO escribir la versión a mano en componentes, rutas API,
 * scripts de despliegue o documentación vigente: cualquier consumidor
 * debe importarla de aquí (o recibirla por prop), de modo que actualizar
 * package.json actualiza TODO el sistema sin riesgo de desincronización
 * (el defecto que esta arquitectura elimina: banners, pies de página y
 * health checks que mostraban versiones distintas tras cada liberación).
 *
 * ESTRATEGIA ELEGIDA — Server Components + props (documentada por orden
 * del contrato de la tarea):
 *   · Rutas API y Server Components: importan directamente
 *     VERSION_DEL_SISTEMA / ETIQUETA_VERSION_SISTEMA de este módulo
 *     (p. ej. el health check GET /api).
 *   · Client Components: NO importan este módulo — empaquetar
 *     package.json completo en el navegador inflaría el bundle del
 *     cliente sin necesidad. En su lugar reciben la versión como PROP
 *     desde un Server Component padre: así lo hace src/app/page.tsx
 *     (Server Component raíz) al renderizar el shell cliente
 *     (SistemaGestionFabrica), que la distribuye a sus pies de página.
 *   · Se descartó la alternativa process.env.NEXT_PUBLIC_APP_VERSION
 *     (variable inyectada en el build): exigiría replicar la versión en
 *     la configuración del entorno/CI, recreando justo la duplicación
 *     que este módulo elimina; la vía de props es explícita, tipada y
 *     verificable por el compilador.
 *
 * NOTA TÉCNICA: se importa con ruta relativa (../../package.json)
 * porque el alias "@/*" de tsconfig.json resuelve a ./src/* y
 * package.json vive en la raíz del proyecto; resolveJsonModule ya está
 * habilitado en tsconfig.json (sin configuración adicional).
 */
import pkg from "../../package.json";

/** Versión del sistema, tal cual está en package.json (p. ej. "2.1.0"). */
export const VERSION_DEL_SISTEMA: string = pkg.version;

/** Etiqueta lista para mostrar en UI, banners y consola (p. ej. "v2.1.0"). */
export const ETIQUETA_VERSION_SISTEMA: string = `v${VERSION_DEL_SISTEMA}`;
