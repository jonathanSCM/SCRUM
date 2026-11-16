import { NextResponse } from "next/server";
import { apiUser } from "@/lib/session";
import { normalizeUrl } from "@/lib/scrum/resources";
import { isDriveUrl } from "@/lib/scrum/driveTitle";
import { fetchDriveTitle } from "@/lib/driveTitle";

// Nombre de un documento de Drive para rellenarlo solo al pegar el enlace (?url=…). { title: null } si no se pudo leer.
export async function GET(req: Request) {
  const auth = await apiUser({ workspace: true });
  if ("error" in auth) return auth.error;
  const url = normalizeUrl(new URL(req.url).searchParams.get("url") ?? "");
  if (!url || !isDriveUrl(url)) return NextResponse.json({ title: null });
  return NextResponse.json({ title: await fetchDriveTitle(url) }, { headers: { "Cache-Control": "private, max-age=300" } });
}
