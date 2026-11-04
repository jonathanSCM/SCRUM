import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Providers from "./providers";

// Fuentes empaquetadas en el proyecto (@fontsource): el build no depende de Google Fonts.
const display = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/archivo/files/archivo-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/archivo/files/archivo-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/archivo/files/archivo-latin-800-normal.woff2", weight: "800", style: "normal" },
    { path: "../../node_modules/@fontsource/archivo/files/archivo-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
});

const body = localFont({
  variable: "--font-body",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "../../node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2", weight: "800", style: "normal" },
  ],
});

const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  applicationName: "SCRUM ProShop",
  appleWebApp: { capable: true, title: "SCRUM ProShop", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  title: { default: "SCRUM ProShop", template: "%s · SCRUM ProShop" },
  description: "Backlog, sprints y tablero para los proyectos de ProShop",
};

export const viewport: Viewport = {
  themeColor: "#6d28d9",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
