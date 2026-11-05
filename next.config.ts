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
};

export default nextConfig;
