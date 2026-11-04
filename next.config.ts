import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit lee sus fuentes (.afm) del disco: no se empaqueta.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
