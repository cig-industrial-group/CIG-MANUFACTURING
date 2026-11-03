"use client";

/**
 * GESTIÓN DE MODELOS — CRUD de modelos de equipo/producto
 * Cada modelo puede asociarse a uno o más números de parte (N:M).
 */
import { useMemo, useState } from "react";
import { Boxes, Link2, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
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
  useActualizarModelo,
  useCrearModelo,
  useEliminarModelo,
  useModelos,
  usePartes,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import type { CuerpoModelo, Modelo } from "../tipos";
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

const VACIO: CuerpoModelo = { codigo: "", nombre: "", descripcion: "", partesIds: [] };

export function GestionModelos() {
  const { t } = useIdioma();
  const { toast } = useToast();
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const { data: modelos, isLoading } = useModelos(mostrarInactivos);
  const { data: partes } = usePartes(); // solo activas para nuevas asociaciones
  const crear = useCrearModelo();
  const actualizar = useActualizarModelo();
  const eliminar = useEliminarModelo();

  const [busqueda, setBusqueda] = useState("");
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [editando, setEditando] = useState<Modelo | null>(null);
  const [porEliminar, setPorEliminar] = useState<Modelo | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<Modelo | null>(null);
  const [formulario, setFormulario] = useState<CuerpoModelo>(VACIO);
  const [error, setError] = useState<string | null>(null);

  const opcionesPartes = useMemo(
    () => (partes ?? []).map((p) => ({ id: p.id, etiqueta: p.numero, subetiqueta: p.nombre })),
    [partes],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return modelos ?? [];
    return (modelos ?? []).filter(
      (m) =>
        m.codigo.toLowerCase().includes(q) ||
        m.nombre.toLowerCase().includes(q) ||
        (m.descripcion ?? "").toLowerCase().includes(q) ||
        m.partes.some((p) => p.numero.toLowerCase().includes(q)),
    );
  }, [modelos, busqueda]);

  function abrirNuevo() {
    setEditando(null);
    setFormulario(VACIO);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(m: Modelo) {
    setEditando(m);
    setFormulario({
      codigo: m.codigo,
      nombre: m.nombre,
      descripcion: m.descripcion ?? "",
      partesIds: m.partes.map((p) => p.id),
    });
    setError(null);
    setDialogoAbierto(true);
  }

  async function guardar() {
    if (!formulario.codigo.trim() || !formulario.nombre.trim()) {
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

  async function reactivar(m: Modelo) {
    try {
      await actualizar.mutateAsync({ id: m.id, cuerpo: { activo: true } });
      toast({ description: t("comun.registroReactivado") });
    } catch {
      toast({ description: t("comun.errorGenerico"), variant: "destructive" });
    }
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("catalogo.tituloModelos")}
        descripcion={t("nav.descripcionModelos")}
        icono={<Boxes className="h-5 w-5" />}
        acciones={
          <Button onClick={abrirNuevo} className="min-h-9">
            <Plus className="mr-2 h-4 w-4" />
            {t("catalogo.nuevoModelo")}
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
      ) : filtrados.length === 0 ? (
        <EstadoVacio
          titulo={t("comun.sinResultados")}
          descripcion={t("catalogo.vacioModelos")}
          icono={<Boxes className="h-8 w-8 text-muted-foreground" aria-hidden />}
        />
      ) : (
        <>
          {/* Tabla escritorio */}
          <div className="hidden md:block">
            <TablaResponsiva>
              <thead className="bg-muted/50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5">{t("catalogo.codigo")}</th>
                  <th className="px-3 py-2.5">{t("catalogo.nombre")}</th>
                  <th className="px-3 py-2.5">{t("catalogo.numPartes")}</th>
                  <th className="px-3 py-2.5">{t("comun.total")}</th>
                  <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtrados.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{m.codigo}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{m.nombre}</p>
                      {m.descripcion && (
                        <p className="max-w-md truncate text-xs text-muted-foreground">{m.descripcion}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {m.partes.length === 0 ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Link2 className="h-3 w-3" /> {t("catalogo.sinAsociaciones")}
                        </span>
                      ) : (
                        <div className="flex max-w-md flex-wrap gap-1">
                          {m.partes.slice(0, 4).map((p) => (
                            <Badge key={p.id} variant="outline" className="font-mono text-[11px]">
                              {p.numero}
                            </Badge>
                          ))}
                          {m.partes.length > 4 && (
                            <Badge variant="secondary" className="text-[11px]">
                              +{m.partes.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {m.activo ? (
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
                          onClick={() => abrirEdicion(m)}
                          aria-label={t("comun.editar")}
                          title={t("comun.editar")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => (m.activo ? setPorDesactivar(m) : reactivar(m))}
                          aria-label={m.activo ? t("comun.desactivar") : t("comun.reactivar")}
                          title={m.activo ? t("comun.desactivar") : t("comun.reactivar")}
                        >
                          <Power className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setPorEliminar(m)}
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
            {filtrados.map((m) => (
              <div key={m.id} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-primary">{m.codigo}</p>
                    <p className="truncate font-semibold">{m.nombre}</p>
                  </div>
                  {m.activo ? (
                    <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                      {t("comun.activo")}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">{t("comun.inactivo")}</Badge>
                  )}
                </div>
                {m.descripcion && (
                  <p className="mt-1 text-xs text-muted-foreground">{m.descripcion}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.partes.length === 0 ? (
                    <span className="text-xs text-muted-foreground">{t("catalogo.sinAsociaciones")}</span>
                  ) : (
                    m.partes.map((p) => (
                      <Badge key={p.id} variant="outline" className="font-mono text-[11px]">
                        {p.numero}
                      </Badge>
                    ))
                  )}
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" className="h-9" onClick={() => abrirEdicion(m)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("comun.editar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => (m.activo ? setPorDesactivar(m) : reactivar(m))}
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {m.activo ? t("comun.desactivar") : t("comun.reactivar")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 text-destructive hover:text-destructive"
                    onClick={() => setPorEliminar(m)}
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
              {editando ? t("catalogo.editarModelo") : t("catalogo.nuevoModelo")}
            </DialogTitle>
            <DialogDescription>{t("catalogo.subtituloModelos")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modelo-codigo">{t("catalogo.codigo")} *</Label>
                <Input
                  id="modelo-codigo"
                  value={formulario.codigo}
                  onChange={(e) => setFormulario({ ...formulario, codigo: e.target.value.toUpperCase() })}
                  placeholder="LW-2000"
                  maxLength={30}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="modelo-nombre">{t("catalogo.nombre")} *</Label>
                <Input
                  id="modelo-nombre"
                  value={formulario.nombre}
                  onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
                  maxLength={100}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelo-descripcion">
                {t("catalogo.descripcion")}{" "}
                <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
              </Label>
              <Input
                id="modelo-descripcion"
                value={formulario.descripcion}
                onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("catalogo.partesAsociadas")}</Label>
              <SelectorMultiple
                opciones={opcionesPartes}
                seleccionados={formulario.partesIds ?? []}
                onCambiar={(ids) => setFormulario({ ...formulario, partesIds: ids })}
                placeholderBusqueda={t("catalogo.buscarPartes")}
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
        titulo={t("catalogo.eliminarModelo")}
        descripcion={`${t("catalogo.eliminarModeloConfirmacion")} ${t("comun.eliminarSinUndo")}`}
        cargando={eliminar.isPending}
        onConfirmar={confirmarEliminar}
        onCerrar={() => setPorEliminar(null)}
      />

      {/* ===== Confirmación de desactivación (reversible) ===== */}
      <DialogoDesactivarRegistro
        abierto={!!porDesactivar}
        titulo={t("catalogo.desactivarModelo")}
        descripcion={t("catalogo.desactivarModeloConfirmacion")}
        cargando={actualizar.isPending}
        onConfirmar={confirmarDesactivar}
        onCerrar={() => setPorDesactivar(null)}
      />
    </div>
  );
}
