export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-4 pt-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <div className="skeleton h-64 w-full" />
    </div>
  );
}
