import { redirect } from "next/navigation";

// Ruta vieja: el portafolio ahora vive en /projects.
export default function DashboardRedirect() {
  redirect("/projects");
}
