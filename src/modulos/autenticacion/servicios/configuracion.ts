/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

/**
 * MÓDULO: AUTENTICACIÓN — Configuración del sistema (servidor)
 * Banderas de registro público y recuperación automática de contraseña.
 */
import { db } from "@/lib/db";
import type { AjustesSistema, BanderasAuth } from "../tipos";

export const CLAVES_CONFIG = {
  registroHabilitado: "auth.registroHabilitado",
  recuperacionHabilitada: "auth.recuperacionHabilitada",
  rolRegistro: "auth.rolRegistro",
} as const;

async function leerConfig(clave: string): Promise<string | null> {
  const registro = await db.configuracion.findUnique({ where: { clave } });
  return registro?.valor ?? null;
}

async function escribirConfig(clave: string, valor: string): Promise<void> {
  await db.configuracion.upsert({
    where: { clave },
    create: { clave, valor },
    update: { valor },
  });
}

/** Banderas públicas (pantalla de acceso) */
export async function obtenerBanderasAuth(): Promise<BanderasAuth> {
  const [registro, recuperacion] = await Promise.all([
    leerConfig(CLAVES_CONFIG.registroHabilitado),
    leerConfig(CLAVES_CONFIG.recuperacionHabilitada),
  ]);
  return {
    registroHabilitado: registro === null ? true : JSON.parse(registro),
    recuperacionHabilitada: recuperacion === null ? true : JSON.parse(recuperacion),
  };
}

/** Ajustes completos (módulo Ajustes) */
export async function obtenerAjustes(): Promise<AjustesSistema> {
  const banderas = await obtenerBanderasAuth();
  const rolRegistro = await leerConfig(CLAVES_CONFIG.rolRegistro);
  return {
    ...banderas,
    rolRegistro: rolRegistro ? JSON.parse(rolRegistro) : "OPERADOR",
  };
}

/** Guarda cambios parciales de los ajustes */
export async function guardarAjustes(
  datos: Partial<{ registroHabilitado: boolean; recuperacionHabilitada: boolean; rolRegistro: string }>,
): Promise<AjustesSistema> {
  if (datos.registroHabilitado !== undefined) {
    await escribirConfig(CLAVES_CONFIG.registroHabilitado, JSON.stringify(datos.registroHabilitado));
  }
  if (datos.recuperacionHabilitada !== undefined) {
    await escribirConfig(
      CLAVES_CONFIG.recuperacionHabilitada,
      JSON.stringify(datos.recuperacionHabilitada),
    );
  }
  if (datos.rolRegistro !== undefined) {
    // Validar que el rol exista antes de guardarlo
    const rol = await db.rol.findUnique({ where: { clave: datos.rolRegistro } });
    if (!rol) throw new Error("ROL_NO_EXISTE");
    await escribirConfig(CLAVES_CONFIG.rolRegistro, JSON.stringify(datos.rolRegistro));
  }
  return obtenerAjustes();
}

/** Resuelve el rol que se asigna a las cuentas de autoregistro */
export async function obtenerRolRegistro(): Promise<{ id: string; clave: string }> {
  const ajustes = await obtenerAjustes();
  const rol = await db.rol.findUnique({ where: { clave: ajustes.rolRegistro } });
  if (rol) return { id: rol.id, clave: rol.clave };
  const operador = await db.rol.findUnique({ where: { clave: "OPERADOR" } });
  if (operador) return { id: operador.id, clave: operador.clave };
  const primero = await db.rol.findFirst();
  if (!primero) throw new Error("SIN_ROLES");
  return { id: primero.id, clave: primero.clave };
}
