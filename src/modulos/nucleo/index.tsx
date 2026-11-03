"use client";

/**
 * NÚCLEO DEL SISTEMA — Shell de la aplicación
 * Layout responsivo: sidebar en escritorio, drawer + bottom-bar en móvil.
 * Controla la sesión: pantalla de acceso, cambio de contraseña obligatorio
 * y menú de usuario con permisos por rol.
 */
import { useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { create } from "zustand";
import {
  Factory,
  Menu,
  Lock,
  LogOut,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { ProveedorIdioma, useIdioma } from "@/modulos/compartidos/idioma";
import { ConmutadorIdioma } from "@/modulos/compartidos/ui";
import {
  MODULOS,
  modulosPermitidos,
  restaurarModulo,
  seccionesPermitidas,
  useModuloStore,
} from "./registro";
import { ProveedorSesion, useSesion } from "@/modulos/autenticacion/servicios/sesion";
import { PantallaAutenticacion } from "@/modulos/autenticacion/componentes/PantallaAutenticacion";
import { DialogoCambioPassword } from "@/modulos/autenticacion/componentes/DialogoCambioPassword";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CLAVE_SECCION = "fabriflow.seccion";

// ============================================================
// MARCA / LOGOTIPO
// ============================================================
function Marca() {
  const { t } = useIdioma();
  return (
    <div className="flex items-center gap-3 px-1">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg">
        <Factory className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-bold leading-tight text-foreground">
          {t("app.nombre")}
        </p>
        <p className="truncate text-[11px] leading-tight text-muted-foreground">
          {t("app.eslogan")}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// ESTADO DE LA SECCIÓN ACTIVA
// ============================================================
const useSeccionStore = create<{ seccion: string; cambiar: (id: string) => void }>((set) => ({
  seccion: "panel",
  cambiar: (id: string) => {
    set({ seccion: id });
    try {
      window.localStorage.setItem(CLAVE_SECCION, id);
    } catch {
      /* almacenamiento no disponible */
    }
  },
}));

function useSeccionActiva() {
  const { seccion, cambiar } = useSeccionStore();
  useEffect(() => {
    const guardada = window.localStorage.getItem(CLAVE_SECCION);
    if (guardada) useSeccionStore.setState({ seccion: guardada });
  }, []);
  return { seccion, cambiar };
}

// ============================================================
// NAVEGACIÓN DE MÓDULOS Y SECCIONES (FILTRADA POR PERMISOS)
// ============================================================
function NavegacionModulos({
  onNavegar,
  permisos,
}: {
  onNavegar?: () => void;
  permisos: string[];
}) {
  const { t, idioma } = useIdioma();
  const { moduloId, cambiarModulo } = useModuloStore();
  const { cambiar } = useSeccionStore();
  const visibles = modulosPermitidos(permisos);

  function seleccionar(id: string) {
    const modulo = MODULOS.find((m) => m.id === id);
    cambiarModulo(id);
    // Llevar a la primera sección permitida del módulo
    const secciones = modulo ? seccionesPermitidas(modulo, permisos) : [];
    if (secciones.length > 0) cambiar(secciones[0].id);
    onNavegar?.();
  }

  return (
    <nav aria-label={t("app.modulos")} className="flex flex-col gap-5">
      {/* Selector de módulos */}
      <div>
        <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          {t("app.modulos")}
        </p>
        <ul className="space-y-0.5">
          {visibles.map((modulo) => {
            const activo = modulo.id === moduloId;
            return (
              <li key={modulo.id}>
                <button
                  onClick={() => seleccionar(modulo.id)}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    activo
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <modulo.icono
                    className={cn("h-4.5 w-4.5 shrink-0", activo && "text-primary")}
                    aria-hidden
                  />
                  <span className="flex-1 truncate text-left">{modulo.nombre[idioma]}</span>
                  {activo && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Secciones del módulo activo */}
      <NavegacionSecciones onNavegar={onNavegar} permisos={permisos} />
    </nav>
  );
}

function NavegacionSecciones({
  onNavegar,
  permisos,
}: {
  onNavegar?: () => void;
  permisos: string[];
}) {
  const { t, idioma } = useIdioma();
  const { seccion, cambiar } = useSeccionActiva();
  const { moduloId } = useModuloStore();
  const modulo = MODULOS.find((m) => m.id === moduloId);
  const secciones = modulo ? seccionesPermitidas(modulo, permisos) : [];

  const grupos = (() => {
    const mapa = new Map<string, typeof secciones>();
    for (const s of secciones) {
      const lista = mapa.get(s.claveGrupo) ?? [];
      lista.push(s);
      mapa.set(s.claveGrupo, lista);
    }
    return [...mapa.entries()];
  })();

  if (!modulo || grupos.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
          {modulo.nombre[idioma]}
        </p>
        {grupos.map(([grupo, seccionesGrupo]) => (
          <div key={grupo} className="mb-4">
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {t(grupo)}
            </p>
            <ul className="space-y-0.5">
              {seccionesGrupo.map((s) => {
                const activo = s.id === seccion;
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => {
                        cambiar(s.id);
                        onNavegar?.();
                      }}
                      aria-current={activo ? "page" : undefined}
                      className={cn(
                        "flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                        activo
                          ? "bg-primary text-primary-foreground font-medium shadow-md"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <s.icono className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{t(s.claveEtiqueta)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// MENÚ DE USUARIO (AVATAR)
// ============================================================
function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function MenuUsuario({ compacto = false }: { compacto?: boolean }) {
  const { t, idioma } = useIdioma();
  const { usuario, cerrarSesion } = useSesion();
  const [cambioAbierto, setCambioAbierto] = useState(false);

  if (!usuario) return null;
  const nombreRol = idioma === "es" ? usuario.rol.nombre : usuario.rol.nombreEn;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn("h-10 gap-2 px-1.5 sm:px-2", compacto && "h-9 w-9 px-0")}
            aria-label={t("auth.miCuenta")}
          >
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                {iniciales(usuario.nombre)}
              </AvatarFallback>
            </Avatar>
            {!compacto && (
              <span className="hidden min-w-0 flex-col items-start md:flex">
                <span className="max-w-36 truncate text-sm font-semibold leading-tight">
                  {usuario.nombre}
                </span>
                <span className="max-w-36 truncate text-[11px] leading-tight text-muted-foreground">
                  {nombreRol}
                </span>
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <p className="truncate text-sm font-semibold">{usuario.nombre}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">{usuario.correo}</p>
            <Badge variant="secondary" className="mt-1.5">
              {nombreRol}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => setCambioAbierto(true)} className="gap-2">
              <KeyRound className="h-4 w-4" aria-hidden />
              {t("auth.cambiarContrasena")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => cerrarSesion()}
            className="gap-2 text-destructive focus:text-destructive"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {t("auth.cerrarSesion")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DialogoCambioPassword
        abierta={cambioAbierto}
        onCerrar={() => setCambioAbierto(false)}
      />
    </>
  );
}

// ============================================================
// SIDEBAR (ESCRITORIO)
// ============================================================
function SidebarEscritorio({ permisos }: { permisos: string[] }) {
  const { t, idioma } = useIdioma();
  const { usuario } = useSesion();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b px-4">
        <Marca />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavegacionModulos permisos={permisos} />
      </div>
      <div className="shrink-0 border-t px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <ConmutadorIdioma />
          {usuario && (
            <span className="max-w-32 truncate text-[11px] font-medium text-muted-foreground">
              {idioma === "es" ? usuario.rol.nombre : usuario.rol.nombreEn}
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">{t("app.version")}</p>
      </div>
    </aside>
  );
}

// ============================================================
// CONTENIDO PRINCIPAL
// ============================================================
function ContenidoPrincipal({ permisos }: { permisos: string[] }) {
  const { t, idioma } = useIdioma();
  const { seccion, cambiar } = useSeccionActiva();
  const { moduloId } = useModuloStore();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const modulo = MODULOS.find((m) => m.id === moduloId && m.disponible);
  // Secciones y módulos visibles derivan de datos estables (MODULOS y los
  // permisos de la sesión): se memorizan para que los efectos de abajo no
  // se ejecuten en cada render por cambiar la identidad del array.
  const secciones = useMemo(
    () => (modulo ? seccionesPermitidas(modulo, permisos) : []),
    [modulo, permisos],
  );
  const seccionDef = secciones.find((s) => s.id === seccion);
  const visibles = useMemo(() => modulosPermitidos(permisos), [permisos]);

  // Si el módulo activo no es visible para el rol, volver al primer módulo permitido
  useEffect(() => {
    if (visibles.length > 0 && !visibles.some((v) => v.id === moduloId)) {
      useModuloStore.getState().cambiarModulo(visibles[0].id);
    }
  }, [visibles, moduloId]);

  // Si la sección activa no está permitida en el módulo actual, usar la primera disponible
  useEffect(() => {
    if (secciones.length > 0 && !secciones.some((s) => s.id === seccion)) {
      cambiar(secciones[0].id);
    }
  }, [secciones, seccion, cambiar]);

  const Componente = modulo?.componente;

  return (
    <div className="flex min-h-screen flex-col lg:pl-64">
      {/* Encabezado móvil */}
      <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 lg:hidden">
        <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t("app.menu")}>
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 overflow-y-auto p-0">
            <div className="flex h-16 items-center justify-between border-b px-4">
              <SheetTitle asChild>
                <div>
                  <Marca />
                </div>
              </SheetTitle>
            </div>
            <div className="px-3 py-4">
              <NavegacionModulos onNavegar={() => setMenuAbierto(false)} permisos={permisos} />
            </div>
            <div className="mt-auto flex items-center justify-between px-4 py-3">
              <ConmutadorIdioma />
              <MenuUsuario compacto />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Factory className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold leading-tight">{t("app.nombre")}</p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {seccionDef ? t(seccionDef.claveEtiqueta) : t("app.eslogan")}
            </p>
          </div>
        </div>
        <MenuUsuario compacto />
      </header>

      {/* Encabezado escritorio */}
      <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:flex">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{modulo?.nombre[idioma]}</span>
          <span className="text-muted-foreground/50">/</span>
          <span>{seccionDef ? t(seccionDef.claveEtiqueta) : ""}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground xl:block">
            {seccionDef ? t(seccionDef.claveDescripcion) : ""}
          </span>
          <MenuUsuario />
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${moduloId}-${seccion}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {Componente && secciones.length > 0 ? (
                <Componente seccionId={seccionDef?.id ?? secciones[0].id} />
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
                  <Lock className="h-8 w-8 text-muted-foreground" aria-hidden />
                  <p className="font-medium">{t("auth.sinPermisos")}</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Pie de página pegajoso */}
      <footer className="mt-auto border-t bg-card px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-1 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <p>
            <span className="font-semibold text-foreground">{t("app.nombre")}</span> — {t("app.derechos")}
          </p>
          <p>{t("app.version")}</p>
        </div>
      </footer>
    </div>
  );
}

// ============================================================
// PANTALLA DE CARGA
// ============================================================
function PantallaCarga() {
  const { t } = useIdioma();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-xl">
        <Factory className="h-7 w-7" aria-hidden />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {t("comun.cargando")}
      </div>
    </div>
  );
}

// ============================================================
// RAÍZ DE LA APLICACIÓN (CONTROL DE SESIÓN)
// ============================================================
function RaizAplicacion() {
  const { usuario, verificando, establecerUsuario } = useSesion();

  // Restaurar el último módulo visitado
  useEffect(() => {
    restaurarModulo();
  }, []);

  // Verificación inicial de sesión
  if (verificando) return <PantallaCarga />;

  // Sin sesión: pantalla de acceso
  if (!usuario) return <PantallaAutenticacion />;

  const permisos = usuario.rol.permisos as string[];

  return (
    <>
      <div className="min-h-screen bg-background">
        <SidebarEscritorio permisos={permisos} />
        <ContenidoPrincipal permisos={permisos} />
      </div>
      {/* Cambio obligatorio de contraseña temporal */}
      <DialogoCambioPassword
        abierta={usuario.debeCambiarPassword}
        forzado={usuario.debeCambiarPassword}
        onCerrar={() => {
          if (usuario) establecerUsuario({ ...usuario, debeCambiarPassword: false });
        }}
      />
    </>
  );
}

// ============================================================
// RAÍZ DEL SISTEMA
// ============================================================
export function SistemaGestionFabrica() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ProveedorIdioma>
        <ProveedorSesion>
          <RaizAplicacion />
        </ProveedorSesion>
      </ProveedorIdioma>
    </QueryClientProvider>
  );
}
