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
 * MÓDULO: AJUSTES — Saneador de SVG (módulo PURO)
 *
 * TASK-STR-012, RF-C1: este archivo es un módulo PURO — sin imports de
 * infraestructura (@/lib/db, Prisma, node:fs…): solo Buffer y string.
 * La causa raíz de la ausencia de pruebas era que el saneador vivía en
 * branding.ts (que importa @/lib/db): vitest no puede importarlo sin
 * resolver el alias y trazar Prisma. Como módulo puro, la prueba unitaria
 * (src/lib/__tests__/svg.test.ts) lo importa por RUTA RELATIVA y corre
 * con `bun run test`. branding.ts lo importa para validar el logo.
 *
 * Historia: saneador original en TASK-STR-009 (hallazgo H4 — lista blanca
 * estricta de elementos; atributos de evento (on*), href, xlink:href y
 * filter fuera; url() externa neutralizada; máquina de estados lineal
 * con pila de descarte). TASK-STR-012 (RF-C3, hallazgo B-7/H4-bypass) añade las
 * PUERTAS FAIL-CLOSED para los vectores V-1…V-8: construcciones cuyo
 * texto «se ve» inerte para el saneador pero que el parser XML del
 * navegador interpreta de forma distinta (entidades, CDATA, comentarios,
 * esquemas ofuscados). Ante ellas se RECHAZA el archivo
 * (BRANDING_ARCHIVO_INVALIDO en la capa de ruta) — fail-closed antes
 * que saneamiento ambiguo.
 */

// ============================================================
// OLFACTEO DEL FORMATO (usado por branding.ts antes y después de sanear)
// ============================================================

/** SVG: texto XML con elemento raíz <svg> (se olfatea el inicio del archivo). */
export function esSvg(bytes: Buffer): boolean {
  const texto = bytes.subarray(0, 4096).toString("utf8").trimStart();
  if (texto.startsWith("<svg")) return true;
  // Puede llevar declaración XML / DOCTYPE antes del <svg>
  return /^<\?xml[\s\S]{0,2048}?<svg[\s>]/i.test(texto);
}

// ============================================================
// LISTA BLANCA DE ELEMENTOS (TASK-STR-009, RF-01)
// ============================================================

/**
 * Etiquetas permitidas en el SVG del logo (lista blanca estricta).
 *
 * Cualquier elemento FUERA de esta lista se elimina con todo su
 * contenido: los mecanismos de ejecución declarados en RF-01
 * (`script`, `foreignObject`, `iframe`, `a`, `animate`, `set`,
 * `handler`) y además cualquier elemento desconocido o prefijado
 * (p. ej. `<x:script>`, `<symbol>`, `<filter>`), que un enfoque de
 * sola lista negra dejaría pasar.
 */
const ETIQUETAS_SVG_PERMITIDAS = new Set([
  "svg", "g", "defs", "title", "desc", "path", "rect", "circle", "ellipse",
  "line", "polyline", "polygon", "text", "tspan", "linearGradient",
  "radialGradient", "stop", "clipPath", "mask", "pattern", "use", "image",
  "style",
]);

/**
 * Atributos con riesgo de ejecución/externalización: bloqueados siempre.
 * `on*` (eventos), `href`/`xlink:href` (navegación y carga externa) y
 * `filter` (referencia a filtros con URLs externas).
 */
const ATRIBUTOS_PELIGROSOS = /^(on[a-z]+|href|xlink:href|filter)$/i;

/**
 * Nombre local de una etiqueta, sin prefijo de espacio de nombres.
 * XML distingue mayúsculas (`linearGradient` ≠ `lineargradient`), así
 * que el nombre local se conserva EXACTO: la lista blanca compara la
 * grafía real de los elementos SVG. Las variantes en otra grafía
 * (`<SCRIPT>`, `<LinearGradient>`) no corresponden a elementos SVG
 * reales y caen fuera de la lista: también se eliminan.
 *
 * V-8 (RF-C3): se evalúa el nombre LOCAL, no el prefijo — `<s:script>`
 * con xmlns:s ligado al espacio de nombres de SVG ES un script y muere
 * por nombre local; `<s:rect>` es un rect válido y se conserva.
 */
function nombreLocalEtiqueta(etiqueta: string): string {
  return etiqueta.split(":").pop() ?? etiqueta;
}

/** ¿Está la etiqueta en la lista blanca (comparada por nombre local)? */
function etiquetaSvgPermitida(etiqueta: string): boolean {
  return ETIQUETAS_SVG_PERMITIDAS.has(nombreLocalEtiqueta(etiqueta));
}

/** Token del documento: texto entre etiquetas, o apertura/cierre completos. */
const PATRON_TOKEN =
  /[^<]+|<\/?([a-zA-Z][\w:.-]*)((?:"[^<"]*"|'[^<']*'|[^>"'<])*)>/g;

/** Atributo nombre=valor dentro de la sección de atributos de una etiqueta. */
const PATRON_ATRIBUTO = /([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g;

// ============================================================
// PUERTAS FAIL-CLOSED: VECTORES V-1…V-8 (TASK-STR-012, RF-C3)
// ============================================================

/** Razón de rechazo (código estable, sin secretos — apta para logs). */
export type RazonRechazoSvg =
  /** V-1: cualquier <!ENTITY declarado (el parser XML del navegador lo expande). */
  | "ENTIDAD_DECLARADA"
  /** V-1/V-2: DOCTYPE con subconjunto interno «[», sin cerrar o malformado. */
  | "DOCTYPE_INVALIDO"
  /** V-3: sección CDATA no cerrada o con «<» interno (puede reparsear). */
  | "CDATA_REPARSEABLE"
  /** V-4: comentario no cerrado o con «<» interno (puede reparsear). */
  | "COMENTARIO_REPARSEABLE"
  /** V-6: entidad en posición de NOMBRE (atributo o etiqueta). */
  | "ENTIDAD_EN_NOMBRE"
  /** V-6: esquema javascript:/vbscript:/data:text/html OFUSCADO con entidades en un valor. */
  | "ESQUEMA_PELIGROSO";

/** Resultado del saneamiento: éxitos con bytes; rechazo con la razón. */
export type ResultadoSaneamientoSvg =
  | { ok: true; bytes: Buffer }
  | { ok: false; razon: RazonRechazoSvg };

/**
 * DOCTYPE (V-1/V-2): valida y ELIMINA las declaraciones externas simples.
 *
 * Regla fail-closed: un subconjunto interno «[» —la única vía de declarar
 * ENTIDADES que el parser XML del navegador EXPANDE (V-1: &x; inocuo para
 * un saneador textual se convierte en <script> al parsear)— o una
 * declaración sin cerrar ⇒ rechazo. Un DOCTYPE externo simple (los que
 * emiten Illustrator/Inkscape) sigue ACEPTÁNDOSE y se elimina del
 * contenido servido: el navegador no carga DTDs externos y el documento
 * queda idéntico sin la declaración.
 *
 * El escaneo respeta comillas: un «>» dentro del identificador
 * público/sistema no corta la declaración (y un «[» dentro de comillas
 * no es subconjunto interno).
 */
function procesarDoctypes(texto: string): { ok: true; texto: string } | { ok: false } {
  let salida = "";
  let resto = texto;
  for (;;) {
    const inicio = resto.search(/<!doctype/i);
    if (inicio < 0) {
      salida += resto;
      return { ok: true, texto: salida };
    }
    salida += resto.slice(0, inicio);
    let comilla: string | null = null;
    let fin = -1;
    for (let j = inicio + 9; j < resto.length; j++) {
      const c = resto[j];
      if (comilla !== null) {
        if (c === comilla) comilla = null;
      } else if (c === '"' || c === "'") {
        comilla = c;
      } else if (c === "[") {
        // Subconjunto interno: ENTIDADES expandibles por el parser (V-1/V-2).
        return { ok: false };
      } else if (c === "<") {
        // «<» crudo fuera de comillas: DOCTYPE malformado (tras los
        // literales solo pueden venir «>» o «[»). Fail-closed: sin esto,
        // un DOCTYPE sin cerrar se comería el «>» de una etiqueta posterior.
        return { ok: false };
      } else if (c === ">") {
        fin = j;
        break;
      }
    }
    if (fin < 0) return { ok: false }; // declaración sin cerrar: XML inválido
    resto = resto.slice(fin + 1);
  }
}

/**
 * CDATA (V-3): texto opaco. Se acepta SOLO si está cerrado y su contenido
 * no contiene «<» — la firma de que puede reparsear como estructura en
 * otro contexto (el vector V-3 esconde </style><script> dentro de una
 * sección CDATA: para el saneador textual son tokens «inertes», para el
 * parser son texto… hasta que algo los reinterpreta). El CSS legítimo de
 * Inkscape (selectores como «g > rect», colores, fuentes) no contiene
 * «<» y pasa sin tocar.
 */
function cdataOpaca(texto: string): boolean {
  let desde = 0;
  for (;;) {
    const inicio = texto.indexOf("<![CDATA[", desde);
    if (inicio < 0) return true;
    const fin = texto.indexOf("]]>", inicio + 9);
    if (fin < 0) return false; // sin cerrar: XML inválido — fail-closed
    if (texto.slice(inicio + 9, fin).includes("<")) return false;
    desde = fin + 3;
  }
}

/**
 * Comentarios (V-4): texto opaco. Mismo criterio que CDATA: cerrados y
 * sin «<» interno (el vector V-4 oculta <script> dentro de un comentario
 * — incluida la variante «<!-->», donde el comentario NO se cierra donde
 * el ojo espera y todo lo que sigue es texto del comentario para el
 * parser, pero no para un saneador que no rastrea comentarios). Los
 * comentarios legítimos («<!-- Generator: Adobe Illustrator… -->») no
 * contienen «<» y pasan intactos.
 */
function comentariosOpacos(texto: string): boolean {
  let desde = 0;
  for (;;) {
    const inicio = texto.indexOf("<!--", desde);
    if (inicio < 0) return true;
    const fin = texto.indexOf("-->", inicio + 4);
    if (fin < 0) return false; // sin cerrar: el resto del documento es comentario
    if (texto.slice(inicio + 4, fin).includes("<")) return false;
    desde = fin + 3;
  }
}

/**
 * Decodifica las entidades que XML expande SIEMPRE (sin DTD): las
 * numéricas (&#115; / &#x73;) y las cinco predefinidas. Se usa para
 * evaluar el VALOR de un atributo tal y como lo verá el navegador (V-6:
 * java&#115;cript: DECODIFICA a javascript:). Las entidades con nombre no
 * predefinidas requieren DTD — y todo DOCTYPE con subconjunto interno ya
 * fue rechazado antes de llegar aquí.
 */
function decodificarEntidades(valor: string): string {
  return valor
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => caracterDeCodigo(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec: string) => caracterDeCodigo(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Codepoint → carácter (cadena vacía si el codepoint no es Unicode
 *  válido: el guard de rango cubre TODAS las condiciones en las que
 *  String.fromCodePoint lanzaría RangeError). */
function caracterDeCodigo(codigo: number): string {
  if (!Number.isInteger(codigo) || codigo < 0 || codigo > 0x10ffff) return "";
  return String.fromCodePoint(codigo);
}

/**
 * ¿El valor decodificado de un atributo ARRANCA con un esquema ejecutable?
 * (V-6: href="java&#115;cript:alert(1)"). Se normaliza como el parser de
 * URLs del navegador: tabuladores/CRLF se eliminan y el espacio inicial
 * se ignora — así «java\tscript:» también muere. Se exige que el esquema
 * esté AL PRINCIPIO del valor: «JavaScript: guía de estilo» en un title
 * legítimo NO dispara el rechazo (un esquema de URL solo existe al inicio).
 */
function esquemaPeligroso(valor: string): boolean {
  const normalizado = valor
    .replace(/[\t\n\r\f]/g, "")
    .replace(/^[\s\x00-\x1f]+/, "")
    .toLowerCase();
  return /^(javascript:|vbscript:|data:text\/html)/.test(normalizado);
}

/**
 * Puerta de ATRIBUTOS (V-5/V-6) sobre el texto crudo, etiqueta por
 * etiqueta (el tokenizador respeta comillas simples y dobles: el valor
 * «a>b» de data-x es un solo token y NO corta la etiqueta — V-5):
 *
 *  (a) Entidad en posición de NOMBRE: tras retirar los valores
 *      entrecomillados de la sección de atributos no puede quedar ningún
 *      «&». `on&#108;oad="alert(1)"` es un nombre de atributo con
 *      entidad numérica — inválido como XML, pero el saneador textual lo
 *      ignoraría y el navegador podría reinterpretarlo: rechazo.
 *      (Cubierto también el nombre de ETIQUETA con entidad: `<&#108;script>`
 *      deja un «<&» crudo que es siempre XML inválido — se rechaza antes.)
 *  (b) Esquema ejecutable OFUSCADO en el VALOR (V-6): valores que
 *      contienen entidades y que, tras decodificarlas, ARRANCAN con
 *      javascript:/vbscript:/data:text/html (java&#115;cript:alert(1)
 *      DECODIFICA a javascript:alert(1)) ⇒ rechazo. El esquema SIN
 *      ofuscar no llega a disparar esta puerta: href/xlink:href los
 *      elimina el pase de atributos del saneamiento (comportamiento
 *      original preservado) — lo que se castiga aquí es el intento de
 *      OCULTARLO, que ningún logo legítimo hace. La evaluación es como
 *      el parser de URLs del navegador: tab/CRLF se eliminan y el
 *      espacio inicial se ignora, pero el esquema debe estar AL
 *      PRINCIPIO (un title="JavaScript: guía" no dispara nada).
 */
function examinarAtributos(
  texto: string,
): { ok: true } | { ok: false; razon: RazonRechazoSvg } {
  PATRON_TOKEN.lastIndex = 0;
  let token: RegExpExecArray | null;
  while ((token = PATRON_TOKEN.exec(texto)) !== null) {
    const crudo = token[0];
    const nombre = token[1];
    if (nombre === undefined || crudo.startsWith("</")) continue; // texto o cierre
    const seccion = token[2] ?? "";

    // (a) Ninguna entidad en posición de nombre
    const sinValores = seccion.replace(/"[^<"]*"|'[^<']*'/g, "");
    if (sinValores.includes("&")) {
      return { ok: false, razon: "ENTIDAD_EN_NOMBRE" };
    }

    // (b) Esquemas ejecutables OFUSCADOS en valores (decodificados)
    PATRON_ATRIBUTO.lastIndex = 0;
    let atributo: RegExpExecArray | null;
    while ((atributo = PATRON_ATRIBUTO.exec(seccion)) !== null) {
      let valor = atributo[2] ?? "";
      if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
        valor = valor.slice(1, -1);
      }
      if (valor.includes("&") && esquemaPeligroso(decodificarEntidades(valor))) {
        return { ok: false, razon: "ESQUEMA_PELIGROSO" };
      }
    }
  }
  return { ok: true };
}

// ============================================================
// SANEAMIENTO ESTRUCTURAL (máquina de estados lineal, TASK-STR-009)
// ============================================================

/**
 * Elimina del texto toda ESTRUCTURA peligrosa en una sola pasada lineal.
 *
 * Máquina de estados con pila de descarte: se recorren los «tokens» del
 * documento (texto entre etiquetas, aperturas y cierres completos) y se
 * decide conservar o descartar cada uno:
 *
 * · Un elemento fuera de la lista blanca —los siete prohibidos por
 *   RF-01 (`script`, `foreignObject`, `iframe`, `a`, `animate`, `set`,
 *   `handler`) y cualquier otro desconocido o prefijado (p. ej.
 *   `<x:script>`, `<s:script>`, `<symbol>`)— se descarta CON TODO SU
 *   CONTENIDO: su apertura abre un marco de descarte que traga texto y
 *   etiquetas anidadas hasta cerrar su último anidamiento.
 * · Las etiquetas permitidas se conservan tal cual (byte a byte).
 * · Los cierres huérfanos de elementos no permitidos se descartan.
 *
 * ¿Por qué una máquina de estados y no los clásicos patrones
 * `<(etiqueta)…[\s\S]*?</etiqueta>`? Porque emparejar aperturas con
 * cierres mediante retroceso es CUADRÁTICO ante entradas adversarias:
 * medido con 2 MB de aperturas sin cerrar, >300 s de CPU por subida
 * (DoS del endpoint, permiso `ajustes.branding` requerido pero
 * explotable). Aquí cada token se reconoce con un patrón acotado por
 * el siguiente `<`, comilla o `>` —sin cuantificadores perezosos que
 * crucen el documento— de modo que el coste total es lineal en el
 * tamaño del archivo (ver benchmark de TASK-STR-012: RF-C4).
 *
 * Nota XML: el valor entrecomillado se acota con `[^<"]` porque `<`
 * crudo es ilegal en valores de atributo (debe venir como `&lt;`);
 * si aparece, el token no se reconoce, pasa como texto y el parser
 * XML del navegador —estricto, a diferencia del de HTML— rechaza el
 * archivo completo: no existe vía de derivación por ahí.
 */
function eliminarEstructuraPeligrosa(texto: string): string {
  /** Marcos abiertos: nombre de elemento y si su contenido se descarta */
  const pila: Array<{ nombre: string; descartado: boolean }> = [];
  /** Marcos de descarte abiertos (O(1) en lugar de recorrer la pila) */
  let descartesActivos = 0;

  return texto.replace(
    PATRON_TOKEN,
    (token: string, nombre: string | undefined) => {
      // Texto entre etiquetas: se conserva solo fuera de todo descarte
      if (nombre === undefined) {
        return descartesActivos > 0 ? "" : token;
      }
      // Cierre: buscar el marco correspondiente desde el tope. Los
      // cierres legítimos coinciden en el tope o muy cerca (input con
      // etiquetas sin cerrar, como un <img> dentro de un foreignObject
      // descartado, deja marcos intermedios); la búsqueda se acota a
      // 64 niveles para mantener el coste lineal ante basura anidada.
      if (token.startsWith("</")) {
        const suelo = Math.max(0, pila.length - 64);
        for (let i = pila.length - 1; i >= suelo; i--) {
          if (pila[i].nombre === nombre) {
            const marco = pila[i];
            while (pila.length > i) {
              const cerrado = pila.pop()!;
              if (cerrado.descartado) descartesActivos--;
            }
            return marco.descartado ? "" : token;
          }
        }
        // Cierre huérfano o entrelazado (input malformado): se conserva
        // únicamente si el elemento está permitido.
        return etiquetaSvgPermitida(nombre) ? token : "";
      }
      // Apertura (o autocierre): dentro de un descarte todo se traga
      const autoCierre = token.endsWith("/>");
      if (descartesActivos > 0 || !etiquetaSvgPermitida(nombre)) {
        if (!autoCierre) {
          pila.push({ nombre, descartado: true });
          descartesActivos++;
        }
        return "";
      }
      if (!autoCierre) pila.push({ nombre, descartado: false });
      return token;
    },
  );
}

// ============================================================
// SANEAMIENTO COMPLETO
// ============================================================

/**
 * Sanea el SVG del logo. Pasos:
 *
 *  0. PUERTAS FAIL-CLOSED (V-1…V-8): construcciones que un saneador
 *     textual no puede garantizar — entidades declaradas, subconjunto
 *     interno de DOCTYPE, CDATA/comentarios reparseables, entidades en
 *     nombres, esquemas ofuscados en valores — ⇒ RECHAZO (la capa de
 *     ruta lo traduce a BRANDING_ARCHIVO_INVALIDO 400). El DOCTYPE
 *     externo simple se ACEPTA y se elimina del contenido servido.
 *  1. ESTRUCTURA: lista blanca estricta (pasada lineal, pila de descarte).
 *  2. ATRIBUTOS: eventos (`on*`) y referencias externas (`href`,
 *     `xlink:href`, `filter`) fuera de cualquier etiqueta restante.
 *  3. URLS de estilos: `url(https://…)` y `@import "https://…"` se
 *     neutralizan a `#` (`data:` y `#id` siguen permitidos); igual que
 *     los esquemas ejecutables dentro de url() (defensa en profundidad).
 *
 * El coste es LINEAL en el tamaño del archivo (RF-C4): todas las
 * pasadas son de una sola pasada con patrones acotados.
 */
export function sanearSvg(bytes: Buffer): ResultadoSaneamientoSvg {
  let texto = bytes.toString("utf8");

  // ── Puerta 0a (V-1): ninguna ENTIDAD declarada en todo el documento ──
  // El parser XML del navegador EXPANDE las entidades del subconjunto
  // interno: «&x;» es texto inerte para este saneador pero se convierte
  // en «<script>alert(1)</script>» al parsear.
  if (/<!entity/i.test(texto)) {
    return { ok: false, razon: "ENTIDAD_DECLARADA" };
  }

  // ── Puerta 0b (V-1/V-2): DOCTYPE externo válido (se elimina) o rechazo ──
  const doctypes = procesarDoctypes(texto);
  if (!doctypes.ok) {
    return { ok: false, razon: "DOCTYPE_INVALIDO" };
  }
  texto = doctypes.texto;

  // ── Puerta 0c: entidad en posición de NOMBRE DE ETIQUETA ──
  // «<&#108;script>» deja un «<&» crudo: siempre XML inválido, pero no se
  // deja el veredicto al parser del navegador (fail-closed aquí).
  if (texto.includes("<&")) {
    return { ok: false, razon: "ENTIDAD_EN_NOMBRE" };
  }

  // ── Puerta 0d (V-3): CDATA como texto opaco ──
  if (!cdataOpaca(texto)) {
    return { ok: false, razon: "CDATA_REPARSEABLE" };
  }

  // ── Puerta 0e (V-4): comentarios como texto opaco ──
  if (!comentariosOpacos(texto)) {
    return { ok: false, razon: "COMENTARIO_REPARSEABLE" };
  }

  // ── Puerta 0f (V-5/V-6): atributos (nombres sin entidades; valores
  //    sin esquemas ejecutables, evaluados tras decodificar) ──
  const atributos = examinarAtributos(texto);
  if (!atributos.ok) {
    return { ok: false, razon: atributos.razon };
  }

  // ── 1. Elementos enteros prohibidos (script, foreignObject, animate,
  //    a, iframe, <s:script>…), incluido su contenido: lista blanca ──
  texto = eliminarEstructuraPeligrosa(texto);

  // ── 2. Atributos de evento y referencias externas en etiquetas restantes ──
  texto = texto.replace(
    /\s([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g,
    (atributo, nombreAtributo: string) =>
      ATRIBUTOS_PELIGROSOS.test(nombreAtributo) ? "" : atributo,
  );

  // ── 3. URLS externas en estilos/filtros (data: y #id siguen permitidos).
  //    El acotado {0,2048} limita el retroceso ante paréntesis sin cerrar.
  texto = texto.replace(/url\(\s*(['"]?)\s*(https?:|\/\/)[^)]{0,2048}\)/gi, "url($1#$1)");
  // V-7 (RF-C3): @import con URL externa — mismo criterio que url().
  // La retro-referencia \1 recoge la comilla de cierre para no dejar
  // basura sintáctica en la hoja de estilo.
  texto = texto.replace(/@import\s+(['"]?)\s*(https?:|\/\/)[^'")\s;]{0,2048}\1?/gi, "@import $1#$1");
  // Esquemas ejecutables dentro de url() (defensa en profundidad frente
  // a valores ofuscados que ya no llegan aquí por la puerta 0f).
  texto = texto.replace(
    /url\(\s*(['"]?)\s*(javascript:|vbscript:|data:text\/html)[^)]{0,2048}\)/gi,
    "url($1#$1)",
  );

  return { ok: true, bytes: Buffer.from(texto, "utf8") };
}
