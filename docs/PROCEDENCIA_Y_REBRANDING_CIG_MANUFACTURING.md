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
- **Procedencia de componentes**: la base tecnológica corresponde a un scaffold Next.js + Tailwind + shadcn/ui + TypeScript (el campo `name` de `package.json` es `nextjs_tailwind_shadcn_ts`, plantilla de arranque sin identidad de producto). Los componentes de `src/components/ui/` siguen la estructura estándar de shadcn/ui. El desarrollo de los módulos de negocio y la identidad FabriFlow son originales del historial de este repositorio desde el commit `5f0a197`. No existe evidencia en el historial de otra procedencia (**no verificado cualquier origen anterior a `860eb1f`**).

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
| Resultado | 2026-11-03 | Último commit de la rama `rebrand/cig-manufacturing` | Registro de procedencia y trazabilidad; rama lista para auditoría externa |

No se reescribió ni alteró el historial de Git para adaptar esta cronología: todos los SHA citados son verificables con `git show`.

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

## 5. Compatibilidad y continuidad

Tratamiento de cada elemento sensible, con su decisión y su impacto real:

| Elemento | Decisión | Impacto y justificación |
|---|---|---|
| **Cookie de sesión** | Renombrada (`cig_manufacturing_sesion`) | Las sesiones activas en el momento del despliegue del cambio dejan de reconocerse y el usuario debe iniciar sesión de nuevo (una sola vez). No hay pérdida de datos: la cookie solo transporta el JWT de sesión. No se implementó alias de doble lectura porque añadiría código de compatibilidad no autorizado. Verificado: emisión y aceptación de la cookie nueva en servidor real. |
| **Secreto de firmado (`AUTH_SECRET`)** | Valor por defecto de desarrollo renombrado | Solo afecta a entornos que NO definan `AUTH_SECRET` (desarrollo): invalida sesiones previas (mismo efecto y cadencia que la cookie). En producción, `AUTH_SECRET` se define en `.env`/secreto del orquestador y no se ve afectado. No se tocó el mecanismo de firmado. |
| **Claves de `localStorage`** (`idioma`, `seccion`, `modulo`) | Renombradas (`cig-manufacturing.*`) | Las preferencias guardadas (idioma elegido, sección y módulo activos) se leen de la clave nueva, ausente en navegadores existentes: vuelven al valor por defecto («es», primera sección, primer módulo) hasta la próxima interacción. Impacto menor, autorecuperable por el usuario. Sin alias por el mismo criterio de alcance. |
| **Identificadores de servicios Docker** | **Conservados** (excepción técnica) | El servicio `fabriflow`, `container_name: fabriflow`, el volumen `fabriflow-data` y la ruta de BD `file:/data/fabriflow.db` de `docker-compose.yml` y `Dockerfile` NO se renombraron: hacerlo crearía contenedores/volúmenes nuevos y una **base de datos vacía** en los despliegues existentes (pérdida de acceso a los datos), exactamente lo que la orden de trabajo prohíbe. Su sustitución exige un procedimiento de migración (renombrado manual del volumen y del archivo de BD) que excede el alcance autorizado. Decisión técnica pendiente de la propiedad del proyecto. |
| **Volúmenes persistentes** | **Conservados** | `fabriflow-data` se mantiene; ningún dato se pierde ni se duplica. Los comandos de respaldo documentados en `docker-compose.yml` (que dependen del nombre del servicio y de la ruta de la BD) siguen siendo válidos sin cambio. |
| **Nombres y rutas de bases de datos** | Sin cambio en producción | `DATABASE_URL` no contiene la identidad (archivo `custom.db` en instalación local; `/data/fabriflow.db` en Docker, conservado por la excepción anterior). El esquema Prisma no se modificó. |
| **Directorios de instalación** | Documentación nueva actualizada; instalaciones existentes intactas | La guía ahora ejemplifica `/opt/cig-manufacturing` para instalaciones **nuevas**. Una instalación existente en `/opt/fabriflow` sigue funcionando sin cambio alguno (su `.env` define su propia ruta). No se creó mecanismo de migración de rutas. |
| **Variables de entorno** | Nombres sin cambio | `DATABASE_URL`, `AUTH_SECRET`, `PORT`, `HOSTNAME` conservan sus nombres (no contenían la identidad anterior salvo en valores de ejemplo y en el secreto por defecto de desarrollo, ya tratados). `.env.example` actualizado como documentación. |
| **Nombres de archivos de respaldo** | Documentación nueva actualizada | La guía genera respaldos `cig-manufacturing-<fecha>.db` en instalaciones nuevas. Los respaldos ya existentes con el nombre histórico **no se renombran ni se eliminan** (son datos históricos del usuario). |
| **Cuentas de prueba y datos de demostración** | Semilla renombrada; datos existentes intactos | Instalaciones nuevas crean `admin@cig-manufacturing.com` y `ti@cig-manufacturing.com` (contraseñas sin cambio). Las bases de datos **existentes** conservan sus cuentas con el dominio histórico: son datos persistentes del usuario y no se modificaron (la orden prohíbe modificar bases de datos reales). El inicio de sesión funciona con las cuentas existentes de cada instalación. |

**Declaración de compatibilidad**: la compatibilidad retroactiva de sesiones y preferencias NO se ha conservado (se documentó el impacto de su pérdida, limitado a un reinicio de sesión y de preferencias de interfaz). La compatibilidad de **datos** (bases de datos, volúmenes, respaldos) sí se conserva íntegramente. No se ha probado una actualización en caliente de un despliegue Docker existente (**no verificado**); la continuidad de datos en ese escenario está garantizada por diseño (nombres de volumen y BD intactos), no por prueba.

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

## 9. Incidencias detectadas durante la ejecución

1. **Permisos de archivo alterados por el entorno (preexistente)**: al iniciar la tarea, 72 archivos rastreados presentaban cambio de modo `100644 → 100755` (bit de ejecutable añadido) sin cambio de contenido, atribuible al reciclado del entorno. Se restauraron los modos al estado del índice de `442cd6e` (sin alterar contenido) para partir de un árbol limpio. Sin impacto en el resultado.
2. **Base de datos de demostración vacía (preexistente)**: la BD de demostración del entorno (`db/custom.db`) se halló **sin datos** durante la verificación; la copia contenida en el build anterior (2026-11-03 20:19) también está vacía, lo que acredita que la ausencia de datos es anterior al rebranding. No hubo pérdida de datos atribuible al cambio de identidad. Para restablecer el funcionamiento del entorno de demostración se ejecutó la semilla (operación estándar de `setup.sh`) sobre esa BD vacía, creando las cuentas con el dominio nuevo.
3. **Fallos preexistentes en la prueba E2E**: 9 verificaciones del módulo de borrado con historial fallan de forma idéntica en el estado base y en el rebranding (27/9 ambos). No se corrigieron por estar fuera del alcance autorizado (la orden prohíbe resolver problemas preexistentes ajenos al rebranding). Pendiente: corrección en tarea aparte.
4. **Servidor del entorno re-arrancado por el sistema**: durante la verificación, el mecanismo del entorno relanzó un servidor de desarrollo en el puerto 3000; se utilizó para las validaciones (sirve el código rebrandeado). Sin impacto en el repositorio.

5. **Commits creados inicialmente sobre `main` y recolocados**: el entorno de ejecución revirtió la rama activa (de `rebrand/cig-manufacturing` a `main`) sin intervención ni aviso durante la tarea, por lo que los commits de implementación (`9ec457f`) y de documentación (`27a4866`) se crearon inicialmente sobre `main`. Se recolocaron en la rama `rebrand/cig-manufacturing` y `main` se restauró a su punto de partida (`442cd6e`); ningún commit previo fue modificado ni eliminado (verificable: los tres commits citados existen íntegros y `main` apunta a `442cd6e`). La corrección se ejecutó el mismo día, antes de la entrega. El entorno continúa forzando la rama activa hacia `main`, por lo que la auditoría debe realizarse sobre la rama `rebrand/cig-manufacturing` y no sobre la rama activa del entorno.

## 10. Confirmación de no modificación funcional

- Commit de implementación: `9ec457f` — 23 archivos, **95 inserciones / 95 eliminaciones** (sustituciones 1:1 de cadenas de identidad; ninguna línea nueva de lógica, ninguna eliminada).
- Sin cambios en: lógica de negocio, funciones, hooks, componentes funcionales, flujos de trabajo, endpoints, contratos API, esquema Prisma, modelos, relaciones, permisos, roles, autenticación (mecanismo), autorización, validaciones, dependencias, versiones de paquetes, arquitectura, estructura modular, sincronización, respaldo ni comportamiento de la aplicación.
- El historial de Git no se reescribió ni alteró; `main` permanece en `442cd6e`; el rebranding vive únicamente en la rama `rebrand/cig-manufacturing`, lista para auditoría externa antes de cualquier integración.