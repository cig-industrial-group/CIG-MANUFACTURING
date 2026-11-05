# 02 — Arquitectura del Sistema

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 1.1.0 · **Rama:** `main`
> Suite de documentación arquitectónica — Parte 2 de 6.

---

## 1. Flujo de datos de una petición

### 1.1 Ruta completa en producción

```
Navegador
  │  HTTPS (443) — TLS gestionado por Caddy (DNS-01 / Let's Encrypt)
  ▼
Caddy (proxy inverso, unidad systemd propia, usuario caddy)
  │  reverse_proxy 127.0.0.1:3000        ← con dominio
  │  reverse_proxy 127.0.0.1:3001        ← modo local (Caddy publica :3000)
  ▼
Servidor standalone de Next.js (.next/standalone/server.js, runtime Bun)
  │  unidad systemd cig-manufacturing, HOSTNAME=127.0.0.1
  ▼
Ruta API — src/app/api/**/route.ts
  │  1ª línea: guarda de autenticación
  │     requerirPermiso(request, "<permiso>")     ← src/modulos/autenticacion/servicios/auth.ts
  │        ├─ sin sesión válida        → 401 NO_AUTENTICADO
  │        └─ sin permiso en el rol    → 403 SIN_PERMISO
  ▼
Lógica del módulo — src/modulos/<modulo>/servicios/nucleo.ts
  │  reglas de negocio, folios, snapshots, bitácoras, transacciones
  ▼
Transacciones con reintentos — src/lib/reintentos.ts (Fase 3)
  ▼
Prisma Client (singleton + WAL/pool=1/busy_timeout) — src/lib/db.ts
  ▼
SQLite (archivo único) — DATABASE_URL (db/custom.db o db/production.db)
```

**Precisión obligatoria:** este proyecto **no** usa `middleware.ts` de Next.js. La capa de
autenticación es la **guarda `requerirPermiso()`** invocada al inicio de cada manejador de
ruta (`route.ts`). Es una decisión deliberada, no una omisión: cada endpoint declara
explícitamente el permiso que exige, la guarda es una sola función auditable, y no existe
ninguna ruta "olvidada" por una coincidencia de patrón de URL (ver
[ADR-004](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md)). Cuando este documento
dice «middleware de autenticación», se refiere a esta guarda.

### 1.2 Ciclo de la sesión JWT (cookie httpOnly)

Todo el ciclo vive en `src/modulos/autenticacion/servicios/auth.ts`:

1. **Login** — `POST /api/auth/login` valida correo + contraseña (bcrypt) con límites
   anti-fuerza bruta (5 fallos por IP+cuenta y 20 por IP en 15 minutos; al agotarse
   responde `429` con `Retry-After`). Con credenciales válidas:
   - `crearTokenSesion(usuarioId)` firma un JWT **HS256** con `sub = usuarioId`,
     emisión y expiración **7 días** (`60 * 60 * 24 * 7`).
   - `conCookieSesion()` adjunta la cookie **`cig_manufacturing_sesion`** con
     `httpOnly: true`, `sameSite: "lax"`, `path: "/"`, `maxAge: 7 días` y
     `secure: true` en producción (solo se omite con `COOKIE_INSEGURA_HTTP=1`,
     que avisa en el arranque).
2. **Cada petición** — la guarda `requerirPermiso()`:
   - lee la cookie de la petición (`leerCookie`),
   - verifica firma y expiración del JWT (`verificarTokenSesion`, `jose`),
   - **recarga el usuario desde la BD** (`obtenerSesion`): si el usuario fue
     eliminado o desactivado, la sesión deja de servir aunque el token siga firmado
     (revocación efectiva por BD),
   - parsea `rol.permisos` (JSON en la tabla `Rol`) y comprueba el permiso exigido.
3. **Logout** — `POST /api/auth/logout` elimina la cookie (`sinCookieSesion`,
   `maxAge: 0`).
4. **Rotación de secreto** — cambiar `AUTH_SECRET` invalida todas las sesiones: los
   usuarios vuelven a autenticarse. No hay mecanismo de migración de tokens.

### 1.3 Flujo del frontend

- `src/app/page.tsx` monta el shell del sistema; el módulo activo se resuelve con el
  registro de módulos (`src/modulos/nucleo/registro.tsx`) y el store Zustand
  (`useModuloStore`, persistido en `localStorage` bajo la clave `cig-manufacturing.modulo`).
- La navegación muestra solo módulos/secciones cuyo permiso tiene el rol del usuario
  (`modulosPermitidos` / `seccionesPermitidas`). La API valida lo mismo en servidor.
- Cada módulo consume sus datos con **React Query** (`servicios/consultas.ts`) sobre el
  servicio HTTP del módulo (`servicios/api.ts`); las mutaciones invalidan la caché del
  módulo al completarse.
- El idioma ES/EN es un diccionario único
  (`src/modulos/compartidos/idioma/diccionario.ts`) consumido con `useIdioma()`.

---

## 2. Estructura de directorios

```
CIG-MANUFACTURING/
├── prisma/
│   ├── schema.prisma              # FUENTE ÚNICA del modelo de datos (21 modelos)
│   └── seed.ts                    # Semilla idempotente: roles, configuración, admin inicial
├── db/                            # Base de datos SQLite + db/backups/ (estado de producción)
├── src/
│   ├── app/                       # App Router de Next.js
│   │   ├── layout.tsx             # Raíz, fuentes y estilos
│   │   ├── page.tsx               # Shell de la aplicación (pantalla única)
│   │   ├── globals.css            # Tema Tailwind + tokens shadcn/ui
│   │   └── api/                   # RUTAS API (fin del capa de red)
│   │       ├── route.ts           #   /api — verificación de vida (healthcheck)
│   │       ├── auth/              #   login, logout, sesion, registro, recuperacion,
│   │       │                      #   recuperacion/confirmar, password, banderas
│   │       ├── usuarios/          #   /api/usuarios (+ [id])
│   │       ├── roles/             #   /api/roles (+ [id])
│   │       ├── ajustes/           #   /api/ajustes
│   │       ├── almacen/           #   almacenes, productos, movimientos, inventario,
│   │       │                      #   estadisticas (+ [id] donde aplica)
│   │       ├── unidades/          #   /api/unidades (+ [id])
│   │       ├── catalogo/          #   modelos, partes (+ [id])
│   │       ├── clientes/          #   /api/clientes (+ [id])
│   │       ├── oqc/               #   salidas (+ [id] y [id]/partidas/[partidaId]),
│   │       │                      #   rechazos, scrap (+ [id])
│   │       ├── papelera/          #   /api/papelera (+ [id], [id]/restaurar)
│   │       └── respaldo/          #   respaldo, auto, descargar, restaurar, revertir, subir
│   ├── modulos/                   # LÓGICA DE NEGOCIO por módulo
│   │   ├── autenticacion/         #   permisos.ts (catálogo), servicios/ (auth, seguridad,
│   │   │                          #   sesion, limites, configuracion, api), componentes/
│   │   ├── almacen/               #   index (secciones), tipos, servicios (nucleo con
│   │   │                          #   folios y stock), componentes (panel, inventario,
│   │   │                          #   operaciones, historial, QR…)
│   │   ├── unidades/              #   catálogo de unidades + conteo en paquetes
│   │   ├── catalogo/              #   modelos y números de parte
│   │   ├── clientes/              #   patrón de referencia para módulos CRUD (ver doc 03)
│   │   ├── oqc/                   #   liberaciones, partidas, scrap, rechazos
│   │   ├── usuarios/              #   gestión de usuarios y roles
│   │   ├── papelera/              #   restauración y purga
│   │   ├── respaldo/              #   respaldo/restauración en caliente
│   │   ├── ajustes/               #   banderas del sistema
│   │   ├── nucleo/                #   registro.tsx: registro de módulos y secciones
│   │   └── compartidos/           #   ui/ (componentes del dominio), idioma/, errores.ts
│   ├── components/ui/             # Componentes shadcn/ui (vocabulario UI base)
│   ├── hooks/                     # use-toast, use-mobile
│   ├── lib/                       # db.ts (Prisma singleton, endurecimiento Fase 2),
│   │                              # reintentos.ts (Fase 3), numerico.ts (Decimal, Fase 1),
│   │                              # utils.ts (cn)
│   └── instrumentation.ts         # Validación de AUTH_SECRET AL ARRANQUE (fail-secure)
├── scripts/                       # Operación, migraciones puntuales y pruebas E2E
│   ├── seed.ts                    #   (alias de siembra usado por CI)
│   ├── permiso-*.ts               #   migraciones puntuales de permisos (catalogo, clientes,
│   │                              #   correccion, oqc, respaldo, unidades)
│   ├── migrar-papelera.ts         #   backfill de snapshots del histórico
│   ├── simulacion-ci.sh           #   réplica local del pipeline de CI (9 pasos)
│   ├── test-clientes.py           #   E2E del módulo Clientes (patrón de pruebas)
│   ├── test-oqc-fix.py            #   E2E correcciones OQC
│   ├── test-oqc-sync.py           #   E2E sincronización cabecera/partidas OQC
│   ├── test-respaldo.py           #   E2E respaldo/restauración
│   ├── test-unidades.py           #   E2E unidades y conteo en paquetes
│   ├── test-borrado.sh            #   E2E borrado en niveles
│   ├── validar-auth-secret.sh     #   validador de secreto compartido por los scripts de arranque
│   ├── posbuild.mjs               #   copia static/ y public/ al standalone
│   └── empaquetar.sh              #   empaquetado de distribución
├── docs/                          # ESTA suite de documentación
├── deploy.sh                      # Instalador de producción (Ubuntu 22.04, endurecido)
├── setup.sh                       # Instalación local completa en un paso
├── start.sh                       # Arranque del standalone (bun/node) con validaciones
├── Dockerfile · docker-compose.yml· Caddyfile   # Despliegue Docker opcional y proxy de referencia
├── next.config.ts                 # output: "standalone"
├── DESPLIEGUE.md                  # ⚠️ DEPRECADO — ver docs/05
└── README-DEPLOY.md               # Guía detallada de deploy.sh (mantiene vigencia)
```

**Regla de capas:** `src/app/api` **no** contiene reglas de negocio: valida entrada,
invoca la guarda, llama a `src/modulos/<modulo>/servicios/nucleo.ts` y traduce errores
a respuestas JSON. El catálogo de rutas completo está en la sección 4.

---

## 3. Modelo de seguridad

### 3.1 Validación de `AUTH_SECRET` (defensa en tres capas)

El secreto HS256 con el que se firman las sesiones se valida con el mismo criterio en
tres puntos independientes:

| Capa | Archivo | Comportamiento |
|---|---|---|
| **Arranque del servidor** | `src/instrumentation.ts` → `seguridad.ts` | `register()` de Next.js valida al levantar el proceso. En producción (`NODE_ENV=production`), un secreto ausente, vacío, con espacios, menor de 32 caracteres, mayor de 512 o igual a un valor publicado **detiene el arranque** con error explícito. |
| **Defensa en profundidad** | `src/modulos/autenticacion/servicios/seguridad.ts` → `auth.ts` | `obtenerSecretoFirmado()` valida perezosamente al primer uso de firma/verificación y memoriza. En producción lanza si es inválido. En desarrollo genera un secreto **efímero aleatorio** y avisa. |
| **Scripts de arranque** | `scripts/validar-auth-secret.sh` | `setup.sh`, `start.sh` y `docker-entrypoint.sh` hacen `source` y rechazan el arranque con el mismo criterio (32+ caracteres, sin espacios, lista negra). |

Lista negra de valores publicados (inutilizables como secreto, definida en
`seguridad.ts` y `validar-auth-secret.sh`): `cig-manufacturing-secreto-desarrollo-2024-cambiar-en-produccion`,
`fabriflow-secreto-desarrollo-2024-cambiar-en-produccion`,
`cambia-esta-clave-por-una-aleatoria-de-64-caracteres`,
`cambia-esta-clave-con-openssl-rand-hex-32`, `pega-aqui-tu-clave-aleatoria`,
`ci-clave-efimera-solo-pruebas`, `clave-local-solo-pruebas`.
Generación correcta: `openssl rand -hex 32` (o `openssl rand -base64 48`, que es lo que
usa `deploy.sh`). El valor del secreto **nunca** se imprime en logs ni mensajes de error.

`deploy.sh` genera el `.env` con `AUTH_SECRET` aleatorio (600,
propietario `cig-manufacturing`) y en re-ejecuciones **conserva y valida** el existente.

### 3.2 Endurecimiento de systemd en producción (resumen)

La unidad `cig-manufacturing.service` la genera `deploy.sh` (no se edita a mano: se
regenera). Directivas verificadas en el script:

```ini
[Service]
User=cig-manufacturing
Group=cig-manufacturing
WorkingDirectory=/home/cig-manufacturing/CIG-MANUFACTURING
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1        # la app nunca escucha en la interfaz pública
Environment=PORT=3000                 # 3001 en modo local (Caddy publica :3000)
EnvironmentFile=/home/cig-manufacturing/CIG-MANUFACTURING/.env
ExecStart=/home/cig-manufacturing/.bun/bin/bun /home/cig-manufacturing/CIG-MANUFACTURING/.next/standalone/server.js
Restart=always
RestartSec=10
StandardOutput=append:…/logs/stdout.log
StandardError=append:…/logs/stderr.log
UMask=0077

NoNewPrivileges=yes
ProtectSystem=strict                 # TODO el sistema de archivos en solo lectura…
ProtectHome=read-only                 # /home legible pero no escribible
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelLogs=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
RestrictSUIDSGID=yes
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallErrorNumber=EPERM
RemoveIPC=yes
CapabilityBoundingSet=               # vacío: sin ninguna capacidad Linux
ReadWritePaths=…/db
ReadWritePaths=…/logs
ReadWritePaths=…/.next/standalone/.next/cache
```

Resultado observable: el proceso solo puede escribir en `db/`, `logs/` y la caché del
standalone; todo lo demás (incluido su propio código) es de solo lectura. La justificación
de `ProtectHome=read-only` frente a `yes` está en
[ADR-002](./06-REGISTRO-DECISIONES-ARQUITECTONICAS%20%28ADR%29.md). La unidad `caddy.service`
aplica el mismo bloque con `ProtectHome=yes` (Caddy no vive en `/home`) y solo la capacidad
`CAP_NET_BIND_SERVICE`.

Complementos del despliegue: UFW (denegar entrantes por defecto; solo SSH y 443/3000),
firewall, token de Cloudflare en `/etc/caddy/caddy.env` (600, root), cabeceras de
seguridad y HSTS (modo dominio), rotación de logs semanal (`/etc/logrotate.d/cig-manufacturing`,
8 rotaciones, `copytruncate`). Operación completa en
[05-DESPLIEGUE-Y-OPERACION.md](./05-DESPLIEGUE-Y-OPERACION.md).

---

## 4. Mapa de rutas API (v1.0.0)

| Ruta | Métodos | Guarda (permiso) |
|---|---|---|
| `/api` | GET | Pública (healthcheck) |
| `/api/auth/login` | POST | Pública (con rate-limit) |
| `/api/auth/logout` | POST | Sesión |
| `/api/auth/sesion` | GET | Sesión |
| `/api/auth/password` | POST | Sesión |
| `/api/auth/registro` | POST | Pública (solo si `auth.registroHabilitado`) |
| `/api/auth/recuperacion` · `/api/auth/recuperacion/confirmar` | POST | Pública (solo si `auth.recuperacionHabilitada`) |
| `/api/auth/banderas` | GET | Pública (banderas de config) |
| `/api/usuarios` · `/api/usuarios/[id]` | GET/POST · GET/PATCH/DELETE | `usuarios.gestionar` |
| `/api/roles` · `/api/roles/[id]` | GET/POST · PATCH/DELETE | `usuarios.gestionar` |
| `/api/ajustes` | GET/POST | `ajustes.gestionar` |
| `/api/almacen/almacenes` · `[id]` | GET/POST · PATCH/DELETE | `almacen.ver` / `almacen.gestionar` |
| `/api/almacen/productos` · `[id]` | GET/POST · PATCH/DELETE | `almacen.ver` / `almacen.gestionar` |
| `/api/almacen/movimientos` · `[id]` | GET/POST · PATCH/DELETE | `movimientos.crear` / `movimientos.corregir` |
| `/api/almacen/inventario` | GET | `almacen.ver` |
| `/api/almacen/estadisticas` | GET | `almacen.ver` |
| `/api/unidades` · `[id]` | GET/POST · PATCH/DELETE | `unidades.gestionar` |
| `/api/catalogo/modelos` · `[id]` | GET/POST · PATCH/DELETE | `catalogo.ver` / `catalogo.gestionar` |
| `/api/catalogo/partes` · `[id]` | GET/POST · PATCH/DELETE | `catalogo.ver` / `catalogo.gestionar` |
| `/api/clientes` · `[id]` | GET/POST · GET/PATCH/DELETE | `clientes.ver` / `clientes.gestionar` |
| `/api/oqc/salidas` · `[id]` · `[id]/partidas/[partidaId]` | GET/POST · PATCH/DELETE · PATCH/DELETE | `oqc.ver`/`oqc.liberar` / `oqc.gestionar` / `oqc.gestionar` |
| `/api/oqc/rechazos` · `[id]` | GET/POST · PATCH/DELETE | `oqc.ver` / `oqc.gestionar` |
| `/api/oqc/scrap` · `[id]` | GET/POST · PATCH/DELETE | `oqc.ver` / `oqc.gestionar` |
| `/api/papelera` · `[id]` · `[id]/restaurar` | GET · DELETE · POST | `papelera.ver` / `papelera.gestionar` |
| `/api/respaldo` · `auto` · `descargar` · `restaurar` · `revertir` · `subir` | GET/POST | `respaldo.gestionar` |

Convención de errores: cuerpo JSON `{ "error": "CODIGO_MAYUSCULAS" }` con el código
estable (`CLIENTE_CODIGO_DUPLICADO`, `STOCK_INSUFICIENTE`, `NO_AUTENTICADO`,
`SIN_PERMISO`, …) que el frontend traduce a texto localizado vía `claveErrorApi()`
(`src/modulos/compartidos/errores.ts`).

---

## 5. Registro y navegación de módulos (frontend)

El shell renderiza módulos declarados en `MODULOS` (`src/modulos/nucleo/registro.tsx`).
Cada módulo exporta sus secciones (`DefinicionSeccion`: `id`, `claveEtiqueta`,
`claveDescripcion`, `claveGrupo`, `icono`, `permiso` opcional) y un componente
enrutador `Modulo<Nombre>({ seccionId })`.

Módulos activos en v1.0.0: `almacen` (permiso `almacen.ver`), `catalogo`
(`catalogo.ver`), `clientes` (`clientes.ver`), `oqc` (`oqc.ver`) y `sistema`
(usuarios, roles, papelera, ajustes, respaldo). Los módulos `produccion`, `compras` y
`calidad` están **declarados pero deshabilitados** (`disponible: false`) como marcadores
de posición de roadmap.

El procedimiento completo para añadir un módulo nuevo —incluido el registro, los
permisos, la API, la UI y las pruebas— está especificado paso a paso en
[03-GUIA-DESARROLLO-NUEVOS-MODULOS.md](./03-GUIA-DESARROLLO-NUEVOS-MODULOS.md).
