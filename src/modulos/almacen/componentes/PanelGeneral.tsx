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
 * PANEL GENERAL — Resumen ejecutivo del área de almacén
 * KPIs, gráfica de actividad, distribución por almacén,
 * alertas de stock mínimo y movimientos recientes.
 */
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Boxes,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormateadores, useIdioma } from "@/modulos/compartidos/idioma";
import {
  CargandoKpis,
  EncabezadoSeccion,
  EstadoVacio,
  Kpi,
} from "@/modulos/compartidos/ui";
import { useEstadisticas } from "../servicios/consultas";
import { InsigniaProductoEliminado, InsigniaTipoMovimiento } from "./compartidos";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const COLORES_DONA = ["#f59e0b", "#10b981", "#0d9488", "#8b5cf6", "#f97316", "#64748b"];

export function PanelGeneral() {
  const { t } = useIdioma();
  const f = useFormateadores();
  const { data, isLoading, isFetching, refetch } = useEstadisticas();

  return (
    <div className="space-y-5">
      <EncabezadoSeccion
        titulo={t("panel.titulo")}
        descripcion={t("nav.descripcionPanel")}
        icono={<LayoutDashboard className="h-5 w-5" />}
        acciones={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="min-h-9"
          >
            <RefreshCw className={isFetching ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            {t("comun.actualizar")}
          </Button>
        }
      />

      {/* ===== KPIs ===== */}
      {isLoading || !data ? (
        <CargandoKpis />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Kpi
            titulo={t("panel.kpiProductos")}
            valor={f.entero(data.productosActivos)}
            icono={<Package className="h-5 w-5" />}
            tono="primario"
          />
          <Kpi
            titulo={t("panel.kpiAlmacenes")}
            valor={f.entero(data.almacenesActivos)}
            icono={<Warehouse className="h-5 w-5" />}
            tono="neutro"
          />
          <Kpi
            titulo={t("panel.kpiStockTotal")}
            valor={f.entero(data.unidadesStock)}
            icono={<Boxes className="h-5 w-5" />}
            tono="exito"
            tendencia={`${t("panel.kpiMovimientos")}: ${data.movimientos7Dias}`}
          />
          <Kpi
            titulo={t("panel.kpiValor")}
            valor={f.moneda(data.valorInventario)}
            icono={<DollarSign className="h-5 w-5" />}
            tono="exito"
          />
        </div>
      )}

      {/* ===== Gráficas ===== */}
      {data && (
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Actividad */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                {t("panel.graficaActividad")}
              </CardTitle>
              <CardDescription>{t("panel.graficaActividadSub")}</CardDescription>
            </CardHeader>
            <CardContent className="h-64 px-2 sm:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.serieActividad} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    width={28}
                  />
                  <RechartsTooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                    contentStyle={{
                      borderRadius: "0.5rem",
                      border: "1px solid hsl(var(--border))",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="entradas"
                    name={t("panel.entradas")}
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                  />
                  <Bar
                    dataKey="salidas"
                    name={t("panel.salidas")}
                    fill="#f59e0b"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-1 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
                  {t("panel.entradas")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  {t("panel.salidas")}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Distribución */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("panel.graficaAlmacenes")}</CardTitle>
              <CardDescription>{t("panel.graficaAlmacenesSub")}</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {data.distribucionAlmacenes.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t("comun.sinDatos")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.distribucionAlmacenes}
                      dataKey="valor"
                      nameKey="codigo"
                      innerRadius="55%"
                      outerRadius="80%"
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {data.distribucionAlmacenes.map((_, i) => (
                        <Cell key={i} fill={COLORES_DONA[i % COLORES_DONA.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(valor: number, nombre: string) => [
                        f.moneda(valor),
                        data.distribucionAlmacenes.find((d) => d.codigo === nombre)?.nombre ?? nombre,
                      ]}
                      contentStyle={{
                        borderRadius: "0.5rem",
                        border: "1px solid hsl(var(--border))",
                        fontSize: "12px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ===== Stock bajo + movimientos recientes ===== */}
      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Alertas */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {t("panel.stockBajo")}
              </CardTitle>
              <CardDescription>{t("panel.stockBajoSub")}</CardDescription>
            </CardHeader>
            <CardContent>
              {data.stockBajo.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  <Boxes className="h-4 w-4 text-emerald-500" />
                  {t("panel.sinAlertas")}
                </div>
              ) : (
                <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
                  {data.stockBajo.map((p) => {
                    const ratio = Math.min(100, Math.round((p.stockTotal / Math.max(p.stockMinimo, 1)) * 100));
                    return (
                      <li key={p.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-medium">
                            <span className="text-muted-foreground">{p.sku}</span> — {p.nombre}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {f.numero(p.stockTotal, 1)} / {f.numero(p.stockMinimo, 1)}{" "}
                            {p.unidad}
                          </span>
                        </div>
                        <Progress
                          value={ratio}
                          className={
                            ratio < 50
                              ? "h-2 [&>div]:bg-red-500"
                              : ratio < 100
                                ? "h-2 [&>div]:bg-orange-500"
                                : "h-2 [&>div]:bg-amber-500"
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Movimientos recientes */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t("panel.movimientosRecientes")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.movimientosRecientes.length === 0 ? (
                <EstadoVacio titulo={t("comun.sinDatos")} />
              ) : (
                <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {data.movimientosRecientes.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <InsigniaTipoMovimiento tipo={m.tipo} />
                          <span className="truncate text-sm font-medium">{m.productoNombre}</span>
                          {!m.productoExiste && <InsigniaProductoEliminado />}
                        </div>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.folio} · {f.fechaHora(m.createdAt)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums">
                          {f.numero(m.cantidad, 1)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            {m.productoUnidad}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {m.almacenDestinoCodigo ?? m.almacenOrigenCodigo}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
