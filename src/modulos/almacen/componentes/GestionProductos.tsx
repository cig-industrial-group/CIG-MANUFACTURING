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
 * GESTIÓN DE PRODUCTOS — CRUD del catálogo de productos
 */
import { useMemo, useState } from "react";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Search,
  Power,
  QrCode,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  DialogoDesactivarRegistro,
  DialogoEliminarRegistro,
  EncabezadoSeccion,
  EstadoVacio,
  InterruptorInactivos,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import {
  useActualizarProducto,
  useCrearProducto,
  useEliminarProducto,
  useProductos,
} from "../servicios/consultas";
import { useUnidades } from "@/modulos/unidades/servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import { InsigniaCategoria, IndicadorStock } from "./compartidos";
import { DialogoEtiquetaQr, EtiquetaQrProducto } from "./qr-etiqueta";
import type { CuerpoProducto, Producto } from "../tipos";
import { esDecimalPositivo, formatearNumeroConteo } from "@/modulos/unidades/tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const VACIO: CuerpoProducto = {
  sku: "",
  nombre: "",
  descripcion: "",
  categoria: "MATERIA_PRIMA",
  unidad: "PZA",
  unidadPaquete: null,
  contenidoPaquete: null,
  stockMinimo: "0",
  costoUnitario: null,
};

export function GestionProductos() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { data: productos, isLoading } = useProductos(mostrarInactivos);
  const { data: unidades } = useUnidades(true);
  const crear = useCrearProducto();
  const actualizar = useActualizarProducto();
  const eliminar = useEliminarProducto();

  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("TODAS");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [porEliminar, setPorEliminar] = useState<Producto | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Producto | null>(null);
  const [qrProducto, setQrProducto] = useState<Producto | null>(null);
  const [formulario, setFormulario] = useState<CuerpoProducto>(VACIO);
  const [error, setError] = useState<string | null>(null);

  /** Unidades base del catálogo (el stock vive en ellas; los paquetes
   *  son solo una forma de contar). Se conserva la unidad vigente del
   *  producto editado aunque ya no esté en la lista. */
  const unidadesDisponibles = useMemo(() => {
    if (!unidades) return [];
    const base = unidades.filter((u) => u.activo && u.tipo !== "PAQUETE");
    if (editando?.unidad && !base.some((u) => u.codigo === editando.unidad)) {
      const actual = unidades.find((u) => u.codigo === editando.unidad);
      return [...base, actual ?? {
        id: `actual-${editando.unidad}`,
        codigo: editando.unidad,
        nombre: editando.unidad,
        nombreEn: editando.unidad,
        tipo: "OTRO" as const,
        unidadBase: null,
        notas: null,
        activo: false,
        esSistema: false,
        createdAt: "",
        usadaComoBase: 0,
        productosAsociados: 0,
      }];
    }
    return base;
  }, [unidades, editando]);

  /** Unidades de PAQUETE activas compatibles con la unidad base elegida:
   *  el empaque con el que se cuenta este producto. */
  const paquetesDisponibles = useMemo(
    () =>
      (unidades ?? []).filter(
        (u) => u.activo && u.tipo === "PAQUETE" && u.unidadBase === formulario.unidad,
      ),
    [unidades, formulario.unidad],
  );

  /** ¿El empaque vigente del formulario sigue disponible para la unidad elegida? */
  const empaqueVigenteValido = Boolean(
    formulario.unidadPaquete &&
      paquetesDisponibles.some((p) => p.codigo === formulario.unidadPaquete),
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (productos ?? []).filter((p) => {
      const coincideBusqueda =
        !q ||
        p.sku.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q) ||
        (p.descripcion ?? "").toLowerCase().includes(q);
      const coincideCategoria = categoriaFiltro === "TODAS" || p.categoria === categoriaFiltro;
      return coincideBusqueda && coincideCategoria;
    });
  }, [productos, busqueda, categoriaFiltro]);

  function abrirNuevo() {
    setEditando(null);
    setFormulario(VACIO);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(p: Producto) {
    setEditando(p);
    setFormulario({
      sku: p.sku,
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      categoria: p.categoria,
      unidad: p.unidad,
      unidadPaquete: p.unidadPaquete,
      contenidoPaquete: p.contenidoPaquete,
      stockMinimo: p.stockMinimo,
      costoUnitario: p.costoUnitario,
    });
    setError(null);
    setDialogoAbierto(true);
  }

  async function guardar() {
    if (!formulario.sku.trim() || !formulario.nombre.trim()) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    // El empaque solo se guarda si su unidad sigue disponible para la
    // unidad base elegida (si fue desactivada o quedó incompatible, se
    // guarda sin empaque: captura directa en unidad base).
    const empaqueValido =
      formulario.unidadPaquete && paquetesDisponibles.some((p) => p.codigo === formulario.unidadPaquete)
        ? formulario
        : { ...formulario, unidadPaquete: null, contenidoPaquete: null };
    if (empaqueValido.unidadPaquete && !(Number(empaqueValido.contenidoPaquete) > 0)) {
      setError(t("producto.contenidoInvalido"));
      return;
    }
    try {
      if (editando) {
        await actualizar.mutateAsync({ id: editando.id, cuerpo: empaqueValido });
        toast({ description: t("comun.registroActualizado") });
      } else {
        await crear.mutateAsync(empaqueValido);
        toast({ description: t("comun.registroGuardado") });
      }
      setDialogoAbierto(false);
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    try {
      await eliminar.mutateAsync(porEliminar.id);
      toast({ description: t("comun.registroEliminado") });
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
    } finally {
      setPorEliminar(null);
    }
  }

  async function confirmarDesactivar() {
    if (!porDesactivar) return;
    try {
      await actualizar.mutateAsync({ id: porDesactivar.id, cuerpo: { activo: false } });
      toast({ description: t("comun.registroDesactivado") });
    } catch {
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    } finally {
      setPorDesactivar(null);
    }
  }

  async function reactivar(p: Producto) {
    try {
      await actualizar.mutateAsync({ id: p.id, cuerpo: { activo: true } });
      toast({ description: t("comun.registroReactivado") });
    } catch {
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("producto.titulo")}
        descripcion={t("nav.descripcionProductos")}
        icono={<Package className="h-5 w-5" />}
        acciones={
          <Button onClick={abrirNuevo} className="min-h-9">
            <Plus className="mr-2 h-4 w-4" />
            {t("producto.nuevo")}
          </Button>
        }
      />

      {/* Filtros */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={t("comun.buscar")}
              className="pl-9"
              aria-label={t("comun.buscar")}
            />
          </div>
          <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">{t("comun.todos")}</SelectItem>
              {["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "MATERIAL", "INSUMO"].map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`categorias.${c}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <InterruptorInactivos marcado={mostrarInactivos} onCambiar={setMostrarInactivos} />
      </div>

      {isLoading ? (
        <CargandoFilas filas={6} />
      ) : filtrados.length === 0 ? (
        <EstadoVacio titulo={t("comun.sinResultados")} />
      ) : (
        <>
          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("producto.sku")}</th>
                  <th className="px-3 py-2.5">{t("producto.nombre")}</th>
                  <th className="px-3 py-2.5">{t("producto.categoria")}</th>
                  <th className="px-3 py-2.5 text-right">{t("producto.stockTotal")}</th>
                  <th className="px-3 py-2.5 text-right">{t("producto.costoUnitario")}</th>
                  <th className="px-3 py-2.5">{t("comun.total")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{p.sku}</td>
                    <td className="max-w-64 px-3 py-2.5">
                      <p className={cn("truncate font-medium", !p.activo && "line-through opacity-60")}>{p.nombre}</p>
                      {p.descripcion && (
                        <p className="truncate text-xs text-muted-foreground">{p.descripcion}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <InsigniaCategoria categoria={p.categoria} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <p className="font-semibold tabular-nums">
                        {f.numero(p.stockTotal, 1)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {p.unidad}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("producto.stockMinimo")}: {f.numero(p.stockMinimo, 1)}
                      </p>
                      {p.unidadPaquete && p.contenidoPaquete && (
                        <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                          1 {p.unidadPaquete} = {formatearNumeroConteo(p.contenidoPaquete)} {p.unidad}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {p.costoUnitario != null ? f.moneda(p.costoUnitario) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        {p.activo ? (
                          <IndicadorStock stock={p.stockTotal} minimo={p.stockMinimo} />
                        ) : (
                          <Badge variant="secondary">{t("comun.inactivo")}</Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQrProducto(p)} aria-label={t("producto.qrProducto")} title={t("producto.qrProducto")}>
                          <QrCode className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => abrirEdicion(p)} aria-label={t("comun.editar")} title={t("comun.editar")}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => (p.activo ? setPorDesactivar(p) : reactivar(p))}
                          aria-label={p.activo ? t("comun.desactivar") : t("comun.reactivar")}
                          title={p.activo ? t("comun.desactivar") : t("comun.reactivar")}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setPorEliminar(p)} aria-label={t("comun.eliminar")} title={t("comun.eliminar")}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TablaResponsiva>
          </div>

          {/* Tarjetas móvil */}
          <div className="space-y-3 md:hidden">
            {filtrados.map((p) => (
              <div key={p.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-primary">{p.sku}</p>
                    <p className={cn("font-semibold", !p.activo && "line-through opacity-60")}>{p.nombre}</p>
                    {p.descripcion && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.descripcion}</p>
                    )}
                  </div>
                  {p.activo ? (
                    <IndicadorStock stock={p.stockTotal} minimo={p.stockMinimo} />
                  ) : (
                    <Badge variant="secondary" className="shrink-0">{t("comun.inactivo")}</Badge>
                  )}
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <InsigniaCategoria categoria={p.categoria} />
                  <Badge variant="outline">{p.unidad}</Badge>
                  {p.unidadPaquete && p.contenidoPaquete && (
                    <Badge variant="outline" className="tabular-nums">
                      1 {p.unidadPaquete} = {formatearNumeroConteo(p.contenidoPaquete)} {p.unidad}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">{t("producto.stockTotal")}</p>
                    <p className="font-bold tabular-nums">
                      {f.numero(p.stockTotal, 1)} {p.unidad}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("producto.costoUnitario")}</p>
                    <p className="font-bold tabular-nums">
                      {p.costoUnitario != null ? f.moneda(p.costoUnitario) : "—"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => setQrProducto(p)}>
                    <QrCode className="mr-1 h-3.5 w-3.5" /> QR
                  </Button>
                  <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(p)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> {t("comun.editar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => (p.activo ? setPorDesactivar(p) : reactivar(p))}
                  >
                    <Power className="mr-1 h-3.5 w-3.5" />
                    {p.activo ? t("comun.desactivar") : t("comun.reactivar")}
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 text-destructive hover:text-destructive" onClick={() => setPorEliminar(p)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> {t("comun.eliminar")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== Dialogo crear/editar ===== */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? t("producto.editar") : t("producto.nuevo")}</DialogTitle>
            <DialogDescription>{t("producto.subtitulo")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sku">{t("producto.sku")} *</Label>
                <Input
                  id="sku"
                  value={formulario.sku}
                  onChange={(e) => setFormulario({ ...formulario, sku: e.target.value.toUpperCase() })}
                  placeholder="MP-0001"
                  maxLength={24}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("producto.categoria")}</Label>
                <Select
                  value={formulario.categoria}
                  onValueChange={(v) => setFormulario({ ...formulario, categoria: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["MATERIA_PRIMA", "PRODUCTO_TERMINADO", "MATERIAL", "INSUMO"].map((c) => (
                      <SelectItem key={c} value={c}>
                        {t(`categorias.${c}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nombre">{t("producto.nombre")} *</Label>
              <Input
                id="nombre"
                value={formulario.nombre}
                onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descripcion">
                {t("producto.descripcion")} <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="descripcion"
                value={formulario.descripcion ?? ""}
                onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
                maxLength={200}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("producto.unidad")}</Label>
                <Select
                  value={formulario.unidad}
                  onValueChange={(v) =>
                    setFormulario((prev) => ({
                      ...prev,
                      unidad: v,
                      // Si el empaque elegido no es compatible con la nueva
                      // unidad base (p. ej. PAQ→PZA vs KG), se retira.
                      ...(!(prev.unidadPaquete &&
                        (unidades ?? []).some(
                          (u) =>
                            u.codigo === prev.unidadPaquete &&
                            u.activo &&
                            u.tipo === "PAQUETE" &&
                            u.unidadBase === v,
                        )) && { unidadPaquete: null, contenidoPaquete: null }),
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadesDisponibles.map((u) => (
                      <SelectItem key={u.id} value={u.codigo}>
                        {u.codigo} — {u.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stockMinimo">{t("producto.stockMinimo")}</Label>
                <Input
                  id="stockMinimo"
                  type="number"
                  min={0}
                  step="any"
                  value={formulario.stockMinimo}
                  onChange={(e) =>
                    setFormulario({ ...formulario, stockMinimo: e.target.value || "0" })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="costo">{t("producto.costoUnitario")}</Label>
                <Input
                  id="costo"
                  type="number"
                  min={0}
                  step="any"
                  value={formulario.costoUnitario ?? ""}
                  onChange={(e) =>
                    setFormulario({
                      ...formulario,
                      costoUnitario: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* ===== Empaque para conteo: cuántas unidades base lleva cada
                paquete. VARÍA POR PRODUCTO: se configura aquí, al registrar
                el producto, y no en el catálogo de unidades. ===== */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <Label className="text-sm">{t("producto.empaque")}</Label>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {t("producto.empaqueAyuda")}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("producto.unidadPaquete")}</Label>
                  <Select
                    value={
                      empaqueVigenteValido && formulario.unidadPaquete
                        ? formulario.unidadPaquete
                        : "NINGUNA"
                    }
                    onValueChange={(v) =>
                      setFormulario((prev) => ({
                        ...prev,
                        unidadPaquete: v === "NINGUNA" ? null : v,
                        contenidoPaquete:
                          v === "NINGUNA"
                            ? null
                            : prev.contenidoPaquete && esDecimalPositivo(prev.contenidoPaquete)
                              ? prev.contenidoPaquete
                              : "10",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NINGUNA">{t("producto.sinPaquete")}</SelectItem>
                      {paquetesDisponibles.map((p) => (
                        <SelectItem key={p.id} value={p.codigo}>
                          {p.codigo} — {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {paquetesDisponibles.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("producto.sinPaquetesCompatibles")}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contenido-paquete">{t("producto.contenidoPaquete")}</Label>
                  <Input
                    id="contenido-paquete"
                    type="number"
                    min={0}
                    step="any"
                    disabled={!empaqueVigenteValido || !formulario.unidadPaquete}
                    value={formulario.contenidoPaquete ?? ""}
                    onChange={(e) =>
                      setFormulario({
                        ...formulario,
                        contenidoPaquete: e.target.value === "" ? null : e.target.value,
                      })
                    }
                    placeholder="10"
                  />
                  <p className="text-[11px] text-muted-foreground">{t("producto.contenidoAyuda")}</p>
                </div>
              </div>
              {empaqueVigenteValido && formulario.unidadPaquete && esDecimalPositivo(formulario.contenidoPaquete) && (
                <p className="rounded-md bg-muted/60 px-3 py-2 text-sm tabular-nums">
                  1 {formulario.unidadPaquete} = {formatearNumeroConteo(formulario.contenidoPaquete ?? "0")}{" "}
                  {formulario.unidad}
                </p>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogoAbierto(false)}>
              {t("comun.cancelar")}
            </Button>
            <Button onClick={guardar} disabled={crear.isPending || actualizar.isPending}>
              {editando ? t("comun.guardarCambios") : t("comun.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== QR individual ===== */}
      <DialogoEtiquetaQr
        abierto={!!qrProducto}
        onCerrar={() => setQrProducto(null)}
        titulo={t("producto.qrProducto")}
        descripcion={t("qr.escaneaInfo")}
      >
        {qrProducto && <EtiquetaQrProducto producto={qrProducto} tamano="L" />}
      </DialogoEtiquetaQr>

      {/* ===== Confirmación de eliminación (borrado real) ===== */}
      <DialogoEliminarRegistro
        abierto={!!porEliminar}
        titulo={t("producto.eliminar")}
        descripcion={`${t("producto.eliminarConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />

      {/* ===== Confirmación de desactivación (reversible) ===== */}
      <DialogoDesactivarRegistro
        abierto={!!porDesactivar}
        titulo={t("producto.desactivar")}
        descripcion={t("producto.desactivarConfirmacion")}
        cargando={actualizar.isPending}
        onConfirmar={confirmarDesactivar}
        onCerrar={() => setPorDesactivar(null)}
      />
    </div>
  );
}
