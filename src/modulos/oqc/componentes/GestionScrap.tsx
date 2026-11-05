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
 * SCRAP (OQC) — Registro de material desechado en la inspección.
 * Registrar descuenta stock del almacén (movimiento SCRAP con el mismo
 * folio); corregir recalcula el stock con bitácora; eliminar devuelve
 * el material con bitácora.
 */
import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  EncabezadoSeccion,
  EstadoVacio,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import { useAlmacenes, useInventario, useProductos } from "@/modulos/almacen/servicios/consultas";
import { SelectorAlmacen, SelectorProducto } from "@/modulos/almacen/componentes/compartidos";
import { useSesion } from "@/modulos/autenticacion/servicios/sesion";
import { tienePermiso } from "@/modulos/autenticacion/permisos";
import { useCorregirScrap, useEliminarScrap, useRegistrarScrap, useScrap } from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import { CapturaConteo } from "@/modulos/unidades/componentes/CapturaConteo";
import { calcularConteo } from "@/modulos/unidades/servicios/consultas";
import {
  compararDecimales,
  esDecimalPositivo,
  estadoConteoInicial,
  textoConteo,
  type EstadoConteo,
} from "@/modulos/unidades/tipos";
import type { RegistroScrap } from "../tipos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface FormularioScrap {
  productoId: string;
  almacenId: string;
  /** Edición: cantidad directa en unidad base */
  cantidad: string;
  /** Registro nuevo: captura directa o en paquetes + sueltas */
  conteo: EstadoConteo;
  motivo: string;
  notas: string;
  responsable: string;
}

function formularioVacio(): FormularioScrap {
  return {
    productoId: "",
    almacenId: "",
    cantidad: "",
    conteo: estadoConteoInicial(null),
    motivo: "",
    notas: "",
    responsable: "",
  };
}

export function GestionScrap() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const { usuario } = useSesion();
  const puedeGestionar = tienePermiso(
    usuario?.rol?.permisos as string[] | undefined,
    "oqc.gestionar",
  );

  const { data: registros, isLoading } = useScrap();
  const { data: productos } = useProductos();
  const { data: almacenes } = useAlmacenes();

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<RegistroScrap | null>(null);
  const [eliminando, setEliminando] = useState<RegistroScrap | null>(null);
  const [motivoEliminacion, setMotivoEliminacion] = useState("");
  const [formulario, setFormulario] = useState<FormularioScrap>(formularioVacio());
  const [error, setError] = useState<string | null>(null);

  const registrar = useRegistrarScrap();
  const corregir = useCorregirScrap();
  const eliminar = useEliminarScrap();

  const productosActivos = useMemo(() => (productos ?? []).filter((p) => p.activo), [productos]);

  // Stock en vivo del almacén elegido (solo para el formulario nuevo)
  const { data: stockAlmacen } = useInventario(
    formulario.almacenId ? { almacenId: formulario.almacenId } : {},
    { enabled: !!formulario.almacenId },
  );
  const stockPorProducto = useMemo(
    () => new Map((stockAlmacen ?? []).map((s) => [s.productoId, s.cantidad])),
    [stockAlmacen],
  );

  function abrirNuevo() {
    setEditando(null);
    setFormulario(formularioVacio());
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(r: RegistroScrap) {
    setEditando(r);
    setFormulario({
      productoId: r.productoId,
      almacenId: r.almacenId ?? "",
      cantidad: String(r.cantidad),
      conteo: estadoConteoInicial(productosActivos.find((p) => p.id === r.productoId) ?? null),
      motivo: r.motivo,
      notas: r.notas ?? "",
      responsable: r.responsable ?? "",
    });
    setError(null);
    setDialogoAbierto(true);
  }

  const productoSel = productosActivos.find((p) => p.id === formulario.productoId) ?? null;

  // Total del scrap según el modo de captura (directo o paquetes del
  // EMPAQUE CONFIGURADO DEL PRODUCTO) — texto decimal exacto
  const resultadoConteo = calcularConteo(formulario.conteo, productoSel);
  const cantidadNueva = editando ? formulario.cantidad : resultadoConteo.total;

  const disponible = formulario.almacenId
    ? stockPorProducto.get(formulario.productoId) ?? "0"
    : null;
  // Comparación EXACTA de textos decimales (guarda de UX; el servidor revalida)
  const excede = disponible !== null && compararDecimales(cantidadNueva, disponible) > 0 && !editando;

  async function guardar() {
    if (
      !formulario.productoId ||
      !formulario.almacenId ||
      !esDecimalPositivo(cantidadNueva)
    ) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    if (!formulario.motivo.trim()) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    try {
      if (editando) {
        await corregir.mutateAsync({
          id: editando.id,
          cuerpo: {
            productoId: formulario.productoId,
            almacenId: formulario.almacenId,
            cantidad: cantidadNueva,
            motivo: formulario.motivo.trim(),
            notas: formulario.notas.trim() || undefined,
            responsable: formulario.responsable.trim() || undefined,
            motivoCorreccion: t("oqc.editarScrap"),
          },
        });
        toast({ description: t("oqc.scrapCorregidoOk") });
      } else {
        const res = await registrar.mutateAsync({
          productoId: formulario.productoId,
          almacenId: formulario.almacenId,
          cantidad: cantidadNueva,
          motivo: formulario.motivo.trim(),
          notas: formulario.notas.trim() || undefined,
          responsable: formulario.responsable.trim() || undefined,
          // Conteo en paquetes (si se capturó así): el servidor calcula el total
          ...(resultadoConteo.enPaquetes &&
            resultadoConteo.partes && {
              conteo: {
                unidad: formulario.conteo.unidad,
                paquetes: formulario.conteo.paquetes || 0,
                sueltas: formulario.conteo.sueltas || 0,
              },
            }),
        });
        toast({ description: t("oqc.scrapOk", { folio: res.folio }) });
      }
      setDialogoAbierto(false);
    } catch (e) {
      const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
      setError(t(claveErrorApi(codigo)));
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("oqc.scrapTitulo")}
        descripcion={t("nav.descripcionOqcScrap")}
        icono={<TriangleAlert className="h-5 w-5" />}
        acciones={
          puedeGestionar ? (
            <Button onClick={abrirNuevo} className="min-h-9">
              <Plus className="mr-2 h-4 w-4" />
              {t("oqc.nuevoScrap")}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <CargandoFilas />
      ) : (registros ?? []).length === 0 ? (
        <EstadoVacio
          titulo={t("comun.sinResultados")}
          descripcion={t("oqc.scrapVacio")}
          icono={<TriangleAlert className="h-8 w-8 text-muted-foreground" aria-hidden />}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("oqc.folio")}</th>
                  <th className="px-3 py-2.5">{t("comun.producto")}</th>
                  <th className="px-3 py-2.5">{t("oqc.cantidad")}</th>
                  <th className="px-3 py-2.5">{t("oqc.motivoScrap")}</th>
                  <th className="px-3 py-2.5">{t("oqc.responsable")}</th>
                  <th className="px-3 py-2.5">{t("comun.fecha")}</th>
                  {puedeGestionar && <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(registros ?? []).map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold">
                      {r.folio}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{r.productoNombre}</p>
                      <p className="font-mono text-xs text-muted-foreground">{r.productoSku}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums">
                      {f.numero(r.cantidad, 2)} {r.productoUnidad}
                      {r.conteo && (
                        <p className="text-[11px] font-normal text-muted-foreground">
                          {textoConteo(r.conteo)}
                        </p>
                      )}
                    </td>
                    <td className="max-w-[16rem] px-3 py-2.5">
                      <p className="truncate" title={r.motivo}>{r.motivo}</p>
                      {r.notas && (
                        <p className="truncate text-xs text-muted-foreground" title={r.notas}>
                          {r.notas}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm">{r.responsable ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {f.fechaCorta(r.createdAt)}
                    </td>
                    {puedeGestionar && (
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => abrirEdicion(r)}
                            aria-label={t("oqc.editarScrap")}
                            title={t("oqc.editarScrap")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setEliminando(r)}
                            aria-label={t("oqc.eliminarScrap")}
                            title={t("oqc.eliminarScrap")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TablaResponsiva>
          </div>

          {/* Tarjetas móvil */}
          <div className="space-y-3 md:hidden">
            {(registros ?? []).map((r) => (
              <div key={r.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-primary">{r.folio}</p>
                    <p className="truncate font-semibold">{r.productoNombre}</p>
                    <p className="font-mono text-xs text-muted-foreground">{r.productoSku}</p>
                  </div>
                  <Badge variant="destructive">{t("oqc.scrapTitulo")}</Badge>
                </div>
                <p className="mt-2 text-sm font-semibold tabular-nums">
                  {f.numero(r.cantidad, 2)} {r.productoUnidad}
                </p>
                {r.conteo && (
                  <p className="text-xs text-muted-foreground">{textoConteo(r.conteo)}</p>
                )}
                <p className="text-sm">{r.motivo}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.responsable ?? "—"} · {f.fechaCorta(r.createdAt)}
                </p>
                {puedeGestionar && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(r)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("comun.editar")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-destructive hover:text-destructive"
                      onClick={() => setEliminando(r)}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("comun.eliminar")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== Diálogo registrar / corregir ===== */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? t("oqc.editarScrap") : t("oqc.nuevoScrap")}</DialogTitle>
            <DialogDescription>{t("oqc.scrapSub")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("comun.producto")} *</Label>
                <SelectorProducto
                  productos={productosActivos}
                  valor={formulario.productoId || null}
                  onChange={(v) =>
                    setFormulario((prev) => ({
                      ...prev,
                      productoId: v,
                      // La captura arranca en su forma natural: paquetes
                      // si el producto tiene empaque, unidad base si no
                      conteo: estadoConteoInicial(
                        productosActivos.find((p) => p.id === v) ?? null,
                      ),
                    }))
                  }
                  stockPorAlmacen={
                    formulario.almacenId && stockPorProducto.size > 0
                      ? stockPorProducto
                      : undefined
                  }
                />
                {productoSel && disponible !== null && !editando && (
                  <p className={`text-xs ${excede ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
                    {t("comun.disponible")}:{" "}
                    <span className="font-semibold tabular-nums text-foreground">
                      {f.numero(disponible, 1)}
                    </span>{" "}
                    {productoSel.unidad}
                    {excede && ` · ${t("comun.stockInsuficiente")}`}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("oqc.almacenOrigen")} *</Label>
                <SelectorAlmacen
                  almacenes={almacenes ?? []}
                  valor={formulario.almacenId || null}
                  onChange={(v) => setFormulario({ ...formulario, almacenId: v })}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {editando ? (
                <div className="space-y-2">
                  <Label htmlFor="scrap-cantidad">{t("oqc.cantidad")} *</Label>
                  <Input
                    id="scrap-cantidad"
                    type="number"
                    min={0}
                    step="any"
                    value={formulario.cantidad}
                    onChange={(e) => setFormulario({ ...formulario, cantidad: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">{t("registros.avisoStock")}</p>
                </div>
              ) : (
                <div className="space-y-2 sm:col-span-2">
                  <Label>{t("oqc.cantidad")} *</Label>
                  {/* Captura: unidad base o paquetes + sueltas (según el
                      empaque configurado del producto) */}
                  <CapturaConteo
                    producto={productoSel}
                    valor={formulario.conteo}
                    onChange={(nuevo) => setFormulario({ ...formulario, conteo: nuevo })}
                    etiquetaCantidad={t("oqc.cantidad")}
                    idPrefijo="scrap"
                  />
                </div>
              )}
              {!editando && (
                <div className="space-y-2">
                  <Label htmlFor="scrap-responsable">
                    {t("oqc.responsable")}{" "}
                    <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                  </Label>
                  <Input
                    id="scrap-responsable"
                    value={formulario.responsable}
                    onChange={(e) => setFormulario({ ...formulario, responsable: e.target.value })}
                    maxLength={80}
                  />
                </div>
              )}
              {editando && (
                <div className="space-y-2">
                  <Label htmlFor="scrap-responsable">
                    {t("oqc.responsable")}{" "}
                    <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                  </Label>
                  <Input
                    id="scrap-responsable"
                    value={formulario.responsable}
                    onChange={(e) => setFormulario({ ...formulario, responsable: e.target.value })}
                    maxLength={80}
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="scrap-motivo">{t("oqc.motivoScrap")} *</Label>
              <Input
                id="scrap-motivo"
                value={formulario.motivo}
                onChange={(e) => setFormulario({ ...formulario, motivo: e.target.value })}
                placeholder={t("oqc.motivoScrapPh")}
                maxLength={150}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="scrap-notas">
                {t("oqc.notas")} <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="scrap-notas"
                value={formulario.notas}
                onChange={(e) => setFormulario({ ...formulario, notas: e.target.value })}
                maxLength={200}
              />
            </div>
            {editando && (
              <>
                <Separator />
                <p className="text-xs text-muted-foreground">{t("registros.avisoStock")}</p>
              </>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogoAbierto(false)}>
              {t("comun.cancelar")}
            </Button>
            <Button
              onClick={guardar}
              disabled={registrar.isPending || corregir.isPending}
            >
              {registrar.isPending || corregir.isPending
                ? t("comun.cargando")
                : editando
                  ? t("comun.guardarCambios")
                  : t("comun.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmación de eliminación ===== */}
      {eliminando && (
        <Dialog open onOpenChange={(abierto) => !abierto && setEliminando(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                {t("oqc.eliminarScrap")}
              </DialogTitle>
              <DialogDescription>
                {t("oqc.eliminarScrapConfirmacion")} ({eliminando.folio} — {eliminando.productoSku})
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="scrap-motivo-eliminacion">
                {t("oqc.motivoCorreccion")} *{" "}
                <span className="text-xs text-muted-foreground">({t("oqc.motivoAviso")})</span>
              </Label>
              <Input
                id="scrap-motivo-eliminacion"
                value={motivoEliminacion}
                onChange={(e) => setMotivoEliminacion(e.target.value)}
                placeholder={t("registros.motivoCorreccionPh")}
                maxLength={200}
                autoFocus
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEliminando(null)} disabled={eliminar.isPending}>
                {t("comun.cancelar")}
              </Button>
              <Button
                variant="destructive"
                disabled={eliminar.isPending || !motivoEliminacion.trim()}
                onClick={async () => {
                  try {
                    await eliminar.mutateAsync({
                      id: eliminando.id,
                      cuerpo: { motivoCorreccion: motivoEliminacion.trim() },
                    });
                    toast({ description: t("oqc.scrapEliminadoOk") });
                    setEliminando(null);
                    setMotivoEliminacion("");
                  } catch (e) {
                    const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
                    toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
                  }
                }}
              >
                {eliminar.isPending ? t("comun.cargando") : t("comun.eliminar")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
