"use client";

/**
 * OPERACIONES DE ALMACÉN
 * Cada sección operativa tiene dos pestañas:
 *   - Registrar: formulario parametrizado para capturar el movimiento
 *     (ENTRADA / RECEPCION / SALIDA / TRASLADO)
 *   - Registros: gestión de los registros de la sección (consultar,
 *     corregir y eliminar con recálculo de stock y bitácora)
 */
import { useEffect, useMemo, useState } from "react";
import {
  PackagePlus,
  ArrowDownToLine,
  ArrowUpFromLine,
  Repeat,
  CheckCircle2,
  RotateCcw,
  ClipboardList,
  History,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import { EncabezadoSeccion } from "@/modulos/compartidos/ui";
import { useAlmacenes, useCrearMovimiento, useInventario, useProductos } from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import { SelectorAlmacen, SelectorProducto, InsigniaTipoMovimiento } from "./compartidos";
import { RegistrosSeccion } from "./RegistrosSeccion";
import { CapturaConteo } from "@/modulos/unidades/componentes/CapturaConteo";
import { calcularConteo } from "@/modulos/unidades/servicios/consultas";
import { estadoConteoInicial, textoConteo, type EstadoConteo } from "@/modulos/unidades/tipos";
import type { MovimientoResumen, Producto } from "../tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TipoOperacion = "ENTRADA" | "RECEPCION" | "SALIDA" | "TRASLADO";

interface ConfigOperacion {
  tipo: TipoOperacion;
  claveTitulo: string;
  claveSubtitulo: string;
  claveRegistrada: string;
  claveDescripcion: string;
  categoriasSugeridas: string[];
  icono: React.ReactNode;
  requiereOrigen: boolean;
  requiereDestino: boolean;
  claveResponsable: string;
}

const CONFIGS: Record<TipoOperacion, ConfigOperacion> = {
  ENTRADA: {
    tipo: "ENTRADA",
    claveTitulo: "entradas.titulo",
    claveSubtitulo: "entradas.subtituloForm",
    claveRegistrada: "entradas.registrada",
    claveDescripcion: "nav.descripcionEntradas",
    categoriasSugeridas: ["PRODUCTO_TERMINADO"],
    icono: <PackagePlus className="h-5 w-5" />,
    requiereOrigen: false,
    requiereDestino: true,
    claveResponsable: "operacion.responsableRecibe",
  },
  RECEPCION: {
    tipo: "RECEPCION",
    claveTitulo: "recepcion.titulo",
    claveSubtitulo: "recepcion.subtituloForm",
    claveRegistrada: "recepcion.registrada",
    claveDescripcion: "nav.descripcionRecepcionMp",
    categoriasSugeridas: ["MATERIA_PRIMA", "INSUMO"],
    icono: <ArrowDownToLine className="h-5 w-5" />,
    requiereOrigen: false,
    requiereDestino: true,
    claveResponsable: "operacion.responsableRecibe",
  },
  SALIDA: {
    tipo: "SALIDA",
    claveTitulo: "salidas.titulo",
    claveSubtitulo: "salidas.subtituloForm",
    claveRegistrada: "salidas.registrada",
    claveDescripcion: "nav.descripcionSalidas",
    categoriasSugeridas: [],
    icono: <ArrowUpFromLine className="h-5 w-5" />,
    requiereOrigen: true,
    requiereDestino: false,
    claveResponsable: "operacion.responsableEntrega",
  },
  TRASLADO: {
    tipo: "TRASLADO",
    claveTitulo: "traslados.titulo",
    claveSubtitulo: "traslados.subtituloForm",
    claveRegistrada: "traslados.registrado",
    claveDescripcion: "nav.descripcionTraslados",
    categoriasSugeridas: [],
    icono: <Repeat className="h-5 w-5" />,
    requiereOrigen: true,
    requiereDestino: true,
    claveResponsable: "operacion.responsableEntrega",
  },
};

// ============================================================
// SECCIÓN CON PESTAÑAS: REGISTRAR / REGISTROS
// ============================================================
function SeccionOperacion({ config }: { config: ConfigOperacion }) {
  const { t } = useIdioma();
  const [pestania, setPestania] = useState("registrar");

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t(config.claveTitulo)}
        descripcion={t(config.claveDescripcion)}
        icono={config.icono}
      />

      <Tabs value={pestania} onValueChange={setPestania}>
        <TabsList className="h-11 w-full sm:w-auto">
          <TabsTrigger
            value="registrar"
            className="min-h-9 flex-1 gap-1.5 px-4 text-xs sm:flex-none sm:text-sm"
          >
            <ClipboardList className="h-4 w-4" aria-hidden />
            {t("registros.tabRegistrar")}
          </TabsTrigger>
          <TabsTrigger
            value="registros"
            className="min-h-9 flex-1 gap-1.5 px-4 text-xs sm:flex-none sm:text-sm"
          >
            <History className="h-4 w-4" aria-hidden />
            {t("registros.tabRegistros")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="registrar" className="mt-4">
          <FormularioOperacion config={config} />
        </TabsContent>
        <TabsContent value="registros" className="mt-4">
          <RegistrosSeccion
            tipo={config.tipo}
            requiereOrigen={config.requiereOrigen}
            requiereDestino={config.requiereDestino}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// FORMULARIO DE OPERACIÓN
// ============================================================
function FormularioOperacion({ config }: { config: ConfigOperacion }) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const { data: almacenes } = useAlmacenes();
  const { data: productos } = useProductos();

  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [productoId, setProductoId] = useState("");
  const [almacenOrigenId, setAlmacenOrigenId] = useState("");
  const [almacenDestinoId, setAlmacenDestinoId] = useState("");
  // Captura de cantidad: directa (unidad base) o en paquetes + sueltas
  const [conteo, setConteo] = useState<EstadoConteo>(estadoConteoInicial(null));
  const [responsable, setResponsable] = useState("");
  // Campos extra por tipo
  const [ordenProduccion, setOrdenProduccion] = useState("");
  const [lote, setLote] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [factura, setFactura] = useState("");
  const [tipoSalida, setTipoSalida] = useState("areaConsumo");
  const [destinoSalida, setDestinoSalida] = useState("");
  const [pedido, setPedido] = useState("");
  const [motivoTraslado, setMotivoTraslado] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<MovimientoResumen | null>(null);
  const registrar = useCrearMovimiento();

  // Stock por producto en el almacén origen (para salidas/traslados)
  const requiereStock = config.requiereOrigen && !!almacenOrigenId;
  const { data: stockOrigen } = useInventario(
    requiereStock ? { almacenId: almacenOrigenId } : {},
    { enabled: requiereStock },
  );
  const stockDisponible = useMemo(() => {
    if (!config.requiereOrigen || !stockOrigen || !productoId) return null;
    return stockOrigen.find((s) => s.productoId === productoId)?.cantidad ?? 0;
  }, [stockOrigen, productoId, config.requiereOrigen]);

  const productosFiltrados = useMemo(() => {
    if (!productos) return [];
    const activos = productos.filter((p) => p.activo);
    if (mostrarTodos || config.categoriasSugeridas.length === 0) return activos;
    return activos.filter((p) => config.categoriasSugeridas.includes(p.categoria));
  }, [productos, mostrarTodos, config.categoriasSugeridas]);

  const productoSel = productos?.find((p) => p.id === productoId) ?? null;

  // Al cambiar de producto (unidad base o empaque distintos) el conteo
  // se reinicia en su forma natural de captura.
  useEffect(() => {
    setConteo(estadoConteoInicial(productoSel));
  }, [productoId]);

  // Total en unidad base según el modo de captura (directo o paquetes
  // del EMPAQUE CONFIGURADO DEL PRODUCTO)
  const resultadoConteo = calcularConteo(conteo, productoSel);
  const cantidadNum = resultadoConteo.total;

  function limpiar() {
    setProductoId("");
    setAlmacenOrigenId("");
    setAlmacenDestinoId("");
    setConteo(estadoConteoInicial(null));
    setResponsable("");
    setOrdenProduccion("");
    setLote("");
    setProveedor("");
    setFactura("");
    setTipoSalida("areaConsumo");
    setDestinoSalida("");
    setPedido("");
    setMotivoTraslado("");
    setError(null);
  }

  async function registrarMovimiento() {
    setError(null);
    if (!productoId) return setError(t("validaciones.productoRequerido"));
    if (config.requiereDestino && !almacenDestinoId) return setError(t("validaciones.almacenRequerido"));
    if (config.requiereOrigen && !almacenOrigenId) return setError(t("validaciones.almacenRequerido"));
    if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) return setError(t("validaciones.cantidadRequerida"));
    if (config.tipo === "TRASLADO" && almacenOrigenId === almacenDestinoId) {
      return setError(t("comun.seleccionarAlmacenesDistintos"));
    }
    if (
      config.requiereOrigen &&
      stockDisponible !== null &&
      cantidadNum > stockDisponible
    ) {
      return setError(t("comun.stockInsuficiente"));
    }

    // Campos compuestos según el tipo de operación
    let motivo: string | undefined;
    let referencia: string | undefined;
    if (config.tipo === "ENTRADA") {
      motivo = lote ? `Lote: ${lote}` : undefined;
      referencia = ordenProduccion || undefined;
    } else if (config.tipo === "RECEPCION") {
      motivo = proveedor ? `${t("operacion.proveedor")}: ${proveedor}` : undefined;
      referencia = factura || undefined;
    } else if (config.tipo === "SALIDA") {
      motivo = [t(`operacion.${tipoSalida}`), destinoSalida].filter(Boolean).join(": ");
      referencia = pedido || undefined;
    } else if (config.tipo === "TRASLADO") {
      motivo = motivoTraslado || undefined;
    }

    try {
      const res = await registrar.mutateAsync({
        tipo: config.tipo,
        productoId,
        almacenOrigenId: config.requiereOrigen ? almacenOrigenId : undefined,
        almacenDestinoId: config.requiereDestino ? almacenDestinoId : undefined,
        cantidad: cantidadNum,
        motivo,
        referencia,
        responsable: responsable || undefined,
        // Conteo en paquetes: el servidor valida la unidad y calcula el total
        ...(resultadoConteo.enPaquetes &&
          resultadoConteo.partes && {
            conteo: {
              unidad: conteo.unidad,
              paquetes: Number(conteo.paquetes) || 0,
              sueltas: Number(conteo.sueltas) || 0,
            },
          }),
      });
      setResultado(res);
      toast({ description: t(config.claveRegistrada) });
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
    }
  }

  // ===== Pantalla de éxito =====
  if (resultado) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <p className="text-lg font-bold">{t(config.claveRegistrada)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("operacion.folioAsignado")}:{" "}
                <span className="font-mono font-semibold text-foreground">{resultado.folio}</span>
              </p>
            </div>
            <Separator className="w-full" />
            <div className="w-full space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("comun.producto")}</span>
                <span className="text-right font-medium">
                  {resultado.productoSku} — {resultado.productoNombre}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("comun.cantidad")}</span>
                <span className="font-semibold tabular-nums">
                  {f.numero(resultado.cantidad, 2)} {resultado.productoUnidad}
                </span>
              </div>
              {resultado.conteo && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("operacion.conteo")}</span>
                  <span className="text-right font-medium">{textoConteo(resultado.conteo)}</span>
                </div>
              )}
              {resultado.almacenDestinoNombre && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("mov.almacenDestino")}</span>
                  <span className="text-right font-medium">{resultado.almacenDestinoNombre}</span>
                </div>
              )}
              {resultado.almacenOrigenNombre && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("mov.almacenOrigen")}</span>
                  <span className="text-right font-medium">{resultado.almacenOrigenNombre}</span>
                </div>
              )}
              {resultado.cantidadDespues != null && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{t("mov.stockResultante")}</span>
                  <span className="font-semibold tabular-nums">
                    {f.numero(resultado.cantidadDespues, 2)} {resultado.productoUnidad}
                  </span>
                </div>
              )}
            </div>
            <Button onClick={() => { setResultado(null); limpiar(); }} className="min-h-10">
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("operacion.nuevoMovimiento")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== Formulario =====
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <InsigniaTipoMovimiento tipo={config.tipo} />
                {t("operacion.registrar")}
              </CardTitle>
            </div>
            <CardDescription>
              {t("operacion.formaParte1")} {t(`mov.tipos.${config.tipo}`).toLowerCase()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Producto */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("operacion.productoDestino")} *</Label>
                {config.categoriasSugeridas.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMostrarTodos((v) => !v)}
                    className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {mostrarTodos
                      ? t("qr.deseleccionar")
                      : `${t("comun.verMas")} (${t("comun.productos")})`}
                  </button>
                )}
              </div>
              <SelectorProducto
                productos={productosFiltrados}
                valor={productoId || null}
                onChange={setProductoId}
                stockPorAlmacen={
                  config.requiereOrigen && almacenOrigenId && stockOrigen
                    ? new Map(stockOrigen.map((s) => [s.productoId, s.cantidad]))
                    : undefined
                }
              />
              {productoSel && !config.requiereOrigen && (
                <p className="text-xs text-muted-foreground">
                  {t("producto.stockTotal")}:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {f.numero(productoSel.stockTotal, 1)} {productoSel.unidad}
                  </span>
                </p>
              )}
              {config.requiereOrigen && productoId && almacenOrigenId && (
                <p
                  className={cn(
                    "text-xs",
                    (stockDisponible ?? 0) <= 0 ? "font-semibold text-orange-600 dark:text-orange-400" : "text-muted-foreground",
                  )}
                >
                  {t("operacion.stockOrigen")}:{" "}
                  <span className="font-semibold tabular-nums text-foreground">
                    {f.numero(stockDisponible ?? 0, 1)} {productoSel?.unidad ?? "PZA"}
                  </span>
                </p>
              )}
            </div>

            {/* Almacenes */}
            <div className="grid gap-4 sm:grid-cols-2">
              {config.requiereOrigen && (
                <div className="space-y-2">
                  <Label>{t("operacion.almacenOrigen")} *</Label>
                  <SelectorAlmacen
                    almacenes={almacenes ?? []}
                    valor={almacenOrigenId || null}
                    onChange={setAlmacenOrigenId}
                  />
                </div>
              )}
              {config.requiereDestino && (
                <div className="space-y-2">
                  <Label>{t("operacion.almacenDestino")} *</Label>
                  <SelectorAlmacen
                    almacenes={
                      config.tipo === "TRASLADO"
                        ? (almacenes ?? []).filter((a) => a.id !== almacenOrigenId)
                        : (almacenes ?? [])
                    }
                    valor={almacenDestinoId || null}
                    onChange={setAlmacenDestinoId}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>
                  {config.tipo === "SALIDA"
                    ? t("operacion.cantidadRetirar")
                    : config.tipo === "TRASLADO"
                      ? t("operacion.cantidadTrasladar")
                      : t("operacion.cantidadIngresar")}{" "}
                  *
                </Label>
                {/* Captura en unidad base o en paquetes + sueltas (según
                    el empaque configurado del producto) */}
                <CapturaConteo
                  producto={productoSel}
                  valor={conteo}
                  onChange={setConteo}
                  etiquetaCantidad={t("comun.cantidad")}
                />
              </div>
            </div>

            {/* Campos específicos por tipo */}
            {config.tipo === "ENTRADA" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("operacion.ordenProduccion")}</Label>
                  <Input
                    value={ordenProduccion}
                    onChange={(e) => setOrdenProduccion(e.target.value.toUpperCase())}
                    placeholder="OP-1042"
                    maxLength={40}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("operacion.lote")}</Label>
                  <Input
                    value={lote}
                    onChange={(e) => setLote(e.target.value.toUpperCase())}
                    placeholder="L-1042-A"
                    maxLength={40}
                  />
                </div>
              </div>
            )}

            {config.tipo === "RECEPCION" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("operacion.proveedor")}</Label>
                  <Input
                    value={proveedor}
                    onChange={(e) => setProveedor(e.target.value)}
                    placeholder="Aceros de México S.A."
                    maxLength={80}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("operacion.numeroFactura")}</Label>
                  <Input
                    value={factura}
                    onChange={(e) => setFactura(e.target.value.toUpperCase())}
                    placeholder="FACT-A-8421"
                    maxLength={40}
                  />
                </div>
              </div>
            )}

            {config.tipo === "SALIDA" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("operacion.tipoSalida")}</Label>
                  <select
                    value={tipoSalida}
                    onChange={(e) => setTipoSalida(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="areaConsumo">{t("operacion.areaConsumo")}</option>
                    <option value="lineaProduccion">{t("operacion.lineaProduccion")}</option>
                    <option value="embarque">{t("operacion.embarque")}</option>
                    <option value="otro">{t("operacion.otro")}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>{t("operacion.destino")}</Label>
                  <Input
                    value={destinoSalida}
                    onChange={(e) => setDestinoSalida(e.target.value)}
                    placeholder={t("operacion.pedido")}
                    maxLength={80}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("operacion.pedido")}</Label>
                  <Input
                    value={pedido}
                    onChange={(e) => setPedido(e.target.value.toUpperCase())}
                    placeholder="PED-7781"
                    maxLength={40}
                  />
                </div>
              </div>
            )}

            {config.tipo === "TRASLADO" && (
              <div className="space-y-2">
                <Label>{t("comun.motivo")}</Label>
                <Input
                  value={motivoTraslado}
                  onChange={(e) => setMotivoTraslado(e.target.value)}
                  placeholder="Orden de producción OP-1042"
                  maxLength={120}
                />
              </div>
            )}

            {/* Responsable */}
            <div className="space-y-2">
              <Label>{t(config.claveResponsable)}</Label>
              <Input
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                maxLength={80}
              />
            </div>

            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={limpiar}
                className="min-h-10 sm:min-h-9"
              >
                {t("operacion.limpiarFormulario")}
              </Button>
              <Button
                onClick={registrarMovimiento}
                disabled={registrar.isPending}
                className="min-h-10 sm:min-h-9"
              >
                {registrar.isPending ? t("comun.cargando") : t("operacion.registrar")}
              </Button>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}

// ============================================================
// EXPORTS — UNA OPERACIÓN POR SECCIÓN
// ============================================================
export function EntradaProductos() {
  return <SeccionOperacion config={CONFIGS.ENTRADA} />;
}
export function RecepcionMateriaPrima() {
  return <SeccionOperacion config={CONFIGS.RECEPCION} />;
}
export function SalidaMateriales() {
  return <SeccionOperacion config={CONFIGS.SALIDA} />;
}
export function Traslados() {
  return <SeccionOperacion config={CONFIGS.TRASLADO} />;
}
