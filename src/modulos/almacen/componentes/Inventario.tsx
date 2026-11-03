"use client";

/**
 * INVENTARIO — Existencias en tiempo real
 * Vista por almacén y vista por producto, con ajuste de stock (conteo físico).
 */
import { useMemo, useState } from "react";
import { Boxes, History, Search, SlidersHorizontal } from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  EncabezadoSeccion,
  EstadoVacio,
  Kpi,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import { useAlmacenes, useCrearMovimiento, useInventario, useProductos } from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import { InsigniaCategoria, IndicadorStock, SelectorAlmacen, SelectorProducto } from "./compartidos";
import { RegistrosSeccion } from "./RegistrosSeccion";
import { CapturaConteo } from "@/modulos/unidades/componentes/CapturaConteo";
import { calcularConteo } from "@/modulos/unidades/servicios/consultas";
import { estadoConteoInicial, textoConteo, type EstadoConteo } from "@/modulos/unidades/tipos";
import type { Producto } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function Inventario() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();

  const [vista, setVista] = useState<"almacen" | "producto" | "registros">("almacen");
  const [almacenId, setAlmacenId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const { data: almacenes } = useAlmacenes();
  const { data: productos } = useProductos();
  const { data: filas, isLoading } = useInventario();

  // Diálogo de ajuste
  const [ajusteAbierto, setAjusteAbierto] = useState(false);
  const [productoAjuste, setProductoAjuste] = useState<Producto | null>(null);
  const [almacenAjuste, setAlmacenAjuste] = useState("");
  const [direccion, setDireccion] = useState<"POS" | "NEG">("POS");
  // Conteo físico: directa (unidad base) o en paquetes + sueltas
  const [conteoAjuste, setConteoAjuste] = useState<EstadoConteo>(estadoConteoInicial(null));
  const [motivo, setMotivo] = useState("");
  const [responsable, setResponsable] = useState("");
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null);
  const registrar = useCrearMovimiento();

  const filasFiltradas = useMemo(() => {
    let lista = filas ?? [];
    if (almacenId) lista = lista.filter((x) => x.almacenId === almacenId);
    const q = busqueda.trim().toLowerCase();
    if (q) {
      lista = lista.filter(
        (x) => x.sku.toLowerCase().includes(q) || x.productoNombre.toLowerCase().includes(q),
      );
    }
    return lista;
  }, [filas, almacenId, busqueda]);

  const resumen = useMemo(() => {
    const skus = new Set(filasFiltradas.map((x) => x.sku));
    return {
      productos: skus.size,
      unidades: filasFiltradas.reduce((acc, x) => acc + x.cantidad, 0),
      valor: filasFiltradas.reduce((acc, x) => acc + x.valor, 0),
    };
  }, [filasFiltradas]);

  // Vista por producto: agrupar filas
  const porProducto = useMemo(() => {
    const mapa = new Map<
      string,
      {
        sku: string;
        nombre: string;
        categoria: string;
        unidad: string;
        stockMinimo: number;
        total: number;
        porAlmacen: Array<{ almacenId: string; codigo: string; cantidad: number }>;
      }
    >();
    for (const x of filas ?? []) {
      const agg =
        mapa.get(x.sku) ??
        {
          sku: x.sku,
          nombre: x.productoNombre,
          categoria: x.categoria,
          unidad: x.unidad,
          stockMinimo: x.stockMinimo,
          total: 0,
          porAlmacen: [] as Array<{ almacenId: string; codigo: string; cantidad: number }>,
        };
      agg.total += x.cantidad;
      agg.porAlmacen.push({ almacenId: x.almacenId, codigo: x.almacenCodigo, cantidad: x.cantidad });
      mapa.set(x.sku, agg);
    }
    let lista = [...mapa.values()];
    if (almacenId) lista = lista.filter((p) => p.porAlmacen.some((a) => a.almacenId === almacenId));
    const q = busqueda.trim().toLowerCase();
    if (q) lista = lista.filter((p) => p.sku.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q));
    return lista.sort((a, b) => a.sku.localeCompare(b.sku));
  }, [filas, almacenId, busqueda]);

  function abrirAjuste(producto?: { id: string; sku: string; nombre: string } | null) {
    const completo = producto ? (productos?.find((p) => p.id === producto.id) ?? null) : null;
    setProductoAjuste(completo);
    setAlmacenAjuste(almacenId);
    setDireccion("POS");
    setConteoAjuste(estadoConteoInicial(completo));
    setMotivo("");
    setResponsable("");
    setErrorAjuste(null);
    setAjusteAbierto(true);
  }

  // Al cambiar de producto (unidad base o empaque distintos) el conteo
  // se reinicia en su forma natural de captura. El ajuste se hace durante
  // el render (patrón recomendado por React para restablecer estado cuando
  // cambia otro valor) en vez de dentro de un useEffect, donde el setState
  // síncrono provoca renders en cascada.
  const [conteoAjusteProductoId, setConteoAjusteProductoId] = useState(productoAjuste?.id);
  if (conteoAjusteProductoId !== productoAjuste?.id) {
    setConteoAjusteProductoId(productoAjuste?.id);
    setConteoAjuste(estadoConteoInicial(productoAjuste));
  }

  // Total del ajuste en unidad base según el modo de captura (directo o
  // paquetes del EMPAQUE CONFIGURADO DEL PRODUCTO)
  const resultadoConteoAjuste = calcularConteo(conteoAjuste, productoAjuste);
  const cantidadAjusteNum = resultadoConteoAjuste.total;

  const stockActualAjuste = useMemo(() => {
    if (!productoAjuste || !almacenAjuste) return null;
    return filas?.find((x) => x.productoId === productoAjuste.id && x.almacenId === almacenAjuste)?.cantidad ?? 0;
  }, [filas, productoAjuste, almacenAjuste]);

  async function confirmarAjuste() {
    if (!productoAjuste) return setErrorAjuste(t("validaciones.productoRequerido"));
    if (!almacenAjuste) return setErrorAjuste(t("validaciones.almacenRequerido"));
    if (!Number.isFinite(cantidadAjusteNum) || cantidadAjusteNum <= 0)
      return setErrorAjuste(t("validaciones.cantidadRequerida"));
    if (!motivo.trim()) return setErrorAjuste(t("validaciones.motivoAjusteRequerido"));
    if (direccion === "NEG" && (stockActualAjuste ?? 0) < cantidadAjusteNum) {
      return setErrorAjuste(t("comun.stockInsuficiente"));
    }

    try {
      await registrar.mutateAsync({
        tipo: "AJUSTE",
        productoId: productoAjuste.id,
        almacenDestinoId: almacenAjuste,
        cantidad: direccion === "POS" ? cantidadAjusteNum : -cantidadAjusteNum,
        motivo: motivo.trim(),
        responsable: responsable || undefined,
        // Conteo en paquetes (si se capturó así): el servidor calcula el total
        ...(resultadoConteoAjuste.enPaquetes &&
          resultadoConteoAjuste.partes && {
            conteo: {
              unidad: conteoAjuste.unidad,
              paquetes: Number(conteoAjuste.paquetes) || 0,
              sueltas: Number(conteoAjuste.sueltas) || 0,
            },
          }),
      });
      toast({ description: t("mov.movimientoRegistrado") });
      setAjusteAbierto(false);
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setErrorAjuste(t(claveErrorApi(codigo)));
    }
  }

  const nombreAlmacen = almacenes?.find((a) => a.id === almacenId);

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("inventario.titulo")}
        descripcion={t("nav.descripcionInventario")}
        icono={<Boxes className="h-5 w-5" />}
        acciones={
          <Button onClick={() => abrirAjuste(null)} className="min-h-9">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            {t("inventario.ajustar")}
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {vista !== "registros" && (
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t("comun.buscarProducto")}
                className="pl-9"
                aria-label={t("comun.buscar")}
              />
            </div>
            <div className="w-full sm:w-64">
              <SelectorAlmacen
                almacenes={almacenes ?? []}
                valor={almacenId || null}
                onChange={(v) => setAlmacenId(v)}
                soloActivos={false}
              />
            </div>
          </div>
        )}
        <Tabs
          value={vista}
          onValueChange={(v) => setVista(v as "almacen" | "producto" | "registros")}
        >
          <TabsList className="h-10">
            <TabsTrigger value="almacen" className="px-3 text-xs sm:text-sm">
              {t("inventario.verPorAlmacen")}
            </TabsTrigger>
            <TabsTrigger value="producto" className="px-3 text-xs sm:text-sm">
              {t("inventario.verPorProducto")}
            </TabsTrigger>
            <TabsTrigger value="registros" className="gap-1.5 px-3 text-xs sm:text-sm">
              <History className="h-3.5 w-3.5" aria-hidden />
              {t("inventario.registrosAjustes")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Resumen */}
      {vista !== "registros" && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Kpi
          titulo={t("comun.productos")}
          valor={f.entero(vista === "almacen" ? resumen.productos : porProducto.length)}
          icono={<Boxes className="h-5 w-5" />}
          tono="primario"
        />
        <Kpi
          titulo={t("almacen.unidades")}
          valor={
            vista === "almacen"
              ? f.entero(resumen.unidades)
              : f.entero(porProducto.reduce((acc, p) => acc + p.total, 0))
          }
          icono={<Boxes className="h-5 w-5" />}
          tono="neutro"
        />
        <Kpi
          titulo={t("inventario.totalSistema")}
          valor={
            f.moneda(
              vista === "almacen"
                ? resumen.valor
                : porProducto.reduce(
                    (acc, p) =>
                      acc + p.total * (productos?.find((x) => x.sku === p.sku)?.costoUnitario ?? 0),
                    0,
                  ),
            )
          }
          icono={<Boxes className="h-5 w-5" />}
          tono="exito"
        />
      </div>
      )}

      {vista === "registros" ? (
        <RegistrosSeccion tipo="AJUSTE" requiereOrigen={false} requiereDestino />
      ) : isLoading ? (
        <CargandoFilas filas={8} />
      ) : (
        <>
          {/* ===== VISTA POR ALMACÉN ===== */}
          {vista === "almacen" &&
            (filasFiltradas.length === 0 ? (
              <EstadoVacio
                titulo={almacenId && nombreAlmacen ? t("inventario.sinStockAlmacen") : t("comun.sinDatos")}
                descripcion={nombreAlmacen ? nombreAlmacen.nombre : undefined}
              />
            ) : (
              <div className="space-y-4">
                <div className="hidden md:block">
                  <TablaResponsiva>
                    <thead className="bg-muted/50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2.5">{t("producto.sku")}</th>
                        <th className="px-3 py-2.5">{t("comun.producto")}</th>
                        <th className="px-3 py-2.5">{t("comun.almacen")}</th>
                        <th className="px-3 py-2.5 text-right">{t("inventario.stockActual")}</th>
                        <th className="px-3 py-2.5 text-right">{t("producto.stockMinimo")}</th>
                        <th className="px-3 py-2.5 text-right">{t("almacen.valor")}</th>
                        <th className="px-3 py-2.5">{t("inventario.estadoStock")}</th>
                        <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filasFiltradas.map((x) => (
                        <tr key={x.id} className="transition-colors hover:bg-muted/30">
                          <td className="px-3 py-2.5 font-mono text-xs font-semibold">{x.sku}</td>
                          <td className="max-w-56 px-3 py-2.5">
                            <p className="truncate font-medium">{x.productoNombre}</p>
                            <InsigniaCategoria categoria={x.categoria} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant="outline" className="font-mono text-[11px]">
                              {x.almacenCodigo}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                            {f.numero(x.cantidad, 2)}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              {x.unidad}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">
                            {f.numero(x.stockMinimo, 1)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{f.moneda(x.valor)}</td>
                          <td className="px-3 py-2.5">
                            <IndicadorStock stock={x.cantidad} minimo={x.stockMinimo} />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={() =>
                                abrirAjuste({ id: x.productoId, sku: x.sku, nombre: x.productoNombre })
                              }
                            >
                              <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                              {t("inventario.ajustar")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </TablaResponsiva>
                </div>

                {/* Tarjetas móvil */}
                <div className="space-y-3 md:hidden">
                  {filasFiltradas.map((x) => (
                    <div key={x.id} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-bold text-primary">{x.sku}</p>
                          <p className="truncate font-semibold">{x.productoNombre}</p>
                        </div>
                        <IndicadorStock stock={x.cantidad} minimo={x.stockMinimo} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <InsigniaCategoria categoria={x.categoria} />
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {x.almacenCodigo}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">{t("inventario.stockActual")}</p>
                          <p className="font-bold tabular-nums">
                            {f.numero(x.cantidad, 2)} {x.unidad}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">{t("almacen.valor")}</p>
                          <p className="font-bold tabular-nums">{f.moneda(x.valor)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9"
                          onClick={() =>
                            abrirAjuste({ id: x.productoId, sku: x.sku, nombre: x.productoNombre })
                          }
                        >
                          <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
                          {t("inventario.ajustar")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

          {/* ===== VISTA POR PRODUCTO ===== */}
          {vista === "producto" &&
            (porProducto.length === 0 ? (
              <EstadoVacio titulo={t("comun.sinResultados")} />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {porProducto.map((p) => (
                  <div key={p.sku} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-primary">{p.sku}</p>
                        <p className="truncate font-semibold">{p.nombre}</p>
                      </div>
                      <IndicadorStock stock={p.total} minimo={p.stockMinimo} />
                    </div>
                    <div className="mt-2">
                      <InsigniaCategoria categoria={p.categoria} />
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <p className="text-2xl font-bold tabular-nums">
                        {f.numero(p.total, 1)}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {p.unidad}
                        </span>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => abrirAjuste({ id: productos?.find((x) => x.sku === p.sku)?.id ?? "", sku: p.sku, nombre: p.nombre })}
                      >
                        <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
                        {t("inventario.ajustar")}
                      </Button>
                    </div>
                    <div className="mt-3 space-y-1.5 border-t pt-3">
                      {p.porAlmacen.map((a) => (
                        <div key={a.almacenId} className="flex items-center justify-between text-xs">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {a.codigo}
                          </Badge>
                          <span className="font-semibold tabular-nums">
                            {f.numero(a.cantidad, 1)} {p.unidad}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
        </>
      )}

      {/* ===== Diálogo de ajuste de stock ===== */}
      <Dialog open={ajusteAbierto} onOpenChange={setAjusteAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("inventario.ajustar")}</DialogTitle>
            <DialogDescription>{t("inventario.subtitulo")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>{t("comun.producto")} *</Label>
              {productoAjuste ? (
                <div className="rounded-md border px-3 py-2.5 text-sm">
                  <span className="font-mono text-xs font-bold text-primary">{productoAjuste.sku}</span>{" "}
                  — {productoAjuste.nombre}
                </div>
              ) : (
                <SelectorProducto
                  productos={(productos ?? []).filter((p) => p.activo)}
                  valor={null}
                  onChange={(id) =>
                    setProductoAjuste(productos?.find((p) => p.id === id) ?? null)
                  }
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("comun.almacen")} *</Label>
              <SelectorAlmacen
                almacenes={almacenes ?? []}
                valor={almacenAjuste || null}
                onChange={setAlmacenAjuste}
              />
              {productoAjuste && almacenAjuste && (
                <p className="text-xs text-muted-foreground">
                  {t("inventario.stockActual")}:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {f.numero(stockActualAjuste ?? 0, 2)} {productoAjuste.unidad}
                  </span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("inventario.tipoAjuste")}</Label>
                <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
                  {(["POS", "NEG"] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      onClick={() => setDireccion(dir)}
                      className={cn(
                        "h-9 rounded-md text-sm font-medium transition-colors",
                        direccion === dir
                          ? dir === "POS"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-red-500/15 text-red-700 dark:text-red-400"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {dir === "POS" ? "+" : "−"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Conteo físico: captura directa o en paquetes + sueltas
                (según el empaque configurado del producto) */}
            <div className="space-y-2">
              <Label>{t("comun.cantidad")} *</Label>
              <CapturaConteo
                producto={productoAjuste}
                valor={conteoAjuste}
                onChange={setConteoAjuste}
                etiquetaCantidad={t("comun.cantidad")}
                idPrefijo="ajuste"
              />
            </div>
            {productoAjuste && almacenAjuste && cantidadAjusteNum > 0 && (
              <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("inventario.stockActual")}</span>
                  <span className="font-semibold tabular-nums">
                    {f.numero(stockActualAjuste ?? 0, 2)}
                  </span>
                </div>
                {resultadoConteoAjuste.partes && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t("operacion.conteo")}</span>
                    <span className="font-medium">{textoConteo(resultadoConteoAjuste.partes)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("inventario.diferencia")}</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      direccion === "POS" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {direccion === "POS" ? "+" : "−"}
                    {f.numero(cantidadAjusteNum, 2)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-1.5">
                  <span className="font-medium">{t("inventario.stockFinal")}</span>
                  <span className="font-bold tabular-nums">
                    {f.numero(
                      (stockActualAjuste ?? 0) + (direccion === "POS" ? 1 : -1) * cantidadAjusteNum,
                      2,
                    )}{" "}
                    {productoAjuste.unidad}
                  </span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("inventario.motivoAjuste")} *</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={t("mov.detalleMovimiento")}
                rows={2}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("comun.responsable")}</Label>
              <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} maxLength={80} />
            </div>
            {errorAjuste && <p className="text-sm text-destructive">{errorAjuste}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAjusteAbierto(false)}>
              {t("comun.cancelar")}
            </Button>
            <Button onClick={confirmarAjuste} disabled={registrar.isPending}>
              {registrar.isPending ? t("comun.cargando") : t("comun.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
