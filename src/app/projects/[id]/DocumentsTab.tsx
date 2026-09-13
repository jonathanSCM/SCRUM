"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Doc = {
  id: string;
  filename: string;
  docType: string;
  uploadedAt: Date | string;
};

export default function DocumentsTab({ projectId, documents }: { projectId: string; documents: Doc[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<"RESUMEN_PROYECTO" | "ACTA_REUNION">("RESUMEN_PROYECTO");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", docType);

    const res = await fetch(`/api/projects/${projectId}/documents`, { method: "POST", body: formData });

    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "No se pudo subir el documento");
      return;
    }

    setFile(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleUpload} className="border border-line bg-card p-4 rounded-xl2 shadow-[6px_6px_0_var(--moss)] space-y-3">
        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-2 text-ink-soft">
            <input
              type="radio"
              checked={docType === "RESUMEN_PROYECTO"}
              onChange={() => setDocType("RESUMEN_PROYECTO")}
              className="accent-moss"
            />
            Resumen / spec del proyecto
          </label>
          <label className="flex items-center gap-2 text-ink-soft">
            <input
              type="radio"
              checked={docType === "ACTA_REUNION"}
              onChange={() => setDocType("ACTA_REUNION")}
              className="accent-moss"
            />
            Acta / transcripción de reunión
          </label>
        </div>

        <input
          type="file"
          accept=".pdf,.md,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-ink-soft file:mr-3 file:border-2 file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-ink file:font-semibold"
        />

        <button type="submit" disabled={!file || uploading} className="btn-primary">
          {uploading ? "Subiendo..." : "Subir documento"}
        </button>

        {error && <p className="text-sm font-medium text-danger">{error}</p>}
      </form>

      {documents.length === 0 ? (
        <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
          Todavía no se subió ningún documento para este proyecto.
        </p>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="border border-line bg-card p-3.5 rounded-xl2 shadow-[6px_6px_0_var(--moss)]"
            >
              <p className="text-sm font-semibold text-ink">{doc.filename}</p>
              <p className="text-xs text-ink-faint">
                {doc.docType === "ACTA_REUNION" ? "Acta / transcripción de reunión" : "Resumen de proyecto"} ·{" "}
                {new Date(doc.uploadedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
