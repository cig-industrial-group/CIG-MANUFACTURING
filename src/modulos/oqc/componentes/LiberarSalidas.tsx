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
 * LIBERAR MATERIAL DE SALIDA A CLIENTE (OQC)
 *   1. Se elige cliente destino y almacén origen.
 *   2. Se capturan las partidas (producto + cantidad) con validación
 *      de stock en vivo por partida.
 *   3. Confirmación con resumen de la liberación.
 *   4. La transacción crea UNA salida (folio OQC-...) que agrupa todas
 *      las partidas y descuenta el stock del almacén (todo o nada).
 */
import { useCallback, useMemo, useState } from "react";
import { ArrowUpFromLine, PackageCheck, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import { CargandoFilas, EncabezadoSeccion, EstadoVacio, SelectorBuscador } from "@/modulos/compartidos/ui";
import { useAlmacenes, useInventario, useProductos } from "@/modulos/almacen/servicios/consultas";
import { SelectorAlmacen, SelectorProducto } from "@/modulos/almacen/componentes/compartidos";
import { useClientes } from "@/modulos/clientes/servicios/consultas";
import { useLiberarSalida } from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import { CapturaConteo } from "@/modulos/unidades/componentes/CapturaConteo";
import { calcularConteo } from "@/modulos/unidades/servicios/consultas";
import { estadoConteoInicial, textoConteo, type EstadoConteo } from "@/modulos/unidades/tipos";
import type { SalidaOQC } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

interface LineaFormulario {
  key: number;
  productoId: string;
  /** Captura de cantidad: directa (unidad base) o paquetes + sueltas */
  conteo: EstadoConteo;
}

let contadorLineas = 1;

export function LiberarSalidas() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const { data: clientes } = useClientes();
  const { data: almacenes } = useAlmacenes();
  const { data: productos } = useProductos();

  const [clienteId, setClienteId] = useState("");
  const [almacenOrigenId, setAlmacenOrigenId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [responsable, setResponsable] = useState("");
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<LineaFormulario[]>([
    { key: contadorLineas++, productoId: "", conteo: estadoConteoInicial(null) },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [confirmacionAbierta, setConfirmacionAbierta] = useState(false);
  const [resultado, setResultado] = useState<SalidaOQC | null>(null);

  const liberar = useLiberarSalida();

  // Stock por producto en el almacén origen elegido
  const { data: stockOrigen, isLoading: cargandoStock } = useInventario(
    almacenOrigenId ? { almacenId: almacenOrigenId } : {},
    { enabled: !!almacenOrigenId },
  );
  const stockPorProducto = useMemo(
    () => new Map((stockOrigen ?? []).map((s) => [s.productoId, s.cantidad])),
    [stockOrigen],
  );

  const clientesActivos = useMemo(() => (clientes ?? []).filter((c) => c.activo), [clientes]);
  const productosActivos = useMemo(() => (productos ?? []).filter((p) => p.activo), [productos]);
  const clienteSel = clientesActivos.find((c) => c.id === clienteId) ?? null;

  function cambiarLinea(key: number, cambios: Partial<LineaFormulario>) {
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, ...cambios } : l)));
  }

  /** Al elegir producto en una línea, la captura arranca en su forma
   *  natural: paquetes si tiene empaque configurado, unidad base si no. */
  function elegirProductoLinea(key: number, productoId: string) {
    const producto = productosActivos.find((p) => p.id === productoId) ?? null;
    setLineas((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, productoId, conteo: estadoConteoInicial(producto) }
          : l,
      ),
    );
  }

  function agregarLinea() {
    setLineas((prev) => [...prev, { key: contadorLineas++, productoId: "", conteo: estadoConteoInicial(null) }]);
  }

  function quitarLinea(key: number) {
    setLineas((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function limpiar() {
    setClienteId("");
    setAlmacenOrigenId("");
    setReferencia("");
    setResponsable("");
    setNotas("");
    setLineas([{ key: contadorLineas++, productoId: "", conteo: estadoConteoInicial(null) }]);
    setError(null);
  }

  /** Total de una línea en unidad base (directo o paquetes + sueltas
   *  según el empaque configurado del producto). Memorizada con useCallback:
   *  la consumen los useMemo de abajo y solo depende de productosActivos. */
  const totalLinea = useCallback(
    (linea: LineaFormulario): number => {
      const producto = productosActivos.find((p) => p.id === linea.productoId) ?? null;
      return calcularConteo(linea.conteo, producto).total;
    },
    [productosActivos],
  );

  /** Partidas válidas (producto elegido y cantidad > 0) */
  const partidasValidas = useMemo(
    () =>
      lineas
        .filter((l) => l.productoId && totalLinea(l) > 0)
        .map((l) => {
          const producto = productosActivos.find((p) => p.id === l.productoId) ?? null;
          const resultado = calcularConteo(l.conteo, producto);
          return {
            productoId: l.productoId,
            cantidad: resultado.total,
            // Conteo en paquetes: el servidor valida y calcula el total
            ...(resultado.enPaquetes &&
              resultado.partes && {
                conteo: {
                  unidad: l.conteo.unidad,
                  paquetes: Number(l.conteo.paquetes) || 0,
                  sueltas: Number(l.conteo.sueltas) || 0,
                },
              }),
          };
        }),
    [lineas, productosActivos, totalLinea],
  );

  /** La misma partida puede capturarse en 2 líneas; se suman al liberar */
  const hayProductosRepetidos = useMemo(() => {
    const ids = partidasValidas.map((p) => p.productoId);
    return new Set(ids).size !== ids.length;
  }, [partidasValidas]);

  /** Validación en vivo: cantidades que exceden el stock del almacén origen */
  const partidasSinStock = useMemo(() => {
    if (!almacenOrigenId) return new Set<number>();
    const excedidas = new Set<number>();
    const acumulado = new Map<string, number>();
    for (const l of lineas) {
      if (!l.productoId) continue;
      const cant = totalLinea(l);
      if (Number.isFinite(cant) && cant > 0) {
        const total = (acumulado.get(l.productoId) ?? 0) + cant;
        acumulado.set(l.productoId, total);
        const disponible = stockPorProducto.get(l.productoId) ?? 0;
        if (total > disponible) excedidas.add(l.key);
      }
    }
    return excedidas;
  }, [lineas, stockPorProducto, almacenOrigenId, totalLinea]);

  function validar(): string | null {
    if (!clienteId) return t("oqc.clienteRequerido");
    if (!almacenOrigenId) return t("comun.seleccionarAlmacen");
    if (partidasValidas.length === 0) return t("oqc.sinLineas");
    if (partidasSinStock.size > 0) return t("comun.stockInsuficiente");
    if (hayProductosRepetidos) return t("oqc.productoRepetido");
    return null;
  }

  function abrirConfirmacion() {
    const problemas = validar();
    if (problemas) {
      setError(problemas);
      return;
    }
    setError(null);
    setConfirmacionAbierta(true);
  }

  async function confirmarLiberacion() {
    try {
      const res = await liberar.mutateAsync({
        clienteId,
        almacenOrigenId,
        referencia: referencia.trim() || undefined,
        responsable: responsable.trim() || undefined,
        notas: notas.trim() || undefined,
        lineas: partidasValidas,
      });
      setResultado(res.salida);
      setConfirmacionAbierta(false);
      toast({ description: t("oqc.liberadaOk", { folio: res.salida.folio }) });
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
      setConfirmacionAbierta(false);
    }
  }

  const totalUnidades = partidasValidas.reduce((acc, p) => acc + p.cantidad, 0);

  // ===== Pantalla de éxito =====
  if (resultado) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <PackageCheck className="h-8 w-8" />
            </div>
            <div>
              <p className="text-lg font-bold">{t("oqc.liberadaOk", { folio: resultado.folio })}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("oqc.clienteDestino")}:{" "}
                <span className="font-semibold text-foreground">
                  {resultado.clienteCodigo} — {resultado.clienteNombre}
                </span>
              </p>
            </div>
            <Separator className="w-full" />
            <div className="w-full space-y-2 text-sm">
              {resultado.partidas.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0 text-left">
                    <p className="font-mono text-xs font-bold text-primary">{m.folio}</p>
                    <p className="truncate text-sm font-medium">
                      {m.productoSku} — {m.productoNombre}
                    </p>
                    {m.conteo && (
                      <p className="truncate text-xs text-muted-foreground">{textoConteo(m.conteo)}</p>
                    )}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">
                    {f.numero(m.cantidad, 2)} {m.productoUnidad}
                  </p>
                </div>
              ))}
            </div>
            <Button
              onClick={() => {
                setResultado(null);
                limpiar();
              }}
              className="min-h-10"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("oqc.nuevaSalida")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== Formulario =====
  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("oqc.liberarTitulo")}
        descripcion={t("nav.descripcionOqcLiberar")}
        icono={<PackageCheck className="h-5 w-5" />}
      />

      {clientesActivos.length === 0 ? (
        <EstadoVacio
          titulo={t("comun.sinResultados")}
          descripcion={t("oqc.vacioLiberar")}
          icono={<PackageCheck className="h-8 w-8 text-muted-foreground" aria-hidden />}
        />
      ) : (
        <div className="mx-auto max-w-3xl">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ArrowUpFromLine className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                {t("oqc.liberarTitulo")}
              </CardTitle>
              <CardDescription>{t("oqc.liberarSub")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Cliente destino + almacén origen */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("oqc.clienteDestino")} *</Label>
                  <SelectorBuscador
                    opciones={clientesActivos.map((c) => ({
                      valor: c.id,
                      etiqueta: c.nombre,
                      subetiqueta: c.codigo,
                      detalle: c.contacto ?? undefined,
                    }))}
                    valor={clienteId || null}
                    onChange={(v) => setClienteId(v)}
                    placeholder={t("oqc.seleccionarCliente")}
                    placeholderBusqueda={t("comun.buscar")}
                    sinResultados={t("comun.sinResultados")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("oqc.almacenOrigen")} *</Label>
                  <SelectorAlmacen
                    almacenes={almacenes ?? []}
                    valor={almacenOrigenId || null}
                    onChange={(v) => setAlmacenOrigenId(v)}
                  />
                </div>
              </div>

              {/* Referencia (remisión / folio / pedido) + responsable */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="salida-referencia">
                    {t("oqc.referencia")}{" "}
                    <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                  </Label>
                  <Input
                    id="salida-referencia"
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value.toUpperCase())}
                    placeholder="REM-0121"
                    maxLength={40}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salida-responsable">
                    {t("oqc.responsableLiberacion")}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({t("comun.opcional")}) — {t("oqc.responsableAviso")}
                    </span>
                  </Label>
                  <Input
                    id="salida-responsable"
                    value={responsable}
                    onChange={(e) => setResponsable(e.target.value)}
                    maxLength={80}
                  />
                </div>
              </div>

              {/* Notas de inspección */}
              <div className="space-y-2">
                <Label htmlFor="salida-notas">
                  {t("oqc.notas")}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({t("comun.opcional")}) — {t("oqc.notasAviso")}
                  </span>
                </Label>
                <Input
                  id="salida-notas"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  maxLength={200}
                />
              </div>

              <Separator />

              {/* Partidas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base">{t("oqc.lineas")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={agregarLinea}
                  >
                    <Plus className="mr-1.5 h-4 w-4" /> {t("oqc.agregarLinea")}
                  </Button>
                </div>

                {cargandoStock && almacenOrigenId ? (
                  <CargandoFilas filas={2} />
                ) : (
                  lineas.map((linea) => {
                    const productoSel = productosActivos.find((p) => p.id === linea.productoId);
                    const disponible = almacenOrigenId
                      ? stockPorProducto.get(linea.productoId) ?? 0
                      : null;
                    const excede = partidasSinStock.has(linea.key);
                    return (
                      <div
                        key={linea.key}
                        className={cn(
                          "rounded-xl border p-3 sm:p-4",
                          excede && "border-destructive/50 bg-destructive/5",
                        )}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <SelectorProducto
                                productos={productosActivos}
                                valor={linea.productoId || null}
                                onChange={(v) => elegirProductoLinea(linea.key, v)}
                                stockPorAlmacen={
                                  almacenOrigenId && stockPorProducto.size > 0
                                    ? stockPorProducto
                                    : undefined
                                }
                              />
                              {productoSel && disponible !== null && (
                                <p
                                  className={cn(
                                    "text-xs",
                                    excede
                                      ? "font-semibold text-destructive"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {t("comun.disponible")}:{" "}
                                  <span className="font-semibold tabular-nums text-foreground">
                                    {f.numero(disponible, 1)}
                                  </span>{" "}
                                  {productoSel.unidad}
                                  {excede && ` · ${t("comun.stockInsuficiente")}`}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                              onClick={() => quitarLinea(linea.key)}
                              disabled={lineas.length <= 1}
                              aria-label={t("comun.eliminar")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {/* Captura de cantidad: unidad base o paquetes
                              + sueltas, según el empaque del producto */}
                          <CapturaConteo
                            producto={productoSel}
                            valor={linea.conteo}
                            onChange={(nuevo) => cambiarLinea(linea.key, { conteo: nuevo })}
                            etiquetaCantidad={t("comun.cantidad")}
                            idPrefijo={`linea-${linea.key}`}
                            compacto
                          />
                        </div>
                      </div>
                    );
                  })
                )}
                {!almacenOrigenId && (
                  <p className="text-xs text-muted-foreground">{t("oqc.avisarAlmacenStock")}</p>
                )}
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={limpiar} className="min-h-10 sm:min-h-9">
                  {t("operacion.limpiarFormulario")}
                </Button>
                <Button
                  onClick={abrirConfirmacion}
                  disabled={liberar.isPending}
                  className="min-h-10 sm:min-h-9"
                >
                  <PackageCheck className="mr-2 h-4 w-4" />
                  {liberar.isPending ? t("comun.cargando") : t("oqc.confirmarLiberacion")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Confirmación con resumen ===== */}
      <AlertDialog open={confirmacionAbierta} onOpenChange={setConfirmacionAbierta}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("oqc.confirmarLiberacion")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t("oqc.confirmacionSub")}</p>
                <div className="space-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("oqc.clienteDestino")}</span>
                    <span className="text-right font-medium">
                      {clienteSel ? `${clienteSel.codigo} — ${clienteSel.nombre}` : ""}
                    </span>
                  </p>
                  <p className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("oqc.almacenOrigen")}</span>
                    <span className="text-right font-medium">
                      {almacenes?.find((a) => a.id === almacenOrigenId)?.nombre ?? ""}
                    </span>
                  </p>
                  <p className="flex justify-between gap-3">
                    <span className="text-muted-foreground">{t("oqc.lineas")}</span>
                    <span className="text-right font-medium">
                      {partidasValidas.length} · {f.numero(totalUnidades, 2)}
                    </span>
                  </p>
                  {referencia.trim() && (
                    <p className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{t("oqc.referencia")}</span>
                      <span className="font-mono text-xs font-semibold">{referencia.trim()}</span>
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={liberar.isPending}>{t("comun.cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // mantener el diálogo abierto hasta que termine la mutación
                confirmarLiberacion();
              }}
              disabled={liberar.isPending}
            >
              {liberar.isPending ? t("comun.cargando") : t("oqc.confirmarLiberacion")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
