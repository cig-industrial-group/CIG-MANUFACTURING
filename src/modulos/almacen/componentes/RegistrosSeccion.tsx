"use client";

/**
 * REGISTROS DE UNA SECCIÓN
 * Lista los movimientos capturados en la sección actual (Entradas,
 * Recepción, Salidas, Traslados o Ajustes de inventario) y permite
 * CONSULTARLOS, CORREGIRLOS y ELIMINARLOS con el permiso
 * «movimientos.corregir».
 *
 * A diferencia del Historial de Movimientos (bitácora global de solo
 * consulta), aquí los registros sí se pueden editar o borrar: el stock
 * se recalcula automáticamente (se revierte el efecto original y se
 * aplica el corregido) y cada acción queda documentada en la bitácora
 * de correcciones, que es inmutable.
 */
import { useMemo, useState } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  FilterX,
  Eye,
  Pencil,
  Trash2,
  History,
  Info,
  AlertTriangle,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import { useSesion } from "@/modulos/autenticacion/servicios/sesion";
import { tienePermiso } from "@/modulos/autenticacion/permisos";
import {
  CargandoFilas,
  EstadoVacio,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import {
  useAlmacenes,
  useActualizarMovimiento,
  useDetalleMovimiento,
  useEliminarMovimiento,
  useInventario,
  useMovimientos,
  useProductos,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import { textoConteo } from "@/modulos/unidades/tipos";
import { InsigniaCorregido, InsigniaProductoEliminado, InsigniaTipoMovimiento, SelectorAlmacen, SelectorProducto } from "./compartidos";
import type { Almacen, CorreccionResumen, MovimientoResumen, Producto } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const POR_PAGINA = 10;

/** Campos que se comparan para mostrar el «antes → después» de una corrección */
const CAMPOS_DIFF: Array<{ clave: string; etiqueta: string }> = [
  { clave: "producto", etiqueta: "comun.producto" },
  { clave: "cantidad", etiqueta: "comun.cantidad" },
  { clave: "almacenOrigen", etiqueta: "mov.almacenOrigen" },
  { clave: "almacenDestino", etiqueta: "mov.almacenDestino" },
  { clave: "motivo", etiqueta: "comun.motivo" },
  { clave: "referencia", etiqueta: "comun.referencia" },
  { clave: "responsable", etiqueta: "comun.responsable" },
];

export interface PropsRegistrosSeccion {
  /** Tipo de movimiento que gestiona esta sección */
  tipo: string;
  /** Si el tipo usa almacén origen (SALIDA / TRASLADO) */
  requiereOrigen: boolean;
  /** Si el tipo usa almacén destino (ENTRADA / RECEPCION / TRASLADO / AJUSTE) */
  requiereDestino: boolean;
}

export function RegistrosSeccion({
  tipo,
  requiereOrigen,
  requiereDestino,
}: PropsRegistrosSeccion) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const { usuario } = useSesion();
  const puedeCorregir = tienePermiso(usuario?.rol?.permisos as string[] | undefined, "movimientos.corregir");

  // ===== Filtros =====
  const [almacenId, setAlmacenId] = useState("");
  const [q, setQ] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [pagina, setPagina] = useState(1);

  // ===== Diálogos =====
  const [detalle, setDetalle] = useState<MovimientoResumen | null>(null);
  const [editando, setEditando] = useState<MovimientoResumen | null>(null);
  const [eliminando, setEliminando] = useState<MovimientoResumen | null>(null);

  const { data: almacenes } = useAlmacenes();
  const { data: productos } = useProductos();
  const filtros = useMemo(
    () => ({
      tipo,
      almacenId: almacenId || undefined,
      q: q.trim() || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      pagina,
      porPagina: POR_PAGINA,
    }),
    [tipo, almacenId, q, desde, hasta, pagina],
  );
  const { data, isLoading, isFetching } = useMovimientos(filtros);
  const { data: detalleCompleto, isLoading: cargandoDetalle } = useDetalleMovimiento(detalle?.id ?? null);

  const hayFiltros = !!almacenId || !!q || !!desde || !!hasta;
  function limpiarFiltros() {
    setAlmacenId("");
    setQ("");
    setDesde("");
    setHasta("");
    setPagina(1);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("registros.descripcion")}</p>

      {!puedeCorregir && (
        <div className="flex items-start gap-2.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-xs text-sky-700 dark:text-sky-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{t("registros.sinPermisosCorregir")}</p>
        </div>
      )}

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
          <SelectorAlmacen
            almacenes={almacenes ?? []}
            valor={almacenId || null}
            onChange={(v) => {
              setAlmacenId(v);
              setPagina(1);
            }}
            soloActivos={false}
          />
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
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
            {hayFiltros && (
              <Button
                variant="ghost"
                size="sm"
                onClick={limpiarFiltros}
                className="h-9 shrink-0 px-2 text-muted-foreground hover:text-foreground"
                aria-label={t("comun.limpiar")}
              >
                <FilterX className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ===== Resultados ===== */}
      {isLoading ? (
        <CargandoFilas filas={6} />
      ) : !data || data.movimientos.length === 0 ? (
        <EstadoVacio
          titulo={t("registros.sinRegistros")}
          descripcion={t("registros.sinRegistrosDesc")}
          icono={<History className="h-6 w-6" />}
        />
      ) : (
        <>
          <p className={cn("text-sm text-muted-foreground", isFetching && "opacity-60")}>
            {data.total.toLocaleString()}{" "}
            {data.total === 1 ? t("comun.resultado") : t("comun.resultados")}
          </p>

          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("comun.folio")}</th>
                  <th className="px-3 py-2.5">{t("comun.producto")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.cantidad")}</th>
                  <th className="px-3 py-2.5">{t("mov.almacenOrigen")} → {t("mov.almacenDestino")}</th>
                  <th className="px-3 py-2.5">{t("comun.responsable")}</th>
                  <th className="px-3 py-2.5">{t("comun.fecha")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.movimientos.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <button
                        onClick={() => setDetalle(m)}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        {m.folio}
                      </button>
                      {m.editado && (
                        <div className="mt-1">
                          <InsigniaCorregido />
                        </div>
                      )}
                    </td>
                    <td className="max-w-56 px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate font-medium">{m.productoNombre}</p>
                        {!m.productoExiste && <InsigniaProductoEliminado />}
                      </div>
                      <p className="font-mono text-[11px] text-muted-foreground">{m.productoSku}</p>
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
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDetalle(m)}
                          aria-label={t("registros.verRegistro")}
                          title={t("registros.verRegistro")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {puedeCorregir && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setEditando(m)}
                              aria-label={t("registros.corregirRegistro")}
                              title={t("registros.corregirRegistro")}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setEliminando(m)}
                              aria-label={t("registros.eliminarRegistro")}
                              title={t("registros.eliminarRegistro")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TablaResponsiva>
          </div>

          {/* Tarjetas móvil */}
          <div className="space-y-3 md:hidden">
            {data.movimientos.map((m) => (
              <div key={m.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] font-semibold text-muted-foreground">
                      {m.folio}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-semibold">{m.productoNombre}</p>
                      {!m.productoExiste && <InsigniaProductoEliminado />}
                    </div>
                  </div>
                  <InsigniaTipoMovimiento tipo={m.tipo} compacto />
                </div>
                {m.editado && (
                  <div className="mt-1.5">
                    <InsigniaCorregido />
                  </div>
                )}
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
                <div className="mt-3 flex justify-end gap-2 border-t pt-3">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setDetalle(m)}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    {t("comun.detalle")}
                  </Button>
                  {puedeCorregir && (
                    <>
                      <Button variant="outline" size="sm" className="h-9" onClick={() => setEditando(m)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        {t("comun.editar")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setEliminando(m)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {t("comun.eliminar")}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Paginación */}
          {data.paginas > 1 && (
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
          )}
        </>
      )}

      {/* ===== Diálogo de detalle + bitácora de correcciones ===== */}
      <Dialog open={!!detalle} onOpenChange={(abierto) => !abierto && setDetalle(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detalle && <InsigniaTipoMovimiento tipo={detalle.tipo} />}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">{detalle?.folio}</DialogDescription>
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
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("comun.fecha")}</span>
                <span>{f.fechaHora(detalle.createdAt)}</span>
              </div>

              <Separator />

              {/* Bitácora de correcciones del registro */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3.5 w-3.5" aria-hidden />
                  {t("registros.bitacoraCorrecciones")}
                </p>
                {cargandoDetalle ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : !detalleCompleto || detalleCompleto.correcciones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("registros.sinCorrecciones")}</p>
                ) : (
                  <div className="space-y-2">
                    {detalleCompleto.correcciones.map((c) => (
                      <TarjetaCorreccion key={c.id} correccion={c} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {puedeCorregir && detalle && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditando(detalle);
                  setDetalle(null);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                {t("registros.corregirRegistro")}
              </Button>
            )}
            <Button variant={puedeCorregir ? "ghost" : "outline"} onClick={() => setDetalle(null)}>
              {t("comun.cerrar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Diálogo de edición ===== */}
      {editando && (
        <DialogoEdicion
          movimiento={editando}
          requiereOrigen={requiereOrigen}
          requiereDestino={requiereDestino}
          almacenes={almacenes ?? []}
          productos={(productos ?? []).filter((p) => p.activo)}
          onCerrar={() => setEditando(null)}
          onCorregido={() => {
            setEditando(null);
            toast({ description: t("registros.corregidoOk") });
          }}
        />
      )}

      {/* ===== Diálogo de eliminación ===== */}
      {eliminando && (
        <DialogoEliminacion
          movimiento={eliminando}
          onCerrar={() => setEliminando(null)}
          onEliminado={() => {
            setEliminando(null);
            toast({ description: t("registros.eliminadoOk") });
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// TARJETA DE CORRECCIÓN (bitácora)
// ============================================================
function TarjetaCorreccion({ correccion }: { correccion: CorreccionResumen }) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const esEdicion = correccion.accion === "EDICION";

  // Campos que cambiaron entre el antes y el después
  const cambios = correccion.despues
    ? CAMPOS_DIFF.filter(({ clave }) => {
        const antes = correccion.antes[clave];
        const despues = correccion.despues?.[clave];
        return JSON.stringify(antes) !== JSON.stringify(despues);
      }).map(({ clave, etiqueta }) => ({
        etiqueta: t(etiqueta),
        antes: correccion.antes[clave],
        despues: correccion.despues?.[clave],
      }))
    : [];

  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn(
            "whitespace-nowrap",
            esEdicion
              ? "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
              : "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
          )}
        >
          {esEdicion ? t("registros.edicion") : t("registros.eliminacion")}
        </Badge>
        <span className="text-muted-foreground">{f.fechaHora(correccion.createdAt)}</span>
      </div>
      <p className="mt-1.5 text-muted-foreground">
        {t("comun.responsable")}: <span className="font-medium text-foreground">{correccion.usuarioNombre ?? "—"}</span>
      </p>
      {correccion.motivo && (
        <p className="mt-1">
          <span className="text-muted-foreground">{t("registros.motivoCorreccion")}: </span>
          {correccion.motivo}
        </p>
      )}
      {cambios.length > 0 && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {cambios.map((c) => (
            <div key={c.etiqueta} className="flex items-start justify-between gap-3">
              <span className="shrink-0 text-muted-foreground">{c.etiqueta}</span>
              <span className="text-right">
                <span className="line-through opacity-60">{formatoValor(c.antes)}</span>
                <span className="mx-1 text-muted-foreground">→</span>
                <span className="font-semibold">{formatoValor(c.despues)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatoValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return String(v);
}

// ============================================================
// DIÁLOGO DE EDICIÓN (CORRECCIÓN DEL REGISTRO)
// ============================================================
function DialogoEdicion({
  movimiento,
  requiereOrigen,
  requiereDestino,
  almacenes,
  productos,
  onCerrar,
  onCorregido,
}: {
  movimiento: MovimientoResumen;
  requiereOrigen: boolean;
  requiereDestino: boolean;
  almacenes: Almacen[];
  productos: Producto[];
  onCerrar: () => void;
  onCorregido: () => void;
}) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();

  const [productoId, setProductoId] = useState(movimiento.productoId);
  const [almacenOrigenId, setAlmacenOrigenId] = useState(movimiento.almacenOrigenId ?? "");
  const [almacenDestinoId, setAlmacenDestinoId] = useState(movimiento.almacenDestinoId ?? "");
  const [cantidad, setCantidad] = useState(String(movimiento.cantidad));
  const [motivo, setMotivo] = useState(movimiento.motivo ?? "");
  const [referencia, setReferencia] = useState(movimiento.referencia ?? "");
  const [responsable, setResponsable] = useState(movimiento.responsable ?? "");
  const [motivoCorreccion, setMotivoCorreccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Partida de una salida OQC: la remisión (PL) y el responsable pertenecen
  // a la CABECERA de esa salida — aquí se muestran solo como consulta y no
  // se envían al corregir (el servidor los conserva sincronizados).
  const agrupadaOqc = !!movimiento.salidaId;

  const corregir = useActualizarMovimiento();
  const productoSel = productos.find((p) => p.id === productoId) ?? null;

  // Stock actual en el origen (referencia para salidas y traslados)
  const { data: stockOrigen } = useInventario(
    requiereOrigen && almacenOrigenId ? { almacenId: almacenOrigenId } : {},
    { enabled: requiereOrigen && !!almacenOrigenId },
  );

  async function guardar() {
    setError(null);
    const cantidadNum = Number(cantidad);
    if (!productoId) return setError(t("validaciones.productoRequerido"));
    if (requiereOrigen && !almacenOrigenId) return setError(t("validaciones.almacenRequerido"));
    if (requiereDestino && !almacenDestinoId) return setError(t("validaciones.almacenRequerido"));
    if (!Number.isFinite(cantidadNum) || cantidadNum === 0) {
      return setError(t("validaciones.cantidadRequerida"));
    }
    if (movimiento.tipo !== "AJUSTE" && cantidadNum < 0) {
      return setError(t("comun.cantidadInvalida"));
    }
    if (movimiento.tipo === "TRASLADO" && almacenOrigenId === almacenDestinoId) {
      return setError(t("comun.seleccionarAlmacenesDistintos"));
    }
    if (!motivoCorreccion.trim()) return setError(t("registros.motivoCorreccionRequerido"));

    try {
      await corregir.mutateAsync({
        id: movimiento.id,
        cuerpo: {
          productoId,
          almacenOrigenId: requiereOrigen ? almacenOrigenId : undefined,
          almacenDestinoId: requiereDestino ? almacenDestinoId : undefined,
          cantidad: cantidadNum,
          // Cadenas crudas (vacía = limpiar). En partidas de una salida OQC
          // la remisión y el responsable no se envían: se conservan desde
          // la cabecera para no desincronizar el historial de movimientos.
          motivo: motivo.trim(),
          ...(agrupadaOqc
            ? {}
            : { referencia: referencia.trim(), responsable: responsable.trim() }),
          motivoCorreccion: motivoCorreccion.trim(),
        },
      });
      onCorregido();
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" aria-hidden />
            {t("registros.corregirRegistro")}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{movimiento.folio}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p>{t("registros.avisoStock")}</p>
            <p className="mt-1 opacity-80">{t("registros.tipoNoEditable")}</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>{t("comun.producto")} *</Label>
            <SelectorProducto
              productos={productos}
              valor={productoId || null}
              onChange={setProductoId}
              stockPorAlmacen={
                requiereOrigen && almacenOrigenId && stockOrigen
                  ? new Map(stockOrigen.map((s) => [s.productoId, s.cantidad]))
                  : undefined
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {requiereOrigen && (
              <div className="space-y-2">
                <Label>{t("operacion.almacenOrigen")} *</Label>
                <SelectorAlmacen
                  almacenes={almacenes}
                  valor={almacenOrigenId || null}
                  onChange={setAlmacenOrigenId}
                />
                {productoId && almacenOrigenId && (
                  <p className="text-xs text-muted-foreground">
                    {t("operacion.stockOrigen")}:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {f.numero(stockOrigen?.find((s) => s.productoId === productoId)?.cantidad ?? 0, 2)}{" "}
                      {productoSel ? productoSel.unidad : ""}
                    </span>
                  </p>
                )}
              </div>
            )}
            {requiereDestino && (
              <div className="space-y-2">
                <Label>{t("operacion.almacenDestino")} *</Label>
                <SelectorAlmacen
                  almacenes={
                    movimiento.tipo === "TRASLADO"
                      ? almacenes.filter((a) => a.id !== almacenOrigenId)
                      : almacenes
                  }
                  valor={almacenDestinoId || null}
                  onChange={setAlmacenDestinoId}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("comun.cantidad")} *</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="any"
                  min={movimiento.tipo === "AJUSTE" ? undefined : 0}
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="pr-16"
                  aria-label={t("comun.cantidad")}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {productoSel ? productoSel.unidad : ""}
                </span>
              </div>
              {movimiento.tipo === "AJUSTE" && (
                <p className="text-xs text-muted-foreground">{t("registros.ajusteNegativoHint")}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("comun.motivo")}</Label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label>{t("comun.referencia")}</Label>
              {agrupadaOqc ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs font-semibold">
                  {referencia || "—"}
                </p>
              ) : (
                <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={60} />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("comun.responsable")}</Label>
            {agrupadaOqc ? (
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{responsable || "—"}</p>
            ) : (
              <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} maxLength={80} />
            )}
          </div>

          {agrupadaOqc && (
            <p className="text-xs text-muted-foreground">
              {t("registros.datosDeSalidaOqc", { folio: movimiento.salidaFolio ?? "" })}
            </p>
          )}

          <div className="space-y-2">
            <Label>{t("registros.motivoCorreccion")} *</Label>
            <Textarea
              value={motivoCorreccion}
              onChange={(e) => setMotivoCorreccion(e.target.value)}
              placeholder={t("registros.motivoCorreccionPh")}
              rows={2}
              maxLength={200}
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCerrar}>
            {t("comun.cancelar")}
          </Button>
          <Button onClick={guardar} disabled={corregir.isPending}>
            {corregir.isPending ? t("comun.cargando") : t("comun.guardarCambios")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// DIÁLOGO DE ELIMINACIÓN
// ============================================================
function DialogoEliminacion({
  movimiento,
  onCerrar,
  onEliminado,
}: {
  movimiento: MovimientoResumen;
  onCerrar: () => void;
  onEliminado: () => void;
}) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const eliminar = useEliminarMovimiento();

  async function confirmar() {
    setError(null);
    if (!motivo.trim()) return setError(t("registros.motivoCorreccionRequerido"));
    try {
      await eliminar.mutateAsync({ id: movimiento.id, motivo: motivo.trim() });
      onEliminado();
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
            {t("registros.eliminarRegistro")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              <p className="font-mono text-xs">{movimiento.folio}</p>
              <p className="font-medium text-foreground">
                {movimiento.productoSku} — {movimiento.productoNombre}
              </p>
              <p>
                {t("comun.cantidad")}:{" "}
                <span className="font-semibold tabular-nums">
                  {f.numero(movimiento.cantidad, 2)} {movimiento.productoUnidad}
                </span>
              </p>
              {movimiento.conteo && (
                <p className="text-xs text-muted-foreground">
                  {t("operacion.conteo")}: {textoConteo(movimiento.conteo)}
                </p>
              )}
              <p>{t("registros.avisoEliminar")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label>{t("registros.motivoCorreccion")} *</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={t("registros.motivoCorreccionPh")}
            rows={2}
            maxLength={200}
          />
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel onClick={onCerrar}>{t("comun.cancelar")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirmar();
            }}
            disabled={eliminar.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {eliminar.isPending ? t("comun.cargando") : t("comun.eliminar")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
