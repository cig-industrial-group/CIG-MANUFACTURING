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
 * GENERACIÓN DE QR — Etiquetas imprimibles para productos y almacenes
 * Selección múltiple → vista previa en vivo → impresión por lote.
 */
import { useMemo, useState } from "react";
import { QrCode, Search, Printer, CheckSquare, Square } from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import { CargandoFilas, EncabezadoSeccion, EstadoVacio } from "@/modulos/compartidos/ui";
import { useAlmacenes, useProductos } from "../servicios/consultas";
import { InsigniaCategoria } from "./compartidos";
import {
  EtiquetaQrAlmacen,
  EtiquetaQrProducto,
  payloadAlmacen,
  payloadProducto,
  type TamanoEtiqueta,
} from "./qr-etiqueta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function GeneracionQr() {
  const { t } = useIdioma();
  const { data: productos, isLoading: cargandoProductos } = useProductos();
  const { data: almacenes } = useAlmacenes();

  const [tipoEtiqueta, setTipoEtiqueta] = useState<"producto" | "almacen">("producto");
  const [busqueda, setBusqueda] = useState("");
  const [idsSeleccionados, setIdsSeleccionados] = useState<Set<string>>(new Set());
  const [tamano, setTamano] = useState<TamanoEtiqueta>("M");
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [incluirSku, setIncluirSku] = useState(true);
  const [incluirNombre, setIncluirNombre] = useState(true);
  const [incluirUnidad, setIncluirUnidad] = useState(true);

  const listaProductos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (productos ?? [])
      .filter((p) => p.activo)
      .filter(
        (p) => !q || p.sku.toLowerCase().includes(q) || p.nombre.toLowerCase().includes(q),
      )
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [productos, busqueda]);

  const listaAlmacenes = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (almacenes ?? [])
      .filter((a) => a.activo)
      .filter(
        (a) =>
          !q ||
          a.codigo.toLowerCase().includes(q) ||
          a.nombre.toLowerCase().includes(q),
      );
  }, [almacenes, busqueda]);

  const elementosActuales = tipoEtiqueta === "producto" ? listaProductos : listaAlmacenes;
  const todosSeleccionados =
    elementosActuales.length > 0 &&
    elementosActuales.every((e) => idsSeleccionados.has(e.id));

  function alternar(id: string) {
    setIdsSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodos() {
    setIdsSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (todosSeleccionados) {
        for (const e of elementosActuales) nuevo.delete(e.id);
      } else {
        for (const e of elementosActuales) nuevo.add(e.id);
      }
      return nuevo;
    });
  }

  const productosSeleccionados = (productos ?? []).filter((p) => idsSeleccionados.has(p.id));
  const almacenesSeleccionados = (almacenes ?? []).filter((a) => idsSeleccionados.has(a.id));
  const numEtiquetas =
    tipoEtiqueta === "producto" ? productosSeleccionados.length : almacenesSeleccionados.length;

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("qr.titulo")}
        descripcion={t("nav.descripcionQr")}
        icono={<QrCode className="h-5 w-5" />}
      />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ===== Panel de configuración ===== */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("qr.subtitulo")}</CardTitle>
            <CardDescription>{t("qr.escaneaInfo")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tipo de etiqueta */}
            <div className="space-y-2">
              <Label>{t("qr.tipoEtiqueta")}</Label>
              <Tabs
                value={tipoEtiqueta}
                onValueChange={(v) => {
                  setTipoEtiqueta(v as "producto" | "almacen");
                  setIdsSeleccionados(new Set());
                  setBusqueda("");
                  setMostrarPreview(false);
                }}
              >
                <TabsList className="grid h-10 w-full grid-cols-2">
                  <TabsTrigger value="producto" className="text-xs sm:text-sm">
                    {t("qr.etiquetaProducto")}
                  </TabsTrigger>
                  <TabsTrigger value="almacen" className="text-xs sm:text-sm">
                    {t("qr.etiquetaAlmacen")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t("comun.buscar")}
                className="pl-9"
                aria-label={t("comun.buscar")}
              />
            </div>

            {/* Opciones (solo productos) */}
            {tipoEtiqueta === "producto" && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label className="text-xs text-muted-foreground">
                  {t("qr.vistaPrevia")}
                </Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={incluirSku} onCheckedChange={(v) => setIncluirSku(!!v)} />
                    {t("qr.incluirSku")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={incluirNombre} onCheckedChange={(v) => setIncluirNombre(!!v)} />
                    {t("qr.incluirNombre")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={incluirUnidad} onCheckedChange={(v) => setIncluirUnidad(!!v)} />
                    {t("qr.incluirUnidad")}
                  </label>
                </div>
              </div>
            )}

            {/* Tamaño */}
            <div className="space-y-2">
              <Label>{t("qr.tamano")}</Label>
              <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
                {(["S", "M", "L"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTamano(s)}
                    className={cn(
                      "h-9 rounded-md text-sm font-medium transition-colors",
                      tamano === s
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`qr.${s === "S" ? "pequena" : s === "M" ? "mediana" : "grande"}`)}
                  </button>
                ))}
              </div>
            </div>

            {/* Lista de selección */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {tipoEtiqueta === "producto"
                    ? t("qr.seleccionarProductos")
                    : t("qr.seleccionarAlmacenes")}
                </Label>
                <button
                  type="button"
                  onClick={alternarTodos}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <CheckSquare className="h-3.5 w-3.5" />
                  {todosSeleccionados ? t("qr.deseleccionar") : t("qr.seleccionarTodos")}
                </button>
              </div>
              {cargandoProductos ? (
                <CargandoFilas filas={5} />
              ) : elementosActuales.length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  {t("comun.sinResultados")}
                </p>
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {tipoEtiqueta === "producto"
                    ? listaProductos.map((p) => (
                        <label
                          key={p.id}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60",
                            idsSeleccionados.has(p.id) && "bg-primary/5",
                          )}
                        >
                          <Checkbox
                            checked={idsSeleccionados.has(p.id)}
                            onCheckedChange={() => alternar(p.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              <span className="font-mono text-xs font-bold text-primary">{p.sku}</span>{" "}
                              — {p.nombre}
                            </p>
                          </div>
                          <InsigniaCategoria categoria={p.categoria} />
                        </label>
                      ))
                    : listaAlmacenes.map((a) => (
                        <label
                          key={a.id}
                          className={cn(
                            "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60",
                            idsSeleccionados.has(a.id) && "bg-primary/5",
                          )}
                        >
                          <Checkbox
                            checked={idsSeleccionados.has(a.id)}
                            onCheckedChange={() => alternar(a.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              <span className="font-mono text-xs font-bold text-primary">{a.codigo}</span>{" "}
                              — {a.nombre}
                            </p>
                            {a.ubicacion && (
                              <p className="truncate text-xs text-muted-foreground">{a.ubicacion}</p>
                            )}
                          </div>
                        </label>
                      ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {idsSeleccionados.size} {t("qr.seleccionados")}
              </p>
            </div>

            {/* Acciones */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => setMostrarPreview(true)}
                disabled={numEtiquetas === 0}
                className="min-h-10"
              >
                <QrCode className="mr-2 h-4 w-4" />
                {t("qr.generar")}
              </Button>
              {numEtiquetas > 0 && (
                <Button
                  variant="outline"
                  onClick={() => window.print()}
                  className="min-h-10"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {t("qr.imprimir")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ===== Vista previa ===== */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {t("qr.vistaPrevia")}
              {numEtiquetas > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {numEtiquetas} {t("qr.etiquetasGeneradas")}
                </span>
              )}
            </CardTitle>
            {numEtiquetas > 0 && (
              <CardDescription className="font-mono text-[11px] break-all">
                {t("qr.contenidoQr")}:{" "}
                {tipoEtiqueta === "producto"
                  ? payloadProducto(productosSeleccionados[0])
                  : payloadAlmacen(almacenesSeleccionados[0])}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!mostrarPreview || numEtiquetas === 0 ? (
              <EstadoVacio
                titulo={t("qr.sinSeleccion")}
                icono={<Square className="h-6 w-6" />}
              />
            ) : (
              <div className="area-impresion max-h-[560px] flex-wrap gap-3 overflow-y-auto rounded-lg border-2 border-dashed bg-muted/20 p-4">
                {tipoEtiqueta === "producto"
                  ? productosSeleccionados.map((p) => (
                      <EtiquetaQrProducto
                        key={p.id}
                        producto={p}
                        tamano={tamano}
                        conSku={incluirSku}
                        conNombre={incluirNombre}
                        conUnidad={incluirUnidad}
                      />
                    ))
                  : almacenesSeleccionados.map((a) => (
                      <EtiquetaQrAlmacen key={a.id} almacen={a} tamano={tamano} />
                    ))}
              </div>
            )}
            {mostrarPreview && numEtiquetas > 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {t("qr.impresion")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
