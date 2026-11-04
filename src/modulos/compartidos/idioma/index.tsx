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
 * PROVEEDOR DE IDIOMA (ES/EN)
 * Uso:
 *   const { t, idioma, setIdioma } = useIdioma();
 *   t("nav.panelGeneral")  // => "Panel General" | "Dashboard"
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
import {
  diccionario,
  LOCALES,
  type TipoIdioma,
} from "./diccionario";

const CLAVE_STORAGE = "cig-manufacturing.idioma";

type CtxIdioma = {
  idioma: TipoIdioma;
  setIdioma: (idioma: TipoIdioma) => void;
  alternarIdioma: () => void;
  t: (clave: string, params?: Record<string, string | number>) => string;
  locale: string;
};

const ContextoIdioma = createContext<CtxIdioma | null>(null);

function resolver(dic: unknown, clave: string): string | undefined {
  let actual: unknown = dic;
  for (const parte of clave.split(".")) {
    if (actual && typeof actual === "object" && parte in (actual as Record<string, unknown>)) {
      actual = (actual as Record<string, unknown>)[parte];
    } else {
      return undefined;
    }
  }
  return typeof actual === "string" ? actual : undefined;
}

export function ProveedorIdioma({ children }: { children: ReactNode }) {
  const [idioma, setIdiomaState] = useState<TipoIdioma>("es");

  // Leer preferencia guardada (seguro para SSR).
  // El estado inicial del servidor es "es"; tras el montaje se sincroniza
  // con la preferencia del navegador (patrón estándar de hidratación).
  useEffect(() => {
    const guardado = window.localStorage.getItem(CLAVE_STORAGE);
    if (guardado === "es" || guardado === "en") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIdiomaState(guardado);
    } else if (navigator.language?.toLowerCase().startsWith("en")) {
      setIdiomaState("en");
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = idioma;
  }, [idioma]);

  const setIdioma = useCallback((nuevo: TipoIdioma) => {
    setIdiomaState(nuevo);
    window.localStorage.setItem(CLAVE_STORAGE, nuevo);
  }, []);

  const alternarIdioma = useCallback(() => {
    setIdioma(idioma === "es" ? "en" : "es");
  }, [idioma, setIdioma]);

  const t = useCallback(
    (clave: string, params?: Record<string, string | number>) => {
      let texto = resolver(diccionario[idioma], clave) ?? resolver(diccionario.es, clave) ?? clave;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          texto = texto.replaceAll(`{${k}}`, String(v));
        }
      }
      return texto;
    },
    [idioma],
  );

  const valor = useMemo<CtxIdioma>(
    () => ({
      idioma,
      setIdioma,
      alternarIdioma,
      t,
      locale: LOCALES[idioma],
    }),
    [idioma, setIdioma, alternarIdioma, t],
  );

  return <ContextoIdioma.Provider value={valor}>{children}</ContextoIdioma.Provider>;
}

export function useIdioma(): CtxIdioma {
  const ctx = useContext(ContextoIdioma);
  if (!ctx) throw new Error("useIdioma debe usarse dentro de <ProveedorIdioma>");
  return ctx;
}

/** Formateadores localizados de números, moneda y fechas */
export function useFormateadores() {
  const { locale } = useIdioma();
  return useMemo(
    () => ({
      numero: (n: number, decimales = 2) =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: decimales,
        }).format(n),
      entero: (n: number) => new Intl.NumberFormat(locale).format(n),
      moneda: (n: number) =>
        new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "MXN",
          maximumFractionDigits: 2,
        }).format(n),
      fecha: (iso: string | Date) =>
        new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)),
      fechaHora: (iso: string | Date) =>
        new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(iso)),
      fechaCorta: (iso: string | Date) =>
        new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(iso)),
    }),
    [locale],
  );
}
