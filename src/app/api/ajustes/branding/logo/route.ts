/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { requerirPermiso } from "@/modulos/autenticacion/servicios/auth";
import { ErrorNegocio } from "@/modulos/almacen/servicios/nucleo";
import {
  estadoBranding,
  eliminarLogo,
  guardarLogo,
  validarArchivoLogo,
} from "@/modulos/ajustes/servicios/branding";

/** ¿El campo «archivo» del formulario es realmente un archivo? */
function esArchivoSubida(v: FormDataEntryValue | null): v is File {
  return v !== null && typeof v === "object" && typeof (v as File).arrayBuffer === "function";
}

// POST /api/ajustes/branding/logo — Sube un logo personalizado
// (multipart/form-data, campo «archivo»: PNG, SVG o JPG; máximo 2 MB).
// Valida MIME por contenido (magic bytes), guarda en branding/logo.{ext}
// (sobrescribe el anterior) y registra branding.logoTipo en Configuracion.
// Requiere el permiso ajustes.branding.
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "ajustes.branding");
  if (guardia instanceof NextResponse) return guardia;

  try {
    const formulario = await request.formData().catch(() => null);
    const archivo = formulario?.get("archivo") ?? null;

    if (!esArchivoSubida(archivo)) {
      return NextResponse.json({ error: "BRANDING_ARCHIVO_INVALIDO" }, { status: 400 });
    }

    const validado = await validarArchivoLogo(archivo);
    await guardarLogo(validado);
    return NextResponse.json({ branding: estadoBranding() }, { status: 201 });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    console.error(
      `[branding] Error al subir el logo: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}

// DELETE /api/ajustes/branding/logo — Elimina el logo personalizado y
// restaura el predeterminado (idempotente: no existir también es éxito).
// Requiere el permiso ajustes.branding.
export async function DELETE(request: Request) {
  const guardia = await requerirPermiso(request, "ajustes.branding");
  if (guardia instanceof NextResponse) return guardia;

  try {
    await eliminarLogo();
    return NextResponse.json({ branding: estadoBranding() });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    console.error(
      `[branding] Error al eliminar el logo: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
