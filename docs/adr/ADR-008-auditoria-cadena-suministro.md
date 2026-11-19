> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-008 — Auditoría de cadena de suministro en el build de la imagen: `bun audit --audit-level=high`

**Estado:** Aceptado · **Fecha:** v1.6.0 (Fase 5)

### Contexto

La imagen Docker de producción compila con las dependencias de
`bun.lock`, pero nada verificaba su integridad frente a avisos de
seguridad publicados: una vulnerabilidad crítica en una dependencia
(transitiva o directa) llegaría a producción sin ninguna barrera.

Verificación empírica previa (bun 1.3.14, el fijado en el Dockerfile):

- `bun audit` **existe** y consulta los advisories en tiempo real; con el
  árbol heredado reportaba **98 vulnerabilidades (4 críticas, 56 altas)**,
  incluida una **crítica en el propio `next` 16.1.3** (corregida a partir
  de 16.4.1).
- `bun audit` **no tiene bandera `--severity`**: su umbral nativo es
  `--audit-level=<low|moderate|high|critical>` (misma semántica que
  `npm audit --audit-level`).
- El comando **sale con código 1** cuando existen avisos ≥ el umbral y con
  **0** cuando el árbol está limpio (verificado en ambos sentidos).

### Decisión

1. **Etapa de auditoría en el Dockerfile**, situada inmediatamente después
   de `bun install --frozen-lockfile` y antes de copiar el código y
   compilar:

   ```dockerfile
   RUN bun audit --audit-level=high
   ```

   El build de la imagen **se detiene** (código de salida 1) si hay
   vulnerabilidades de severidad Alta o Crítica en el árbol que está a
   punto de compilar. La capa se cachea junto a la de dependencias: solo
   se re-audita cuando cambian `package.json` o `bun.lock`.

2. **Se usa `bun audit`, no `npm audit`**: `npm audit` tampoco tiene
   `--severity` (su bandera es igualmente `--audit-level`) y exigiría un
   `package-lock.json` que este proyecto no tiene (usa `bun.lock`);
   generarlo duplicaría la gestión de dependencias y desincronizaría el
   lockfile del runtime real.

3. **Dependencias actualizadas para que el umbral pase** (de lo contrario
   la nueva etapa habría dejado la imagen incompilable desde el primer
   día): `bun update` dentro de rangos semver (`next` 16.1.3 → 16.4.5,
   `zod` → 4.6.7, `react-dom` → 19.3.1, …), `sharp` subida explícita de
   rango (`^0.34.3` → `^0.35.5`, corrección de 3 avisos high en
   libvips/libheif/librsvg), **regeneración completa de `bun.lock`** para
   purgar resoluciones transitivas obsoletas anidadas, y un
   **`overrides` de `deepmerge-ts` a `8.0.2`** porque `@prisma/config`
   6.19.3 (última 6.x; Prisma 7 exige migrar a `prisma.config.ts`, fuera
   de alcance) fija exactamente la 7.1.5, vulnerable (GHSA-ggr8-5vv4-36mx).
   Resultado: **0 críticas, 0 altas** (antes: 4 y 56).

4. **1 moderate aceptado y documentado**: `minimatch` ≥7 <11.0.1
   (GHSA-g3hv-m249, DoS por amplificación de glob) en la cadena de
   `devDependencies` de ESLint/TypeScript-ESTree. Corregirlo exige un
   override a la 11.x (mayor, con cambio de API de minimatch) sobre la
   herramienta de lint; el umbral de la etapa de auditoría es High/Crítica
   y este aviso está por debajo. Se reevaluará cuando typescript-eslint
   publique el salto.

### Justificación

- **Puerta en el lugar correcto**: auditar justo después de instalar (con
  el lockfile congelado que usará el build) y antes de compilar falla
  rápido y sin coste adicional de caché; auditar después de compilar
  desperdiciaría el trabajo.
- **Umbral High/Crítica**: son las severidades con explotación realista
  (RCE, ejecución en build, exposición de datos). Bajarlo a moderate/low
  en una cadena de herramientas de desarrollo (ESLint, Babel) genera
  ruido que entrena al equipo a ignorar la puerta.
- **El exit code es la barrera**: no hace falta parsear la salida; el
  contrato del comando (0 limpio / 1 con avisos ≥ umbral) es la interfaz
  estable que Docker traduce en fallo de build. `scripts/prueba-humo-fase5.ts`
  verifica ambos sentidos de ese contrato.
- **`sharp` como dependencia directa**: la subida de rango fue deliberada
  (no hay forma compatible de llegar a 0.35.x desde `^0.34.3`, que en
  versiones 0.x no cruza el menor); sharp también la consume `next` para
  optimización de imágenes en runtime.

### Alternativas descartadas

- **`npm audit` como alternativa**: sin `--severity` tampoco, requiere
  `package-lock.json` (el proyecto usa `bun.lock`) y duplicaría lockfiles.
- **`bun audit --json` + script que parsea severidades**: re-implementa
  la semántica que `--audit-level` ya da de forma nativa y estable.
- **Umbral `critical` solamente**: dejaría pasar las 56 high (Next incl.)
  que esta fase precisamente vino a cerrar.
- **`bun update --latest`**: actualiza con cambios de rotura fuera de los
  rangos declarados; el arreglo debía ser mínimo y verificable.
- **Migrar a Prisma 7** para resolver el pin de `deepmerge-ts`: migración
  de configuración (`prisma.config.ts`) fuera del alcance y riesgo de la
  fase; el override es quirúrgico y validado por CI.

### Consecuencias

- Un aviso High/Crítica nuevo publicado contra cualquier dependencia
  **bloquea el siguiente build de la imagen** hasta actualizar: es el
  comportamiento buscado (la puerta es un compromiso visible, no una
  sugerencia).
- `bun.lock` quedó regenerado: los cambios de dependencias viajan en el
  DIFF de la fase y todo el sistema se revalidó (CI: build, tipos, BD
  efímera, semilla, servidor real, login y rate-limit).
- **Corrección en v1.1.1 (transparencia):** la actualización de rangos
  también subió `eslint-config-next` a 16.4.5, cuyo
  `eslint-plugin-react-hooks` 7.1.1 convierte
  `react-hooks/set-state-in-effect` en error; `carousel.tsx` y
  `use-mobile.ts` (componentes shadcn sin tocar por las fases) la
  incumplían. La simulación de CI local NO lo detectó: sus pasos de
  calidad usaban el patrón `cmd && echo "✔"`, que en bash **no aborta**
  (errexit no aplica dentro de listas `&&`), así que el paso de lint
  fallaba en silencio y la simulación terminaba "en orden". Corregido:
  `use-mobile.ts` migrado a `useSyncExternalStore` (patrón canónico),
  `carousel.tsx` a lectura inicial diferida por `requestAnimationFrame`
  con baja simétrica de eventos, y `scripts/simulacion-ci.sh` endurecido
  con `|| fallo` en los pasos 3–7 (cada paso es ahora una puerta real).
  El workflow real de GitHub Actions nunca tuvo el defecto: sus pasos
  `run:` sí abortan con código de salida distinto de cero.
- El `overrides` de `deepmerge-ts` debe retirarse cuando Prisma publique
  una 6.x/7.x que dependa de la 8.x o superior.
- Docker no está disponible en el entorno de desarrollo de esta fase: la
  cadena del Dockerfile se validó ejecutando sus mismos pasos
  (`bun install --frozen-lockfile` → `bun audit --audit-level=high` →
  `bunx prisma generate && bun run build`) y el orden de las etapas lo
  verifica `scripts/prueba-humo-fase5.ts`. En v1.1.1 la cadena completa
  se reejecutó desde `node_modules` borrado (instalación limpia de 618
  paquetes con lockfile congelado) más CI endurecido 9/9 y las cinco
  pruebas de humo de fase.

---
