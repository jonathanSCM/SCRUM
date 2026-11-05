// Se muestra al instante al cambiar de pestaña del proyecto, para que se note que está cargando.
export default function ProjectTabLoading() {
  return (
    <div className="space-y-3 pt-2" aria-busy="true" aria-label="Cargando">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg border border-line bg-card" />
      ))}
    </div>
  );
}
