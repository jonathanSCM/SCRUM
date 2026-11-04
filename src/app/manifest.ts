import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SCRUM ProShop",
    short_name: "SCRUM",
    description: "Backlog, sprints y tablero para los proyectos de ProShop",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#6d28d9",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
