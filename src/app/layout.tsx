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

export const metadata: Metadata = {
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
};

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
