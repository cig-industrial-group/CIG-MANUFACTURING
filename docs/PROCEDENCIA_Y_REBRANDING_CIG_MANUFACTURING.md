# PROCEDENCIA Y REBRANDING — CIG-MANUFACTURING

Documento de registro histórico, trazabilidad y continuidad del proyecto **CIG-MANUFACTURING**.

> **Nota de alcance**: este documento es el único lugar autorizado donde la denominación histórica del proyecto aparece con fines de registro. Todas las menciones a «FabriFlow» aquí contenidas son información histórica deliberada y justificada.

---

## 1. Origen real del proyecto

La información de esta sección se obtiene exclusivamente del historial de Git disponible en el repositorio y de los archivos versionados. No se ha consultado ni utilizado ninguna otra fuente. Todo dato no verificable se marca expresamente como **no verificado**.

- **Denominación original del proyecto**: FabriFlow (verificable en el contenido de archivos de los commits previos al rebranding).
- **Repositorio de origen**: repositorio Git local, de historia lineal única (una sola rama principal, `main`), sin remotos configurados. Estructura: aplicación Next.js 16 (App Router) con módulos de negocio bajo `src/modulos/`, esquema Prisma + SQLite, componentes shadcn/ui bajo `src/components/ui/`, CI de GitHub Actions y despliegue con Docker/pm2/systemd.
- **Autoría del historial**: los 20 commits previos al rebranding pertenecen a un único autor registrado: `Z User <z@container>` (identidad de entorno; el autor humano u organización real no puede verificarse a partir del historial — **no verificado**).
- **Primer commit disponible**: `860eb1f81febc5b483c24e3d6285c2d0f6899a63` — 2026-11-01 07:01:16 UTC — mensaje «Initial commit» — contiene únicamente 3 archivos de arranque del entorno (`.env`, `.gitignore`, `download/README.md`); no es el código de la aplicación.
- **Primera evidencia del proyecto con la identidad anterior**: commit `5f0a197d32681efb26d688955e901776c042830d` — 2026-11-01 08:24:03 UTC — primer commit que introduce la cadena «FabriFlow» y la estructura de la aplicación (115 archivos).
- **Primera evidencia del identificador de sesión con la identidad anterior**: commit `b824408c3407216d8d4234119d9a60f13ebe57f5` — 2026-11-01 09:19:34 UTC — introduce la cookie `fabriflow_sesion`.
- **Evolución verificable**: 20 commits entre 2026-11-01 07:01 y 2026-11-03 20:29 UTC. De ellos, 9 tienen mensajes descriptivos en español y 11 tienen como mensaje un identificador UUID cuyo propósito no está documentado en el historial (**no verificado**). Hitos verificables: `c389b64` «Restauración del estado final tras reciclado del sandbox» (2026-11-03 19:06:40 UTC, el árbol pasa de 565 a 223 archivos) y `442cd6e` «Corrección técnica: reinicio de conteo en handlers y dependencias de hooks» (2026-11-03 20:29:52 UTC).
- **Punto de partida del rebranding**: commit `442cd6e8206fd0fa722feca0d72a47b00039c267` (2026-11-03 20:29:52 UTC), extremo de `main`, con árbol de trabajo limpio (verificación previa al inicio; véase la incidencia de permisos en la sección 9).
- **Rama de trabajo del rebranding**: `rebrand/cig-manufacturing`, creada desde `442cd6e` sin modificar `main`. Sin operaciones remotas (el repositorio no tiene remoto configurado).
- **Publicación verificada en GitHub (posterior al trabajo local)**: el agente trabajó en su repositorio Git local, en la rama rebrand/cig-manufacturing, sin acceso a GitHub y sin remoto configurado. El propietario publicó manualmente el código entregado por el agente en el repositorio cig-industrial-group/CIG-MANUFACTURING, mediante la rama remota rebranding-documentacion-de-procedencia. El estado publicado se verificó el 2026-11-03: commit 4cf7499c992847721abfd65ac7dbed2fee6a4687, padre bfd39e1a0bdb4021208ba0fb2cdfdedffefe5f65. El main remoto permaneció en b43e2bc015a310f0b39c8f9120b0f383f3ae1280. Los SHA locales (9ec457f, 27a4866, d094512, 2b5e66d, b272511 y b3be1ea) pertenecen al historial local del agente y no deben presentarse como SHA de los commits publicados. La correspondencia se establece por el contenido incorporado y la trazabilidad descrita en este documento; no se afirma identidad de SHA ni equivalencia de árboles completos entre ambos historiales.
- **Procedencia de componentes**: la base tecnológica corresponde a un scaffold Next.js + Tailwind + shadcn/ui + TypeScript (el campo `name` de `package.json` era `nextjs_tailwind_shadcn_ts` —plantilla de arranque sin identidad de producto— hasta la 2.ª intervención, que lo renombró a `cig-manufacturing`; véase 11.3). Los componentes de `src/components/ui/` siguen la estructura estándar de shadcn/ui. El desarrollo de los módulos de negocio y la identidad FabriFlow son originales del historial de este repositorio desde el commit `5f0a197`. No existe evidencia en el historial de otra procedencia (**no verificado cualquier origen anterior a `860eb1f`**).

## 2. Motivo del cambio de identidad

La identidad anterior, FabriFlow, fue sustituida por **CIG-MANUFACTURING** para alinear la identidad integral del producto (interfaz, metadatos, documentación, mensajería y elementos operativos) con la denominación oficial actual del proyecto, establecida por la propiedad del proyecto en la orden de trabajo recibida el 2026-11-03.

Esta operación **no** constituye una reconstrucción, una migración tecnológica ni un desarrollo desde cero: el sistema conserva íntegros su arquitectura, su código funcional, su historial y sus datos.

## 3. Registro cronológico

| Evento | Fecha (UTC) | Referencia verificable | Detalle |
|---|---|---|---|
| Origen | 2026-11-01 07:01:16 | `860eb1f` | Primer commit disponible (arranque del entorno, 3 archivos) |
| Primera evidencia con identidad FabriFlow | 2026-11-01 08:24:03 | `5f0a197` | Estructura de la aplicación (115 archivos) con la denominación anterior |
| Evolución | 2026-11-01 → 2026-11-03 | 20 commits en `main` | Desarrollo del sistema; hitos: `c389b64` (restauración del estado final, 223 archivos), `442cd6e` (corrección técnica) |
| Punto de partida del rebranding | 2026-11-03 | `442cd6e` en rama `rebrand/cig-manufacturing` | Rama creada desde `main`; árbol limpio verificado |
| Cambio de identidad | 2026-11-03 | Commit `9ec457f` | 95 sustituciones 1:1 en 23 archivos; identificación oficial CIG-MANUFACTURING aplicada |
| Validación | 2026-11-03 | Sección 7 de este documento | 12 verificaciones funcionales y técnicas ejecutadas; E2E comparada contra el estado base |
| Resultado (1.ª intervención) | 2026-11-03 | `d094512` (extremo de la rama) | Registro de procedencia y trazabilidad; rama lista para auditoría externa |
| Cierre técnico (2.ª intervención) | 2026-11-03 22:35:28 UTC | Commit `2b5e66d` | Identificadores Docker/persistencia/paquete sustituidos (13 sustituciones en 5 archivos) con autorización expresa de la propiedad |
| Cierre documental (2.ª intervención) | 2026-11-03/04 | Sección 11 de este documento | Registro completo de la segunda intervención, validaciones y auditoría final |
| Regeneración de paquetes de entrega | 2026-11-04 | Extremo de `rebrand/cig-manufacturing` posterior al cierre | ZIP/TAR regenerados a petición de la propiedad desde el estado de cierre completo; hashes publicados en `descargas.html` (página de entrega, fuera del repositorio) |

No se reescribió ni alteró el historial local para adaptar esta cronología. Los SHA abreviados y completos de la historia local fueron comprobados por el agente mediante git show en su entorno. La historia remota de GitHub es independiente y se registra por separado en las secciones 1 y 12.

## 4. Registro de modificaciones

95 sustituciones de identidad en 23 archivos (95 líneas modificadas, 0 líneas añadidas o eliminadas netas — verificable con `git show 9ec457f --stat`). Clasificación por archivo:

| # | Archivo | Referencia anterior → nueva | Motivo | Clasificación | Validación |
|---|---|---|---|---|---|
| 1 | `src/app/layout.tsx` | Título «FabriFlow — …» → «CIG-MANUFACTURING — …» | Metadatos del documento | Visual / metadatos | Build ✔, título servido verificado |
| 2 | `src/modulos/compartidos/idioma/diccionario.ts` | `app.nombre`: «FabriFlow» → «CIG-MANUFACTURING» (diccionarios ES y EN) | Nombre de presentación en interfaz | Visual | Navegador ✔ (barra lateral ES y EN) |
| 3 | `src/modulos/compartidos/idioma/index.tsx` | `fabriflow.idioma` → `cig-manufacturing.idioma` | Clave de localStorage de preferencia de idioma | Identificador técnico | Navegador ✔ (preferencia persistida con clave nueva) |
| 4 | `src/modulos/nucleo/index.tsx` | `fabriflow.seccion` → `cig-manufacturing.seccion` | Clave de localStorage de sección activa | Identificador técnico | Navegación ✔ |
| 5 | `src/modulos/nucleo/registro.tsx` | `fabriflow.modulo` → `cig-manufacturing.modulo` | Clave de localStorage de módulo activo | Identificador técnico | Navegación ✔ |
| 6 | `src/modulos/autenticacion/servicios/auth.ts` | Cookie `fabriflow_sesion` → `cig_manufacturing_sesion` | Cookie de sesión httpOnly | Identificador técnico | Login + sesión autenticada ✔ |
| 7 | `src/modulos/autenticacion/servicios/auth.ts` | Secreto de desarrollo `fabriflow-…` → `cig-manufacturing-…` | Valor por defecto de `AUTH_SECRET` (solo desarrollo) | Identificador técnico | Login + sesión autenticada ✔ |
| 8 | `prisma/seed.ts` | `admin@fabriflow.com`, `ti@fabriflow.com` → `admin@cig-manufacturing.com`, `ti@cig-manufacturing.com` | Cuentas de demostración en instalaciones nuevas | Datos de prueba / semilla | Semilla ejecutada ✔ en BD de pruebas |
| 9 | `README.md` | Título, árbol `fabriflow/`, credenciales, nota de derechos | Documentación del proyecto | Documental | Revisión de diff ✔ |
| 10 | `DESPLIEGUE.md` | Rutas `/opt/fabriflow`, servicios pm2/systemd `fabriflow`, dominios y respaldos de ejemplo, paquete `fabriflow-codigo-fuente.zip` | Guía de despliegue (instalaciones nuevas) | Documental | Revisión de diff ✔ |
| 11 | `.env.example` | Cabecera y rutas de ejemplo `…/fabriflow/db/…` | Ejemplo de configuración | Configuración / documental | Revisión de diff ✔ |
| 12 | `setup.sh` | Cabecera y credenciales mostradas al instalar | Mensajes de instalación | Documental / operación | Revisión de diff ✔ |
| 13 | `start.sh` | Cabecera y mensaje «▶ … escuchando» | Mensaje de arranque | Documental / operación | Revisión de diff ✔ |
| 14 | `Dockerfile` | Cabecera y tag de imagen de ejemplo `fabriflow` → `cig-manufacturing` | Imagen de producción | Configuración / documental | Revisión de diff ✔ (volumen y BD conservados; véase §5) |
| 15 | `docker-compose.yml` | Únicamente la cabecera del archivo | Orquestación Docker | Documental | Revisión de diff ✔ (identificadores internos conservados; véase §5) |
| 16 | `.github/workflows/ci.yml` | Cabecera y credenciales de la prueba de humo | Pipeline CI | CI / pruebas | Cambios de cadena verificados; sintaxis intacta |
| 17 | `scripts/simulacion-ci.sh` | Credenciales de la prueba de humo | Simulación local de CI | Pruebas | Revisión de diff ✔ |
| 18 | `scripts/empaquetar.sh` | Estructura `fabriflow/` y nombres `fabriflow-codigo-fuente.{zip,tar.gz}` → `cig-manufacturing/…` | Empaquetado de código fuente | Configuración / operación | Revisión de diff ✔ |
| 19 | `scripts/test-borrado.sh` | Credenciales y correos temporales de prueba | Prueba E2E | Pruebas | Ejecutada ✔ (véase §7, punto 12) |
| 20 | `scripts/test-clientes.py` | Docstring, log temporal y correos de prueba | Prueba E2E | Pruebas | Revisión de diff ✔ |
| 21 | `scripts/test-oqc-fix.py` | Credenciales de prueba | Prueba E2E | Pruebas | Revisión de diff ✔ |
| 22 | `scripts/test-oqc-sync.py` | Credenciales de prueba | Prueba E2E | Pruebas | Revisión de diff ✔ |
| 23 | `scripts/test-respaldo.py` | Correos de prueba | Prueba E2E | Pruebas | Revisión de diff ✔ |

Los esloganes oficiales («Sistema de Gestión de Fábrica» / «Factory Management System») ya estaban presentes en el diccionario y el título; se conservaron sin alteración y se verificó su correcta presentación en ambos idiomas.

> Las 13 sustituciones de la **segunda intervención** (cierre técnico: Docker, persistencia y paquete) se detallan en la sección 11.3 de este documento.

## 5. Compatibilidad y continuidad

Tratamiento de cada elemento sensible, con su decisión y su impacto real:

| Elemento | Decisión | Impacto y justificación |
|---|---|---|
| **Cookie de sesión** | Renombrada (`cig_manufacturing_sesion`) | Las sesiones activas en el momento del despliegue del cambio dejan de reconocerse y el usuario debe iniciar sesión de nuevo (una sola vez). No hay pérdida de datos: la cookie solo transporta el JWT de sesión. No se implementó alias de doble lectura porque añadiría código de compatibilidad no autorizado. Verificado: emisión y aceptación de la cookie nueva en servidor real. |
| **Secreto de firmado (`AUTH_SECRET`)** | Valor por defecto de desarrollo renombrado | Solo afecta a entornos que NO definan `AUTH_SECRET` (desarrollo): invalida sesiones previas (mismo efecto y cadencia que la cookie). En producción, `AUTH_SECRET` se define en `.env`/secreto del orquestador y no se ve afectado. No se tocó el mecanismo de firmado. |
| **Claves de `localStorage`** (`idioma`, `seccion`, `modulo`) | Renombradas (`cig-manufacturing.*`) | Las preferencias guardadas (idioma elegido, sección y módulo activos) se leen de la clave nueva, ausente en navegadores existentes: vuelven al valor por defecto («es», primera sección, primer módulo) hasta la próxima interacción. Impacto menor, autorecuperable por el usuario. Sin alias por el mismo criterio de alcance. |
| **Identificadores de servicios Docker** | **Renombrados** (2.ª intervención, commit `2b5e66d`) | Servicio, contenedor y volumen renombrados a `cig-manufacturing` / `cig-manufacturing-data` con autorización expresa de la propiedad (no existe instalación productiva con datos reales; el servidor en producción es exclusivamente un entorno de pruebas). En un despliegue de prueba existente, `docker compose up` creará volumen y BD nuevos con los nombres oficiales; los recursos de prueba anteriores pueden eliminarse (autorizado). |
| **Volúmenes persistentes** | **Renombrados** (2.ª intervención) | `fabriflow-data` → `cig-manufacturing-data`; la BD Docker pasa a `/data/cig-manufacturing.db`; los comandos de respaldo/restauración de la cabecera de `docker-compose.yml` se actualizaron en consecuencia. La persistencia en la ruta nueva fue validada funcionalmente (sección 11.6). |
| **Nombres y rutas de bases de datos** | Ruta Docker renombrada (2.ª intervención) | `DATABASE_URL` de Docker: `file:/data/cig-manufacturing.db` (Dockerfile y Compose coinciden exactamente). La instalación local sigue usando `custom.db` (sin identidad en la ruta). El esquema Prisma no se modificó. |
| **Directorios de instalación** | Documentación nueva actualizada; instalaciones existentes intactas | La guía ahora ejemplifica `/opt/cig-manufacturing` para instalaciones **nuevas**. Una instalación existente en `/opt/fabriflow` sigue funcionando sin cambio alguno (su `.env` define su propia ruta). No se creó mecanismo de migración de rutas. |
| **Variables de entorno** | Nombres sin cambio | `DATABASE_URL`, `AUTH_SECRET`, `PORT`, `HOSTNAME` conservan sus nombres (no contenían la identidad anterior salvo en valores de ejemplo y en el secreto por defecto de desarrollo, ya tratados). `.env.example` actualizado como documentación. |
| **Nombres de archivos de respaldo** | Documentación nueva actualizada | La guía genera respaldos `cig-manufacturing-<fecha>.db` en instalaciones nuevas. Los respaldos ya existentes con el nombre histórico **no se renombran ni se eliminan** (son datos históricos del usuario). |
| **Cuentas de prueba y datos de demostración** | Semilla renombrada; datos existentes intactos | Instalaciones nuevas crean `admin@cig-manufacturing.com` y `ti@cig-manufacturing.com` (contraseñas sin cambio). Las bases de datos **existentes** conservan sus cuentas con el dominio histórico: son datos persistentes del usuario y no se modificaron (la orden prohíbe modificar bases de datos reales). El inicio de sesión funciona con las cuentas existentes de cada instalación. |

**Declaración de compatibilidad (actualizada tras la 2.ª intervención)**: la compatibilidad retroactiva de sesiones y preferencias de interfaz NO se conserva (impacto limitado a un reinicio de sesión y de preferencias, como arriba). La compatibilidad de identificadores Docker tampoco se conserva: fueron renombrados con autorización expresa al no existir instalación productiva. La **persistencia de datos en la ruta nueva** sí fue validada funcionalmente (sección 11.6: esquema, semilla, login, modificación y reinicio con la BD en `cig-manufacturing.db`). No se ha probado un contenedor Docker real (**no verificado en este entorno**, véase 11.10.1).

## 6. Declaración de continuidad del proyecto

> CIG-MANUFACTURING es la identidad oficial actual del proyecto anteriormente identificado como FabriFlow. El cambio realizado corresponde a una transición de identidad y denominación. No representa por sí mismo una reescritura del sistema, una modificación de su arquitectura ni una alteración de sus funcionalidades. La procedencia y evolución del proyecto se conservan mediante el historial de Git y la documentación de trazabilidad correspondiente.

El análisis del repositorio confirma esta declaración sin diferencias materiales: el commit de rebranding (`9ec457f`) contiene exclusivamente sustituciones de cadenas de identidad (95 líneas modificadas, 0 líneas añadidas o eliminadas netas), sin cambios en lógica de negocio, componentes funcionales, contratos API, esquema de base de datos, permisos, dependencias ni arquitectura.

## 7. Resultado de las validaciones (fase de verificación)

Todas las pruebas fueron ejecutadas realmente el 2026-11-03 sobre el árbol de la rama `rebrand/cig-manufacturing`:

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | ESLint | **Aprobada** | `bun run lint` sin errores ni advertencias |
| 2 | Build de producción | **Aprobada** | `bun run build` completó; todas las rutas compiladas |
| 3 | TypeScript | **Aprobada** | `tsc --noEmit` sin errores |
| 4 | Prisma validate | **Aprobada** | «The schema at prisma/schema.prisma is valid» |
| 5 | Prisma generate | **Aprobada** | Cliente generado |
| 6 | Esquema + BD de pruebas + semilla | **Aprobada** | BD temporal creada con `db push`; semilla ejecutada; usuarios `admin@` y `ti@cig-manufacturing.com` verificados en la BD |
| 7 | Inicio del servidor | **Aprobada** | Servidor de producción (standalone) y servidor de desarrollo arrancados sin errores |
| 8 | Comprobación de API | **Aprobada** | `GET /api` → 200 |
| 9 | Inicio de sesión y sesión autenticada | **Aprobada** | Login `admin@cig-manufacturing.com` → 200; cookie `cig_manufacturing_sesion` emitida (HttpOnly, SameSite=lax); `/api/auth/sesion` y `/api/usuarios` autenticados → 200; verificado también en navegador real |
| 10 | Idioma español e inglés | **Aprobada** | Toggle ES/EN en navegador: «Bienvenido de nuevo / Iniciar sesión» ↔ «Welcome back / Sign in»; eslogan oficial en ambos idiomas; preferencia persistida en `cig-manufacturing.idioma` |
| 11 | Navegación entre módulos | **Aprobada** | Login → Panel General → Inventario → Clientes; barra lateral muestra «CIG-MANUFACTURING \| Sistema de Gestión de Fábrica» |
| 12 | Pruebas funcionales existentes (E2E `test-borrado.sh`) | **Ejecutada, con fallos preexistentes** | Resultado 27 correctas / 9 fallidas. La **misma prueba contra el estado base** (`442cd6e`, en worktree aislado con su propia BD) arrojó **exactamente 27/9 con los mismos fallos**: son defectos previos del módulo de borrado con historial, **no atribuibles al rebranding** (cero regresiones). |

## 8. Auditoría de referencias residuales (búsqueda global)

Búsqueda global posterior al cambio, insensible a mayúsculas y con variantes (`fabriflow`, `FabriFlow`, `fabri-flow`, `fabri_flow`, `fabri flow`), sobre todos los archivos rastreados:

- **Antes del rebranding**: 104 coincidencias-línea en 24 archivos.
- **Después del rebranding**: 94 líneas sustituidas; **10 coincidencias restantes, todas clasificadas como excepciones técnicas justificadas** (identificadores de persistencia Docker):

| Archivo:línea | Contenido conservado | Justificación |
|---|---|---|
| `docker-compose.yml:7` | `docker compose exec fabriflow sqlite3 /data/fabriflow.db …` | Comando de respaldo que depende del servicio y la BD conservados |
| `docker-compose.yml:8` | `docker compose cp fabriflow:…` | Ídem |
| `docker-compose.yml:11` | `services: fabriflow:` | Servicio de despliegues existentes (renombrarlo rompe `docker compose up` y deja contenedores huérfanos) |
| `docker-compose.yml:13` | `container_name: fabriflow` | Ídem |
| `docker-compose.yml:20` | `DATABASE_URL: file:/data/fabriflow.db` | Ruta de la BD persistente (renombrarla crea una BD vacía) |
| `docker-compose.yml:23` | `- fabriflow-data:/data` | Volumen persistente (renombrarlo pierde el acceso a los datos) |
| `docker-compose.yml:26` | `fabriflow-data:` (declaración) | Ídem |
| `Dockerfile:4` | `-v fabriflow-data:/data` (ejemplo de ejecución) | Alineado con el compose real para no inducir un volumen vacío |
| `Dockerfile:26` | `DATABASE_URL=file:/data/fabriflow.db` | Ruta de la BD persistente en la imagen |
| `DESPLIEGUE.md:154` | «volumen (`fabriflow-data`)» | Referencia documental al volumen real del compose (necesaria para que la guía siga siendo exacta) |

- **Interfaz y presentación**: 0 coincidencias.
- **Configuración y operación activa sustituible**: 0 coincidencias.
- **Nombres de archivos y directorios**: ningún archivo o directorio del repositorio contenía la identidad anterior (verificado antes y después).
- **Documentación operativa vigente**: 0 coincidencias salvo la línea 154 de `DESPLIEGUE.md`, que describe el identificador conservado (excepción anterior).

**Actualización (2.ª intervención, commits `2b5e66d` y siguientes)**: las 10 excepciones técnicas de la tabla anterior quedaron **resueltas y sustituidas** con autorización expresa de la propiedad. Tras el cierre, la búsqueda global sobre archivos rastreados arroja **0 coincidencias** fuera de este documento; el desglose por área está en la sección 11.9.

## 9. Incidencias detectadas durante la ejecución

1. **Permisos de archivo alterados por el entorno (preexistente)**: al iniciar la tarea, 72 archivos rastreados presentaban cambio de modo `100644 → 100755` (bit de ejecutable añadido) sin cambio de contenido, atribuible al reciclado del entorno. Se restauraron los modos al estado del índice de `442cd6e` (sin alterar contenido) para partir de un árbol limpio. Sin impacto en el resultado.
2. **Base de datos de demostración vacía (preexistente)**: la BD de demostración del entorno (`db/custom.db`) se halló **sin datos** durante la verificación; la copia contenida en el build anterior (2026-11-03 20:19) también está vacía, lo que acredita que la ausencia de datos es anterior al rebranding. No hubo pérdida de datos atribuible al cambio de identidad. Para restablecer el funcionamiento del entorno de demostración se ejecutó la semilla (operación estándar de `setup.sh`) sobre esa BD vacía, creando las cuentas con el dominio nuevo.
3. **Fallos preexistentes en la prueba E2E**: 9 verificaciones del módulo de borrado con historial fallan de forma idéntica en el estado base y en el rebranding (27/9 ambos). No se corrigieron por estar fuera del alcance autorizado (la orden prohíbe resolver problemas preexistentes ajenos al rebranding). Pendiente: corrección en tarea aparte.
4. **Servidor del entorno re-arrancado por el sistema**: durante la verificación, el mecanismo del entorno relanzó un servidor de desarrollo en el puerto 3000; se utilizó para las validaciones (sirve el código rebrandeado). Sin impacto en el repositorio.

5. **Commits creados inicialmente sobre `main` y recolocados**: el entorno de ejecución revirtió la rama activa (de `rebrand/cig-manufacturing` a `main`) sin intervención ni aviso durante la tarea, por lo que los commits de implementación (`9ec457f`) y de documentación (`27a4866`) se crearon inicialmente sobre `main`. Se recolocaron en la rama `rebrand/cig-manufacturing` y `main` se restauró a su punto de partida (`442cd6e`); ningún commit previo fue modificado ni eliminado (verificable: los tres commits citados existen íntegros y `main` apunta a `442cd6e`). La corrección se ejecutó el mismo día, antes de la entrega. El entorno continúa forzando la rama activa hacia `main`, por lo que la auditoría debe realizarse sobre la rama `rebrand/cig-manufacturing` y no sobre la rama activa del entorno.
6. **Docker no disponible en el entorno (2.ª intervención)**: el sandbox no dispone del binario `docker` ni `docker compose`; las pruebas de sintaxis real de Compose, construcción de imagen, ejecución de contenedor y persistencia con contenedor real **no se ejecutaron**. Se sustituyeron por validaciones alternativas documentadas (11.5.6-8 y 11.6). Estado: **no ejecutable en este entorno**.
7. **Reciclado del sandbox durante la 2.ª intervención (recurrente)**: el entorno revirtió la rama activa a `main` en varias ocasiones entre comandos (misma causa que la incidencia 5). Ningún trabajo se perdió: cada comando re-establece la rama antes de operar y los commits existen íntegros en `rebrand/cig-manufacturing` (verificado al cierre: `2b5e66d`, `27a4866`, `9ec457f`, `d094512`).
8. **Suites E2E con prerrequisitos de datos (2.ª intervención)**: con la BD de demostración recién reinicializada, `test-unidades.py`, `test-clientes.py`, `test-oqc-fix.py` y `test-oqc-sync.py` abortaban en sus precondiciones («hay almacén para pruebas», «hay almacén con 2 productos con stock», «No hay stock para probar»): los fixtures de la BD de desarrollo se perdieron con el reciclado del sandbox (incidencia 2 de la primera intervención). No es un defecto del código ni del rebranding: con fixtures mínimos creados vía API (almacén, 2 productos con stock ≥ 100 y un cliente activo), las suites pasan completas (sección 11.7). Nota operativa: el catálogo de unidades se auto-siembra en el primer `GET /api/unidades` (comportamiento previsto del sistema).

## 10. Confirmación de no modificación funcional

- Commit de implementación: `9ec457f` — 23 archivos, **95 inserciones / 95 eliminaciones** (sustituciones 1:1 de cadenas de identidad; ninguna línea nueva de lógica, ninguna eliminada).
- Sin cambios en: lógica de negocio, funciones, hooks, componentes funcionales, flujos de trabajo, endpoints, contratos API, esquema Prisma, modelos, relaciones, permisos, roles, autenticación (mecanismo), autorización, validaciones, dependencias, versiones de paquetes, arquitectura, estructura modular, sincronización, respaldo ni comportamiento de la aplicación.
- En el entorno local del agente, el historial no se reescribió y main local permaneció en 442cd6e; los cambios quedaron en rebrand/cig-manufacturing. Este dato corresponde exclusivamente al repositorio local, no al main remoto de GitHub. La publicación remota posterior se registra en la sección 12.

**Segunda intervención (cierre técnico)**:
- Commit de implementación: `2b5e66dd45d64e3a30b160fd70c800dc7d7e4dc7` — 5 archivos, **12 inserciones / 12 eliminaciones** (13 sustituciones 1:1 de identificadores: 8 en `docker-compose.yml`, 2 en `Dockerfile`, 1 en `DESPLIEGUE.md`, 1 en `package.json`, 1 en `bun.lock`; ninguna línea nueva de lógica).
- Sin cambios en: lógica de negocio, funciones, hooks, componentes funcionales, flujos de trabajo, endpoints, contratos API, esquema Prisma, modelos, permisos, roles, autenticación, autorización, validaciones, dependencias, versiones de paquetes, arquitectura, estructura modular, sincronización, respaldo ni comportamiento.
- Verificación de integridad de la 1.ª intervención: cookie `cig_manufacturing_sesion`, secreto de desarrollo, claves `cig-manufacturing.*` de localStorage, semilla con cuentas `@cig-manufacturing.com`, UI/diccionarios, docs, CI y scripts rebrandeados siguen presentes y funcionales (validado en 11.6-11.8).

---

## 11. Registro de la segunda intervención: cierre del rebranding

### 11.1. Marco de la intervención

- **Fecha de ejecución**: 2026-11-03 ≈22:00–22:50 UTC (2026-11-04 en la zona horaria del entorno de ejecución, UTC+8). Orden de trabajo de cierre recibida del propietario del proyecto.
- **Rama local**: `rebrand/cig-manufacturing` (la misma rama de la primera intervención; verificada como rama activa y árbol limpio al iniciar).
- **Commit base de la 2.ª intervención**: `d0945126eef8d2c7f417fe8b1266b854018de23c` — «docs: registra recolocacion de commits en la rama de entrega» (2026-11-03 21:52:58 UTC).
- **Commits de la 1.ª intervención**: `9ec457f` (implementación, 95 sustituciones en 23 archivos), `27a4866` (presente documento), `d094512` (registro de recolocación de commits).
- **Commit de cierre técnico**: `2b5e66dd45d64e3a30b160fd70c800dc7d7e4dc7` — «Cierre del rebranding: identificadores Docker y de persistencia» (2026-11-03 22:35:28 UTC).
- **Commit de cierre documental**: la actualización de este documento (commit inmediatamente posterior al técnico).
- **Autorización específica**: la propiedad autorizó eliminar y sustituir los identificadores técnicos antiguos (servicios Docker, contenedores, volúmenes, imágenes, rutas SQLite, directorios de ejemplo, respaldos, systemd/PM2, identificadores de almacenamiento y referencias en scripts/configuración) porque **no existe instalación productiva** con información real que preservar; el servidor configurado en modo producción tiene exclusivamente fines de prueba, validación de compilaciones y comprobación del sistema. La autorización permite reinicializar recursos de prueba propios del proyecto; no autoriza operaciones sobre infraestructura externa.

### 11.2. Identificadores oficiales aplicados

| Elemento | Identificador oficial |
|---|---|
| Nombre del proyecto | `CIG-MANUFACTURING` |
| Identificador técnico | `cig-manufacturing` |
| Servicio Docker | `cig-manufacturing` |
| Contenedor Docker | `cig-manufacturing` |
| Volumen Docker | `cig-manufacturing-data` |
| Archivo SQLite (Docker) | `cig-manufacturing.db` |
| Ruta SQLite (Docker) | `/data/cig-manufacturing.db` |
| Eslogan español | Sistema de Gestión de Fábrica |
| Eslogan inglés | Factory Management System |
| Nombre del paquete raíz | `cig-manufacturing` (`package.json` + `bun.lock`) |

Sin nombres alternativos introducidos.

### 11.3. Archivos modificados y sustituciones (commit `2b5e66d`)

| # | Archivo | Sust. | Detalle |
|---|---|---|---|
| 1 | `docker-compose.yml` | 8 | Servicio `fabriflow:` → `cig-manufacturing:`; `container_name: fabriflow` → `cig-manufacturing`; `DATABASE_URL: file:/data/fabriflow.db` → `file:/data/cig-manufacturing.db`; montaje `- fabriflow-data:/data` → `- cig-manufacturing-data:/data`; declaración `fabriflow-data:` → `cig-manufacturing-data:`; comandos de respaldo (`docker compose exec cig-manufacturing sqlite3 /data/cig-manufacturing.db …`) y restauración (`docker compose cp cig-manufacturing:…`) de la cabecera |
| 2 | `Dockerfile` | 2 | Volumen del ejemplo de ejecución (`-v cig-manufacturing-data:/data`) y `DATABASE_URL=file:/data/cig-manufacturing.db`; coincide exactamente con Compose |
| 3 | `DESPLIEGUE.md` | 1 | Referencia al volumen persistente `cig-manufacturing-data` |
| 4 | `package.json` | 1 | `"name"`: `nextjs_tailwind_shadcn_ts` → `cig-manufacturing` (el valor anterior era el nombre de la plantilla de arranque, sin identidad de producto; véase §1, procedencia de componentes) |
| 5 | `bun.lock` | 1 | Nombre del espacio de trabajo raíz → `cig-manufacturing` (edición 1:1 coherente con `package.json`; el lockfile **no** se regeneró; consistencia verificada con `bun install --frozen-lockfile --dry-run` exitoso) |

**Total: 13 sustituciones 1:1 en 5 archivos** (12 líneas modificadas, 0 añadidas o eliminadas netas — verificable con `git show 2b5e66d --stat`). La sustitución se ejecutó con un script auxiliar de verificación atómica (herramienta de sesión no incluida en el repositorio y eliminada tras completar la auditoría) que valida todos los conteos esperados antes de escribir cualquier archivo y verifica la ausencia de residuos tras aplicar.

### 11.4. Identificadores renombrados vs. conservados

| Identificador | Decisión | Justificación / estado |
|---|---|---|
| Servicio, contenedor y volumen Docker; ruta SQLite Docker | **Renombrados** (2.ª) | Autorización expresa; sin instalación productiva |
| Cookie de sesión `cig_manufacturing_sesion` | Ya renombrada (1.ª) | Re-verificada: emisión y aceptación probadas (11.6) |
| Secreto de desarrollo (`cig-manufacturing-…`) | Ya renombrado (1.ª) | Login y sesión probados con él |
| Claves localStorage `cig-manufacturing.*` (idioma/sección/módulo) | Ya renombradas (1.ª) | Re-verificadas en navegador real (11.8) |
| Cuentas demo `admin@` y `ti@cig-manufacturing.com` | Ya renombradas (1.ª) | Re-verificado: login de ambas (11.6) |
| Nombres de variables de entorno (`DATABASE_URL`, `AUTH_SECRET`, `PORT`, `HOSTNAME`) | **Conservados** | Nunca contuvieron la identidad; solo cambian valores de ejemplo |
| Esquema Prisma, modelos, tablas y relaciones | **Conservados** (sin cambio) | Restricción de alcance; `prisma validate` ✔ |
| Archivos y directorios del repositorio | Sin renombros necesarios | Ninguno contenía la denominación anterior (verificado; véase 11.9) |
| Registros históricos de Git | **Conservados intactos** | Prohibición expresa de reescribir el historial |
| Menciones históricas en este documento | **Conservadas** | Único lugar autorizado (registro de procedencia) |

### 11.5. Validaciones técnicas

| # | Prueba | Resultado | Evidencia |
|---|---|---|---|
| 1 | ESLint (`bun run lint`) | **Aprobada** | Sin errores ni advertencias |
| 2 | TypeScript (`bunx tsc --noEmit`) | **Aprobada** | Sin errores |
| 3 | Prisma validate | **Aprobada** | «The schema at prisma/schema.prisma is valid» |
| 4 | Prisma generate | **Aprobada** | Cliente generado |
| 5 | Build de producción (`bun run build`) | **Aprobada** | Todas las rutas compiladas (con `package.json` ya renombrado) |
| 6 | Sintaxis YAML de `docker-compose.yml` (alternativa a Compose real) | **Aprobada** | `yaml.safe_load` correcto; servicio/contenedor/volumen/ruta oficiales confirmados programáticamente |
| 7 | Coherencia Dockerfile ↔ Compose | **Aprobada** | Volumen, ruta SQLite e identidad presentes e idénticos en ambos; cero referencias anteriores |
| 8 | Consistencia del lockfile tras el renombrado del paquete | **Aprobada** | `bun install --frozen-lockfile --dry-run` → sin diferencias, salida exitosa |
| 9 | `docker compose config` (real) | **No ejecutable** | `docker`/`docker compose` no instalados en el sandbox (incidencia 9.6) |
| 10 | Construcción de imagen `cig-manufacturing` (real) | **No ejecutable** | Ídem |
| 11 | Ejecución de contenedor y volumen reales | **No ejecutable** | Ídem |

### 11.6. Persistencia SQLite en la ruta nueva (simulación funcional del flujo Docker)

Docker no disponible en el entorno; se reprodujo el flujo exacto del `CMD` del Dockerfile (`bunx prisma db push --skip-generate` → `bun prisma/seed.ts` → servidor standalone) sobre un directorio aislado con `DATABASE_URL=file:…/cig-manufacturing.db` (puerto 3105). **Resultado: 15/15 pasos aprobados.**

| # | Paso | Resultado |
|---|---|---|
| 1 | Esquema creado en la ruta nueva (`db push`) | ✔ |
| 2 | Semilla ejecutada | ✔ |
| 3 | Cuentas `admin@` y `ti@cig-manufacturing.com` verificadas directamente en SQLite; sin cuentas con dominio anterior | ✔ |
| 4 | Servidor de producción arrancado contra esa BD | ✔ |
| 5 | `GET /api` → 200 | ✔ |
| 6 | Login admin → 200; cookie `cig_manufacturing_sesion` emitida | ✔ |
| 7 | Login ti → 200 | ✔ |
| 8 | Sesión autenticada (`/api/auth/sesion`) → 200 | ✔ |
| 9 | Catálogo de unidades auto-sembrado (13) y unidad de prueba creada vía API → 201 | ✔ |
| 10 | Modificación verificada directamente en SQLite | ✔ |
| 11 | **Reinicio del servidor** (equivalente funcional al reinicio del contenedor) | ✔ |
| 12 | La modificación **sobrevive** al reinicio | ✔ |
| 13 | La sesión (JWT firmado) sigue válida tras el reinicio | ✔ |
| 14 | La unidad creada es visible por la API tras el reinicio | ✔ |
| 15 | Login operativo tras el reinicio | ✔ |

### 11.7. Pruebas funcionales E2E existentes

Ejecutadas sobre el build rebrandeado (`.next/standalone`), con la BD de demostración **reinicializada** mediante el flujo del CMD Docker (`db push` + semilla; respaldo previo de la BD en `/tmp/custom.db.backup-*`) y fixtures mínimos creados vía API (almacén `FIX-ALM`, productos `FIX-0001`/`FIX-0002` con ENTRADA de 150 c/u, cliente `CLI-FIX`):

| Suite | Resultado | Observaciones |
|---|---|---|
| `scripts/test-unidades.py` | **Aprobada: 56 OK / 0 FAIL** | Requiere como prerrequisito un almacén activo y un cliente activo |
| `scripts/test-clientes.py` | **Aprobada: 66/66** | |
| `scripts/test-oqc-fix.py` | **Aprobada: 70 OK / 0 FAIL** | Requiere almacén con 2 productos y stock ≥ 100 |
| `scripts/test-oqc-sync.py` | **Aprobada: 40 OK / 0 FAIL** | Ídem |
| `scripts/test-respaldo.py` | **Aprobada: 71 OK / 0 FALLAS** | |
| `scripts/test-borrado.sh` | **Ejecutada con fallos preexistentes: 27 correctas / 9 fallidas** | Las 9 fallidas son los defectos previos del módulo de borrado con historial; resultado idéntico (27/9) al estado base `442cd6e` y a la primera intervención: **cero regresiones atribuibles al rebranding** |

### 11.8. Validación de interfaz en navegador real

| # | Verificación | Resultado |
|---|---|---|
| 1 | Página de acceso en español («Bienvenido de nuevo», «Iniciar sesión») | ✔ |
| 2 | Login `admin@cig-manufacturing.com` → sesión iniciada | ✔ |
| 3 | Barra lateral: «CIG-MANUFACTURING» + «Sistema de Gestión de Fábrica» | ✔ |
| 4 | Navegación por módulos (Almacén, Catálogo, Clientes, OQC, Sistema) | ✔ (módulo Clientes abierto) |
| 5 | Conmutador ES/EN: inglés muestra «Factory Management System», «Modules» | ✔ |
| 6 | Preferencia persistida: `localStorage["cig-manufacturing.idioma"] = "en"` | ✔ |
| 7 | Claves rebrandeadas en uso: `cig-manufacturing.idioma`, `cig-manufacturing.modulo`, `cig-manufacturing.seccion` | ✔ |
| 8 | Título del documento: «CIG-MANUFACTURING — Sistema de Gestión de Fábrica \| Factory Management System» | ✔ |

Nota: en un navegador sin preferencia guardada el idioma inicial se autodetecta del sistema (el navegador headless de prueba arrancó en inglés y se conmutó manualmente al español): comportamiento previsto, no un defecto.

### 11.9. Búsqueda global final (2.ª intervención)

Búsqueda insensible a mayúsculas con todas las variantes (`fabriflow`, `FabriFlow`, `FABRIFLOW`, `fabri-flow`, `fabri_flow`, `fabri flow`) sobre los archivos rastreados (`git grep -i -E "fabriflow|fabri-flow|fabri_flow|fabri flow"`) tras el cierre técnico:

| Área | Coincidencias |
|---|---|
| Interfaz / presentación | **0** |
| Código fuente operativo | **0** |
| Configuración (incl. `.env.example`, CI) | **0** |
| Docker (Compose, Dockerfile) | **0** |
| Persistencia (rutas, BD, volúmenes) | **0** |
| Scripts | **0** |
| Pruebas | **0** |
| Despliegue vigente (`DESPLIEGUE.md`) | **0** |
| Nombres de archivos y directorios | **0** (verificado también sobre el árbol de trabajo con búsqueda de nombres) |
| Documentación vigente (`README.md`, `setup.sh`, `start.sh`, docs operativas) | **0** |
| **Documento histórico de procedencia (este archivo)** | **Únicas menciones autorizadas** (registro histórico de la identidad anterior) |

Los registros históricos de Git originales permanecen intactos (prohibición expresa de alterarlos).

**Búsqueda exhaustiva sobre el árbol de trabajo completo** (adicional a los archivos rastreados; `rg --no-ignore --hidden`, insensible a mayúsculas, excluyendo solo `.git` y `node_modules`): se localizaron artefactos derivados con la identidad anterior y se trataron así: (a) la caché de compilación de desarrollo `.next/dev` (chunks del servidor de desarrollo de sesiones previas) fue **eliminada** — artefacto regenerable, no fuente; (b) las copias de herramientas auxiliares de sesión arrastradas en `.next/standalone/scripts/` fueron **eliminadas**; (c) la copia del presente documento en `.next/standalone/docs/` fue **sincronizada** con la versión vigente. Tras la limpieza, las únicas coincidencias de texto en el árbol de trabajo son el presente documento y su copia en el directorio de compilación (ambas, registro histórico autorizado). Verificación de binarios: `db/custom.db` sin ocurrencias; los paquetes ZIP/TAR previos contienen la instantánea de la primera intervención (véase 11.10.4). Nota metodológica: las búsquedas usaron los patrones completos de la denominación anterior (`fabriflow` y variantes), nunca fragmentos, para evitar falsos positivos con la palabra legítima «fábrica».

### 11.10. Incidencias, limitaciones y pendientes de la 2.ª intervención

1. **Docker real no ejecutable en el sandbox** (incidencia 9.6): `docker compose config`, construcción de imagen, ejecución de contenedor, verificación del volumen `cig-manufacturing-data` y persistencia **con contenedor real** no se ejecutaron. Sustituidos por: validación de sintaxis YAML, comprobación programática de coherencia Dockerfile↔Compose y simulación funcional completa del flujo (11.6). **Pendiente**: ejecutar el ciclo Docker real (construir → levantar → sembrar → modificar → `docker compose restart` → verificar) en un entorno con Docker.
2. **Reciclados recurrentes del sandbox** (incidencia 9.7): gestionados; sin pérdida de trabajo ni de commits.
3. **Prerrequisitos de datos de suites E2E** (incidencia 9.8): resueltos con fixtures vía API; el flujo queda documentado para futuras ejecuciones.
4. **Paquetes ZIP/TAR de entrega** (regenerados tras el cierre, a petición de la propiedad): los paquetes previos (ZIP de 549.599 B; construidos el 2026-11-03 ≈21:54 UTC desde el estado de la primera intervención, esencialmente `27a4866`, con una versión intermedia del presente documento) incluían la primera intervención pero no el cierre técnico de la segunda: conservaban las 11 ocurrencias técnicas de la denominación anterior que entonces eran excepciones documentadas (`docker-compose.yml` 8, `Dockerfile` 2, `DESPLIEGUE.md` 1). El 2026-11-04, por instrucción expresa de la propiedad, los paquetes fueron **regenerados** desde el extremo de la rama `rebrand/cig-manufacturing` posterior al cierre documental (estado completo: corrección técnica `442cd6e`, primera intervención `9ec457f`–`d094512`, cierre técnico `2b5e66d`, registro documental `b272511`–`b3be1ea` y el presente registro), con el procedimiento de empaquetado determinista del entorno: staging desde `git archive` del extremo, manifiesto verificado contra `git ls-files`, exclusión de herramientas privadas, comprobación de ausencia de secretos y de contenido prohibido, verificación de los archivos indispensables, `prisma validate` del esquema incluido y equivalencia exacta zip≡tar. La página de entrega `descargas.html` (fuera del repositorio) publica los hashes SHA-256 definitivos y queda sincronizada con los paquetes servidos. Ambos son artefactos de entrega excluidos del repositorio.
5. **Servidor de preview del entorno** (:3000, expuesto vía Caddy :81): rearrancado al cierre sirviendo el build rebrandeado con la BD de demostración reinicializada; el estado del entorno queda coherente con la rama.

### 11.11. Confirmación final de la segunda intervención

- Los cambios se limitan a sustituciones de identidad: **13 sustituciones en 5 archivos, cero cambios de lógica, dependencias, versiones, esquema de datos o comportamiento** (auditoría del diff completo `git show 2b5e66d`).
- Los cambios de la primera intervención permanecen íntegros y funcionales (11.6-11.8).
- En el entorno local del agente, main no fue modificada, el historial no fue reescrito y no se realizaron operaciones remotas. El agente no tuvo acceso a GitHub.
- La rama local rebrand/cig-manufacturing quedó terminada y el propietario publicó manualmente el código entregado. La publicación y sus verificaciones se documentan en la sección 12.


---

## 12. Registro de publicación manual y verificación en GitHub

### 12.1. Responsabilidades y flujo de entrega

El agente realizó el trabajo en su entorno Git local y entregó el código al propietario mediante un paquete ZIP. **El agente no tuvo acceso a la cuenta, al repositorio ni a las operaciones de GitHub**; no ejecutó push, no creó ramas remotas y no abrió Pull Requests.

El propietario realizó manualmente la publicación del código entregado en GitHub. Por ello, los nombres y SHA de las referencias locales del agente no deben confundirse con los identificadores creados en el repositorio remoto.

### 12.2. Referencias locales y remotas

| Elemento | Referencia | Contexto |
|---|---|---|
| Rama local del agente | rebrand/cig-manufacturing | Entorno aislado del agente |
| Último estado local informado | b3be1ea | Commit de cierre documental local, según el informe del agente |
| Repositorio remoto | cig-industrial-group/CIG-MANUFACTURING | GitHub |
| Rama remota publicada | rebranding-documentacion-de-procedencia | Rama efectivamente verificada en GitHub |
| Commit remoto de la primera publicación | bfd39e1a0bdb4021208ba0fb2cdfdedffefe5f65 | Publicación remota anterior |
| Commit remoto de cierre técnico | 4cf7499c992847721abfd65ac7dbed2fee6a4687 | Publicación remota del cierre Docker/paquete y actualización documental |
| Padre del commit remoto de cierre | bfd39e1a0bdb4021208ba0fb2cdfdedffefe5f65 | Relación Git verificada |
| main remoto | b43e2bc015a310f0b39c8f9120b0f383f3ae1280 | Permaneció sin cambios durante esta verificación |

Los SHA locales reportados por el agente (9ec457f, 27a4866, d094512, 2b5e66d, b272511 y b3be1ea) documentan su secuencia de trabajo local. Los commits remotos tienen identificadores propios. No se afirma que ambos historiales compartan los mismos objetos Git ni que sus SHA sean intercambiables.

La rama remota se llama rebranding-documentacion-de-procedencia, no rebrand/cig-manufacturing. El segundo nombre identifica la rama local del agente; el primero identifica la rama efectivamente publicada por el propietario. Esta diferencia se registra expresamente para evitar confusión futura.

### 12.3. Comparación remota contra main

Verificación de GitHub para la rama remota rebranding-documentacion-de-procedencia frente a main:

| Indicador | Resultado verificado |
|---|---:|
| Estado de comparación | ahead |
| Commits adelante | 2 |
| Commits atrás | 0 |
| Archivos modificados acumulados | 26 |
| Inserciones acumuladas | 441 |
| Eliminaciones acumuladas | 106 |
| SHA de main durante la verificación | b43e2bc015a310f0b39c8f9120b0f383f3ae1280 |
| SHA de la rama remota | 4cf7499c992847721abfd65ac7dbed2fee6a4687 |

El diff acumulado incluye la primera intervención de rebranding y el cierre técnico posterior. Los conteos anteriores corresponden a la comparación completa de la rama con main, no exclusivamente al último commit.

### 12.4. Archivos incluidos en el cierre remoto

El commit remoto 4cf7499c992847721abfd65ac7dbed2fee6a4687 tiene como padre a bfd39e1a0bdb4021208ba0fb2cdfdedffefe5f65 y contiene cambios en:

- docker-compose.yml: servicio, contenedor, volumen, ruta SQLite y comandos de respaldo/restauración con la identidad CIG-MANUFACTURING.
- Dockerfile: nombre de volumen de ejemplo y ruta de la base de datos.
- DESPLIEGUE.md: referencia al volumen persistente.
- package.json: nombre del paquete raíz cig-manufacturing.
- bun.lock: nombre del workspace raíz coherente con package.json.
- Este documento: incorporación del registro de cierre y actualización de la trazabilidad.

Los archivos package.json y bun.lock se verificaron en GitHub y ambos indican cig-manufacturing.

### 12.5. CI de GitHub Actions

La ejecución asociada al commit remoto de cierre fue:

- **Workflow**: CI.
- **Run ID**: 41736921347.
- **Commit**: 4cf7499c992847721abfd65ac7dbed2fee6a4687.
- **Rama**: rebranding-documentacion-de-procedencia.
- **Estado final**: completed.
- **Conclusión**: success.

El job «Calidad, tipos, build y humo» terminó correctamente. Se verificaron instalación congelada, guardia de configuración, Prisma validate/generate, ESLint, build de producción, TypeScript, creación de esquema y semilla, servidor standalone, API, login y sesión autenticada.

La ejecución está disponible en:
https://github.com/cig-industrial-group/CIG-MANUFACTURING/actions/runs/41736921347

Esta CI no ejecutó una construcción ni una prueba de contenedor Docker real. Por tanto, no sustituye la validación pendiente en un entorno que disponga de Docker.

### 12.6. Verificación de identidad en el árbol remoto

En el árbol remoto correspondiente al commit 4cf7499 se revisaron las rutas de los archivos y las referencias de texto identificadas en la primera auditoría:

- No se encontraron coincidencias de las variantes de la identidad anterior en los archivos operativos inspeccionados.
- No se encontraron rutas de archivos o directorios con esas variantes en el árbol remoto consultado.
- Las menciones restantes se encuentran en el documento histórico de procedencia y son deliberadas.
- En la copia publicada de este documento se contabilizaron 50 menciones de la denominación histórica; no deben confundirse con residuos en código o configuración operativa.

La búsqueda de GitHub se realizó sobre el árbol publicado; no equivale a una inspección de archivos ignorados o artefactos privados del entorno local del agente.

### 12.7. Estado de integración

- La rama remota continúa separada de main.
- No se encontró un Pull Request abierto asociado a la rama en el momento de la consulta.
- No se realizó merge.
- main permaneció en b43e2bc015a310f0b39c8f9120b0f383f3ae1280.
- La publicación remota fue realizada por el propietario, no por el agente.

### 12.8. Alcance de las evidencias y pendientes

La publicación, el commit remoto, la comparación contra main, la CI y los archivos versionados fueron verificados directamente en GitHub.

No se verificaron independientemente desde GitHub:

- Los paquetes ZIP/TAR entregados por el agente.
- La página externa descargas.html ni sus hashes.
- El contenido del servidor de preview.
- Una ejecución Docker real con construcción de imagen, contenedor, volumen y reinicio de contenedor.

Estos elementos permanecen sujetos a las evidencias del entorno local o a una prueba posterior. No se presentan como verificaciones realizadas por GitHub.

