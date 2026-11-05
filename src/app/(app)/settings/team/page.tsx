import { redirect } from "next/navigation";

// Equipo y Personas ahora son una sola página.
export default function TeamRedirect() {
  redirect("/people");
}
