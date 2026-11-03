"use client";

/**
 * GESTIÓN DE NÚMEROS DE PARTE — CRUD de refacciones y componentes
 * Cada número de parte puede asociarse a uno o más modelos (N:M).
 */
import { useMemo, useState } from "react";
import { Hash, Link2, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
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
  useActualizarParte,
  useCrearParte,
  useEliminarParte,
  useModelos,
  usePartes,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import type { CuerpoParte, NumeroParte } from "../tipos";
import { SelectorMultiple } from "./SelectorMultiple";
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
import { useToast } from "@/hooks/use-toast";

const VACIO: CuerpoParte = { numero: "", nombre: "", descripcion: "", modelosIds: [] };

export function GestionPartes() {
  const { t } = useIdioma();
  const { toast } = useToast();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { data: partes, isLoading } = usePartes(mostrarInactivos);
  const { data: modelos } = useModelos(); // solo activos para nuevas asociaciones
  const crear = useCrearParte();
  const actualizar = useActualizarParte();
  const eliminar = useEliminarParte();

  const [busqueda, setBusqueda] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<NumeroParte | null>(null);
  const [porEliminar, setPorEliminar] = useState<NumeroParte | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<NumeroParte | null>(null);
  const [formulario, setFormulario] = useState<CuerpoParte>(VACIO);
  const [error, setError] = useState<string | null>(null);

  const opcionesModelos = useMemo(
    () => (modelos ?? []).map((m) => ({ id: m.id, etiqueta: m.codigo, subetiqueta: m.nombre })),
    [modelos],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return partes ?? [];
    return (partes ?? []).filter(
      (p) =>
        p.numero.toLowerCase().includes(q) ||
        p.nombre.toLowerCase().includes(q) ||
        (p.descripcion ?? "").toLowerCase().includes(q) ||
        p.modelos.some((m) => m.codigo.toLowerCase().includes(q)),
    );
  }, [partes, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setFormulario(VACIO);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(p: NumeroParte) {
    setEditando(p);
    setFormulario({
      numero: p.numero,
      nombre: p.nombre,
      descripcion: p.descripcion ?? "",
      modelosIds: p.modelos.map((m) => m.id),
    });
    setError(null);
    setDialogoAbierto(true);
  }

  async function guardar() {
    if (!formulario.numero.trim() || !formulario.nombre.trim()) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    try {
      if (editando) {
        await actualizar.mutateAsync({ id: editando.id, cuerpo: formulario });
        toast({ description: t("comun.registroActualizado") });
      } else {
        await crear.mutateAsync(formulario);
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

  async function reactivar(p: NumeroParte) {
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
        titulo={t("catalogo.tituloPartes")}
        descripcion={t("nav.descripcionNumerosParte")}
        icono={<Hash className="h-5 w-5" />}
        acciones={
          <Button onClick={abrirNuevo} className="min-h-9">
            <Plus className="mr-2 h-4 w-4" />
            {t("catalogo.nuevaParte")}
          </Button>
        }
      />

      {/* Búsqueda y filtro de estado */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t("comun.buscar")}
            className="pl-9"
            aria-label={t("comun.buscar")}
          />
        </div>
        <InterruptorInactivos marcado={mostrarInactivos} onCambiar={setMostrarInactivos} />
      </div>

      {isLoading ? (
        <CargandoFilas />
      ) : filtradas.length === 0 ? (
        <EstadoVacio
          titulo={t("comun.sinResultados")}
          descripcion={t("catalogo.vacioPartes")}
          icono={<Hash className="h-8 w-8 text-muted-foreground" aria-hidden />}
        />
      ) : (
        <>
          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("catalogo.numero")}</th>
                  <th className="px-3 py-2.5">{t("catalogo.nombre")}</th>
                  <th className="px-3 py-2.5">{t("catalogo.numModelos")}</th>
                  <th className="px-3 py-2.5">{t("comun.total")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtradas.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{p.numero}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{p.nombre}</p>
                      {p.descripcion && (
                        <p className="max-w-md truncate text-xs text-muted-foreground">{p.descripcion}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.modelos.length === 0 ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="h-3 w-3" /> {t("catalogo.sinAsociaciones")}
                        </span>
                      ) : (
                        <div className="flex max-w-md flex-wrap gap-1">
                          {p.modelos.slice(0, 4).map((m) => (
                            <Badge key={m.id} variant="outline" className="font-mono text-[11px]">
                              {m.codigo}
                            </Badge>
                          ))}
                          {p.modelos.length > 4 && (
                            <Badge variant="secondary" className="text-[11px]">
                              +{p.modelos.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.activo ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                          {t("comun.activo")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t("comun.inactivo")}</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => abrirEdicion(p)}
                          aria-label={t("comun.editar")}
                          title={t("comun.editar")}
                        >
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setPorEliminar(p)}
                          aria-label={t("comun.eliminar")}
                          title={t("comun.eliminar")}
                        >
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
            {filtradas.map((p) => (
              <div key={p.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-primary">{p.numero}</p>
                    <p className="truncate font-semibold">{p.nombre}</p>
                  </div>
                  {p.activo ? (
                    <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                      {t("comun.activo")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">{t("comun.inactivo")}</Badge>
                  )}
                </div>
                {p.descripcion && (
                  <p className="mt-1 text-xs text-muted-foreground">{p.descripcion}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.modelos.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("catalogo.sinAsociaciones")}</span>
                  ) : (
                    p.modelos.map((m) => (
                      <Badge key={m.id} variant="outline" className="font-mono text-[11px]">
                        {m.codigo}
                      </Badge>
                    ))
                  )}
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(p)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("comun.editar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => (p.activo ? setPorDesactivar(p) : reactivar(p))}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {p.activo ? t("comun.desactivar") : t("comun.reactivar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-destructive hover:text-destructive"
                    onClick={() => setPorEliminar(p)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("comun.eliminar")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== Diálogo crear/editar ===== */}
      <Dialog open={dialogoAbierto} onOpenChange={setDialogoAbierto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editando ? t("catalogo.editarParte") : t("catalogo.nuevaParte")}
            </DialogTitle>
            <DialogDescription>{t("catalogo.subtituloPartes")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="parte-numero">{t("catalogo.numero")} *</Label>
                <Input
                  id="parte-numero"
                  value={formulario.numero}
                  onChange={(e) => setFormulario({ ...formulario, numero: e.target.value.toUpperCase() })}
                  placeholder="MOT-0500-A"
                  maxLength={40}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parte-nombre">{t("catalogo.nombre")} *</Label>
                <Input
                  id="parte-nombre"
                  value={formulario.nombre}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parte-descripcion">
                {t("catalogo.descripcion")}{" "}
                <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="parte-descripcion"
                value={formulario.descripcion}
                onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("catalogo.modelosAsociados")}</Label>
              <SelectorMultiple
                opciones={opcionesModelos}
                seleccionados={formulario.modelosIds ?? []}
                onCambiar={(ids) => setFormulario({ ...formulario, modelosIds: ids })}
                placeholderBusqueda={t("catalogo.buscarModelos")}
                textoVacio={t("comun.sinResultados")}
              />
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

      {/* ===== Confirmación de eliminación (borrado real) ===== */}
      <DialogoEliminarRegistro
        abierto={!!porEliminar}
        titulo={t("catalogo.eliminarParte")}
        descripcion={`${t("catalogo.eliminarParteConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />

      {/* ===== Confirmación de desactivación (reversible) ===== */}
      <DialogoDesactivarRegistro
        abierto={!!porDesactivar}
        titulo={t("catalogo.desactivarParte")}
        descripcion={t("catalogo.desactivarParteConfirmacion")}
        cargando={actualizar.isPending}
        onConfirmar={confirmarDesactivar}
        onCerrar={() => setPorDesactivar(null)}
      />
    </div>
  );
}
