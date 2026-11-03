"use client";

/**
 * HISTORIAL DE MOVIMIENTOS — Bitácora completa con filtros y paginación
 */
import { useMemo, useState } from "react";
import { History, Info, Search, ChevronLeft, ChevronRight, FilterX } from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  EncabezadoSeccion,
  EstadoVacio,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import { useAlmacenes, useMovimientos } from "../servicios/consultas";
import { textoConteo } from "@/modulos/unidades/tipos";
import { InsigniaCorregido, InsigniaProductoEliminado, InsigniaTipoMovimiento, SelectorAlmacen } from "./compartidos";
import type { MovimientoResumen } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const TIPOS = ["ENTRADA", "RECEPCION", "SALIDA", "TRASLADO", "AJUSTE"];

export function HistorialMovimientos() {
  const { t } = useIdioma();
  const f = useFormateadores();

  const [tipo, setTipo] = useState("TODOS");
  const [almacenId, setAlmacenId] = useState("");
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);
  const [detalle, setDetalle] = useState<MovimientoResumen | null>(null);

  const { data: almacenes } = useAlmacenes();
  const filtros = useMemo(
    () => ({
      tipo: tipo === "TODOS" ? undefined : tipo,
      almacenId: almacenId || undefined,
      q: q.trim() || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      pagina,
      porPagina: 15,
    }),
    [tipo, almacenId, q, desde, hasta, pagina],
  );
  const { data, isLoading, isFetching } = useMovimientos(filtros);

  const hayFiltros = tipo !== "TODOS" || !!almacenId || !!q || !!desde || !!hasta;

  function limpiarFiltros() {
    setTipo("TODOS");
    setAlmacenId("");
    setQ("");
    setDesde("");
    setHasta("");
    setPagina(1);
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("mov.titulo")}
        descripcion={t("nav.descripcionHistorial")}
        icono={<History className="h-5 w-5" />}
      />

      {/* Nota de inmutabilidad */}
      <div className="flex items-start gap-2.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-700 dark:text-sky-400">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{t("mov.notaInmutable")}</p>
      </div>

      {/* ===== Filtros ===== */}
      <div className="rounded-xl border bg-card p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPagina(1);
              }}
              placeholder={t("mov.busquedaFolio")}
              className="pl-9"
              aria-label={t("comun.buscar")}
            />
          </div>
          <Select
            value={tipo}
            onValueChange={(v) => {
              setTipo(v);
              setPagina(1);
            }}
          >
            <SelectTrigger aria-label={t("mov.tipo")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODOS">{t("comun.todos")}</SelectItem>
              {TIPOS.map((tipoMov) => (
                <SelectItem key={tipoMov} value={tipoMov}>
                  {t(`mov.tipos.${tipoMov}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="sm:col-span-2 lg:col-span-1">
            <SelectorAlmacen
              almacenes={almacenes ?? []}
              valor={almacenId || null}
              onChange={(v) => {
                setAlmacenId(v);
                setPagina(1);
              }}
              soloActivos={false}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-3">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {t("mov.rangoFechas")}
              </span>
              <Input
                type="date"
                value={desde}
                onChange={(e) => {
                  setDesde(e.target.value);
                  setPagina(1);
                }}
                aria-label={t("mov.rangoFechas")}
                className="h-9"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="date"
                value={hasta}
                onChange={(e) => {
                  setHasta(e.target.value);
                  setPagina(1);
                }}
                aria-label={t("mov.rangoFechas")}
                className="h-9"
              />
            </div>
            {hayFiltros && (
              <Button
                variant="ghost"
                size="sm"
                onClick={limpiarFiltros}
                className="h-9 justify-self-start text-muted-foreground hover:text-foreground sm:justify-self-end lg:col-span-1"
              >
                <FilterX className="mr-1.5 h-4 w-4" />
                {t("comun.limpiar")}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ===== Resultados ===== */}
      {isLoading ? (
        <CargandoFilas filas={8} />
      ) : !data || data.movimientos.length === 0 ? (
        <EstadoVacio titulo={t("mov.sinMovimientos")} />
      ) : (
        <>
          <p className={cn("text-sm text-muted-foreground", isFetching && "opacity-60")}>
            {data.total.toLocaleString()} {data.total === 1 ? t("comun.resultado") : t("comun.resultados")}
          </p>

          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("comun.folio")}</th>
                  <th className="px-3 py-2.5">{t("mov.tipo")}</th>
                  <th className="px-3 py-2.5">{t("comun.producto")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.cantidad")}</th>
                  <th className="px-3 py-2.5">{t("mov.almacenOrigen")} → {t("mov.almacenDestino")}</th>
                  <th className="px-3 py-2.5">{t("comun.responsable")}</th>
                  <th className="px-3 py-2.5">{t("comun.fecha")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.movimientos.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => setDetalle(m)}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                  >
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <p className="font-mono text-xs font-semibold">{m.folio}</p>
                      {m.editado && (
                        <div className="mt-1">
                          <InsigniaCorregido />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <InsigniaTipoMovimiento tipo={m.tipo} />
                    </td>
                    <td className="max-w-56 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-medium">{m.productoNombre}</p>
                        {!m.productoExiste && <InsigniaProductoEliminado />}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">{m.productoSku}</p>
                      {m.clienteId && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                          <span aria-hidden>→</span>
                          <span className={cn("truncate", !m.clienteExiste && "line-through opacity-70")}>
                            {t("clientes.clienteDestino")}: {m.clienteNombre}
                          </span>
                          {!m.clienteExiste && <InsigniaProductoEliminado />}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums">
                      <span
                        className={cn(
                          m.tipo === "SALIDA" || (m.tipo === "AJUSTE" && m.cantidad < 0)
                            ? "text-orange-600 dark:text-orange-400"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {m.tipo === "AJUSTE" && m.cantidad > 0 ? "+" : ""}
                        {m.tipo === "SALIDA" ? "−" : ""}
                        {f.numero(m.cantidad, 2)}
                      </span>{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {m.productoUnidad}
                      </span>
                      {m.conteo && (
                        <p className="text-[11px] font-normal text-muted-foreground">
                          {textoConteo(m.conteo)}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-xs">
                        {m.almacenOrigenCodigo ? (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {m.almacenOrigenCodigo}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {m.almacenOrigenCodigo && m.almacenDestinoCodigo && (
                          <span className="text-muted-foreground">→</span>
                        )}
                        {m.almacenDestinoCodigo && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {m.almacenDestinoCodigo}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="max-w-32 truncate px-3 py-2.5 text-sm">
                      {m.responsable ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {f.fechaHora(m.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TablaResponsiva>
          </div>

          {/* Tarjetas móvil */}
          <div className="space-y-3 md:hidden">
            {data.movimientos.map((m) => (
              <button
                key={m.id}
                onClick={() => setDetalle(m)}
                className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-semibold text-muted-foreground">
                      {m.folio}
                    </p>
                    {m.editado && (
                      <div className="mt-1">
                        <InsigniaCorregido />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-semibold">{m.productoNombre}</p>
                      {!m.productoExiste && <InsigniaProductoEliminado />}
                    </div>
                    {m.clienteId && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <span aria-hidden>→</span>
                        <span className={cn("truncate", !m.clienteExiste && "line-through opacity-70")}>
                          {m.clienteNombre}
                        </span>
                        {!m.clienteExiste && <InsigniaProductoEliminado />}
                      </p>
                    )}
                  </div>
                  <InsigniaTipoMovimiento tipo={m.tipo} compacto />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1 text-xs">
                    {m.almacenOrigenCodigo && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {m.almacenOrigenCodigo}
                      </Badge>
                    )}
                    {m.almacenOrigenCodigo && m.almacenDestinoCodigo && (
                      <span className="text-muted-foreground">→</span>
                    )}
                    {m.almacenDestinoCodigo && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {m.almacenDestinoCodigo}
                      </Badge>
                    )}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-bold tabular-nums",
                      m.tipo === "SALIDA" || (m.tipo === "AJUSTE" && m.cantidad < 0)
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {m.tipo === "SALIDA" ? "−" : m.tipo === "AJUSTE" && m.cantidad > 0 ? "+" : ""}
                    {f.numero(m.cantidad, 1)} {m.productoUnidad}
                  </span>
                  {m.conteo && (
                    <p className="mt-0.5 w-full text-xs text-muted-foreground">{textoConteo(m.conteo)}</p>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{f.fechaHora(m.createdAt)}</p>
              </button>
            ))}
          </div>

          {/* Paginación */}
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {data.pagina} / {data.paginas}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t("comun.anterior")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                disabled={pagina >= data.paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                {t("comun.siguiente")}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* ===== Diálogo de detalle ===== */}
      <Dialog open={!!detalle} onOpenChange={(abierto) => !abierto && setDetalle(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detalle && <InsigniaTipoMovimiento tipo={detalle.tipo} />}
              {detalle?.editado && <InsigniaCorregido />}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {detalle?.folio}
            </DialogDescription>
          </DialogHeader>
          {detalle && (
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("comun.producto")}</span>
                <span className="text-right font-medium">
                  {detalle.productoSku} — {detalle.productoNombre}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("comun.cantidad")}</span>
                <span className="font-semibold tabular-nums">
                  {f.numero(detalle.cantidad, 2)} {detalle.productoUnidad}
                </span>
              </div>
              {detalle.conteo && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("operacion.conteo")}</span>
                  <span className="text-right font-medium">{textoConteo(detalle.conteo)}</span>
                </div>
              )}
              {detalle.almacenOrigenNombre && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("mov.almacenOrigen")}</span>
                  <span className="text-right font-medium">{detalle.almacenOrigenNombre}</span>
                </div>
              )}
              {detalle.almacenDestinoNombre && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("mov.almacenDestino")}</span>
                  <span className="text-right font-medium">{detalle.almacenDestinoNombre}</span>
                </div>
              )}
              {detalle.clienteId && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("clientes.clienteDestino")}</span>
                  <span className="flex items-center gap-1.5 text-right font-medium">
                    {!detalle.clienteExiste && <InsigniaProductoEliminado />}
                    {detalle.clienteCodigo} — {detalle.clienteNombre}
                  </span>
                </div>
              )}
              {detalle.cantidadDespues != null && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("mov.stockResultante")}</span>
                  <span className="font-semibold tabular-nums">
                    {f.numero(detalle.cantidadDespues, 2)} {detalle.productoUnidad}
                  </span>
                </div>
              )}
              {detalle.referencia && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("comun.referencia")}</span>
                  <span className="font-mono text-xs font-semibold">{detalle.referencia}</span>
                </div>
              )}
              {detalle.motivo && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("comun.motivo")}</span>
                  <span className="max-w-56 text-right">{detalle.motivo}</span>
                </div>
              )}
              {detalle.responsable && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("comun.responsable")}</span>
                  <span>{detalle.responsable}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("comun.fecha")}</span>
                <span>{f.fechaHora(detalle.createdAt)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetalle(null)}>
              {t("comun.cerrar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
