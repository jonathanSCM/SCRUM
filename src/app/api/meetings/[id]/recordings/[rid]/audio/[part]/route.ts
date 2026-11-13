import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/session";
import { errorResponse } from "@/lib/api";
import { canViewRecordings } from "@/lib/recordings";

const safeName = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "reunion";

// Una parte del audio de la reunión, para escucharla en el navegador (con Range, para poder adelantar) o descargarla (?download=1).
// Solo la reciben quienes pueden ver las transcripciones de esa reunión (invitados, quien agendó, quien grabó y líderes).
export async function GET(req: Request, { params }: { params: Promise<{ id: string; rid: string; part: string }> }) {
  const { id, rid, part: partParam } = await params;
  const auth = await apiUser({ meeting: id });
  if ("error" in auth) return auth.error;
  const partNo = Number(partParam);
  if (!Number.isInteger(partNo) || partNo < 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  try {
    const meeting = await prisma.meeting.findUnique({ where: { id }, select: { id: true, workspaceId: true, everyone: true, createdById: true, title: true } });
    const rec = await prisma.meetingRecording.findFirst({ where: { id: rid, meetingId: id }, select: { id: true, recordedById: true, title: true, startedAt: true, createdAt: true } });
    if (!meeting || !rec || !(await canViewRecordings(auth.user, meeting, rec))) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const part = await prisma.audioPart.findUnique({ where: { recordingId_part: { recordingId: rid, part: partNo } }, select: { data: true, mimeType: true, size: true } });
    if (!part?.data) return NextResponse.json({ error: "Este audio ya no está disponible" }, { status: 404 });
    const bytes = new Uint8Array(part.data);
    const total = bytes.byteLength;
    const url = new URL(req.url);
    const download = url.searchParams.get("download") === "1";
    const day = (rec.startedAt ?? rec.createdAt).toISOString().slice(0, 10);
    const headers: Record<string, string> = {
      "Content-Type": part.mimeType || "audio/webm",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(`${safeName(rec.title || meeting.title)}-${day}-parte-${partNo}.webm`)}`,
    };
    const m = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
    if (m && !download && (m[1] || m[2])) {
      let start = m[1] ? Number(m[1]) : Math.max(0, total - Number(m[2]));
      let end = m[1] && m[2] ? Number(m[2]) : total - 1;
      end = Math.min(end, total - 1);
      if (start > end || start >= total) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
      start = Math.max(0, start);
      return new NextResponse(bytes.slice(start, end + 1) as Uint8Array<ArrayBuffer>, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(end - start + 1) } });
    }
    return new NextResponse(bytes as Uint8Array<ArrayBuffer>, { headers: { ...headers, "Content-Length": String(total) } });
  } catch (e) {
    return errorResponse(e);
  }
}
