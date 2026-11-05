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
 * SALIDAS A CLIENTES (HISTORIAL AGRUPADO — OQC)
 * Cada folio OQC-... agrupa las partidas liberadas en una sola operación.
 * El inspector puede:
 *   · Corregir una partida individual (cantidad/producto) — revierte y
 *     reaplica el stock con bitácora inmutable.
 *   · Eliminar una partida individual — devuelve el material con bitácora.
 *   · Editar la cabecera de la salida (referencia, responsable, notas).
 *   · Eliminar la salida COMPLETA — devuelve todo el material con bitácora
 *     por partida y marca la salida como eliminada (visible como historia).
 */
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  History,
  Pencil,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  EncabezadoSeccion,
  EstadoVacio,
  InterruptorInactivos,
} from "@/modulos/compartidos/ui";
import { useAlmacenes, useProductos } from "@/modulos/almacen/servicios/consultas";
import type { Producto } from "@/modulos/almacen/tipos";
import { SelectorProducto } from "@/modulos/almacen/componentes/compartidos";
import { useSesion } from "@/modulos/autenticacion/servicios/sesion";
import { tienePermiso } from "@/modulos/autenticacion/permisos";
import {
  useCorregirPartida,
  useEditarSalida,
  useEliminarPartida,
  useEliminarSalida,
  useSalidas,
} from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import { aTextoDecimal, esDecimalPositivo, textoConteo } from "@/modulos/unidades/tipos";
import type { CuerpoEdicionPartida, CuerpoEdicionSalida, PartidaSalida, SalidaOQC } from "../tipos";
import { detalleSalida } from "../servicios/api";
import { useQuery } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";

export function HistorialSalidas() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const { usuario } = useSesion();
  const puedeGestionar = tienePermiso(
    usuario?.rol?.permisos as string[] | undefined,
    "oqc.gestionar",
  );

  const [mostrarEliminadas, setMostrarEliminadas] = useState(false);
  const { data: salidas, isLoading } = useSalidas(mostrarEliminadas);
  const { data: productos } = useProductos();
  const { data: almacenes } = useAlmacenes();

  const [expandida, setExpandida] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  // Diálogos de partida
  const [corrigiendo, setCorrigiendo] = useState<{ salida: SalidaOQC; partida: PartidaSalida } | null>(null);
  const [eliminandoPartida, setEliminandoPartida] = useState<{ salida: SalidaOQC; partida: PartidaSalida } | null>(null);
  // Diálogos de salida
  const [editandoSalida, setEditandoSalida] = useState<SalidaOQC | null>(null);
  const [eliminandoSalida, setEliminandoSalida] = useState<SalidaOQC | null>(null);
  const [bitacoraDe, setBitacoraDe] = useState<SalidaOQC | null>(null);

  const corregir = useCorregirPartida();
  const eliminarPartidaM = useEliminarPartida();
  const editarSalidaM = useEditarSalida();
  const eliminarSalidaM = useEliminarSalida();

  const productosActivos = useMemo(() => (productos ?? []).filter((p) => p.activo), [productos]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return salidas ?? [];
    return (salidas ?? []).filter(
      (s) =>
        s.folio.toLowerCase().includes(q) ||
        (s.clienteNombre ?? "").toLowerCase().includes(q) ||
        (s.clienteCodigo ?? "").toLowerCase().includes(q) ||
        (s.referencia ?? "").toLowerCase().includes(q),
    );
  }, [salidas, busqueda]);

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("oqc.salidasTitulo")}
        descripcion={t("nav.descripcionOqcSalidas")}
        icono={<History className="h-5 w-5" />}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder={t("comun.buscar")}
            aria-label={t("comun.buscar")}
          />
        </div>
        <InterruptorInactivos marcado={mostrarEliminadas} onCambiar={setMostrarEliminadas} />
      </div>

      {isLoading ? (
        <CargandoFilas />
      ) : filtradas.length === 0 ? (
        <EstadoVacio
          titulo={t("comun.sinResultados")}
          descripcion={t("oqc.salidasVacio")}
          icono={<History className="h-8 w-8 text-muted-foreground" aria-hidden />}
        />
      ) : (
        <div className="space-y-3">
          {filtradas.map((s) => (
            <CardSalida
              key={s.id}
              salida={s}
              expandida={expandida === s.id}
              onToggle={() => setExpandida(expandida === s.id ? null : s.id)}
              puedeGestionar={puedeGestionar}
              onCorregir={(partida) => setCorrigiendo({ salida: s, partida })}
              onEliminarPartida={(partida) => setEliminandoPartida({ salida: s, partida })}
              onEditar={() => setEditandoSalida(s)}
              onEliminar={() => setEliminandoSalida(s)}
              onBitacora={() => setBitacoraDe(s)}
            />
          ))}
        </div>
      )}

      {/* ===== Corregir partida ===== */}
      {corrigiendo && (
        <DialogoCorregirPartida
          salida={corrigiendo.salida}
          partida={corrigiendo.partida}
          productos={productosActivos}
          almacenNombre={
            almacenes?.find((a) => a.id === corrigiendo.salida.almacenOrigenId)?.nombre ??
            corrigiendo.salida.almacenOrigenNombre ??
            ""
          }
          cargando={corregir.isPending}
          onCerrar={() => setCorrigiendo(null)}
          onConfirmar={async (cuerpo) => {
            try {
              await corregir.mutateAsync({
                salidaId: corrigiendo.salida.id,
                partidaId: corrigiendo.partida.id,
                cuerpo,
              });
              toast({ description: t("oqc.corregidaOk") });
              setCorrigiendo(null);
            } catch (e) {
              const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
              toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
            }
          }}
        />
      )}

      {/* ===== Eliminar partida ===== */}
      {eliminandoPartida && (
        <DialogoMotivoEliminacion
          titulo={t("oqc.eliminarPartida")}
          descripcion={`${t("oqc.eliminarPartidaConfirmacion")} (${eliminandoPartida.partida.folio} — ${eliminandoPartida.partida.productoSku})`}
          cargando={eliminarPartidaM.isPending}
          onCerrar={() => setEliminandoPartida(null)}
          onConfirmar={async (motivo) => {
            try {
              await eliminarPartidaM.mutateAsync({
                salidaId: eliminandoPartida.salida.id,
                partidaId: eliminandoPartida.partida.id,
                cuerpo: { motivoCorreccion: motivo },
              });
              toast({ description: t("oqc.partidaEliminadaOk") });
              setEliminandoPartida(null);
            } catch (e) {
              const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
              toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
            }
          }}
        />
      )}

      {/* ===== Editar cabecera de salida ===== */}
      {editandoSalida && (
        <DialogoEditarSalida
          salida={editandoSalida}
          cargando={editarSalidaM.isPending}
          onCerrar={() => setEditandoSalida(null)}
          onConfirmar={async (cuerpo) => {
            try {
              await editarSalidaM.mutateAsync({ id: editandoSalida.id, cuerpo });
              toast({ description: t("oqc.salidaActualizadaOk") });
              setEditandoSalida(null);
            } catch (e) {
              const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
              toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
            }
          }}
        />
      )}

      {/* ===== Eliminar salida completa ===== */}
      {eliminandoSalida && (
        <DialogoMotivoEliminacion
          titulo={t("oqc.eliminarSalida")}
          descripcion={`${t("oqc.eliminarSalidaConfirmacion")} (${eliminandoSalida.folio})`}
          cargando={eliminarSalidaM.isPending}
          onCerrar={() => setEliminandoSalida(null)}
          onConfirmar={async (motivo) => {
            try {
              await eliminarSalidaM.mutateAsync({
                id: eliminandoSalida.id,
                cuerpo: { motivoCorreccion: motivo },
              });
              toast({ description: t("oqc.salidaEliminadaOk", { folio: eliminandoSalida.folio }) });
              setEliminandoSalida(null);
            } catch (e) {
              const codigo = e instanceof ErrorApi ? e.codigo : "ERROR_INTERNO";
              toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
            }
          }}
        />
      )}

      {/* ===== Bitácora de la salida ===== */}
      {bitacoraDe && (
        <DialogoBitacora salidaId={bitacoraDe.id} folio={bitacoraDe.folio} onCerrar={() => setBitacoraDe(null)} />
      )}
    </div>
  );
}

// ============================================================
// TARJETA DE SALIDA (con partidas expandibles)
// ============================================================

function CardSalida({
  salida,
  expandida,
  onToggle,
  puedeGestionar,
  onCorregir,
  onEliminarPartida,
  onEditar,
  onEliminar,
  onBitacora,
}: {
  salida: SalidaOQC;
  expandida: boolean;
  onToggle: () => void;
  puedeGestionar: boolean;
  onCorregir: (partida: PartidaSalida) => void;
  onEliminarPartida: (partida: PartidaSalida) => void;
  onEditar: () => void;
  onEliminar: () => void;
  onBitacora: () => void;
}) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const eliminada = salida.estado === "ELIMINADA";

  return (
    <div
      className={cn(
        "rounded-xl border",
        eliminada ? "border-dashed opacity-75" : "border",
      )}
    >
      {/* Cabecera de la salida */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
        aria-expanded={expandida}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-sm font-bold">{salida.folio}</p>
            <p className="truncate text-sm">
              {salida.clienteNombre ? (
                <>
                  <span className="font-medium">{salida.clienteNombre}</span>
                  {salida.clienteCodigo && (
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      {salida.clienteCodigo}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {eliminada ? (
            <Badge variant="destructive">{t("oqc.eliminada")}</Badge>
          ) : (
            <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
              {t("oqc.emitida")}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {t("oqc.partidas", { n: salida.totalPartidas })} · {f.numero(salida.totalUnidades, 2)}{" "}
            {t("oqc.unidades")}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {f.fechaCorta(salida.createdAt)}
          </span>
          {expandida ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Detalle expandible */}
      {expandida && (
        <div className="space-y-3 border-t px-4 py-3">
          {/* Metadatos de la salida */}
          <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("oqc.almacenOrigen")}</p>
              <p className="font-medium">{salida.almacenOrigenNombre ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("oqc.referencia")}</p>
              <p className="font-mono text-xs font-semibold">{salida.referencia ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("oqc.responsableLiberacion")}</p>
              <p className="font-medium">{salida.responsable ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground">{t("oqc.notas")}</p>
              <p className="truncate font-medium" title={salida.notas ?? undefined}>
                {salida.notas ?? "—"}
              </p>
            </div>
          </div>

          {eliminada && salida.eliminadaPor && (
            <p className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
              <TriangleAlert className="h-3.5 w-3.5" />
              {t("oqc.eliminadaPor")}: <strong>{salida.eliminadaPor}</strong>
              {salida.eliminadaEn && ` · ${f.fechaCorta(salida.eliminadaEn)}`}
            </p>
          )}

          {/* Partidas */}
          {salida.partidas.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
              {eliminada ? t("oqc.sinBitacora") : t("oqc.salidasVacio")}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t("oqc.folio")}</th>
                    <th className="px-3 py-2">{t("comun.producto")}</th>
                    <th className="px-3 py-2 text-right">{t("oqc.cantidad")}</th>
                    <th className="px-3 py-2 text-right">{t("comun.acciones")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salida.partidas.map((p) => (
                    <tr key={p.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold">
                        {p.folio}
                        {p.editado && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            {t("registros.corregido")}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{p.productoNombre}</p>
                        <p className="font-mono text-xs text-muted-foreground">{p.productoSku}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">
                        {f.numero(p.cantidad, 2)} {p.productoUnidad}
                        {p.conteo && (
                          <p className="text-[11px] font-normal text-muted-foreground">
                            {textoConteo(p.conteo)}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {puedeGestionar && !eliminada ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => onCorregir(p)}
                              aria-label={t("oqc.editarPartida")}
                              title={t("oqc.editarPartida")}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => onEliminarPartida(p)}
                              aria-label={t("oqc.eliminarPartida")}
                              title={t("oqc.eliminarPartida")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Acciones de la salida */}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={onBitacora}>
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" /> {t("oqc.bitacora")}
            </Button>
            {puedeGestionar && !eliminada && (
              <>
                <Button variant="outline" size="sm" className="h-9" onClick={onEditar}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> {t("oqc.editarSalida")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 text-destructive hover:text-destructive"
                  onClick={onEliminar}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> {t("oqc.eliminarSalida")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// DIÁLOGOS
// ============================================================

function DialogoCorregirPartida({
  salida,
  partida,
  productos,
  almacenNombre,
  cargando,
  onCerrar,
  onConfirmar,
}: {
  salida: SalidaOQC;
  partida: PartidaSalida;
  productos: Producto[];
  almacenNombre: string;
  cargando: boolean;
  onCerrar: () => void;
  onConfirmar: (cuerpo: CuerpoEdicionPartida) => Promise<void>;
}) {
  const { t } = useIdioma();
  const [productoId, setProductoId] = useState(partida.productoId);
  const [cantidad, setCantidad] = useState(partida.cantidad);
  const [motivo, setMotivo] = useState(partida.motivo ?? "");
  const [motivoCorreccion, setMotivoCorreccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    // Validación decimal exacta del lado cliente (el servidor revalida)
    const cant = aTextoDecimal(cantidad);
    if (!productoId || cant === null || !esDecimalPositivo(cant)) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    if (!motivoCorreccion.trim()) {
      setError(t("oqc.motivoCorreccion") + " — " + t("comun.camposIncompletos"));
      return;
    }
    setError(null);
    // Se envía la cadena cruda del motivo (vacía = limpiar). La remisión
    // (PL) y el responsable NO viajan aquí: el servidor los refleja desde
    // la cabecera de la salida, así esta corrección jamás los pierde.
    await onConfirmar({
      productoId,
      cantidad: cant,
      motivo: motivo.trim(),
      motivoCorreccion: motivoCorreccion.trim(),
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("oqc.editarPartida")}</DialogTitle>
          <DialogDescription className="font-mono text-xs">
            {partida.folio} · {salida.folio}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>{t("comun.producto")}</Label>
            <SelectorProducto
              productos={productos}
              valor={productoId || null}
              onChange={(v) => setProductoId(v)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="partida-cantidad">{t("oqc.cantidad")} *</Label>
              <Input
                id="partida-cantidad"
                type="number"
                min={0}
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("oqc.almacenOrigen")}</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{almacenNombre}</p>
            </div>
          </div>
          {/* Datos de la cabecera (solo consulta): la remisión/PL y el
              responsable se reflejan en la partida desde la salida */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("oqc.referencia")}</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-xs font-semibold">
                {salida.referencia ?? salida.folio}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("oqc.responsableLiberacion")}</Label>
              <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                {salida.responsable ?? salida.usuarioNombre ?? "—"}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("oqc.datosCabeceraAviso")}</p>
          <div className="space-y-2">
            <Label htmlFor="partida-motivo">
              {t("comun.motivo")} <span className="text-xs text-muted-foreground">({t("comun.opcional")})</span>
            </Label>
            <Input id="partida-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={120} />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="partida-motivo-correccion">{t("oqc.motivoCorreccion")} *</Label>
            <Input
              id="partida-motivo-correccion"
              value={motivoCorreccion}
              onChange={(e) => setMotivoCorreccion(e.target.value)}
              placeholder={t("oqc.motivoAviso")}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">{t("oqc.motivoAviso")}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={cargando}>
            {t("comun.cancelar")}
          </Button>
          <Button onClick={confirmar} disabled={cargando}>
            {cargando ? t("comun.cargando") : t("comun.guardarCambios")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DialogoEditarSalida({
  salida,
  cargando,
  onCerrar,
  onConfirmar,
}: {
  salida: SalidaOQC;
  cargando: boolean;
  onCerrar: () => void;
  onConfirmar: (cuerpo: CuerpoEdicionSalida) => Promise<void>;
}) {
  const { t } = useIdioma();
  const [referencia, setReferencia] = useState(salida.referencia ?? "");
  const [responsable, setResponsable] = useState(salida.responsable ?? "");
  const [notas, setNotas] = useState(salida.notas ?? "");
  const [motivoCorreccion, setMotivoCorreccion] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!motivoCorreccion.trim()) {
      setError(t("oqc.motivoCorreccion") + " — " + t("comun.camposIncompletos"));
      return;
    }
    setError(null);
    // Cadenas crudas: dejar un campo vacío LIMPIA el dato, y la remisión y
    // el responsable se propagan a todas las partidas del historial de
    // movimientos para que reflejen siempre esta cabecera.
    await onConfirmar({
      referencia: referencia.trim(),
      responsable: responsable.trim(),
      notas: notas.trim(),
      motivoCorreccion: motivoCorreccion.trim(),
    });
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("oqc.editarSalida")}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{salida.folio}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t("oqc.soloCabeceraEditable")}
          </p>
          <div className="space-y-2">
            <Label htmlFor="salida-edit-referencia">{t("oqc.referencia")}</Label>
            <Input
              id="salida-edit-referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value.toUpperCase())}
              maxLength={40}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salida-edit-responsable">{t("oqc.responsableLiberacion")}</Label>
            <Input
              id="salida-edit-responsable"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salida-edit-notas">{t("oqc.notas")}</Label>
            <Input
              id="salida-edit-notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              maxLength={200}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="salida-edit-motivo">{t("oqc.motivoCorreccion")} *</Label>
            <Input
              id="salida-edit-motivo"
              value={motivoCorreccion}
              onChange={(e) => setMotivoCorreccion(e.target.value)}
              placeholder={t("oqc.motivoAviso")}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">{t("oqc.motivoAviso")}</p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={cargando}>
            {t("comun.cancelar")}
          </Button>
          <Button onClick={confirmar} disabled={cargando}>
            {cargando ? t("comun.cargando") : t("comun.guardarCambios")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Diálogo genérico de eliminación con motivo de corrección obligatorio */
function DialogoMotivoEliminacion({
  titulo,
  descripcion,
  cargando,
  onCerrar,
  onConfirmar,
}: {
  titulo: string;
  descripcion: string;
  cargando: boolean;
  onCerrar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const { t } = useIdioma();
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirmar() {
    if (!motivo.trim()) {
      setError(t("comun.camposIncompletos"));
      return;
    }
    setError(null);
    await onConfirmar(motivo.trim());
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" />
            {titulo}
          </DialogTitle>
          <DialogDescription>{descripcion}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo-eliminacion">
            {t("oqc.motivoCorreccion")} * <span className="text-xs text-muted-foreground">({t("oqc.motivoAviso")})</span>
          </Label>
          <Input
            id="motivo-eliminacion"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={200}
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCerrar} disabled={cargando}>
            {t("comun.cancelar")}
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={cargando}>
            {cargando ? t("comun.cargando") : t("comun.eliminar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bitácora de correcciones de una salida (partidas editadas/eliminadas) */
function DialogoBitacora({
  salidaId,
  folio,
  onCerrar,
}: {
  salidaId: string;
  folio: string;
  onCerrar: () => void;
}) {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { data, isLoading } = useQuery({
    queryKey: ["oqc", "salida-detalle", salidaId],
    queryFn: () => detalleSalida(salidaId),
  });

  const correcciones = data?.correcciones ?? [];

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4" />
            {t("oqc.bitacora")}
          </DialogTitle>
          <DialogDescription className="font-mono text-xs">{folio}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <CargandoFilas filas={2} />
        ) : correcciones.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            {t("oqc.sinBitacora")}
          </p>
        ) : (
          <div className="space-y-2">
            {correcciones.map((c) => (
              <div key={c.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={c.accion === "ELIMINACION" ? "destructive" : "secondary"}
                      className="text-[10px]"
                    >
                      {c.accion === "ELIMINACION"
                        ? t("oqc.accionEliminacion")
                        : c.esCabecera
                          ? t("oqc.accionEdicionCabecera")
                          : t("oqc.accionEdicion")}
                    </Badge>
                    <span className="font-mono text-xs font-semibold">{c.folio}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{f.fechaCorta(c.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-sm">
                  <span className="text-muted-foreground">{t("oqc.motivoCorreccion")}: </span>
                  {c.motivo ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("comun.responsable")}: {c.usuarioNombre ?? "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
