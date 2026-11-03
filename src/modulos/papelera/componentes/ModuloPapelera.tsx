"use client";

/**
 * MÓDULO: PAPELERA — Componente principal
 * Dos vistas:
 *   · En papelera: registros restaurables con cuenta regresiva de 30 días
 *   · Bitácora: log inmutable de cada eliminación, restauración y purga
 */
import { useState } from "react";
import {
  ArchiveRestore,
  Boxes,
  Building2,
  History,
  Mail,
  Package,
  Trash2,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useIdioma, useFormateadores } from "@/modulos/compartidos/idioma";
import {
  CargandoFilas,
  DialogoEliminarRegistro,
  EncabezadoSeccion,
  EstadoVacio,
  TablaResponsiva,
} from "@/modulos/compartidos/ui";
import { usePapelera, usePurgarEntrada, useRestaurarEntrada } from "../servicios/consultas";
import { ErrorApi } from "../servicios/api";
import { claveErrorApi } from "../servicios/errores";
import type { EntradaPapelera } from "../tipos";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ICONOS_ENTIDAD: Record<string, typeof Package> = {
  PRODUCTO: Package,
  ALMACEN: Warehouse,
  MODELO: Boxes,
  NUMERO_PARTE: Wrench,
  USUARIO: Mail,
  CLIENTE: Building2,
};

function InsigniaEntidad({ entidad }: { entidad: string }) {
  const { t } = useIdioma();
  const Icono = ICONOS_ENTIDAD[entidad] ?? Package;
  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <Icono className="h-3 w-3" aria-hidden />
      {t(`papelera.entidad.${entidad}`)}
    </Badge>
  );
}

function InsigniaEstado({ estado }: { estado: string }) {
  const { t } = useIdioma();
  if (estado === "EN_PAPELERA") return <Badge variant="secondary">{t("papelera.estado.enPapelera")}</Badge>;
  if (estado === "RESTAURADO")
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">{t("papelera.estado.restaurado")}</Badge>
    );
  return <Badge variant="destructive">{t("papelera.estado.purgado")}</Badge>;
}

export function ModuloPapelera() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { toast } = useToast();
  const [vista, setVista] = useState<"activa" | "bitacora">("activa");
  const { data, isLoading } = usePapelera(vista);
  const restaurar = useRestaurarEntrada();
  const purgar = usePurgarEntrada();

  const [porPurgar, setPorPurgar] = useState<EntradaPapelera | null>(null);

  const entradas = data?.entradas ?? [];

  async function confirmarRestaurar(e: EntradaPapelera) {
    try {
      await restaurar.mutateAsync(e.id);
      toast({ description: t("papelera.restauradoOk", { nombre: e.nombre }) });
    } catch (err) {
      const codigo = err instanceof ErrorApi ? err.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
    }
  }

  async function confirmarPurgar() {
    if (!porPurgar) return;
    try {
      await purgar.mutateAsync(porPurgar.id);
      toast({ description: t("papelera.purgadoOk", { nombre: porPurgar.nombre }) });
    } catch (err) {
      const codigo = err instanceof ErrorApi ? err.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
    } finally {
      setPorPurgar(null);
    }
  }

  function Fila({ e }: { e: EntradaPapelera }) {
    const restaurable = e.estado === "EN_PAPELERA";
    return (
      <tr className="transition-colors hover:bg-muted/30">
        <td className="px-3 py-2.5">
          <InsigniaEntidad entidad={e.entidad} />
        </td>
        <td className="px-3 py-2.5">
          <p className="font-mono text-xs font-semibold">{e.identificador}</p>
          <p className="max-w-64 truncate text-sm">{e.nombre}</p>
        </td>
        <td className="px-3 py-2.5 text-sm">
          <p>{e.usuarioNombre ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{f.fechaHora(e.eliminadoEn)}</p>
        </td>
        {vista === "activa" ? (
          <td className="px-3 py-2.5">
            <span
              className={cn(
                "text-sm font-semibold tabular-nums",
                e.diasRestantes <= 3 ? "text-destructive" : "text-foreground",
              )}
            >
              {t("papelera.diasRestantes", { dias: e.diasRestantes })}
            </span>
            <p className="text-xs text-muted-foreground">{f.fecha(e.expiraEn)}</p>
          </td>
        ) : (
          <td className="px-3 py-2.5">
            <InsigniaEstado estado={e.estado} />
            {e.restauradoEn && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("papelera.restauradoEl")} {f.fechaHora(e.restauradoEn)}
              </p>
            )}
            {e.purgadoEn && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("papelera.purgadoEl")} {f.fechaHora(e.purgadoEn)}
                {e.purgadoPor ? ` · ${e.purgadoPor}` : ""}
              </p>
            )}
          </td>
        )}
        <td className="px-3 py-2.5">
          {restaurable ? (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-emerald-600 hover:text-emerald-600"
                onClick={() => confirmarRestaurar(e)}
                disabled={restaurar.isPending}
                aria-label={t("papelera.restaurar")}
                title={t("papelera.restaurar")}
              >
                <ArchiveRestore className="h-4 w-4" />
                <span className="hidden sm:inline">{t("papelera.restaurar")}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setPorPurgar(e)}
                aria-label={t("papelera.eliminarDefinitivamente")}
                title={t("papelera.eliminarDefinitivamente")}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("papelera.eliminarDefinitivamente")}</span>
              </Button>
            </div>
          ) : (
            <p className="text-right text-xs text-muted-foreground">—</p>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("papelera.titulo")}
        descripcion={t("nav.descripcionPapelera")}
        icono={<Trash2 className="h-5 w-5" />}
      />

      <Tabs value={vista} onValueChange={(v) => setVista(v as "activa" | "bitacora")}>
        <TabsList>
          <TabsTrigger value="activa" className="gap-1.5">
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("papelera.enPapelera")}
          </TabsTrigger>
          <TabsTrigger value="bitacora" className="gap-1.5">
            <History className="h-4 w-4" aria-hidden />
            {t("papelera.bitacora")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="activa" className="mt-4 space-y-4">
          {isLoading ? (
            <CargandoFilas filas={4} />
          ) : entradas.length === 0 ? (
            <EstadoVacio titulo={t("papelera.vacia")} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("papelera.avisoVentana")}</p>
              <div className="hidden md:block">
                <TablaResponsiva>
                  <thead className="bg-muted/50">
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2.5">{t("papelera.tipo")}</th>
                      <th className="px-3 py-2.5">{t("papelera.registro")}</th>
                      <th className="px-3 py-2.5">{t("papelera.eliminadoPor")}</th>
                      <th className="px-3 py-2.5">{t("papelera.expira")}</th>
                      <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {entradas.map((e) => (
                      <Fila key={e.id} e={e} />
                    ))}
                  </tbody>
                </TablaResponsiva>
              </div>
              <div className="space-y-3 md:hidden">
                {entradas.map((e) => (
                  <div key={e.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <InsigniaEntidad entidad={e.entidad} />
                        <p className="mt-1.5 font-mono text-xs font-bold text-primary">{e.identificador}</p>
                        <p className="font-semibold">{e.nombre}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-bold tabular-nums",
                          e.diasRestantes <= 3 ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {t("papelera.diasRestantes", { dias: e.diasRestantes })}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("papelera.eliminadoPor")} {e.usuarioNombre ?? "—"} · {f.fechaHora(e.eliminadoEn)}
                    </p>
                    <div className="mt-3 flex justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 text-emerald-600 hover:text-emerald-600"
                        onClick={() => confirmarRestaurar(e)}
                        disabled={restaurar.isPending}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" /> {t("papelera.restaurar")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 gap-1.5 text-destructive hover:text-destructive"
                        onClick={() => setPorPurgar(e)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {t("papelera.eliminarDefinitivamente")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="bitacora" className="mt-4 space-y-4">
          {isLoading ? (
            <CargandoFilas filas={4} />
          ) : entradas.length === 0 ? (
            <EstadoVacio titulo={t("papelera.vaciaBitacora")} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("papelera.avisoBitacora")}</p>
              <TablaResponsiva>
                <thead className="bg-muted/50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5">{t("papelera.tipo")}</th>
                    <th className="px-3 py-2.5">{t("papelera.registro")}</th>
                    <th className="px-3 py-2.5">{t("papelera.eliminadoPor")}</th>
                    <th className="px-3 py-2.5">{t("papelera.desenlace")}</th>
                    <th className="px-3 py-2.5 text-right">{t("comun.acciones")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {entradas.map((e) => (
                    <Fila key={e.id} e={e} />
                  ))}
                </tbody>
              </TablaResponsiva>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== Purga definitiva (doble confirmación) ===== */}
      <DialogoEliminarRegistro
        abierto={!!porPurgar}
        titulo={t("papelera.eliminarDefinitivamente")}
        descripcion={`${t("papelera.purgarConfirmacion", { nombre: porPurgar?.nombre ?? "" })} ${t("papelera.purgarIrreversible")}`}
        cargando={purgar.isPending}
        onConfirmar={confirmarPurgar}
        onCerrar={() => setPorPurgar(null)}
      />
    </div>
  );
}
