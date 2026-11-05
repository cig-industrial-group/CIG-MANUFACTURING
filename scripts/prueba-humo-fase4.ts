/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * PRUEBA DE HUMO — FASE 4 (hardening de sesiones y cookies, ADR-007)
 * ============================================================================
 * Ejercita los MANEJADORES REALES de /api/auth/login y /api/auth/logout
 * contra la BD de desarrollo (usuario temporal creado y purgado por la
 * propia prueba) y afirma, tras logins reales, la matriz completa de
 * atributos de la cookie `cig_manufacturing_sesion`:
 *
 *   1. PRODUCCIÓN (NODE_ENV=production, AUTH_SECRET válido, SIN
 *      COOKIE_INSEGURA_HTTP): Set-Cookie con HttpOnly, SameSite=Strict,
 *      Path=/, Secure y Max-Age=86400 (24 h).
 *   2. PRODUCCIÓN con COOKIE_INSEGURA_HTTP=1 (LAN sin TLS): mismos
 *      atributos EXCEPTO Secure, que debe estar AUSENTE.
 *   3. DESARROLLO (NODE_ENV=development): sin Secure, resto idéntico.
 *   4. LOGOUT en producción: cookie de eliminación con Max-Age=0,
 *      HttpOnly, SameSite=Strict, Path=/ y Secure.
 *   5. JWT emitido (jose, HS256): exp − iat = 86400, sub = id del usuario,
 *      y verificarTokenSesion() lo resuelve contra el secreto en vigor.
 *   6. La verificación RECHAZA un token vencido y uno firmado con otro
 *      secreto (la expiración y la firma se aplican de verdad).
 *   7. Limpieza: el usuario temporal se elimina y el entorno se restaura.
 *
 * NOTA: la prueba fija su PROPIO AUTH_SECRET aleatorio (válido) antes de
 * importar los módulos, de modo que el modo producción no dependa del
 * secreto que haya en .env, y no altera ningún dato preexistente.
 *
 * Ejecutar: bun scripts/prueba-humo-fase4.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { SignJWT } from "jose";

// ============================================================
// CARGA EXPLÍCITA DEL .env DEL PROYECTO (antes de importar los
// módulos bajo prueba, que leen DATABASE_URL al cargarse). La
// resolución automática de bun puede preferir el .env de un
// directorio superior: aquí se fija la real (patrón fase 2/3).
// ============================================================
function cargarEnvProyecto(): void {
  const directorioScript = path.dirname(fileURLToPath(import.meta.url));
  const rutaEnv = path.resolve(directorioScript, "..", ".env");
  for (const linea of fs.readFileSync(rutaEnv, "utf8").split("\n")) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && m[2] !== "") process.env[m[1]] = m[2];
  }
}
cargarEnvProyecto();

// ============================================================
// ENTORNO CONTROLADO: producción con secreto válido y sin escape
// LAN, ANTES de importar los módulos bajo prueba.
// ============================================================
const ENTORNOOriginal = {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_SECRET: process.env.AUTH_SECRET,
  COOKIE_INSEGURA_HTTP: process.env.COOKIE_INSEGURA_HTTP,
};
// Escritura de entorno de solo runtime: NODE_ENV se declara readonly en los
// tipos de Next, aunque Node/Bun permiten reasignarlo. Se escribe por índice.
const envRuntime = process.env as unknown as Record<string, string | undefined>;
function fijarEnv(clave: string, valor: string | undefined): void {
  if (valor === undefined) delete envRuntime[clave];
  else envRuntime[clave] = valor;
}
function restaurarEntorno(): void {
  for (const [clave, valor] of Object.entries(ENTORNOOriginal)) fijarEnv(clave, valor);
}
// Secreto aleatorio de 64 hex chars (256 bits) — válido para producción.
const SECRETO_PRUEBA = Array.from({ length: 32 }, () =>
  Math.floor(Math.random() * 256)
    .toString(16)
    .padStart(2, "0"),
).join("");
fijarEnv("NODE_ENV", "production");
fijarEnv("AUTH_SECRET", SECRETO_PRUEBA);
fijarEnv("COOKIE_INSEGURA_HTTP", undefined);

// Importación DINÁMICA: se ejecuta tras fijar el entorno.
const { POST: iniciarSesion } = await import("../src/app/api/auth/login/route");
const { POST: cerrarSesion } = await import("../src/app/api/auth/logout/route");
const {
  COOKIE_SESION,
  hashearPassword,
  verificarTokenSesion,
} = await import("../src/modulos/autenticacion/servicios/auth");
const { db } = await import("../src/lib/db");

let fallas = 0;
function afirmar(condicion: boolean, mensaje: string) {
  console.log(`  ${condicion ? "✔" : "✗ FALLO"} — ${mensaje}`);
  if (!condicion) fallas++;
}

const CORREO_PRUEBA = "fase4.humo@cig-manufacturing.com";
const PASSWORD_PRUEBA = "Humo*Fase4*2026";
const DURACION_ESPERADA_SEG = 60 * 60 * 24; // 24 h (ADR-007)

interface AtributosCookie {
  [atributo: string]: string | true;
}

/** Extrae la cookie de sesión del Set-Cookie de una respuesta real. */
function cookieDeSesion(respuesta: Response): string | null {
  const crudas =
    typeof respuesta.headers.getSetCookie === "function"
      ? respuesta.headers.getSetCookie()
      : (respuesta.headers.get("set-cookie") ?? "").split(/,(?=[^;]+\s*=)/);
  const conSesion = crudas.filter((c) => c.startsWith(`${COOKIE_SESION}=`));
  return conSesion.length > 0 ? conSesion[0] : null;
}

/** Parsea una cookie Set-Cookie cruda en pares atributo→valor. */
function parsearAtributos(cruda: string): AtributosCookie {
  const atributos: AtributosCookie = {};
  for (const parte of cruda.split(";").slice(1)) {
    const limpio = parte.trim();
    if (!limpio) continue;
    const [nombre, ...resto] = limpio.split("=");
    atributos[nombre.trim().toLowerCase()] = resto.length > 0 ? resto.join("=") : true;
  }
  return atributos;
}

/** Ejecuta un login REAL contra el manejador real de la ruta. */
async function login(correo: string, password: string): Promise<Response> {
  return iniciarSesion(
    new Request("http://127.0.0.1:3000/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
      body: JSON.stringify({ correo, password }),
    }),
  );
}

/** Decodifica el payload de un JWT (solo lectura, sin verificar). */
function decodificarJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const [h, p] = token.split(".");
  const dec = (s: string) => JSON.parse(Buffer.from(s, "base64url").toString("utf8")) as Record<string, unknown>;
  return { header: dec(h), payload: dec(p) };
}

/** Afirma la política de atributos común (HttpOnly, SameSite, Path, Max-Age). */
function afirmarPoliticaComun(atributos: AtributosCookie, maxAgeEsperado: number, escenario: string): void {
  afirmar(atributos["httponly"] === true, `${escenario}: HttpOnly presente`);
  // RFC 6265bis: los valores de SameSite son case-insensitive; Next serializa
  // "strict" en minúsculas (verificado empíricamente), el navegador lo trata
  // igual que "Strict".
  const samesite = atributos["samesite"];
  afirmar(
    typeof samesite === "string" && samesite.toLowerCase() === "strict",
    `${escenario}: SameSite=Strict (serializado: ${String(samesite)})`,
  );
  afirmar(atributos["path"] === "/", `${escenario}: Path=/`);
  afirmar(
    atributos["max-age"] === String(maxAgeEsperado),
    `${escenario}: Max-Age=${maxAgeEsperado} (obtenido: ${String(atributos["max-age"])})`,
  );
}

async function main(): Promise<void> {
  console.log("PRUEBA DE HUMO — FASE 4: hardening de sesiones y cookies (ADR-007)\n");

  // Limpieza defensiva de ejecuciones previas interrumpidas.
  await db.usuario.deleteMany({ where: { correo: CORREO_PRUEBA } });

  const rolAdmin = await db.rol.findUnique({ where: { clave: "ADMIN" } });
  if (!rolAdmin) throw new Error("La semilla no creó el rol ADMIN: ejecuta setup.sh primero.");
  const usuario = await db.usuario.create({
    data: {
      nombre: "Humo Fase 4",
      correo: CORREO_PRUEBA,
      passwordHash: await hashearPassword(PASSWORD_PRUEBA),
      rolId: rolAdmin.id,
      activo: true,
      debeCambiarPassword: false,
    },
  });

  let tokenEscenarioA = "";
  try {
    // ---------- Escenario A: producción SIN COOKIE_INSEGURA_HTTP ----------
    console.log("Escenario A — producción (NODE_ENV=production, sin COOKIE_INSEGURA_HTTP):");
    const respA = await login(CORREO_PRUEBA, PASSWORD_PRUEBA);
    afirmar(respA.status === 200, `login → 200 (obtenido: ${respA.status})`);
    const cuerpoA = (await respA.json()) as { usuario?: { id?: string } };
    afirmar(cuerpoA.usuario?.id === usuario.id, "el cuerpo responde con el usuario autenticado");
    const crudaA = cookieDeSesion(respA);
    afirmar(crudaA !== null, `Set-Cookie emite la cookie ${COOKIE_SESION}`);
    if (crudaA) {
      const atributos = parsearAtributos(crudaA);
      afirmarPoliticaComun(atributos, DURACION_ESPERADA_SEG, "A");
      afirmar(atributos["secure"] === true, "A: Secure presente (producción con HTTPS)");
      tokenEscenarioA = crudaA.split(";")[0].slice(COOKIE_SESION.length + 1);
    }

    // ---------- JWT emitido: algoritmo, expiración y sujeto ----------
    console.log("\nJWT emitido (jose, HS256):");
    if (tokenEscenarioA) {
      const { header, payload } = decodificarJwt(tokenEscenarioA);
      afirmar(header.alg === "HS256", `alg HS256 (obtenido: ${String(header.alg)})`);
      const exp = Number(payload.exp);
      const iat = Number(payload.iat);
      afirmar(
        exp - iat === DURACION_ESPERADA_SEG,
        `exp − iat = ${exp - iat} s (esperado ${DURACION_ESPERADA_SEG} = 24 h)`,
      );
      afirmar(payload.sub === usuario.id, "sub = id del usuario");
      const verificado = await verificarTokenSesion(tokenEscenarioA);
      afirmar(verificado === usuario.id, "verificarTokenSesion() resuelve al usuario");
    } else {
      afirmar(false, "sin token no se puede verificar el JWT (fallo en cadena del escenario A)");
    }

    // ---------- Escenario B: producción CON COOKIE_INSEGURA_HTTP=1 ----------
    console.log("\nEscenario B — producción con COOKIE_INSEGURA_HTTP=1 (LAN sin TLS):");
    fijarEnv("COOKIE_INSEGURA_HTTP", "1");
    const respB = await login(CORREO_PRUEBA, PASSWORD_PRUEBA);
    afirmar(respB.status === 200, `login → 200 (obtenido: ${respB.status})`);
    const crudaB = cookieDeSesion(respB);
    if (crudaB) {
      const atributos = parsearAtributos(crudaB);
      afirmarPoliticaComun(atributos, DURACION_ESPERADA_SEG, "B");
      afirmar(!("secure" in atributos), "B: Secure AUSENTE (escape LAN sin TLS operativo)");
    } else {
      afirmar(false, "B: la respuesta no emitió la cookie de sesión");
    }

    // ---------- Escenario C: desarrollo ----------
    console.log("\nEscenario C — desarrollo (NODE_ENV=development):");
    fijarEnv("NODE_ENV", "development");
    const respC = await login(CORREO_PRUEBA, PASSWORD_PRUEBA);
    afirmar(respC.status === 200, `login → 200 (obtenido: ${respC.status})`);
    const crudaC = cookieDeSesion(respC);
    if (crudaC) {
      const atributos = parsearAtributos(crudaC);
      afirmarPoliticaComun(atributos, DURACION_ESPERADA_SEG, "C");
      afirmar(!("secure" in atributos), "C: Secure ausente en desarrollo");
    } else {
      afirmar(false, "C: la respuesta no emitió la cookie de sesión");
    }

    // ---------- Escenario D: logout en producción ----------
    console.log("\nEscenario D — logout en producción (cookie de eliminación):");
    fijarEnv("NODE_ENV", "production");
    fijarEnv("COOKIE_INSEGURA_HTTP", undefined);
    const respD = await cerrarSesion();
    afirmar(respD.status === 200, `logout → 200 (obtenido: ${respD.status})`);
    const crudaD = cookieDeSesion(respD);
    if (crudaD) {
      const atributos = parsearAtributos(crudaD);
      afirmar(crudaD.split(";")[0] === `${COOKIE_SESION}=`, "D: la cookie se envía vacía");
      afirmarPoliticaComun(atributos, 0, "D");
      afirmar(atributos["secure"] === true, "D: Secure presente (eliminación en producción)");
    } else {
      afirmar(false, "D: la respuesta no emitió la cookie de eliminación");
    }

    // ---------- Escenario E: la verificación aplica expiración y firma ----------
    console.log("\nEscenario E — verificación del JWT (expiración y firma se aplican):");
    const secreto = new TextEncoder().encode(SECRETO_PRUEBA);
    const tokenVencido = await new SignJWT({ sub: usuario.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(secreto);
    afirmar((await verificarTokenSesion(tokenVencido)) === null, "un token VENCIDO no verifica (null)");

    const secretoAjeno = new TextEncoder().encode(`${SECRETO_PRUEBA}-ajeno`);
    const tokenAjeno = await new SignJWT({ sub: usuario.id })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(secretoAjeno);
    afirmar((await verificarTokenSesion(tokenAjeno)) === null, "un token firmado con OTRO secreto no verifica (null)");
  } finally {
    // ---------- Limpieza ----------
    await db.usuario.deleteMany({ where: { correo: CORREO_PRUEBA } });
    const restos = await db.usuario.count({ where: { correo: CORREO_PRUEBA } });
    afirmar(restos === 0, `usuario temporal purgado (quedan ${restos})`);
    restaurarEntorno();
    console.log("\n  ✔ — entorno restaurado (NODE_ENV/AUTH_SECRET/COOKIE_INSEGURA_HTTP)");
    await db.$disconnect();
  }

  console.log(
    fallas
      ? `\n✗ PRUEBA DE HUMO FALLIDA (${fallas} afirmaciones)`
      : `\n✔ PRUEBA DE HUMO COMPLETA: cookie de sesión con HttpOnly + SameSite=Strict + Path=/ + Secure condicional y JWT de 24 h verificados tras logins reales`,
  );
  process.exitCode = fallas ? 1 : 0;
}

main().catch(async (e) => {
  console.error("ERROR:", e);
  try {
    await db.usuario.deleteMany({ where: { correo: CORREO_PRUEBA } });
    await db.$disconnect();
  } catch {
    /* mejor esfuerzo */
  }
  restaurarEntorno();
  process.exitCode = 1;
});
