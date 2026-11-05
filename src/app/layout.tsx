/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * generateMetadata: el favicon lo sirve la ruta dinámica
 * /api/branding/favicon (personalizado si existe; predeterminado en
 * otro caso). Como el contenido lo resuelve la API en cada petición,
 * cambiar el favicon desde Ajustes no requiere recompilar: el
 * <link rel="icon" href="/api/branding/favicon" /> es estable y la
 * caché del navegador se refresca en ≤ 1 h (max-age=3600).
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "CIG-MANUFACTURING — Sistema de Gestión de Fábrica | Factory Management System",
    description:
      "Control y gestión de almacén: inventario, entradas, salidas, traslados, recepción de materia prima e historial de movimientos. Bilingüe ES/EN. | Warehouse management: inventory, inbound, outbound, transfers, raw material reception and movement history. Bilingual ES/EN.",
    keywords: [
      "gestión de fábrica",
      "almacén",
      "inventario",
      "WMS",
      "warehouse management",
      "inventory",
      "factory system",
    ],
    icons: {
      icon: "/api/branding/favicon",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f59e0b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
