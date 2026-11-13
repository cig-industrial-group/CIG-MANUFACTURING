/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import type { NextConfig } from "next";
import { fileURLToPath } from "url";

const nextConfig: NextConfig = {
  output: "standalone",
  /*
   * Raíz de trazado EXPLÍCITA (corrección técnica, Fase 3): Next infiere
   * la raíz buscando lockfiles hacia ARRIBA; si existe uno ajeno fuera del
   * proyecto (p. ej. ~/package-lock.json en la máquina que compila), el
   * output standalone queda anidado (.next/standalone/<camino>/server.js)
   * y el despliegue/CI, que esperan .next/standalone/server.js, se rompen.
   * Fijarla al directorio del proyecto hace el build determinista en
   * cualquier entorno (local, CI, Docker).
   */
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  /* config options here */
  reactStrictMode: false,
  /*
   * Cabeceras de seguridad globales (TASK-STR-009, hallazgo H8 del
   * pentest): se declaran en src/middleware.ts —no aquí— desde la
   * re-entrega. La CSP estática con `script-src 'self'` rompía la
   * hidratación de Next.js (scripts inline self.__next_f bloqueados); el
   * middleware genera un NONCE criptográfico único por petición, lo
   * inyecta en la CSP y lo propaga al renderizador, de modo que la app
   * hidrata sin 'unsafe-inline'/'unsafe-eval' en script-src. Ver
   * src/middleware.ts (RF-01 a RF-04) y el layout raíz (propagación del
   * nonce al <html>). Se mantienen aquí solo las configuraciones de
   * Next.js (output standalone, raíz de trazado determinista).
   */
};

export default nextConfig;
