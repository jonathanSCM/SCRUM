"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { useToast } from "@/components/ui/Toaster";
import type { ProjectOptions } from "@/lib/types";
import CreateIssueModal from "@/components/issue/CreateIssueModal";

type ProjectRef = { id: string; name: string; key: string | null };
const LAST_KEY = "create-issue-last-project";
export const OPEN_CREATE_EVENT = "open-create-issue";

// Crear un ticket desde cualquier pantalla (SCP-69): un solo clic en "Crear", se elige el proyecto
// (recuerda el último) y se escribe el título. Se abre también con el evento "open-create-issue".
export default function GlobalCreate({ projects, currentUserId }: { projects: ProjectRef[]; currentUserId: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [options, setOptions] = useState<ProjectOptions | null>(null);

  const load = useCallback(
    async (id: string) => {
      setOptions(null);
      const res = await api<ProjectOptions>(`/api/projects/${id}/options`);
      if (!res.ok) return toast.error(res.error);
      setOptions(res.data);
    },
    [toast]
  );

  const choose = useCallback(
    (id: string) => {
      setProjectId(id);
      try {
        localStorage.setItem(LAST_KEY, id);
      } catch {}
      void load(id);
    },
    [load]
  );

  useEffect(() => {
    const onOpen = () => {
      if (projects.length === 0) return toast.error("Primero crea un proyecto");
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST_KEY);
      } catch {}
      // Si ya estás dentro de un proyecto, se propone ese.
      const here = window.location.pathname.match(/^\/projects\/([^/]+)/)?.[1];
      const pick = [here, last].find((id) => id && projects.some((p) => p.id === id)) ?? projects[0].id;
      choose(pick);
      setOpen(true);
    };
    window.addEventListener(OPEN_CREATE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CREATE_EVENT, onOpen);
  }, [projects, choose, toast]);

  if (!open || !projectId || !options) return null;
  return <CreateIssueModal key={projectId} open onClose={() => setOpen(false)} projectId={projectId} options={options} currentUserId={currentUserId} projectPicker={{ projects, onChange: choose }} />;
}
