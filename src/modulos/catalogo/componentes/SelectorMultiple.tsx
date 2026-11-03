"use client";

/**
 * SELECTOR MÚLTIPLE CON BÚSQUEDA — para asociaciones N:M del catálogo
 * Muestra los elementos elegidos como chips y una lista con casillas
 * filtrable. Pensado para usarse dentro de diálogos (alto acotado).
 */
import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface OpcionMultiple {
  id: string;
  /** Etiqueta principal (ej. número de parte) */
  etiqueta: string;
  /** Etiqueta secundaria (ej. nombre) */
  subetiqueta?: string;
}

export function SelectorMultiple({
  opciones,
  seleccionados,
  onCambiar,
  placeholderBusqueda,
  textoVacio,
  deshabilitado = false,
}: {
  opciones: OpcionMultiple[];
  seleccionados: string[];
  onCambiar: (ids: string[]) => void;
  placeholderBusqueda: string;
  textoVacio: string;
  deshabilitado?: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");

  const seleccionadas = useMemo(
    () => opciones.filter((o) => seleccionados.includes(o.id)),
    [opciones, seleccionados],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return opciones;
    return opciones.filter(
      (o) =>
        o.etiqueta.toLowerCase().includes(q) ||
        (o.subetiqueta ?? "").toLowerCase().includes(q),
    );
  }, [opciones, busqueda]);

  function alternar(id: string) {
    if (deshabilitado) return;
    onCambiar(
      seleccionados.includes(id)
        ? seleccionados.filter((s) => s !== id)
        : [...seleccionados, id],
    );
  }

  return (
    <div className="space-y-2">
      {/* Elementos seleccionados como chips */}
      {seleccionadas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {seleccionadas.map((o) => (
            <Badge
              key={o.id}
              variant="secondary"
              className="gap-1 pr-1 font-mono text-[11px] font-semibold"
            >
              {o.etiqueta}
              {!deshabilitado && (
                <button
                  type="button"
                  onClick={() => alternar(o.id)}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`${o.etiqueta} ✕`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* Búsqueda */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={placeholderBusqueda}
          className="pl-9"
          disabled={deshabilitado}
          aria-label={placeholderBusqueda}
        />
      </div>

      {/* Lista con casillas */}
      <ScrollArea className="h-44 rounded-lg border">
        {filtradas.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{textoVacio}</p>
        ) : (
          <ul className="divide-y">
            {filtradas.map((o) => {
              const activo = seleccionados.includes(o.id);
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => alternar(o.id)}
                    disabled={deshabilitado}
                    aria-pressed={activo}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors",
                      activo ? "bg-primary/10" : "hover:bg-muted/50",
                      deshabilitado && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        activo ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                    >
                      {activo && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-xs font-semibold">{o.etiqueta}</span>
                      {o.subetiqueta && (
                        <span className="block truncate text-xs text-muted-foreground">{o.subetiqueta}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>

      {/* Contador */}
      <p className="text-[11px] text-muted-foreground">
        {seleccionadas.length} / {opciones.length}
      </p>
    </div>
  );
}
