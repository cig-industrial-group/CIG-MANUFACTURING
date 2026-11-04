/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

"use client";

/**
 * MÓDULO: AUTENTICACIÓN — Contexto de sesión
 * Provee el usuario autenticado a toda la aplicación.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { UsuarioSesion } from "../tipos";
import { ErrorApiAuth, cerrarSesion, iniciarSesion, obtenerSesion, registrarse } from "./api";

interface CtxSesion {
  usuario: UsuarioSesion | null;
  verificando: boolean;
  iniciarSesion: (correo: string, password: string) => Promise<UsuarioSesion>;
  registrarse: (nombre: string, correo: string, password: string) => Promise<UsuarioSesion>;
  cerrarSesion: () => Promise<void>;
  establecerUsuario: (usuario: UsuarioSesion | null) => void;
  refrescarSesion: () => Promise<UsuarioSesion | null>;
}

const ContextoSesion = createContext<CtxSesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [verificando, setVerificando] = useState(true);

  // Verificar sesión activa al montar
  useEffect(() => {
    let vigente = true;
    obtenerSesion()
      .then((resp) => {
        if (vigente) setUsuario(resp.usuario);
      })
      .catch(() => {
        /* sin sesión activa */
      })
      .finally(() => {
        if (vigente) setVerificando(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  const iniciar = useCallback(async (correo: string, password: string) => {
    const resp = await iniciarSesion(correo, password);
    setUsuario(resp.usuario);
    return resp.usuario;
  }, []);

  const registrar = useCallback(async (nombre: string, correo: string, password: string) => {
    const resp = await registrarse(nombre, correo, password);
    setUsuario(resp.usuario);
    return resp.usuario;
  }, []);

  const cerrar = useCallback(async () => {
    try {
      await cerrarSesion();
    } catch (e) {
      // incluso si falla la API, se limpia el estado local
      if (!(e instanceof ErrorApiAuth)) throw e;
    }
    setUsuario(null);
  }, []);

  const refrescar = useCallback(async () => {
    try {
      const resp = await obtenerSesion();
      setUsuario(resp.usuario);
      return resp.usuario;
    } catch {
      setUsuario(null);
      return null;
    }
  }, []);

  const valor = useMemo<CtxSesion>(
    () => ({
      usuario,
      verificando,
      iniciarSesion: iniciar,
      registrarse: registrar,
      cerrarSesion: cerrar,
      establecerUsuario: setUsuario,
      refrescarSesion: refrescar,
    }),
    [usuario, verificando, iniciar, registrar, cerrar, refrescar],
  );

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): CtxSesion {
  const ctx = useContext(ContextoSesion);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <ProveedorSesion>");
  return ctx;
}
