> **Proyecto:** CIG-MANUFACTURING · **Suite:** Registro de Decisiones Arquitectónicas  
> Formato: contexto, decisión, alternativas descartadas y consecuencias. Un ADR es
> histórico: si la decisión se revierte, se marca `SUPERSEDED` y se añade el reemplazo;
> nunca se edita para maquillar el pasado.  
> Índice completo: [00-INDICE.md](./00-INDICE.md)

---

## ADR-004 — Guarda de autenticación por ruta (`requerirPermiso`) en lugar de `middleware.ts`

**Estado:** Aceptado · **Fecha:** v1.0.0

### Contexto

Next.js App Router ofrece `middleware.ts` para interceptar peticiones antes de las
rutas. La autenticación del sistema es una cookie JWT (`cig_manufacturing_sesion`)
cuya validez depende de que el usuario siga **activo en base de datos**, y la
autorización es por permiso granular declarado en el rol.

### Decisión

No usar `middleware.ts`. La autenticación/autorización es una **guarda explícita** al
inicio de cada manejador de ruta:

```ts
const guardia = await requerirPermiso(request, "clientes.ver");
if (guardia instanceof NextResponse) return guardia; // 401 / 403
const { usuario } = guardia;                          // usuario verificado
```

(`src/modulos/autenticacion/servicios/auth.ts`). Las rutas públicas son la excepción
explícita (`/api/auth/login`, `/api/auth/banderas`, y registro/recuperación si están
habilitados por configuración).

### Justificación

1. **Nada se filtra por coincidencia de patrón**: cada endpoint declara su permiso en
   su propia fuente; una ruta nueva sin guarda es visible en revisión de código (y
   viola la checklist del doc 03), mientras que en un middleware por prefijos una ruta
   fuera del patrón quedaría abierta sin llamar la atención.
2. **Verificación real contra la BD en cada petición**: la guarda recarga el usuario y
   su rol (`obtenerSesion`); desactivar un usuario revoca sus sesiones al instante.
3. **Permisos como dato del rol, no como código**: el permiso exigido es una cadena
   gestionable desde la aplicación (Roles y Permisos), sin redesplegar reglas de
   middleware.
4. **Auditoría simple**: el mapa ruta → permiso (docs/02 §4) se verifica leyendo la
   primera línea de cada `route.ts`.

### Alternativas descartadas

- **`middleware.ts` con matcher de `/api/*`**: redirige/rechaza por patrón, pero el
  modelo de permisos granulares terminaría duplicándose en dos lugares; además el
  middleware corre en un entorno donde consultar Prisma por petición es más frágil.
- **Bearer tokens en cabecera**: la cookie `httpOnly` evita exposición del token a JS
  del cliente (XSS); es deliberada (ADR implícito de sesión).

### Consecuencias

- Disciplina obligatoria: **toda** ruta nueva empieza con la guarda (checklist del
  doc 03, paso 3 y §7).
- El coste por petición es una verificación JWT + un `findUnique` con rol incluido;
  amortiguado por Prisma y aceptable para la carga objetivo.

---
