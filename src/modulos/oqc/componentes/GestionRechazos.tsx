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
 * RECHAZOS (OQC) — Registro de material no conforme detectado en la
 * inspección de salida. Documental: no altera el stock. Cada rechazo
 * puede vincularse al cliente previsto y a la salida donde se detectó,
 * y lleva una disposición (pendiente / retrabajo / scrap / liberado).
 */
import { useMemo, useState } from "react";
import { CircleX, Pencil, Plus, Trash2 } from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  EncabezadoSeccion,
  EstadoVacio,
  SelectorBuscador,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import { useProductos } from "@/modulos/almacen/servicios/consultas";
import { SelectorProducto } from "@/modulos/almacen/componentes/compartidos";
import { useClientes } from "@/modulos/clientes/servicios/consultas";
import { useSesion } from "@/modulos/autenticacion/servicios/sesion";
import { tienePermiso } from "@/modulos/autenticacion/permisos";
import {
  useEditarRechazo,
  useEliminarRechazo,
  useRegistrarRechazo,
  useRechazos,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import type { DisposicionRechazo, RegistroRechazo } from "../tipos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const DISPOSICIONES: DisposicionRechazo[] = ["PENDIENTE", "RETRABAJO", "SCRAP", "LIBERADO"];

interface FormularioRechazo {
  productoId: string;
  clienteId: string;
  cantidad: string;
  motivo: string;
  disposicion: DisposicionRechazo;
  notas: string;
  responsable: string;
}

const VACIO: FormularioRechazo = {
  productoId: "",
  clienteId: "",
  cantidad: "",
  motivo: "",
  disposicion: "PENDIENTE",
  notas: "",
  responsable: "",
};

function badgeDisposicion(d: DisposicionRechazo) {
  switch (d) {
    case "RETRABAJO":
      return "bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400";
    case "SCRAP":
      return "bg-red-500/15 text-red-700 hover:bg-red-500/15 dark:text-red-400";
    case "LIBERADO":
      return "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400";
    default:
      return "bg-slate-500/15 text-slate-700 hover:bg-slate-500/15 dark:text-slate-400";
  }
}

export function GestionRechazos() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const { usuario } = useSesion();
  const puedeGestionar = tienePermiso(
    usuario?.rol?.permisos as string[] | undefined,
    "oqc.gestionar",
  );

  const { data: registros, isLoading } = useRechazos();
  const { data: productos } = useProductos();
  const { data: clientes } = useClientes();

  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<RegistroRechazo | null>(null);
  const [porEliminar, setPorEliminar] = useState<RegistroRechazo | null>(null);
  const [formulario, setFormulario] = useState<FormularioRechazo>(VACIO);
  const [error, setError] = useState<string | null>(null);

  const registrar = useRegistrarRechazo();
  const editar = useEditarRechazo();
  const eliminar = useEliminarRechazo();

  const productosActivos = useMemo(() => (productos ?? []).filter((p) => p.activo), [productos]);
  const clientesActivos = useMemo(() => (clientes ?? []).filter((c) => c.activo), [clientes]);

  function abrirNuevo() {
    setEditando(null);
    setFormulario(VACIO);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(r: RegistroRechazo) {
    setEditando(r);
    setFormulario({
      productoId: r.productoId,
      clienteId: r.clienteId ?? "",
      cantidad: String(r.cantidad),
      motivo: r.motivo,
      disposicion: r.disposicion,
      notas: r.notas ?? "",
      responsable: r.responsable ?? "",
    });
    setError(null);
    setDialogoAbierto(true);
  }

  async function guardar() {
    const cantidad = Number(formulario.cantidad);
    if (!formulario.productoId || !Number.isFinite(cantidad) || cantidad <= 0 || !formulario.motivo.trim()) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    try {
      if (editando) {
        await editar.mutateAsync({
          id: editando.id,
          cuerpo: {
            clienteId: formulario.clienteId || null,
            cantidad,
            motivo: formulario.motivo.trim(),
            disposicion: formulario.disposicion,
            notas: formulario.notas.trim() || undefined,
            responsable: formulario.responsable.trim() || undefined,
          },
        });
        toast({ description: t("oqc.rechazoActualizadoOk") });
      } else {
        const res = await registrar.mutateAsync({
          productoId: formulario.productoId,
          clienteId: formulario.clienteId || undefined,
          cantidad,
          motivo: formulario.motivo.trim(),
          disposicion: formulario.disposicion,
          notas: formulario.notas.trim() || undefined,
          responsable: formulario.responsable.trim() || undefined,
        });
        toast({ description: t("oqc.rechazoOk", { folio: res.folio }) });
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
        titulo={t("oqc.rechazosTitulo")}
        descripcion={t("nav.descripcionOqcRechazos")}
        icono={<CircleX className="h-5 w-5" />}
        acciones={
          puedeGestionar ? (
            <Button onClick={abrirNuevo} className="min-h-9">
              <Plus className="mr-2 h-4 w-4" />
              {t("oqc.nuevoRechazo")}
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <CargandoFilas />
      ) : (registros ?? []).length === 0 ? (
        <EstadoVacio
          titulo={t("comun.sinResultados")}
          descripcion={t("oqc.rechazosVacio")}
          icono={<CircleX className="h-8 w-8 text-muted-foreground" aria-hidden />}
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
                  <th className="px-3 py-2.5">{t("oqc.motivoRechazo")}</th>
                  <th className="px-3 py-2.5">{t("oqc.disposicion")}</th>
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
                    </td>
                    <td className="max-w-[14rem] px-3 py-2.5">
                      <p className="truncate" title={r.motivo}>{r.motivo}</p>
                      {r.clienteNombre && (
                        <p className="truncate text-xs text-muted-foreground">
                          {t("oqc.clienteDestino")}: {r.clienteNombre}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={badgeDisposicion(r.disposicion)}>
                        {t(`oqc.disposiciones.${r.disposicion}`)}
                      </Badge>
                    </td>
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
                            aria-label={t("oqc.editarRechazo")}
                            title={t("oqc.editarRechazo")}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setPorEliminar(r)}
                            aria-label={t("oqc.eliminarRechazo")}
                            title={t("oqc.eliminarRechazo")}
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
                  <Badge className={`shrink-0 ${badgeDisposicion(r.disposicion)}`}>
                    {t(`oqc.disposiciones.${r.disposicion}`)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-semibold tabular-nums">
                  {f.numero(r.cantidad, 2)} {r.productoUnidad}
                </p>
                <p className="text-sm">{r.motivo}</p>
                {r.clienteNombre && (
                  <p className="text-xs text-muted-foreground">
                    {t("oqc.clienteDestino")}: {r.clienteNombre}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{f.fechaCorta(r.createdAt)}</p>
                {puedeGestionar && (
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(r)}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("comun.editar")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 text-destructive hover:text-destructive"
                      onClick={() => setPorEliminar(r)}
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

      {/* ===== Diálogo registrar / editar ===== */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? t("oqc.editarRechazo") : t("oqc.nuevoRechazo")}</DialogTitle>
            <DialogDescription>{t("oqc.rechazosSub")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("comun.producto")} *</Label>
                <SelectorProducto
                  productos={productosActivos}
                  valor={formulario.productoId || null}
                  onChange={(v) => setFormulario({ ...formulario, productoId: v })}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t("oqc.clienteDestino")}{" "}
                  <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                </Label>
                <SelectorBuscador
                  opciones={clientesActivos.map((c) => ({
                    valor: c.id,
                    etiqueta: c.nombre,
                    subetiqueta: c.codigo,
                  }))}
                  valor={formulario.clienteId || null}
                  onChange={(v) => setFormulario({ ...formulario, clienteId: v ?? "" })}
                  placeholder={t("oqc.seleccionarCliente")}
                  placeholderBusqueda={t("comun.buscar")}
                  sinResultados={t("comun.sinResultados")}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rechazo-cantidad">{t("oqc.cantidad")} *</Label>
                <Input
                  id="rechazo-cantidad"
                  type="number"
                  min={0}
                  step="any"
                  value={formulario.cantidad}
                  onChange={(e) => setFormulario({ ...formulario, cantidad: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("oqc.disposicion")}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DISPOSICIONES.map((d) => (
                    <Button
                      key={d}
                      type="button"
                      variant={formulario.disposicion === d ? "default" : "outline"}
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setFormulario({ ...formulario, disposicion: d })}
                    >
                      {t(`oqc.disposiciones.${d}`)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rechazo-motivo">{t("oqc.motivoRechazo")} *</Label>
              <Input
                id="rechazo-motivo"
                value={formulario.motivo}
                onChange={(e) => setFormulario({ ...formulario, motivo: e.target.value })}
                placeholder={t("oqc.motivoRechazoPh")}
                maxLength={150}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rechazo-responsable">
                  {t("oqc.responsable")}{" "}
                  <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                </Label>
                <Input
                  id="rechazo-responsable"
                  value={formulario.responsable}
                  onChange={(e) => setFormulario({ ...formulario, responsable: e.target.value })}
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rechazo-notas">
                  {t("oqc.notas")}{" "}
                  <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
                </Label>
                <Input
                  id="rechazo-notas"
                  value={formulario.notas}
                  onChange={(e) => setFormulario({ ...formulario, notas: e.target.value })}
                  maxLength={200}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogoAbierto(false)}>
              {t("comun.cancelar")}
            </Button>
            <Button onClick={guardar} disabled={registrar.isPending || editar.isPending}>
              {registrar.isPending || editar.isPending
                ? t("comun.cargando")
                : editando
                  ? t("comun.guardarCambios")
                  : t("comun.guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Confirmación de eliminación ===== */}
      {porEliminar && (
        <Dialog open onOpenChange={(abierto) => !abierto && setPorEliminar(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="h-4 w-4" />
                {t("oqc.eliminarRechazo")}
              </DialogTitle>
              <DialogDescription>
                {t("oqc.eliminarRechazoConfirmacion")} ({porEliminar.folio} — {porEliminar.productoSku})
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPorEliminar(null)} disabled={eliminar.isPending}>
                {t("comun.cancelar")}
              </Button>
              <Button
                variant="destructive"
                disabled={eliminar.isPending}
                onClick={async () => {
                  try {
                    await eliminar.mutateAsync(porEliminar.id);
                    toast({ description: t("oqc.rechazoEliminadoOk") });
                    setPorEliminar(null);
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
