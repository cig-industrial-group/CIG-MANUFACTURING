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
import { subirRespaldo, TAMANO_MAX_SUBIDA_BYTES } from "@/modulos/respaldo/servicios/nucleo";

/** ¿El campo «archivo» del formulario es realmente un archivo? */
function esArchivoSubida(v: FormDataEntryValue | null): v is File {
  return v !== null && typeof v === "object" && typeof (v as File).arrayBuffer === "function";
}

/** Nombre seguro: algunos runtimes no exponen .name en partes vacías */
function nombreArchivo(archivo: File): string {
  return typeof archivo.name === "string" ? archivo.name : "";
}

// POST /api/respaldo/subir — Registra un respaldo subido manualmente
// (multipart/form-data, campo «archivo»: un .dump descargado antes).
// Se valida integridad y esquema ANTES de aceptarlo: si no pasa, se
// rechaza con el error concreto y no queda rastro en el servidor.
// El respaldo queda como SUBIDO y se restaura con /api/respaldo/restaurar
// (en caliente, con rollback automático y ventana de reversión de 24 h).
export async function POST(request: Request) {
  const guardia = await requerirPermiso(request, "respaldo.gestionar");
  if (guardia instanceof NextResponse) return guardia;
  const { usuario } = guardia;

  try {
    const formulario = await request.formData().catch(() => null);
    const archivo = formulario?.get("archivo") ?? null;

    if (!esArchivoSubida(archivo)) {
      return NextResponse.json({ error: "ARCHIVO_INVALIDO" }, { status: 400 });
    }
    if (typeof archivo.size === "number" && archivo.size > TAMANO_MAX_SUBIDA_BYTES) {
      return NextResponse.json({ error: "ARCHIVO_MUY_GRANDE" }, { status: 413 });
    }

    const bytes = Buffer.from(await archivo.arrayBuffer());
    // Sin bytes no hay nada que restaurar. Se revisa ANTES de la
    // extensión: algunos runtimes (Bun) devuelven un Blob sin «name»
    // para las partes vacías, y el veredicto correcto es ARCHIVO_VACIO.
    if (bytes.length === 0) {
      return NextResponse.json({ error: "ARCHIVO_VACIO" }, { status: 400 });
    }
    if (!nombreArchivo(archivo).toLowerCase().endsWith(".dump")) {
      return NextResponse.json({ error: "ARCHIVO_INVALIDO" }, { status: 400 });
    }

    const respaldo = await subirRespaldo({
      bytes,
      nombreOriginal: nombreArchivo(archivo),
      usuario: usuario.nombre,
    });
    return NextResponse.json({ respaldo });
  } catch (e) {
    if (e instanceof ErrorNegocio) {
      return NextResponse.json({ error: e.message }, { status: e.codigoHTTP });
    }
    console.error(
      `[respaldo] Error al subir el archivo: ${e instanceof Error ? e.message : String(e)}`,
    );
    return NextResponse.json({ error: "ERROR_INTERNO" }, { status: 500 });
  }
}
