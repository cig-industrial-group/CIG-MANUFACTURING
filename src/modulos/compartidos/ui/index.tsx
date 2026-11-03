"use client";

/**
 * COMPONENTES UI COMPARTIDOS ENTRE MÓDULOS
 * KPIs, encabezados, tablas responsivas, estados vacíos y selectores.
 */
import { useState, type ReactNode } from "react";
import { ChevronsUpDown, Check, Inbox, Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useIdioma } from "@/modulos/compartidos/idioma";

// ============================================================
// CONMUTADOR DE IDIOMA ES/EN
// ============================================================
export function ConmutadorIdioma() {
  const { idioma, setIdioma, t } = useIdioma();
  return (
    <div
      className="flex items-center rounded-lg border bg-muted/50 p-0.5"
      role="group"
      aria-label={t("app.idioma")}
    >
      {(["es", "en"] as const).map((codigo) => (
        <button
          key={codigo}
          onClick={() => setIdioma(codigo)}
          aria-pressed={idioma === codigo}
          className={cn(
            "flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold uppercase transition-colors",
            idioma === codigo
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Languages className="h-3.5 w-3.5" aria-hidden />
          {codigo}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// ENCABEZADO DE SECCIÓN
// ============================================================
export function EncabezadoSeccion({
  titulo,
  descripcion,
  acciones,
  icono,
}: {
  titulo: string;
  descripcion?: string;
  acciones?: ReactNode;
  icono?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        {icono && (
          <div className="mt-0.5 hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {icono}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{titulo}</h1>
          {descripcion && (
            <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>
          )}
        </div>
      </div>
      {acciones && <div className="flex shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

// ============================================================
// TARJETA KPI
// ============================================================
export function Kpi({
  titulo,
  valor,
  icono,
  tendencia,
  tono = "neutro",
}: {
  titulo: string;
  valor: string;
  icono: ReactNode;
  tendencia?: string;
  tono?: "neutro" | "exito" | "alerta" | "peligro" | "primario";
}) {
  const tonos: Record<string, string> = {
    neutro: "bg-muted text-foreground",
    exito: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    alerta: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    peligro: "bg-red-500/10 text-red-600 dark:text-red-400",
    primario: "bg-primary/10 text-primary",
  };
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{titulo}</p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
              {valor}
            </p>
            {tendencia && <p className="mt-1 text-xs text-muted-foreground">{tendencia}</p>}
          </div>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11",
              tonos[tono],
            )}
          >
            {icono}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// TABLA RESPONSIVA
// ============================================================
export function TablaResponsiva({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[640px] caption-bottom text-sm">{children}</table>
    </div>
  );
}

// ============================================================
// ESTADO VACÍO
// ============================================================
export function EstadoVacio({
  titulo,
  descripcion,
  icono,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  icono?: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icono ?? <Inbox className="h-6 w-6" />}
      </div>
      <p className="font-medium">{titulo}</p>
      {descripcion && (
        <p className="max-w-sm text-sm text-muted-foreground">{descripcion}</p>
      )}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

// ============================================================
// ESQUELETO DE CARGA
// ============================================================
export function CargandoFilas({ filas = 5 }: { filas?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: filas }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function CargandoKpis() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

// ============================================================
// INTERRUPTOR «MOSTRAR INACTIVOS»
// Filtra las listas de gestión: por defecto solo se ven registros
// activos; al activarlo aparecen también los desactivados.
// ============================================================
export function InterruptorInactivos({
  marcado,
  onCambiar,
  className,
}: {
  marcado: boolean;
  onCambiar: (valor: boolean) => void;
  className?: string;
}) {
  const { t } = useIdioma();
  return (
    <label
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <Switch
        checked={marcado}
        onCheckedChange={onCambiar}
        aria-label={t("comun.mostrarInactivos")}
      />
      <span className="font-medium">{t("comun.mostrarInactivos")}</span>
    </label>
  );
}

// ============================================================
// DIÁLOGO DE CONFIRMACIÓN — ELIMINAR (BORRADO REAL)
// Advierte que el registro se borra permanentemente de la base
// de datos y no puede recuperarse.
// ============================================================
export function DialogoEliminarRegistro({
  abierto,
  titulo,
  descripcion,
  cargando = false,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  descripcion: string;
  cargando?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  const { t } = useIdioma();
  return (
    <AlertDialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cargando}>{t("comun.cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault(); // mantener el diálogo abierto hasta que termine la mutación
              onConfirmar();
            }}
            disabled={cargando}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {t("comun.eliminarDefinitivo")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// DIÁLOGO DE CONFIRMACIÓN — DESACTIVAR (BAJA LÓGICA)
// El registro se conserva y puede reactivarse más tarde.
// ============================================================
export function DialogoDesactivarRegistro({
  abierto,
  titulo,
  descripcion,
  cargando = false,
  onConfirmar,
  onCerrar,
}: {
  abierto: boolean;
  titulo: string;
  descripcion: string;
  cargando?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}) {
  const { t } = useIdioma();
  return (
    <AlertDialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cargando}>{t("comun.cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfirmar();
            }}
            disabled={cargando}
          >
            {t("comun.desactivar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ============================================================
// SELECTOR CON BÚSQUEDA (ComboBox)
// ============================================================
export interface OpcionSelector {
  valor: string;
  etiqueta: string;
  subetiqueta?: string;
  detalle?: string;
  deshabilitado?: boolean;
}

export function SelectorBuscador({
  opciones,
  valor,
  onChange,
  placeholder,
  placeholderBusqueda,
  sinResultados,
  className,
  deshabilitado = false,
}: {
  opciones: OpcionSelector[];
  valor: string | null;
  onChange: (valor: string) => void;
  placeholder: string;
  placeholderBusqueda: string;
  sinResultados: string;
  className?: string;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const seleccionado = opciones.find((o) => o.valor === valor);

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          disabled={deshabilitado}
          className={cn(
            "w-full justify-between font-normal",
            !seleccionado && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">
            {seleccionado ? seleccionado.etiqueta : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholderBusqueda} />
          <CommandList>
            <CommandEmpty>{sinResultados}</CommandEmpty>
            <CommandGroup>
              {opciones.map((opcion) => (
                <CommandItem
                  key={opcion.valor}
                  value={`${opcion.etiqueta} ${opcion.subetiqueta ?? ""} ${opcion.detalle ?? ""}`}
                  disabled={opcion.deshabilitado}
                  onSelect={() => {
                    onChange(opcion.valor === valor ? "" : opcion.valor);
                    setAbierto(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-1 h-4 w-4 shrink-0",
                      valor === opcion.valor ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{opcion.etiqueta}</p>
                    {(opcion.subetiqueta || opcion.detalle) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[opcion.subetiqueta, opcion.detalle].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
