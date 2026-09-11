type Doc = {
  id: string;
  filename: string;
  docType: string;
  uploadedAt: Date | string;
};

export default function DocumentsTab({ documents }: { documents: Doc[] }) {
  if (documents.length === 0) {
    return (
      <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
        Todavía no se subió ningún documento para este proyecto.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {documents.map((doc) => (
        <li
          key={doc.id}
          className="border border-line bg-card p-3.5 rounded-xl2 backdrop-blur-md shadow-[0_20px_45px_-20px_rgba(0,0,0,0.7)]"
        >
          <p className="text-sm font-semibold text-ink">{doc.filename}</p>
          <p className="text-xs text-ink-faint">
            {doc.docType === "ACTA_REUNION" ? "Acta / transcripción de reunión" : "Resumen de proyecto"} ·{" "}
            {new Date(doc.uploadedAt).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
