# FASE 14 — Informe de Validación
## Módulo de Branding (Identidad Visual)

**Proyecto:** CIG-MANUFACTURING · **Versión auditada:** 1.0.0
**Rama de trabajo:** `feat/branding-ajustes` (creada desde `main`)
**Fecha de validación:** 2026-11-05
**Método:** verificación ejecutada contra el sistema real (build de producción + servidor standalone + APIs + navegador), pruebas E2E automatizadas (`scripts/test-branding.py`, 58 verificaciones) y réplica completa del pipeline de CI (`bash scripts/simulacion-ci.sh`, 9/9 pasos). Cada afirmación de este informe se comprobó contra el código y el sistema en ejecución; ninguna se infiere.

---

## 1. Criterios de aceptación (checklist de auditoría)

| # | Criterio | Estado | Evidencia de verificación |
|---|---|---|---|
| 1 | El permiso `ajustes.branding` existe en `prisma/seed.ts` y `src/modulos/autenticacion/permisos.ts` | **PASS** | `prisma/seed.ts:77` (arreglo `PERMISOS`; los roles ADMIN y TI usan `TODOS = [...PERMISOS]`, línea 83, de modo que ambos lo reciben automáticamente en instalaciones nuevas). `src/modulos/autenticacion/permisos.ts:44` (arreglo `PERMISOS`) y `:104` (`PERMISOS_AGRUPADOS`, grupo «Administración»). Verificado en BD en vivo tras `bun scripts/permiso-branding.ts`: los roles ADMIN y TI contienen el permiso (consulta SQLite directa). La migración puntual `scripts/permiso-branding.ts` sigue el patrón de `scripts/permiso-clientes.ts` (asignación ADMIN + TI, idempotente, omite roles inexistentes). |
| 2 | Las API routes `/api/ajustes/branding/logo` y `/favicon` funcionan (POST, DELETE) | **PASS** | E2E §3–§7: `POST logo PNG → 201`, `POST logo SVG → 201` (sobrescribe la extensión anterior y actualiza `branding.logoTipo`), `POST favicon ICO → 201`, `POST favicon PNG → 201`. `DELETE logo → 200` (restaura predeterminado y borra la clave de configuración), `DELETE favicon → 200`, y **idempotencia**: repetir el DELETE con el recurso ya inexistente también responde 200. Todas las rutas usan `requerirPermiso(request, "ajustes.branding")` como primera operación (`src/app/api/ajustes/branding/logo/route.ts:43,74`; `favicon/route.ts:43,74`; `route.ts:17`). |
| 3 | Las API routes `/api/branding/logo` y `/favicon` sirven los archivos (GET) | **PASS** | E2E §1 y §3: públicas (200 sin sesión, necesarias para la pantalla de acceso), sirven los bytes exactos subidos (`bytes servidos == bytes subidos`), con `Content-Type` correcto por tipo (`image/png`, `image/svg+xml`, `image/x-icon`) y `Cache-Control: public, max-age=3600`. Sin archivo personalizado sirven el predeterminado (`public/logo.svg`). Implementación con **streams** (`fs.createReadStream` → `Readable.toWeb`), sin cargar el archivo en memoria, y `export const dynamic = "force-dynamic"` para que el build jamás congele la respuesta (rutas marcadas `ƒ` en la salida de `next build`). |
| 4 | El directorio `branding/` se crea con permisos correctos | **PASS** | En runtime: `carpetaBranding()` → `fs.mkdirSync(recursive)` + `fs.writeFileSync(mode: 0o644)` (`src/modulos/ajustes/servicios/branding.ts`, `guardarArchivo`); verificado en disco: `branding/logo.png` con permisos `-rw-r--r--` (644) tras la subida por UI. En despliegue: `deploy.sh:595` crea el directorio con `mkdir -p branding && chmod 755 branding` como usuario de servicio. Ubicación: raíz de la aplicación (hermana de `db/`, resuelta desde `DATABASE_URL`; reubicable con `BRANDING_DIR`), **fuera de `public/`** para que los builds no lo regeneren. |
| 5 | `deploy.sh` incluye `branding/` en ReadWritePaths y lo excluye del rsync | **PASS** | `deploy.sh:521` — `--exclude='branding/'` en el `rsync -a --delete` (los archivos subidos nunca se sobrescriben al re-desplegar); `deploy.sh:687` — `ReadWritePaths=${APP_DIR}/branding` en la unidad systemd (junto a `db` y `logs`); `deploy.sh:592-595` — creación del directorio con permisos 755. Comentario de aislamiento de la unidad actualizado (línea 629). `bash -n deploy.sh` pasa (sintaxis válida). Adicional: `.gitignore:24` excluye `branding/` (dato de runtime, igual que `db/`). |
| 6 | La UI permite subir, previsualizar y eliminar logo/favicon | **PASS** | `src/modulos/ajustes/componentes/SeccionBranding.tsx`: vista previa del logo (tarjeta de 96 px) y del favicon (maqueta de pestaña de navegador con el título de la app), badge «Personalizado/Predeterminado», botones «Subir logo/Subir favicon» (input file oculto con `accept` restringido), «Restaurar predeterminado» solo visible cuando existe personalizado, validación en cliente (tipo + tamaño antes de enviar), estados de carga (`Loader2` + deshabilitado) y feedback con `useToast` (éxito y error con `claveErrorApi`). Verificado en navegador real (agent-browser): subida de un PNG 512×512 por la UI → badge cambia a «Personalizado» + toast de éxito + aparece «Restaurar predeterminado»; al restaurar → vuelve a «Predeterminado». Registrada como sección «Identidad Visual» del módulo Sistema (`src/modulos/nucleo/registro.tsx:189-196`, icono Palette, permiso `ajustes.branding`), enrutada por `ModuloAjustes({ seccionId })` (`ModuloAjustes.tsx:143-148`). |
| 7 | El layout principal usa el favicon dinámico (`/api/branding/favicon`) | **PASS** | `src/app/layout.tsx:34-52` — `generateMetadata()` retorna `icons: { icon: "/api/branding/favicon" }`, que materializa `<link rel="icon" href="/api/branding/favicon">` en el `<head>`. Verificado en el HTML servido: E2E §1 comprueba que `GET /` incluye exactamente ese `rel="icon"` con ese `href`. La URL es estable; el contenido lo resuelve la API en cada petición (el cambio de favicon no requiere recompilar; la caché del navegador se refresca en ≤ 1 h por diseño). |
| 8 | El sidebar/header usa el logo dinámico (`/api/branding/logo`) | **PASS** | `src/modulos/nucleo/index.tsx` — `Marca()` (sidebar de escritorio y drawer móvil, líneas 74-94), encabezado móvil (líneas 427-432) y `PantallaCarga` (498-507) usan `<img src={urlLogo(version)}>` en lugar del ícono hardcodeado. También la pantalla de acceso (`PantallaAutenticacion.tsx`, panel de marca de escritorio y marca móvil). **Aplicación inmediata**: tras subir el logo por la UI se verificó en el navegador que el `src` del sidebar pasa a `/api/branding/logo?v=<marca de tiempo>` sin recargar la aplicación (invalidación de caché vía `useVersionBranding`, `useSyncExternalStore` sobre localStorage + eventos; refresca también otras pestañas abiertas). |
| 9 | Las pruebas E2E (`scripts/test-branding.py`) pasan completamente | **PASS** | `ADMIN_PASSWORD=… python3 scripts/test-branding.py` → **58/58 verificaciones superadas**, ejecutado **dos veces consecutivas** con el mismo resultado (la suite incluye limpieza inicial de restos de ejecuciones previas, patrón de `test-clientes.py`). Cobertura: servicio público con cabeceras, autenticación (401/403/SIN_PERMISO), subidas válidas (PNG/SVG/ICO) con verificación byte a byte, sobrescritura entre extensiones, rechazos (.exe → `BRANDING_ARCHIVO_INVALIDO`; contenido falso con extensión .png → `BRANDING_ARCHIVO_INVALIDO` por magic bytes; logo > 2 MB y favicon > 500 KB → 413 `BRANDING_TAMANNO_EXCEDIDO`), idempotencia de DELETE, restauración del predeterminado, `<link rel="icon">` en el HTML y permisos por rol (OPERADOR → 403). |
| 10 | `bash scripts/simulacion-ci.sh` pasa completo | **PASS** | Ejecutado sobre el estado final de la rama: **9/9 pasos** — guardia de `ignoreBuildErrors`, guardia de secretos, `prisma validate`+`generate`, ESLint, build de producción, `tsc --noEmit`, BD efímera + semilla (6 roles, configuración y admin con el permiso nuevo incluido), servidor standalone y humo (API, login, sesión, rate-limit). Termina con «✔✔ SIMULACIÓN DE CI COMPLETA: TODO EN ORDEN». |
| 11 | Textos visibles traducidos (ES/EN), sin literales hardcodeados | **PASS** | Diccionario bilingüe: subárbol `ajustes.branding` (27 claves ES = 27 claves EN, paridad verificada programáticamente con el diccionario importado) + `nav.branding`/`nav.descripcionBranding` en ambos idiomas. Todas las cadenas visibles de `SeccionBranding.tsx`, `registro.tsx` y los toasts pasan por `t()`. Errores estables BRANDING_* mapeados en `src/modulos/compartidos/errores.ts:102-105` → claves i18n. Verificado en navegador en ambos idiomas: «Identidad Visual / Visual Identity», «Subir logo / Upload logo», «Restaurar predeterminado / Restore default», descripciones y notas. |
| 12 | Informe de validación entregado, criterio por criterio | **PASS** | Este documento: §1 checklist con método de verificación por criterio, §2 evidencia de ejecución, §3 inventario de archivos, §4 notas de diseño y desviaciones justificadas. |

---

## 2. Evidencia de ejecución

### 2.1 Pipeline local (estado final de la rama)

```
bun run lint                → 0 errores, 0 advertencias
./node_modules/.bin/tsc --noEmit → sin errores de tipos
bun run build               → ✓ Compiled successfully (37/37 páginas,
                              5 rutas nuevas ƒ /api/{ajustes/}branding/*)
bun scripts/permiso-branding.ts → ✔ Añadido a ADMIN · ✔ Añadido a TI
python3 scripts/test-branding.py → 58/58 (×2 ejecuciones)
bash scripts/simulacion-ci.sh    → 9/9 · «TODO EN ORDEN»
```

### 2.2 Verificación en navegador (agent-browser, servidor de producción)

1. Inicio de sesión como ADMIN → el shell muestra el logo servido por `/api/branding/logo`.
2. Navegación **Sistema → Identidad Visual** → sección con encabezado, nota de aplicación inmediata y las dos tarjetas (logo/favicon) con badge «Predeterminado».
3. Subida de un PNG azul 512×512 por la UI → badge «Personalizado», toast de éxito, botón «Restaurar predeterminado» visible, `branding/logo.png` (1880 bytes, permisos 644) en disco, y el `src` del logo del sidebar pasa a `/api/branding/logo?v=1793853173699` (aplicación inmediata, sin reinicio ni recompilación).
4. `curl -I /api/branding/logo` → `Content-Type: image/png` + `Cache-Control: public, max-age=3600`; `cmp` confirma que los bytes servidos son idénticos a los subidos.
5. «Restaurar predeterminado» → vuelve al estado inicial y el archivo desaparece de `branding/`.
6. Conmutador EN → la sección completa se muestra en inglés («Visual Identity», «Upload logo», …) y de vuelta a ES sin literales sin traducir.

### 2.3 Anomalía detectada y corregida durante la validación

Durante la verificación visual se detectó que el encabezado mostraba la clave cruda `ajustes.branding.titulo`: el bloque i18n se había insertado como hermano de `ajustes` en lugar de anidado. Se corrigió la anidación en ES y EN, se reconstruyó y se re-verificó en navegador en ambos idiomas. Todas las evidencias de §2.2 corresponden al estado corregido.

---

## 3. Inventario de cambios (main → feat/branding-ajustes)

**19 archivos, +1518 / −38 líneas** (parche completo en `DIFF-fase14.patch`):

| Archivo | Cambio |
|---|---|
| `prisma/seed.ts` | Permiso `ajustes.branding` en el catálogo (ADMIN y TI lo heredan de `TODOS`) |
| `scripts/permiso-branding.ts` | **Nuevo.** Migración puntual para BD existentes (ADMIN + TI) |
| `src/modulos/autenticacion/permisos.ts` | Permiso en `PERMISOS` + `PERMISOS_AGRUPADOS` (Administración) |
| `src/modulos/compartidos/idioma/diccionario.ts` | `ajustes.branding.*` (27 claves ES/EN) + `nav.branding` |
| `src/modulos/compartidos/errores.ts` | Mapa BRANDING_ARCHIVO_INVALIDO / BRANDING_TAMANNO_EXCEDIDO / BRANDING_ERROR_GUARDADO |
| `src/modulos/compartidos/branding.ts` | **Nuevo.** Versión de branding (cache-busting) con `useSyncExternalStore` |
| `src/modulos/ajustes/servicios/branding.ts` | **Nuevo.** Núcleo del servidor: rutas, validación por magic bytes, límites, guardado/eliminación idempotentes, estado |
| `src/modulos/ajustes/servicios/api.ts` | Cliente HTTP: GET estado + subir/restaurar logo y favicon + límites espejo |
| `src/modulos/ajustes/servicios/consultas.ts` | Hooks React Query (`useBranding`, 4 mutaciones con invalidación y aviso de versión) |
| `src/modulos/ajustes/componentes/SeccionBranding.tsx` | **Nuevo.** UI de la sección |
| `src/modulos/ajustes/componentes/ModuloAjustes.tsx` | Enrutado por sección (`branding` → SeccionBranding) |
| `src/modulos/ajustes/index.tsx` | Exporta `SeccionBranding` |
| `src/app/api/ajustes/branding/route.ts` | **Nuevo.** GET estado (permiso `ajustes.branding`) |
| `src/app/api/ajustes/branding/logo/route.ts` | **Nuevo.** POST sube / DELETE restaura |
| `src/app/api/ajustes/branding/favicon/route.ts` | **Nuevo.** POST sube / DELETE restaura |
| `src/app/api/branding/logo/route.ts` | **Nuevo.** GET público con stream + cache 1 h |
| `src/app/api/branding/favicon/route.ts` | **Nuevo.** GET público con stream + cache 1 h |
| `src/app/layout.tsx` | `generateMetadata` con `icons.icon = "/api/branding/favicon"` |
| `src/modulos/nucleo/registro.tsx` | Sección «Identidad Visual» en el módulo Sistema (Palette, `ajustes.branding`) |
| `src/modulos/nucleo/index.tsx` | Logo dinámico en Marca (sidebar/drawer), encabezado móvil y pantalla de carga |
| `src/modulos/autenticacion/componentes/PantallaAutenticacion.tsx` | Logo dinámico en panel de marca (escritorio y móvil) |
| `deploy.sh` | rsync `--exclude='branding/'` · `mkdir branding` 755 · `ReadWritePaths=${APP_DIR}/branding` |
| `.gitignore` | `branding/` (dato de runtime) |
| `scripts/test-branding.py` | **Nuevo.** Suite E2E (58 verificaciones, autolimpiable) |
| `DIFF-fase14.patch` | **Nuevo.** Diff de la fase |

---

## 4. Notas de diseño y desviaciones justificadas

1. **Tab vs. sección de navegación.** La especificación ofrecía dos integraciones («Tabs de shadcn/ui si ya existe, o SeccionBranding como nueva sección»). Se eligió la **sección de navegación** porque es el patrón real del sistema (el sidebar filtra secciones por permiso) y porque el permiso `ajustes.branding` filtra solapadamente quién la ve: un rol con `ajustes.gestionar` pero sin `ajustes.branding` ve «Ajustes» y no ve «Identidad Visual», sin tab huérfana. `ModuloAjustes` quedó enrutable por `seccionId` igual que `ModuloUsuarios`.
2. **Predeterminado del favicon.** El repositorio no incluye `favicon.ico`; el predeterminado se sirve como `public/logo.svg` (`image/svg+xml`), el único activo de marca existente. Al subir un ICO/PNG se sirve ese. Igual patrón que el logo, como pedía la especificación.
3. **Aplicación inmediata vs. caché de 1 hora.** Ambas requeridas a la vez: la API cachea 1 h (rendimiento) y la UI invalida al instante añadiendo `?v=<marca de tiempo>` a la URL tras cada cambio (localStorage + evento; refresca también otras pestañas). El costo es una sola re-descarga del recurso cambiado.
4. **Sanitización de nombres.** Ningún nombre de usuario toca el sistema de archivos: los únicos nombres posibles son `logo.{png,svg,jpg}` y `favicon.{ico,png}` (catálogo fijo). Se suma `path.basename()` como defensa en profundidad.
5. **Validación de tipo por contenido.** La extensión se comprueba, pero el veredicto lo dan los magic bytes (PNG/JPG/ICO) o el olfateo del XML (`<svg`), de modo que un `.exe` renombrado a `.png` —o un texto plano con extensión válida— se rechazan con `BRANDING_ARCHIVO_INVALIDO`. Probado en E2E.
6. **Orden de chequeos.** Tamaño (413) antes que contenido: un archivo demasiado grande se rechaza sin leerlo entero. Para el E2E del límite se genera un PNG válido incompresible (> 2 MB), de modo que el rechazo proviene exactamente del límite y no del formato.
7. **`BRANDING_DIR` (extensión no solicitada).** La carpeta se resuelve como hermana de `db/` (raíz de la app, como pide la especificación); la variable permite reubicarla (p. ej. `/data/branding` en Docker, donde la raíz no es escribible). No se modificaron `Dockerfile`/`docker-compose.yml` porque la especificación limitaba los cambios de despliegue a `deploy.sh`; en Docker sin configurar, la subida falla con `BRANDING_ERROR_GUARDADO` y el servicio público degrada limamente al predeterminado.
8. **Credenciales del entorno de prueba.** Durante la validación en navegador se completó el cambio obligatorio de contraseña del admin sembrado (política de la app); la contraseña vigente en este entorno quedó en `Fase14*Branding` (con `debeCambiarPassword` ya resuelto). En una instalación nueva, el flujo original (contraseña aleatoria en `db/credenciales-iniciales.txt` + cambio obligatorio) no cambia.

---

## 5. Cómo reproducir la validación

```bash
# desde la raíz del proyecto, con el build ya generado (bun run build)
bash scripts/simulacion-ci.sh                 # pipeline completo (9/9)
bun scripts/permiso-branding.ts               # migración puntual (BD existente)
ADMIN_PASSWORD='<clave-admin>' python3 scripts/test-branding.py   # E2E 58/58
```

**Resultado global: 12/12 criterios de aceptación aprobados.**
