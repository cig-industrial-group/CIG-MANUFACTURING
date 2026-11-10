# Security Policy

> CIG-MANUFACTURING — Sistema de Gestión de Fábrica (WMS)
> Propiedad de Emmanuel Caballero De La Rosa · Tijuana, Baja California, México.
> Uso interno y confidencial.

## Alcance

Esta política aplica a todo el código del repositorio CIG-MANUFACTURING
(`src/`, `prisma/`, scripts de operación e infraestructura de despliegue),
a sus dependencias publicadas en `bun.lock` y a los artefactos de
despliegue (imagen Docker, unidad systemd, proxy inverso Caddy).

Están **fuera de alcance**: vulnerabilidades de servicios de terceros
(GitHub, Cloudflare, PostgreSQL no empaquetado por el proyecto) y
despliegues modificados por el operador que se aparten de `deploy.sh`,
`setup.sh` o `docker-compose.yml`.

## Versiones con soporte

| Versión | Soporte de seguridad |
| ------- | -------------------- |
| 2.0.0+ (rama principal) | Soportada — correcciones activas |
| < 2.0.0 (serie 1.x, motor SQLite) | Sin soporte — migrar a 2.0.0 |

Las series 1.x usaban SQLite embebido y quedaron descontinuadas con la
migración a PostgreSQL 16 (decisión ADR-009). No se publicarán parches
de seguridad para ramas/etiquetas anteriores a la v2.0.0.

## Cómo reportar una vulnerabilidad

**No abras un issue público, pull request ni discusión** para reportar
una vulnerabilidad. Los issues públicos pueden exponer detalles
explotables a terceros antes de que exista una corrección disponible, y
este sistema gestiona la operación de planta de un entorno de
manufactura.

Reporta de forma **privada** por correo a:

- **caballeroemanuel966@gmail.com**
- Asunto: `[VULNERABILIDAD] CIG-MANUFACTURING — <resumen breve>`

Incluye en el reporte, en la medida de lo posible:

1. Descripción del problema y su impacto potencial (confidencialidad,
   integridad o disponibilidad).
2. Versión/commit afectado y pasos o prueba de concepto para
   reproducirlo.
3. Componente involucrado (ruta de archivo, endpoint de API o módulo).
4. Cualquier mitigación temporal que hayas identificado.

## Compromisos de tiempo de respuesta

| Evento | Objetivo |
| ------ | -------- |
| Acuse de recibo del reporte | 5 días hábiles |
| Evaluación inicial y clasificación de severidad | 10 días hábiles |
| Plan de corrección comunicado | 30 días naturales |
| Corrección publicada (severidad crítica/alta) | 90 días naturales, o antes si es viable |

Si el reporte no recibe acuse en 5 días hábiles, reenvía el correo
(verifica también tu carpeta de correo no deseado antes de escalar por
cualquier otro medio).

## Proceso de divulgación responsable

1. El reportero envía la información por el canal privado indicado.
2. El mantenedor acusa recibo, evalúa, clasifica la severidad y, si
   procede, abre el seguimiento interno (issue restringido).
3. Se desarrolla y valida la corrección con el pipeline de calidad del
   proyecto (`scripts/simulacion-ci.sh`: lint, tipos, build y humo sobre
   una base de datos efímera).
4. Se coordina la publicación: se emite el parche y se actualiza
   `CHANGELOG.md` antes del anuncio.
5. El reportero recibe crédito en el aviso **solo si lo solicita**, y
   puede publicar los detalles una vez publicada la corrección (o
   transcurridos 90 días desde el acuse, lo que ocurra primero, salvo
   acuerdo expreso de prórroga).

## Prácticas de seguridad del proyecto

- `AUTH_SECRET` (mínimo 32 caracteres) es obligatorio en producción y
  su arranque se valida en tres capas; el repositorio no publica
  valores fijos.
- El CI rechaza fallbacks de secretos y credenciales históricas
  publicadas (guardianes de secretos en `.github/workflows/ci.yml`).
- Dependencias: mantén `bun audit` limpio antes de cada entrega.
- Divulgación coordinada alineada con ISO/IEC 27001 (control de
  vulnerabilidades técnicas) y NIST SP 800-53 (SI-2, Gestión de flaws).

## Agradecimientos

Quienes reportan de forma responsable y permiten la divulgación
coordinada protegen la operación de la planta y a sus usuarios. Gracias
por seguir este proceso.
