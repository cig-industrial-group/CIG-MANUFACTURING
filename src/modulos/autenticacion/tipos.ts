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
 * MÓDULO: AUTENTICACIÓN — Tipos compartidos
 * Contratos de datos entre el frontend y las APIs de sesión.
 */

/** Información de un rol con sus permisos */
export interface InfoRol {
  id: string;
  clave: string;
  nombre: string;
  nombreEn: string;
  descripcion: string | null;
  permisos: string[];
  sistema: boolean;
  numUsuarios?: number;
}

/** Usuario autenticado (sesión activa) */
export interface UsuarioSesion {
  id: string;
  nombre: string;
  correo: string;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: string | null;
  rol: InfoRol;
}

/** Usuario del catálogo de gestión (módulo usuarios) */
export interface UsuarioLista {
  id: string;
  nombre: string;
  correo: string;
  activo: boolean;
  debeCambiarPassword: boolean;
  ultimoAcceso: string | null;
  createdAt: string;
  rol: InfoRol;
}

/** Banderas públicas de la pantalla de acceso */
export interface BanderasAuth {
  registroHabilitado: boolean;
  recuperacionHabilitada: boolean;
}

/** Ajustes completos del sistema (módulo ajustes) */
export interface AjustesSistema {
  registroHabilitado: boolean;
  recuperacionHabilitada: boolean;
  rolRegistro: string;
}

export interface RespuestaLogin {
  usuario: UsuarioSesion;
}

/**
 * Respuesta de POST /api/auth/recuperacion.
 *
 * Desde TASK-STR-004 el código de recuperación NUNCA viaja en la
 * respuesta HTTP (entrega fuera de banda por el log auditado del
 * servidor, etiqueta [AUDIT_SENSITIVE]): la respuesta es uniforme
 * y anti-enumeración ({ ok, expiraMinutos }). El campo `codigo`
 * heredado del prototipo se eliminó en TASK-STR-006 — la API ya
 * no lo devuelve.
 */
export interface RespuestaRecuperacion {
  expiraMinutos: number;
}
