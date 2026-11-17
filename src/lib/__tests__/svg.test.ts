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
 * PRUEBAS UNITARIAS DEL SANEADOR DE SVG (TASK-STR-012, RF-C2)
 * ============================================================
 *
 * Sujeto de prueba: src/modulos/ajustes/servicios/svg.ts — módulo PURO
 * (RF-C1: sin @/lib/db ni node:fs; solo Buffer/string), importado AQUÍ
 * por RUTA RELATIVA. Esta suite existe porque el saneador original
 * vivía en branding.ts (que importa @/lib/db) y vitest no podía
 * cargarlo sin resolver el alias: la causa raíz de la ausencia de
 * pruebas. Ahora son PERMANENTES y corren con `bun run test`.
 *
 * Cobertura de casos:
 *  · Los 16 CASOS ORIGINALES del alcance de TASK-STR-009 (H4): los 7
 *    elementos prohibidos por RF-01 (script, foreignObject, iframe, a,
 *    animate, set, handler) más los 9 vectores de su validación E2E
 *    (onload en la raíz, onmouseover, onclick, xlink:href="javascript:",
 *    href externo en <image>, url(https://) en estilos, elemento
 *    prefijado, conservación de elementos y de atributos legítimos).
 *  · Los 8 VECTORES NUEVOS V-1…V-8 (TASK-STR-012, RF-C3) y sus bordes.
 *  · No-regresión RF-C5: public/logo.svg sobrevive BYTE A BYTE.
 *
 * Aislamiento: sin base de datos, sin red, sin E/S salvo la lectura del
 * logo propio del repositorio (activo versionado, no entrada externa).
 * Determinismo: sin reloj ni aleatoriedad.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  esSvg,
  sanearSvg,
  type ResultadoSaneamientoSvg,
} from '../../modulos/ajustes/servicios/svg';

/** Utilidades locales */
const aBytes = (texto: string) => Buffer.from(texto, 'utf8');
const saneado = (texto: string): ResultadoSaneamientoSvg => sanearSvg(aBytes(texto));
const textoDe = (r: ResultadoSaneamientoSvg): string => {
  if (!r.ok) throw new Error(`esperaba éxito, obtuve rechazo ${r.razon}`);
  return r.bytes.toString('utf8');
};
const razonDe = (r: ResultadoSaneamientoSvg): string => {
  if (r.ok) throw new Error('esperaba rechazo, obtuve éxito');
  return r.razon;
};

// ============================================================
// LOS 16 CASOS ORIGINALES (TASK-STR-009, RF-01 / H4)
// ============================================================
describe('Saneador SVG — 16 casos originales (TASK-STR-009)', () => {
  // ---- 7 elementos prohibidos: eliminados CON su contenido ----

  it('1. <script> con código: etiqueta y contenido eliminados', () => {
    const t = textoDe(saneado('<svg><script>alert(1)</script><rect width="1"/></svg>'));
    expect(t).not.toContain('<script');
    expect(t).not.toContain('alert(1)');
    expect(t).toContain('<rect width="1"/>');
  });

  it('2. <foreignObject> con HTML interno: eliminado con su contenido', () => {
    const t = textoDe(
      saneado('<svg><foreignObject><body onload="alert(1)"><p>hola</p></body></foreignObject></svg>'),
    );
    expect(t).not.toContain('foreignObject');
    expect(t).not.toContain('<body');
    expect(t).not.toContain('hola');
  });

  it('3. <iframe> con fuente externa: eliminado', () => {
    const t = textoDe(saneado('<svg><iframe src="https://evil.example/"></iframe></svg>'));
    expect(t).not.toContain('iframe');
    expect(t).not.toContain('evil.example');
  });

  it('4. <a> con contenido: eliminado con su contenido', () => {
    const t = textoDe(saneado('<svg><a>pulsa</a><circle r="1"/></svg>'));
    expect(t).not.toContain('<a>');
    expect(t).not.toContain('pulsa');
    expect(t).toContain('<circle r="1"/>');
  });

  it('5. <animate> con values de JavaScript: eliminado', () => {
    const t = textoDe(
      saneado('<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>'),
    );
    expect(t).not.toContain('animate');
    expect(t).not.toContain('javascript');
  });

  it('6. <set> con evento programado: eliminado', () => {
    const t = textoDe(
      saneado('<svg><set attributeName="onmouseover" to="alert(1)"/></svg>'),
    );
    expect(t).not.toContain('<set');
    expect(t).not.toContain('onmouseover');
  });

  it('7. <handler> con código: eliminado con su contenido', () => {
    const t = textoDe(
      saneado('<svg><handler xmlns:ev="http://www.w3.org/2001/xml-events" ev:event="load">alert(1)</handler></svg>'),
    );
    expect(t).not.toContain('handler');
    expect(t).not.toContain('alert(1)');
  });

  // ---- 9 vectores de la validación E2E de TASK-STR-009 ----

  it('8. onload en la raíz: atributo eliminado, raíz conservada', () => {
    const t = textoDe(saneado('<svg onload="alert(1)"><rect/></svg>'));
    expect(t).not.toContain('onload');
    expect(t).toContain('<svg');
    expect(t).toContain('<rect/>');
  });

  it('9. onmouseover en elemento: atributo eliminado', () => {
    const t = textoDe(saneado('<svg><circle r="1" onmouseover="alert(1)"/></svg>'));
    expect(t).not.toContain('onmouseover');
    expect(t).toContain('<circle r="1"');
  });

  it('10. onclick en elemento: atributo eliminado', () => {
    const t = textoDe(saneado('<svg><rect onclick="alert(1)"/></svg>'));
    expect(t).not.toContain('onclick');
    expect(t).toContain('<rect');
  });

  it('11. xlink:href="javascript:" en elemento permitido: atributo eliminado', () => {
    const t = textoDe(
      saneado('<svg><image xlink:href="javascript:alert(1)" width="1" height="1"/></svg>'),
    );
    expect(t).not.toContain('xlink:href');
    expect(t).not.toContain('javascript');
    expect(t).toContain('<image');
    // El esquema SIN ofuscar lo retira el pase de atributos (comportamiento
    // original): NO es rechazo de archivo completo (ese castigo es para el
    // esquema OFUSCADO, ver V-6b).
  });

  it('12. href externo en <image>: atributo eliminado', () => {
    const t = textoDe(
      saneado('<svg><image href="https://evil.example/x.png" width="1"/></svg>'),
    );
    expect(t).not.toContain('href');
    expect(t).not.toContain('evil.example');
    expect(t).toContain('<image');
  });

  it('13. url(https://…) en <style>: neutralizada a url(#)', () => {
    const t = textoDe(
      saneado('<svg><style>.f{fill:url(https://evil.example/x.svg#a)}</style><rect class="f"/></svg>'),
    );
    expect(t).not.toContain('evil.example');
    expect(t).toContain('url(#)');
    expect(t).toContain('<rect class="f"/>');
  });

  it('14. elemento prefijado <x:script>: eliminado (nombre local)', () => {
    const t = textoDe(
      saneado('<svg xmlns:x="http://www.w3.org/2000/svg"><x:script>alert(1)</x:script></svg>'),
    );
    expect(t).not.toContain('script');
    expect(t).toContain('xmlns:x');
  });

  it('15. elementos legítimos conservados íntegros', () => {
    const entrada =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">' +
      '<defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>' +
      '<g><path d="M0 0h8v8z"/><rect x="1" y="1" width="2" height="2"/>' +
      '<circle cx="4" cy="4" r="1"/><text>x</text><image width="1" height="1"/></g></svg>';
    const t = textoDe(saneado(entrada));
    expect(t).toBe(entrada);
  });

  it('16. atributos legítimos conservados íntegros', () => {
    const entrada =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'xml:space="preserve" viewBox="0 0 1 1" version="1.1" enable-background="new 0 0 1 1">' +
      '<rect x="0" y="0" width="1" height="1" fill="#fff" opacity="1" stroke="none"/></svg>';
    const t = textoDe(saneado(entrada));
    expect(t).toBe(entrada);
  });
});

// ============================================================
// LOS 8 VECTORES NUEVOS V-1…V-8 (TASK-STR-012, RF-C3)
// ============================================================
describe('Saneador SVG — vectores V-1…V-8 (fail-closed)', () => {
  it('V-1. DOCTYPE con ENTIDAD interna: RECHAZADO — el parser del navegador expande &x; a <script>', () => {
    const r = saneado('<!DOCTYPE svg [<!ENTITY x "<script>alert(1)</script>">]><svg>&x;</svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('ENTIDAD_DECLARADA');
  });

  it('V-2. DOCTYPE con subconjunto interno «[»: RECHAZADO aunque no haya entidades', () => {
    const r = saneado('<!DOCTYPE svg [<!ELEMENT svg ANY>]><svg><rect/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('DOCTYPE_INVALIDO');
  });

  it('V-2b. DOCTYPE sin cerrar: RECHAZADO (fail-closed ante XML inválido)', () => {
    const r = saneado('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"<svg><rect/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('DOCTYPE_INVALIDO');
  });

  it('V-2c. DOCTYPE externo simple (Illustrator/Inkscape): ACEPTADO y eliminado del contenido servido', () => {
    const entrada =
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>';
    const r = saneado(entrada);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t = textoDe(r);
    expect(t).not.toContain('DOCTYPE');
    expect(t).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(t).toContain('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"/></svg>');
    // El SVG sigue siendo un SVG válido tras retirar la declaración.
    expect(esSvg(r.bytes)).toBe(true);
  });

  it('V-2d. DOCTYPE externo con «>» dentro del literal SYSTEM: aceptado y eliminado (escaneo respeta comillas)', () => {
    const r = saneado('<!DOCTYPE svg SYSTEM "a>b"><svg><rect/></svg>');
    expect(r.ok).toBe(true);
    expect(textoDe(r)).toBe('<svg><rect/></svg>');
  });

  it('V-3. CDATA que oculta </style><script>: RECHAZADO (puede reparsear)', () => {
    const r = saneado('<svg><style><![CDATA[</style><script>alert(1)</script>]]></style></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('CDATA_REPARSEABLE');
  });

  it('V-3b. CDATA sin cerrar: RECHAZADO (fail-closed)', () => {
    const r = saneado('<svg><style><![CDATA[.a{fill:#fff}</style></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('CDATA_REPARSEABLE');
  });

  it('V-3c. CDATA con CSS legítimo (sin «<»): aceptado y conservado como texto opaco', () => {
    const entrada = '<svg><style><![CDATA[.a{fill:#fff} g > rect{stroke:none}]]></style><rect/></svg>';
    const r = saneado(entrada);
    expect(r.ok).toBe(true);
    expect(textoDe(r)).toBe(entrada);
  });

  it('V-4. comentario que oculta <script>: RECHAZADO (puede reparsear)', () => {
    const r = saneado('<svg><!--<script>alert(1)</script>--><rect/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('COMENTARIO_REPARSEABLE');
  });

  it('V-4b. variante «<!-->» que oculta <script>: RECHAZADO', () => {
    const r = saneado('<svg><!--><script>alert(1)</script>--><rect/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('COMENTARIO_REPARSEABLE');
  });

  it('V-4c. comentario legítimo (Illustrator/Inkscape): aceptado y conservado', () => {
    const entrada = '<svg><!-- Generator: Adobe Illustrator 27.0, SVG Export Plug-In --><rect/></svg>';
    const r = saneado(entrada);
    expect(r.ok).toBe(true);
    expect(textoDe(r)).toBe(entrada);
  });

  it('V-4d. comentario sin cerrar: RECHAZADO (el resto del documento sería comentario)', () => {
    const r = saneado('<svg><rect/><!-- sin cerrar');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('COMENTARIO_REPARSEABLE');
  });

  it('V-5. tokenizador respeta comillas: data-x="a>b" conserva el valor y onload muere', () => {
    const r = saneado('<svg><rect data-x="a>b" onload="alert(1)"/></svg>');
    expect(r.ok).toBe(true);
    const t = textoDe(r);
    expect(t).toContain('data-x="a>b"');
    expect(t).not.toContain('onload');
    expect(t).not.toContain('alert(1)');
  });

  it('V-5b. comillas simples también respetadas', () => {
    const r = saneado("<svg><rect data-x='a>b' onclick='alert(1)'/></svg>");
    expect(r.ok).toBe(true);
    const t = textoDe(r);
    expect(t).toContain("data-x='a>b'");
    expect(t).not.toContain('onclick');
  });

  it('V-6. entidad numérica en NOMBRE de atributo (on&#108;oad): RECHAZADO', () => {
    const r = saneado('<svg><rect on&#108;oad="alert(1)"/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('ENTIDAD_EN_NOMBRE');
  });

  it('V-6b. esquema javascript: OFUSCADO con entidad en el valor: RECHAZADO', () => {
    const r = saneado('<svg><image href="java&#115;cript:alert(1)" width="1"/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('ESQUEMA_PELIGROSO');
  });

  it('V-6c. entidad en nombre de ETIQUETA (<&#108;script>): RECHAZADO (el «<&» crudo es XML inválido)', () => {
    const r = saneado('<svg><&#108;script>alert(1)</script></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('ENTIDAD_EN_NOMBRE');
  });

  it('V-6d. entidad hexadecimal vbscript ofuscado: RECHAZADO', () => {
    const r = saneado('<svg><rect data-u="vb&#x73;cript:msgbox(1)"/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('ESQUEMA_PELIGROSO');
  });

  it('V-6e. entidades legítimas en valores (A &amp; B) NO disparan el rechazo', () => {
    const entrada = '<svg><text data-x="A &amp; B" data-n="2 &#60; 3">hola</text></svg>';
    const r = saneado(entrada);
    expect(r.ok).toBe(true);
    expect(textoDe(r)).toBe(entrada);
  });

  it('V-6f. title legítimo que EMPIEZA por «JavaScript:» (sin entidades) NO se rechaza', () => {
    const entrada = '<svg><rect title="JavaScript: guía de estilo" width="1"/></svg>';
    const r = saneado(entrada);
    expect(r.ok).toBe(true);
    expect(textoDe(r)).toBe(entrada);
  });

  it('V-6g. esquema con tabulación interna ofuscada por entidad: RECHAZADO', () => {
    const r = saneado('<svg><rect data-u="java&#9;script:alert(1)"/></svg>');
    expect(r.ok).toBe(false);
    expect(razonDe(r)).toBe('ESQUEMA_PELIGROSO');
  });

  it('V-6h. codepoint numérico fuera de Unicode (&#x110000;): decodifica a vacío sin romper', () => {
    const r = saneado('<svg><rect data-x="&#x110000;ok" width="1"/></svg>');
    expect(r.ok).toBe(true);
    expect(textoDe(r)).toContain('data-x="&#x110000;ok"');
  });

  it('V-7. @import externo en <style>: neutralizado como url() externa', () => {
    const t = textoDe(saneado('<svg><style>@import "https://evil.test/x.css";</style><rect/></svg>'));
    expect(t).not.toContain('evil.test');
    expect(t).toContain('@import "#"');
  });

  it('V-7b. @import externo sin comillas: neutralizado', () => {
    const t = textoDe(saneado('<svg><style>@import https://evil.test/x.css;</style></svg>'));
    expect(t).not.toContain('evil.test');
    expect(t).toContain('@import #;');
  });

  it('V-7c. @import con url() externa: la url() se neutraliza', () => {
    const t = textoDe(saneado('<svg><style>@import url(https://evil.test/x.css);</style></svg>'));
    expect(t).not.toContain('evil.test');
    expect(t).toContain('@import url(#)');
  });

  it('V-8. <s:script> con prefijo ligado al espacio de nombres SVG: eliminado por nombre LOCAL', () => {
    const r = saneado(
      '<svg xmlns:s="http://www.w3.org/2000/svg"><s:script>alert(1)</s:script><s:rect width="1"/></svg>',
    );
    expect(r.ok).toBe(true);
    const t = textoDe(r);
    expect(t).not.toContain('script');
    expect(t).not.toContain('alert(1)');
    // <s:rect> es un rect legítimo en ese espacio de nombres: se conserva.
    expect(t).toContain('<s:rect width="1"/>');
  });
});

// ============================================================
// NO-REGRESIÓN RF-C5: EL LOGO PROPIO SOBREVIVE BYTE A BYTE
// ============================================================
describe('Saneador SVG — no-regresión del logo (RF-C5)', () => {
  it('public/logo.svg se sanea a sí mismo BYTE A BYTE', () => {
    const ruta = join(process.cwd(), 'public', 'logo.svg');
    const original = readFileSync(ruta);
    const r = sanearSvg(original);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bytes.equals(original)).toBe(true);
  });

  it('esSvg reconoce el logo propio y un SVG con declaración XML + DOCTYPE', () => {
    expect(esSvg(readFileSync(join(process.cwd(), 'public', 'logo.svg')))).toBe(true);
    expect(
      esSvg(aBytes('<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//x" "y"><svg><rect/></svg>')),
    ).toBe(true);
    expect(esSvg(aBytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(true);
    expect(esSvg(aBytes('esto no es un svg'))).toBe(false);
  });
});

// ============================================================
// BORDES ADICIONALES DEL SANEAMIENTO ESTRUCTURAL
// ============================================================
describe('Saneador SVG — bordes estructurales', () => {
  it('etiqueta en MAYÚSCULAS (<SCRIPT>): eliminada (XML distingue mayúsculas y no es elemento SVG real)', () => {
    const t = textoDe(saneado('<svg><SCRIPT>alert(1)</SCRIPT></svg>'));
    expect(t).not.toContain('SCRIPT');
    expect(t).not.toContain('alert(1)');
  });

  it('cierres huérfanos de elementos prohibidos: descartados', () => {
    const t = textoDe(saneado('<svg><rect/></script></svg>'));
    expect(t).not.toContain('</script>');
    expect(t).toContain('<rect/>');
  });

  it('aperturas sin cerrar de elementos prohibidos: tragan hasta el final (lineal, sin colgar)', () => {
    const t = textoDe(saneado('<svg><foreignObject><img src=x>' + 'x'.repeat(5000) + '</svg>'));
    expect(t).not.toContain('foreignObject');
    expect(t).not.toContain('<img');
  });

  it('script anidado dentro de elemento permitido: eliminado y el permitido se cierra bien', () => {
    const t = textoDe(saneado('<svg><g><script>alert(1)</script><rect/></g></svg>'));
    expect(t).toBe('<svg><g><rect/></g></svg>');
  });

  it('url() con data: interna e #id: se conservan', () => {
    const entrada =
      '<svg><defs><linearGradient id="g"/></defs>' +
      '<style>.a{fill:url(#g)}.b{background:url(data:image/png;base64,AAAA)}</style></svg>';
    const r = saneado(entrada);
    expect(r.ok).toBe(true);
    expect(textoDe(r)).toBe(entrada);
  });

  it('url() con esquema javascript: dentro de <style>: neutralizada (defensa en profundidad)', () => {
    const t = textoDe(saneado('<svg><style>.a{fill:url(javascript:alert(1))}</style></svg>'));
    expect(t).not.toContain('javascript');
    expect(t).toContain('url(#)');
  });
});
