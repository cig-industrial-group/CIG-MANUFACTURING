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
 * POSBUILD — Coloca los assets estáticos en el lugar correcto del build standalone.
 *
 * Por qué existe: con `output: "standalone"`, Next.js genera .next/standalone/server.js,
 * pero NO incluye dentro de esa carpeta ni los assets del cliente (.next/static)
 * ni los archivos públicos (public/): hay que copiarlos manualmente junto al server.js.
 *
 * En Next.js 16, si el proyecto se compila dentro de un workspace (monorepo, carpeta
 * con .git/package.json por encima), server.js puede quedar anidado con la ruta del
 * proyecto (p. ej. .next/standalone/apps/web/server.js). Este script localiza
 * server.js donde esté y copia:
 *
 *     .next/static  →  <carpeta de server.js>/.next/static
 *     public/       →  <carpeta de server.js>/public
 *
 * Funciona en Linux, macOS y Windows (usa fs.cpSync de Node, sin comandos externos).
 * Uso:  node scripts/posbuild.mjs    (se ejecuta automáticamente con `npm run build`)
 */
import { cpSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const RAIZ = process.cwd();
const STANDALONE = join(RAIZ, ".next", "standalone");
const STATIC = join(RAIZ, ".next", "static");
const PUBLIC = join(RAIZ, "public");

if (!existsSync(STANDALONE)) {
  console.error("✖ No existe .next/standalone — ejecuta primero `next build` (¿desactivaste output: 'standalone'?).");
  process.exit(1);
}

// --- Localizar server.js dentro del standalone (BFS: gana el más superficial) ---
let servidor = null;
let nivel = [STANDALONE];
for (let profundidad = 0; profundidad <= 6 && !servidor; profundidad++) {
  const siguiente = [];
  for (const dir of nivel) {
    for (const entrada of readdirSync(dir)) {
      if (entrada === "node_modules") continue;
      const ruta = join(dir, entrada);
      if (statSync(ruta).isDirectory()) {
        siguiente.push(ruta);
      } else if (entrada === "server.js" && !servidor) {
        servidor = ruta;
      }
    }
  }
  nivel = siguiente;
}

if (!servidor) {
  console.error("✖ No se encontró server.js dentro de .next/standalone.");
  process.exit(1);
}

const DESTINO = dirname(servidor);
console.log(`▸ server.js detectado en: .next/standalone/${relative(STANDALONE, DESTINO) || "(raíz)"}`);

// --- Copiar .next/static → DESTINO/.next/static ---
if (existsSync(STATIC)) {
  cpSync(STATIC, join(DESTINO, ".next", "static"), { recursive: true, force: true });
  console.log("✔ Assets del cliente copiados  (.next/static)");
} else {
  console.log("· No había .next/static que copiar");
}

// --- Copiar public → DESTINO/public ---
if (existsSync(PUBLIC)) {
  cpSync(PUBLIC, join(DESTINO, "public"), { recursive: true, force: true });
  console.log("✔ Archivos públicos copiados  (public/)");
} else {
  console.log("· No había carpeta public/ que copiar");
}

console.log("✓ Postbuild completado — el standalone está listo para ejecutarse.");
