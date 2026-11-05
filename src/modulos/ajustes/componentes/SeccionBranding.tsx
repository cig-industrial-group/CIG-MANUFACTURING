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
 * MÓDULO: AJUSTES — Sección «Identidad Visual» (branding)
 *
 * Permite al administrador subir, previsualizar y restaurar el logo y el
 * favicon del sistema. Los cambios se aplican de inmediato en toda la
 * aplicación (invalidación de caché por versión) sin reiniciar el servidor
 * ni recompilar.
 *
 * Validación en cliente (tipo y tamaño) ANTES de enviar; el servidor
 * vuelve a validar por contenido (magic bytes) — nunca se confía solo en
 * la extensión.
 */
import { useRef } from "react";
import {
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  Upload,
  Info,
} from "lucide-react";
import { useIdioma } from "@/modulos/compartidos/idioma";
import { claveErrorApi } from "@/modulos/compartidos/errores";
import { EncabezadoSeccion } from "@/modulos/compartidos/ui";
import { useVersionBranding, urlLogo, urlFavicon } from "@/modulos/compartidos/branding";
import {
  useBranding,
  useRestaurarFavicon,
  useRestaurarLogo,
  useSubirFavicon,
  useSubirLogo,
} from "../servicios/consultas";
import { ErrorApiAjustes, LIMITES_BRANDING, type EstadoActivoBranding } from "../servicios/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ============================================================
// VISTA PREVIA (recurso dinámico servido por /api/branding)
// ============================================================
function PreviewRecurso({ tipo, alt, clase }: { tipo: "logo" | "favicon"; alt: string; clase: string }) {
  const version = useVersionBranding();
  const src = tipo === "logo" ? urlLogo(version) : urlFavicon(version);
  return <img src={src} alt={alt} className={clase} />;
}

// ============================================================
// TARJETA DE RECURSO (LOGO O FAVICON)
// ============================================================
function TarjetaBranding({
  tipo,
  estado,
  cargando,
}: {
  tipo: "logo" | "favicon";
  estado?: EstadoActivoBranding;
  cargando: boolean;
}) {
  const { t } = useIdioma();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const esLogo = tipo === "logo";
  // Los cuatro hooks se llaman SIEMPRE (reglas de hooks); la selección
  // solo decide cuál se usa para las acciones de esta tarjeta.
  const subirLogo = useSubirLogo();
  const subirFavicon = useSubirFavicon();
  const restaurarLogo = useRestaurarLogo();
  const restaurarFavicon = useRestaurarFavicon();
  const subir = esLogo ? subirLogo : subirFavicon;
  const restaurar = esLogo ? restaurarLogo : restaurarFavicon;

  const limites = esLogo
    ? {
        tamanoMax: LIMITES_BRANDING.logoTamanoMaxBytes,
        tipos: LIMITES_BRANDING.logoTipos,
        formato: t("ajustes.branding.formatoLogo"),
        acepta: ".png,.svg,.jpg,image/png,image/svg+xml,image/jpeg",
      }
    : {
        tamanoMax: LIMITES_BRANDING.faviconTamanoMaxBytes,
        tipos: LIMITES_BRANDING.faviconTipos,
        formato: t("ajustes.branding.formatoFavicon"),
        acepta: ".ico,.png,image/x-icon,image/png",
      };

  /** Validación en cliente: tipo y tamaño antes de gastar una petición */
  function validarCliente(archivo: File): boolean {
    const nombre = archivo.name.toLowerCase();
    const mimesValidos: Record<string, string> = {
      png: "image/png",
      svg: "image/svg+xml",
      jpg: "image/jpeg",
      ico: "image/x-icon",
    };
    const tipoOk =
      limites.tipos.some((ext) => nombre.endsWith(`.${ext}`)) ||
      limites.tipos.some((ext) => archivo.type === mimesValidos[ext]);
    if (!tipoOk) {
      toast({ description: t("ajustes.branding.errTipoArchivo"), variant: "destructive" });
      return false;
    }
    if (archivo.size > limites.tamanoMax) {
      toast({ description: t("ajustes.branding.errTamanoArchivo"), variant: "destructive" });
      return false;
    }
    return true;
  }

  async function alElegirArchivo(archivo: File | undefined) {
    if (!archivo) return;
    if (!validarCliente(archivo)) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      await subir.mutateAsync(archivo);
      toast({
        description: t(
          esLogo ? "ajustes.branding.logoActualizado" : "ajustes.branding.faviconActualizado",
        ),
      });
    } catch (e) {
      const codigo = e instanceof ErrorApiAjustes ? e.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function alRestaurar() {
    try {
      await restaurar.mutateAsync();
      toast({
        description: t(
          esLogo ? "ajustes.branding.logoRestaurado" : "ajustes.branding.faviconRestaurado",
        ),
      });
    } catch (e) {
      const codigo = e instanceof ErrorApiAjustes ? e.codigo : "ERROR_INTERNO";
      toast({ description: t(claveErrorApi(codigo)), variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">
                {t(esLogo ? "ajustes.branding.logoTitulo" : "ajustes.branding.faviconTitulo")}
              </p>
              <Badge
                variant="outline"
                className={
                  estado?.personalizado
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : ""
                }
              >
                {t(
                  estado?.personalizado
                    ? "ajustes.branding.personalizado"
                    : "ajustes.branding.predeterminado",
                )}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {t(esLogo ? "ajustes.branding.logoDesc" : "ajustes.branding.faviconDesc")}
            </p>
            <p className="text-xs text-muted-foreground/80">{limites.formato}</p>
          </div>

          {/* Vista previa: logo en tarjeta; favicon en pestaña de navegador */}
          <div className="shrink-0">
            {esLogo ? (
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border bg-muted/40">
                <PreviewRecurso
                  tipo="logo"
                  alt={t("ajustes.branding.logoActual")}
                  clase="h-full w-full object-contain p-2"
                />
              </div>
            ) : (
              <div className="flex items-end">
                <div className="flex max-w-44 items-center gap-2 rounded-t-lg border border-b-0 bg-muted/60 px-3 py-1.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-sm">
                    <PreviewRecurso
                      tipo="favicon"
                      alt={t("ajustes.branding.faviconActual")}
                      clase="h-6 w-6 object-contain"
                    />
                  </div>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {t("app.nombre")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t pt-4">
          <input
            ref={inputRef}
            type="file"
            accept={limites.acepta}
            className="hidden"
            onChange={(e) => alElegirArchivo(e.target.files?.[0])}
          />
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={subir.isPending || cargando}
            className="gap-2"
          >
            {subir.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="h-4 w-4" aria-hidden />
            )}
            {subir.isPending
              ? t("ajustes.branding.subiendo")
              : t(esLogo ? "ajustes.branding.subirLogo" : "ajustes.branding.subirFavicon")}
          </Button>
          {estado?.personalizado && (
            <Button
              variant="outline"
              onClick={alRestaurar}
              disabled={restaurar.isPending || cargando}
              className="gap-2"
            >
              {restaurar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden />
              )}
              {restaurar.isPending
                ? t("ajustes.branding.restaurando")
                : t("ajustes.branding.restaurarDefault")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// SECCIÓN PRINCIPAL: IDENTIDAD VISUAL
// ============================================================
export function SeccionBranding() {
  const { t } = useIdioma();
  const { data, isLoading } = useBranding();

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("ajustes.branding.titulo")}
        descripcion={t("ajustes.branding.descripcion")}
        icono={<ImageIcon className="h-5 w-5" aria-hidden />}
      />

      {/* Nota de aplicación inmediata */}
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p>{t("ajustes.branding.aplicacionInmediata")}</p>
      </div>

      {isLoading || !data ? (
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <TarjetaBranding tipo="logo" estado={data.branding.logo} cargando={isLoading} />
          <TarjetaBranding tipo="favicon" estado={data.branding.favicon} cargando={isLoading} />
        </div>
      )}
    </div>
  );
}
