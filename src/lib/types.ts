// Tipos de datos que viajan del servidor al navegador (sin dependencias de
// Prisma, para poder importarlos desde componentes de cliente).

import type { IssueStatus, IssueType, Priority, SprintState } from "@/lib/scrum/constants";

export type UserRef = { id: string; name: string };

export type EpicRef = { id: string; key: string; title: string; color: string | null };

export type IssueCardData = {
  id: string;
  key: string;
  number: number | null;
  projectId: string;
  title: string;
  description: string;
  issueType: IssueType;
  status: IssueStatus;
  priority: Priority;
  storyPoints: number | null;
  labels: string[];
  rank: number;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  sprintId: string | null;
  assignee: UserRef | null;
  epic: EpicRef | null;
  epicColor: string | null; // color propio si el ticket ES una épica
  commentCount: number;
  attachmentCount: number;
};

export type SprintData = {
  id: string;
  name: string;
  goal: string;
  state: SprintState;
  startDate: string | null;
  endDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  committedPoints: number;
  completedPoints: number;
  committedCount: number;
  completedCount: number;
};

export type ProjectOptions = {
  members: UserRef[];
  epics: EpicRef[];
  sprints: Array<{ id: string; name: string; state: SprintState }>;
};
