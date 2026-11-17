import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit lee sus fuentes (.afm) del disco: no se empaqueta.
  serverExternalPackages: ["pdfkit"],
  // El chequeo de tipos se corre antes de subir el código (`npm run typecheck` y las pruebas). En la imagen de Docker
  // se salta (SKIP_TYPECHECK=1): en el servidor consumía mucha memoria y el build se llegó a matar sin dar ningún mensaje.
  typescript: { ignoreBuildErrors: process.env.SKIP_TYPECHECK === "1" },
};

export default nextConfig;
