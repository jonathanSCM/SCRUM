"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Sprint = { id: string; name: string };

export default function TaskSprintSelect({
  taskId,
  currentSprintId,
  sprints,
}: {
  taskId: string;
  currentSprintId: string | null;
  sprints: Sprint[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(sprintId: string) {
    setBusy(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprintId: sprintId || null }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <select
      value={currentSprintId ?? ""}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      className="field !w-auto py-1 text-xs"
      title="Asignar a sprint"
    >
      <option value="">Sin sprint</option>
      {sprints.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
