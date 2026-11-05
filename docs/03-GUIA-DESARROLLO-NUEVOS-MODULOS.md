# 03 — Guía de Desarrollo: Nuevos Módulos

> **Proyecto:** CIG-MANUFACTURING · **Versión documentada:** 1.0.0 · **Rama:** `main`
> Suite de documentación arquitectónica — Parte 3 de 6.
>
> **Ejemplo maestro:** módulo **Proveedores** (catálogo de proveedores de materia prima).
> Todos los fragmentos siguen los patrones reales de `main` (módulo Clientes como
> referencia de CRUD puro; el resto indica las desviaciones cuando aplican).

---

## 0. Reglas previas inquebrantables

1. **Nomenclatura**: carpetas y rutas en minúsculas plural (`proveedores`); modelo
   Prisma en singular capitalizado (`Proveedor`); permisos `<modulo>.<accion>`
   (`proveedores.ver`, `proveedores.gestionar`).
2. **Ninguna ruta API sin guarda.** La primera línea de cada manejador invoca
   `requerirPermiso()`.
3. **Nada de lógica de negocio en `src/app/api/`**: vive en `src/modulos/<modulo>/servicios/nucleo.ts`.
4. **UI solo con shadcn/ui (`src/components/ui`) y componentes compartidos**
   (`src/modulos/compartidos/ui`). Todo texto visible pasa por el diccionario i18n ES/EN.
5. **El módulo debe ser bilingüe, accesible (labels/aria) y responsivo** (tabla en
   escritorio, tarjetas en móvil) — copia los patrones existentes, no reinventes.
6. **La siembra es idempotente y no sobrescribe permisos de roles existentes**: los
   permisos nuevos para bases de datos ya pobladas se aplican con una **migración
   puntual** (`scripts/permiso-proveedores.ts`, paso 2.3).
7. Un módulo CRUD simple no toca stock ni folios. Si tu módulo **descuenta inventario,
   emite folios o corriga movimientos**, estudia antes `src/modulos/almacen/servicios/nucleo.ts`
   y `src/modulos/oqc/servicios/nucleo.ts`: transacción, folio monotónico, snapshots y
   bitácora son obligatorios (ver [04-REFERENCIA-BASE-DATOS.md](./04-REFERENCIA-BASE-DATOS.md)).

Orden obligatorio de integración (cada paso depende del anterior):

```
1. Base de datos (schema.prisma → db push)
2. Permisos (seed.ts + permisos.ts + migración puntual)
3. API (src/app/api/proveedores/)
4. Lógica de negocio (src/modulos/proveedores/servicios/)
5. UI (componentes + index + registro + i18n)
6. Pruebas E2E (scripts/test-proveedores.py)
```

---

## 1. Base de datos

### 1.1 Modelo en `prisma/schema.prisma`

Añade el modelo en una sección nueva del esquema, con el mismo estilo de cabecera de
sección que los existentes:

```prisma
// ============================================================
// MÓDULO: PROVEEDORES / SUPPLIERS
// Catálogo de proveedores de materia prima y materiales.
// Patrón de entidad de catálogo con borrado en niveles
// (desactivar / papelera 30 días / purga): ver módulo Clientes.
// ============================================================

model Proveedor {
  id        String   @id @default(cuid())
  codigo    String   @unique // código corto del proveedor (ej. PRV-0001)
  nombre    String // razón social o nombre visible
  contacto  String? // persona de contacto
  correo    String?
  telefono  String?
  direccion String?
  notas     String?
  activo    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Es deliberadamente isomorfo a `Cliente` (líneas 318-330 de `schema.prisma`): para un
catálogo puro este es el contrato estándar del sistema. Si tu módulo participa en
movimientos (como el `clienteId` de `Movimiento`), añade además los campos de
**referencia suave + snapshots** siguiendo ese patrón — nunca una FK dura hacia una
entidad de negocio.

### 1.2 Aplicar el esquema y regenerar el cliente

Este proyecto usa `prisma db push` (sin historial de migraciones versionadas). Desde la
raíz del repositorio:

```bash
bunx prisma db push            # aplica el esquema a la BD de DATABASE_URL
bunx prisma generate           # regenera PrismaClient (db:generate en package.json)
```

`package.json` define los atajos `db:push` y `db:generate` (`bun run db:push`,
`bun run db:generate`). `deploy.sh` en producción ya ejecuta
`bunx prisma db push --skip-generate` seguido de `bunx prisma db seed` en cada
re-ejecución, por lo que desplegar la versión nueva aplica el esquema sin pasos extra.

> **Verificación inmediata:** `bunx prisma studio` o
> `sqlite3 db/custom.db ".schema Proveedor"` deben mostrar la tabla nueva.

---

## 2. Permisos

Los permisos viven en **tres** lugares que deben permanecer sincronizados:
la semilla (`prisma/seed.ts`), el catálogo del frontend
(`src/modulos/autenticacion/permisos.ts`) y la BD ya desplegada (migración puntual).

### 2.1 Catálogo de permisos en `prisma/seed.ts`

Añade las claves al arreglo `PERMISOS` (línea 61 del archivo):

```ts
/** Catálogo de permisos del sistema */
export const PERMISOS = [
  "almacen.ver",
  "almacen.gestionar",
  // … permisos existentes, sin tocar …
  "clientes.ver",
  "clientes.gestionar",
  "proveedores.ver",       // ← nuevo
  "proveedores.gestionar", // ← nuevo
  "oqc.ver",
  // …
] as const;
```

Y asigna el permiso a los roles del arreglo `ROLES` del mismo archivo. Criterio de
asignación inicial (ajústalo a la operación real de la planta):

```ts
  {
    clave: "JEFE_ALMACEN",
    // …
    permisos: [
      // … existentes …
      "clientes.ver", "clientes.gestionar",
      "proveedores.ver", "proveedores.gestionar", // ← nuevo
      "oqc.ver", "oqc.liberar",
    ],
    sistema: false,
  },
  {
    clave: "ALMACENERO",
    // …
    permisos: [
      "almacen.ver", "movimientos.crear", "catalogo.ver",
      "clientes.ver",
      "proveedores.ver", // ← nuevo (solo consulta)
      "oqc.ver", "oqc.liberar",
    ],
    sistema: false,
  },
```

`ADMIN` y `TI` usan `TODOS` (el arreglo completo), por lo que ya incluyen los permisos
nuevos en instalaciones nuevas.

### 2.2 Catálogo de permisos en el frontend (`src/modulos/autenticacion/permisos.ts`)

Añade las claves a `PERMISOS` (mismo orden que la semilla) y el grupo visible en la
matriz de roles `PERMISOS_AGRUPADOS`:

```ts
  {
    grupoEs: "Proveedores",
    grupoEn: "Suppliers",
    permisos: [
      { clave: "proveedores.ver", es: "Consultar el catálogo de proveedores", en: "View the supplier catalog" },
      { clave: "proveedores.gestionar", es: "Gestionar el catálogo de proveedores", en: "Manage the supplier catalog" },
    ],
  },
```

La matriz de «Sistema → Roles y Permisos» y el filtrado de navegación se alimentan de
estas listas: sin este paso, el permiso existe en BD pero la UI no sabe editarlo ni
filtrar por él.

### 2.3 Migración puntual para bases de datos existentes (`scripts/permiso-proveedores.ts`)

**La semilla no sobrescribe permisos de roles existentes** (el `update` del `upsert` de
`Rol` es intencionalmente vacío, porque los permisos se gestionan desde la aplicación).
Por eso todo permiso nuevo se acompaña de una migración puntual idempotente, siguiendo el
patrón real de `scripts/permiso-clientes.ts`:

```ts
/**
 * MIGRACIÓN PUNTUAL: habilita el módulo de Proveedores en una base de
 * datos existente. Añade los permisos nuevos a los roles ya existentes.
 *
 * Uso: bun scripts/permiso-proveedores.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ASIGNACIONES: Array<{ permiso: string; roles: string[] }> = [
  { permiso: "proveedores.ver", roles: ["ADMIN", "TI", "JEFE_ALMACEN", "ALMACENERO", "OQC"] },
  { permiso: "proveedores.gestionar", roles: ["ADMIN", "TI", "JEFE_ALMACEN"] },
];

async function main() {
  for (const { permiso, roles } of ASIGNACIONES) {
    console.log(`\n▸ Permiso: ${permiso}`);
    for (const clave of roles) {
      const rol = await db.rol.findUnique({ where: { clave } });
      if (!rol) {
        console.log(`· Rol no encontrado (se omite): ${clave}`);
        continue;
      }
      const permisos = JSON.parse(rol.permisos) as string[];
      if (permisos.includes(permiso)) {
        console.log(`· ${clave} ya tenía el permiso`);
        continue;
      }
      permisos.push(permiso);
      await db.rol.update({
        where: { id: rol.id },
        data: { permisos: JSON.stringify(permisos) },
      });
      console.log(`✔ Añadido a ${clave}`);
    }
  }
  console.log("\nMigración de permisos de Proveedores completada.");
}

main()
  .catch((e) => {
    console.error("Error en la migración:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
```

Ejecución (en desarrollo y en cada servidor existente al actualizar):

```bash
bun prisma/seed.ts                  # asegura roles/config en instalaciones nuevas
bun scripts/permiso-proveedores.ts  # aplica permisos a roles EXISTENTES (idempotente)
```

Otros roles distintos de los precargados pueden recibir el permiso desde la aplicación
(Sistema → Roles y Permisos), sin scripts.

---

## 3. API — `src/app/api/proveedores/`

### 3.1 Colección: `src/app/api/proveedores/route.ts`

Patrón: guarda primero, lectura de query, delegación a `nucleo.ts` para la proyección
pública (`aProveedor`), códigos de error estables:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { aProveedor } from "@/modulos/proveedores/servicios/nucleo";

// GET /api/proveedores — Listar proveedores (activos; incluirInactivos=true para todos)
export async function GET(request: Request) {
  const guardia = await requerirPermiso(request, "proveedores.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { searchParams } = new URL(request.url);
  const incluirInactivos = searchParams.get("incluirInactivos") === "true";

  const proveedores = await db.proveedor.findMany({
    where: incluirInactivos ? {} : { activo: true },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });

  return NextResponse.json(proveedores.map((p) => aProveedor(p)));
}

// POST /api/proveedores — Crear proveedor
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "proveedores.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const cuerpo = await request.json();
    const codigo = String(cuerpo.codigo ?? "").trim().toUpperCase();
    const nombre = String(cuerpo.nombre ?? "").trim();
    if (!codigo || !nombre) {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }

    const existe = await db.proveedor.findUnique({ where: { codigo } });
    if (existe) {
      return NextResponse.json({ error: "PROVEEDOR_CODIGO_DUPLICADO" }, { status: 409 });
    }

    const proveedor = await db.proveedor.create({
      data: {
        codigo,
        nombre,
        contacto: cuerpo.contacto?.trim() || null,
        correo: cuerpo.correo?.trim() || null,
        telefono: cuerpo.telefono?.trim() || null,
        direccion: cuerpo.direccion?.trim() || null,
        notas: cuerpo.notas?.trim() || null,
      },
    });

    return NextResponse.json(aProveedor(proveedor), { status: 201 });
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
```

### 3.2 Elemento: `src/app/api/proveedores/[id]/route.ts`

En Next.js 16 `params` es una **Promise** (deserialízala con `await`). El `DELETE`
envía a la papelera (nivel 2) — no borra físicamente:

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import {
  aProveedor,
  DIAS_RESTAURACION,
  enviarProveedorAPapelera,
} from "@/modulos/proveedores/servicios/nucleo";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/proveedores/[id] — Detalle de un proveedor
export async function GET(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "proveedores.ver");
  if (guardia instanceof NextResponse) return guardia;

  const { id } = await params;
  const proveedor = await db.proveedor.findUnique({ where: { id } });
  if (!proveedor) {
    return NextResponse.json({ error: "PROVEEDOR_NO_EXISTE" }, { status: 404 });
  }
  return NextResponse.json(aProveedor(proveedor));
}

// PATCH /api/proveedores/[id] — Actualizar (campos parciales; activo para desactivar/reactivar)
export async function PATCH(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "proveedores.gestionar");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const { id } = await params;
    const cuerpo = await request.json();
    const existente = await db.proveedor.findUnique({ where: { id } });
    if (!existente) {
      return NextResponse.json({ error: "PROVEEDOR_NO_EXISTE" }, { status: 404 });
    }

    const codigo =
      cuerpo.codigo !== undefined ? String(cuerpo.codigo).trim().toUpperCase() : undefined;
    if (codigo === "") {
      return NextResponse.json({ error: "CAMPOS_INCOMPLETOS" }, { status: 400 });
    }
    if (codigo && codigo !== existente.codigo) {
      const duplicado = await db.proveedor.findUnique({ where: { codigo } });
      if (duplicado) {
        return NextResponse.json({ error: "PROVEEDOR_CODIGO_DUPLICADO" }, { status: 409 });
      }
    }

    const proveedor = await db.proveedor.update({
      where: { id },
      data: {
        ...(codigo !== undefined && { codigo }),
        ...(cuerpo.nombre !== undefined && { nombre: String(cuerpo.nombre).trim() }),
        ...(cuerpo.contacto !== undefined && { contacto: cuerpo.contacto?.trim() || null }),
        ...(cuerpo.correo !== undefined && { correo: cuerpo.correo?.trim() || null }),
        ...(cuerpo.telefono !== undefined && { telefono: cuerpo.telefono?.trim() || null }),
        ...(cuerpo.direccion !== undefined && { direccion: cuerpo.direccion?.trim() || null }),
        ...(cuerpo.notas !== undefined && { notas: cuerpo.notas?.trim() || null }),
        ...(cuerpo.activo !== undefined && { activo: Boolean(cuerpo.activo) }),
      },
    });

    return NextResponse.json(aProveedor(proveedor));
  } catch {
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/proveedores/[id] — Enviar a la papelera (borrado en 2 etapas)
export async function DELETE(request: Request, { params }: Ctx) {
  const guardia = await requerirPermiso(request, "proveedores.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const { id } = await params;
    await enviarProveedorAPapelera(id, { id: usuario.id, nombre: usuario.nombre });
    return NextResponse.json({ ok: true, restaurableDuranteDias: DIAS_RESTAURACION });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
```

Si el módulo no necesita papelera, sustituye el `DELETE` por un `update({ activo: false })`
— pero el estándar del sistema para catálogos es el borrado en 2 etapas.

---

## 4. Lógica de negocio — `src/modulos/proveedores/`

### 4.1 Tipos: `src/modulos/proveedores/tipos.ts`

Contrato compartido frontend ↔ API (isomorfo al de clientes):

```ts
export interface Proveedor {
  id: string;
  codigo: string;
  nombre: string;
  contacto: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  activo: boolean;
  createdAt: string;
}

export interface CuerpoProveedor {
  codigo: string;
  nombre: string;
  contacto?: string;
  correo?: string;
  telefono?: string;
  direccion?: string;
  notas?: string;
}
```

### 4.2 Núcleo de servidor: `src/modulos/proveedores/servicios/nucleo.ts`

Proyección pública (serializa `Date` → ISO) y, si aplica papelera, el envío con
snapshot. Para el envío a papelera, replica la mecánica de
`src/modulos/papelera/servicios/nucleo.ts` (`enviarClienteAPapelera` como referencia):
crear la fila `Papelera` con `entidad: "PROVEEDOR"`, `datos` con el snapshot JSON y
`expiraEn = eliminadoEn + DIAS_RESTAURACION` días, eliminar el registro vivo dentro de
una transacción y respetar los conflictos de código al restaurar
(`IDENTIFICADOR_EN_USO`, 409). Si añades la entidad `PROVEEDOR`, actualiza también el
catálogo de entidades aceptadas de la papelera (`src/modulos/papelera/servicios/`) para
restauración y purga.

```ts
import { db } from "@/lib/db";
import { DIAS_RESTAURACION } from "@/modulos/papelera/servicios/nucleo";

export type FilaProveedor = {
  id: string; codigo: string; nombre: string;
  contacto: string | null; correo: string | null; telefono: string | null;
  direccion: string | null; notas: string | null;
  activo: boolean; createdAt: Date;
};

/** Proyección pública de un proveedor */
export function aProveedor(p: FilaProveedor) {
  return {
    id: p.id, codigo: p.codigo, nombre: p.nombre,
    contacto: p.contacto, correo: p.correo, telefono: p.telefono,
    direccion: p.direccion, notas: p.notas,
    activo: p.activo, createdAt: p.createdAt.toISOString(),
  };
}

/** Envío a papelera con snapshot (borrado nivel 2). Esqueleto — completar
 *  siguiendo enviarClienteAPapelera (transacción + snapshot + expiración). */
export async function enviarProveedorAPapelera(
  id: string,
  usuario: { id: string; nombre: string },
) {
  // 1. Cargar el proveedor (404 PROVEEDOR_NO_EXISTE si no existe).
  // 2. Dentro de db.$transaction:
  //    a) crear Papelera { entidad: "PROVEEDOR", entidadId, identificador: codigo,
  //       nombre, datos: JSON del registro, estado: "EN_PAPELERA", usuarioId,
  //       usuarioNombre, eliminadoEn, expiraEn: +30 días };
  //    b) delete del proveedor vivo.
  // 3. Devolver { ok: true }.
}
```

`ErrorNegocio` (con `codigoHTTP`) ya existe en `src/modulos/almacen/servicios/nucleo.ts`
— reutilízala para los errores de dominio; la API solo la traduce.

### 4.3 Servicio HTTP: `src/modulos/proveedores/servicios/api.ts`

Copia el patrón de `clientes/servicios/api.ts` (fetch + traducción de errores a
`ErrorApi` con código estable):

```ts
import type { CuerpoProveedor, Proveedor } from "../tipos";

export class ErrorApi extends Error {
  codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.codigo = codigo;
  }
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!resp.ok) {
    let codigo = "ERROR_INTERNO";
    try {
      const cuerpo = await resp.json();
      if (cuerpo?.error) codigo = cuerpo.error;
    } catch {
      /* respuesta sin JSON */
    }
    throw new ErrorApi(codigo);
  }
  return resp.json() as Promise<T>;
}

export const listarProveedores = (incluirInactivos = false) =>
  pedir<Proveedor[]>(`/api/proveedores?incluirInactivos=${incluirInactivos}`);
export const crearProveedor = (cuerpo: CuerpoProveedor) =>
  pedir<Proveedor>("/api/proveedores", { method: "POST", body: JSON.stringify(cuerpo) });
export const actualizarProveedor = (id: string, cuerpo: Partial<CuerpoProveedor> & { activo?: boolean }) =>
  pedir<Proveedor>(`/api/proveedores/${id}`, { method: "PATCH", body: JSON.stringify(cuerpo) });
/** Envía a la papelera (restaurable 30 días); para desactivar usar actualizarProveedor({ activo: false }) */
export const eliminarProveedor = (id: string) =>
  pedir<{ ok: boolean }>(`/api/proveedores/${id}`, { method: "DELETE" });
```

### 4.4 Consultas React Query: `src/modulos/proveedores/servicios/consultas.ts`

```ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { actualizarProveedor, crearProveedor, eliminarProveedor, listarProveedores } from "./api";
import type { CuerpoProveedor } from "../tipos";

export const CLAVES_QUERY = {
  proveedores: ["proveedores", "listado"] as const,
};

export function useInvalidarProveedores() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["proveedores"] });
  };
}

export function useProveedores(incluirInactivos = false) {
  return useQuery({
    queryKey: [...CLAVES_QUERY.proveedores, incluirInactivos],
    queryFn: () => listarProveedores(incluirInactivos),
  });
}

export function useCrearProveedor() {
  const invalidar = useInvalidarProveedores();
  return useMutation({
    mutationFn: (cuerpo: CuerpoProveedor) => crearProveedor(cuerpo),
    onSuccess: invalidar,
  });
}

export function useActualizarProveedor() {
  const invalidar = useInvalidarProveedores();
  return useMutation({
    mutationFn: ({ id, cuerpo }: { id: string; cuerpo: Partial<CuerpoProveedor> & { activo?: boolean } }) =>
      actualizarProveedor(id, cuerpo),
    onSuccess: invalidar,
  });
}

export function useEliminarProveedor() {
  const invalidar = useInvalidarProveedores();
  return useMutation({
    mutationFn: (id: string) => eliminarProveedor(id),
    onSuccess: invalidar,
  });
}
```

---

## 5. Interfaz de usuario

### 5.1 Componente de gestión: `src/modulos/proveedores/componentes/GestionProveedores.tsx`

Estructura obligatoria (sigue `GestionClientes.tsx`): `"use client"`;
`EncabezadoSeccion` con acción «Nuevo»; búsqueda local + `InterruptorInactivos`;
`TablaResponsiva` en escritorio y tarjetas en móvil; `Dialog` de alta/edición con
`Label`/`Input` shadcn; confirmaciones con `DialogoEliminarRegistro` (papelera) y
`DialogoDesactivarRegistro`; `useToast` para resultados; errores traducidos con
`claveErrorApi`. Esqueleto con los puntos clave:

```tsx
"use client";
import { useMemo, useState } from "react";
import { Pencil, Plus, Power, Search, Trash2, Truck } from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas, DialogoDesactivarRegistro, DialogoEliminarRegistro,
  EncabezadoSeccion, EstadoVacio, InterruptorInactivos, TablaResponsiva,
} from "@/modulos/compartidos/ui";
import {
  useActualizarProveedor, useCrearProveedor, useEliminarProveedor, useProveedores,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import type { CuerpoProveedor, Proveedor } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const VACIO: CuerpoProveedor = {
  codigo: "", nombre: "", contacto: "", correo: "", telefono: "", direccion: "", notas: "",
};

export function GestionProveedores() {
  const { t } = useIdioma();
  const { toast } = useToast();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { data: proveedores, isLoading } = useProveedores(mostrarInactivos);
  const crear = useCrearProveedor();
  const actualizar = useActualizarProveedor();
  const eliminar = useEliminarProveedor();

  const [busqueda, setBusqueda] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [porEliminar, setPorEliminar] = useState<Proveedor | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Proveedor | null>(null);
  const [formulario, setFormulario] = useState<CuerpoProveedor>(VACIO);
  const [error, setError] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return proveedores ?? [];
    return (proveedores ?? []).filter(
      (p) => p.codigo.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q),
    );
  }, [proveedores, busqueda]);

  // abrirNuevo / abrirEdicion / guardar / confirmarEliminar / confirmarDesactivar /
  // reactivar: mismos manejadores que GestionClientes.tsx, sustituyendo «cliente»
  // por «proveedor» y los hooks/errores por los del módulo.
  // guardar() usa crear.mutateAsync / actualizar.mutateAsync y traduce el error:
  //   catch (e) { const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
  //               setError(t(claveErrorApi(codigo))); }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("proveedores.titulo")}
        descripcion={t("nav.descripcionProveedores")}
        icono={<Truck className="h-5 w-5" />}
        acciones={
          <Button onClick={abrirNuevo} className="min-h-9">
            <Plus className="mr-2 h-4 w-4" />
            {t("proveedores.nuevo")}
          </Button>
        }
      />
      {/* Búsqueda + InterruptorInactivos; CargandoFilas; EstadoVacio; TablaResponsiva
          (columnas: código, nombre, contacto, estado, acciones) y tarjetas móvil —
          copiar la estructura exacta de GestionClientes.tsx. */}
      {/* Dialog crear/editar con campos codigo/nombre/contacto/correo/telefono/
          direccion/notas (placeholder "PRV-0001"). */}
      <DialogoEliminarRegistro
        abierto={!!porEliminar}
        titulo={t("proveedores.eliminar")}
        descripcion={`${t("proveedores.eliminarConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />
      <DialogoDesactivarRegistro
        abierto={!!porDesactivar}
        titulo={t("proveedores.desactivar")}
        descripcion={t("proveedores.desactivarConfirmacion")}
        cargando={actualizar.isPending}
        onConfirmar={confirmarDesactivar}
        onCerrar={() => setPorDesactivar(null)}
      />
    </div>
  );
}
```

### 5.2 Punto de entrada y secciones: `src/modulos/proveedores/index.tsx`

```tsx
"use client";
import { Truck } from "lucide-react";
import type { DefinicionSeccion } from "@/modulos/nucleo/registro";
import { GestionProveedores } from "./componentes/GestionProveedores";

/** Secciones del módulo proveedores (el orden define la navegación) */
export const SECCIONES_PROVEEDORES: DefinicionSeccion[] = [
  {
    id: "catalogo",
    claveEtiqueta: "nav.proveedores",
    claveDescripcion: "nav.descripcionProveedores",
    claveGrupo: "nav.catalogos",
    icono: Truck,
    permiso: "proveedores.ver",
  },
];

/** Renderiza la sección activa del módulo proveedores */
export function ModuloProveedores({ seccionId }: { seccionId: string }) {
  switch (seccionId) {
    case "catalogo":
    default:
      return <GestionProveedores />;
  }
}
```

### 5.3 Registro del módulo: `src/modulos/nucleo/registro.tsx`

Añade el import y la entrada al arreglo `MODULOS`. Existe además un marcador de posición
`compras` (`disponible: false`, «Proveedores, requisiciones y órdenes de compra»): si el
roadmap es activar Compras completo, registra Proveedores como **sección** de ese módulo
en lugar de módulo aparte; para un módulo autónomo:

```tsx
import { SECCIONES_PROVEEDORES, ModuloProveedores } from "@/modulos/proveedores";
// …
  {
    id: "proveedores",
    nombre: { es: "Proveedores", en: "Suppliers" },
    descripcion: {
      es: "Catálogo de proveedores de materia prima y materiales",
      en: "Raw material and materials supplier catalog",
    },
    icono: Truck,
    disponible: true,
    permiso: "proveedores.ver",
    secciones: SECCIONES_PROVEEDORES,
    componente: ModuloProveedores,
  },
```

El shell detecta el módulo automáticamente (comentario de cabecera de `registro.tsx`:
«Crea su carpeta en src/modulos/<nombre>/ · Regístralo aquí (disponible: true)»).

### 5.4 Idioma: `src/modulos/compartidos/idioma/diccionario.ts`

Añade las claves en **ambos** idiomas (bloque `es` y bloque `en`), junto a las de
clientes: dentro de `nav` → `proveedores: "Proveedores"` /
`descripcionProveedores: "Catálogo de proveedores de la empresa"`, y un espacio nuevo
`proveedores: { titulo, subtitulo, nuevo, editar, codigo, nombre, personaContacto,
telefono, correo, direccion, notas, eliminar, eliminarConfirmacion, desactivar,
desactivarConfirmacion, vacio }` (en inglés: `Suppliers`, `Supplier catalog`, etc.).
Sin estas claves la UI muestra el identificador crudo de la clave.

---

## 6. Pruebas — `scripts/test-proveedores.py`

Patrón: arrancar el servidor standalone en un puerto de pruebas, ejecutar la batería
contra las APIs reales con sesión de administrador (cookie jar), apagar el servidor al
terminar y limpiar los datos de prueba. Copia la estructura de `scripts/test-clientes.py`
(sesión `Sesion`, `check(desc, esperado, obtenido)`, `esperar_servidor`, arranque con
`PORT`/`HOSTNAME`/`COOKIE_INSEGURA_HTTP` y `start_new_session` para apagar por grupo de
proceso). Batería mínima:

```python
#!/usr/bin/env python3
"""Verificación E2E del módulo Proveedores (CIG-MANUFACTURING).

Uso: ADMIN_PASSWORD='...' python3 scripts/test-proveedores.py
Arranca el servidor standalone en el puerto 3300 (start.sh) contra la BD
de desarrollo y apaga todo al terminar. Estructura idéntica a
scripts/test-clientes.py (Sesion, check, esperar_servidor, main/pruebas).
"""
# … cabecera e helpers copiados de test-clientes.py (BASE=…:3300,
#    CIG_PROYECTO del entorno, ADMIN_PASSWORD obligatoria) …

def pruebas():
    admin = Sesion()
    cod, _ = admin.req("POST", "/api/auth/login",
                       {"correo": "admin@cig-manufacturing.com", "password": ADMIN_PASSWORD})
    check("Login admin", 200, cod)

    # 1. CRUD
    cod, p1 = admin.req("POST", "/api/proveedores", {
        "codigo": "PRV-0001", "nombre": "Aceros del Norte S.A. de C.V.",
        "contacto": "Ing. Ramiro Vega", "correo": "ventas@acerosnorte.mx",
        "telefono": "81-1234-5678", "direccion": "Av. Industrial 4501, Apodaca, N.L.",
    })
    check("Crear proveedor PRV-0001", 201, cod)
    cod, cuerpo = admin.req("POST", "/api/proveedores",
                            {"codigo": "PRV-0001", "nombre": "Duplicado"})
    check("Código duplicado → 409", 409, cod)
    check("  error PROVEEDOR_CODIGO_DUPLICADO", "PROVEEDOR_CODIGO_DUPLICADO", cuerpo.get("error"))
    cod, _ = admin.req("PATCH", f"/api/proveedores/{p1['id']}", {"telefono": "81-8765-4321"})
    check("Actualizar teléfono", 200, cod)
    cod, cuerpo = admin.req("POST", "/api/proveedores", {"codigo": "", "nombre": ""})
    check("Campos incompletos → 400", 400, cod)

    # 2. Estados y papelera
    cod, _ = admin.req("PATCH", f"/api/proveedores/{p1['id']}", {"activo": False})
    check("Desactivar proveedor", 200, cod)
    cod, lista = admin.req("GET", "/api/proveedores")
    check("  fuera del listado de activos", False, any(p["id"] == p1["id"] for p in lista))
    cod, _ = admin.req("DELETE", f"/api/proveedores/{p1['id']}")
    check("Eliminar → papelera (200, 30 días)", 200, cod)

    # 3. Permisos (OPERADOR sin proveedores.ver → 403)
    #    … mismo bloque que la sección 7 de test-clientes.py, con un usuario
    #    de prueba OPERADOR y limpieza final (usuario + papelera purgada).

    ok = sum(1 for _, hecho in PRUEBAS if hecho)
    print(f"\nRESULTADO: {ok}/{len(PRUEBAS)} pruebas superadas")
    return 0 if ok == len(PRUEBAS) else 1
```

Ejecución:

```bash
ADMIN_PASSWORD='TuClave123' python3 scripts/test-proveedores.py
```

Antes de entregar, corre también la réplica local del pipeline de CI, que valida
esquema, lint, build, tipos y humo real:

```bash
bash scripts/simulacion-ci.sh
```

---

## 7. Lista de verificación final de integración

- [ ] `prisma/schema.prisma` tiene el modelo `Proveedor` y `bunx prisma db push` aplicó sin error.
- [ ] `prisma/seed.ts` incluye `proveedores.ver`/`proveedores.gestionar` en `PERMISOS` y en los roles objetivo; `ADMIN`/`TI` heredan por `TODOS`.
- [ ] `src/modulos/autenticacion/permisos.ts` tiene las claves en `PERMISOS` **y** el grupo en `PERMISOS_AGRUPADOS`.
- [ ] `scripts/permiso-proveedores.ts` existe, es idempotente y se documenta en la guía de actualización.
- [ ] `src/app/api/proveedores/route.ts` y `[id]/route.ts`: cada manejador llama `requerirPermiso` con el permiso correcto; `params` se trata como `Promise`.
- [ ] `src/modulos/proveedores/` tiene `tipos.ts`, `servicios/{nucleo,api,consultas}.ts` y `componentes/GestionProveedores.tsx`.
- [ ] `src/modulos/proveedores/index.tsx` exporta `SECCIONES_PROVEEDORES` y `ModuloProveedores`; `registro.tsx` registra el módulo con `disponible: true` y `permiso`.
- [ ] Diccionario i18n actualizado en **ES y EN** (`nav.proveedores`, `nav.descripcionProveedores`, espacio `proveedores.*`).
- [ ] `scripts/test-proveedores.py` pasa completo; `bash scripts/simulacion-ci.sh` pasa completo.
- [ ] Los textos visibles no contienen literales sin traducir y la UI es responsiva.
- [ ] Si el módulo toca stock/folios/movimientos: transacción + folio monotónico + snapshots + bitácora (ver `almacen`/`oqc` nucleo).

Con todos los puntos verificados, el módulo está listo para revisión de código y fusión
a `main` siguiendo el flujo del repositorio.
