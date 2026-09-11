import TaskRow from "@/components/TaskRow";
import { DONE_TYPE } from "@/lib/taskLabels";

type Task = {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  dueDate: Date | string | null;
  assigneeName: string | null;
  moduleName: string | null;
  sprintId: string | null;
};

type Sprint = { id: string; name: string };

function splitDone(tasks: Task[]) {
  return {
    pending: tasks.filter((t) => t.type !== DONE_TYPE),
    done: tasks.filter((t) => t.type === DONE_TYPE),
  };
}

function TaskGroupList({ tasks, sprints }: { tasks: Task[]; sprints: Sprint[] }) {
  const { pending, done } = splitDone(tasks);
  return (
    <>
      <ul className="space-y-2.5">
        {pending.map((task) => (
          <TaskRow key={task.id} task={task} sprints={sprints} />
        ))}
      </ul>
      {done.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Completadas ({done.length})
          </h4>
          <ul className="space-y-2.5">
            {done.map((task) => (
              <TaskRow key={task.id} task={task} sprints={sprints} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export default function TasksTab({ tasks, sprints }: { tasks: Task[]; sprints: Sprint[] }) {
  if (tasks.length === 0) {
    return (
      <p className="border border-dashed border-line-strong rounded-xl2 p-6 text-center text-sm text-ink-soft">
        Todavía no hay tareas sincronizadas para este proyecto.
      </p>
    );
  }

  const bySprint = new Map<string, Task[]>();
  const withoutSprint: Task[] = [];
  for (const task of tasks) {
    if (task.sprintId) {
      const list = bySprint.get(task.sprintId) ?? [];
      list.push(task);
      bySprint.set(task.sprintId, list);
    } else {
      withoutSprint.push(task);
    }
  }

  const groups = sprints
    .map((sprint) => ({ sprint, tasks: bySprint.get(sprint.id) ?? [] }))
    .filter((g) => g.tasks.length > 0);

  return (
    <div className="space-y-6">
      {groups.map(({ sprint, tasks: sprintTasks }) => (
        <div key={sprint.id}>
          <h3 className="mb-2 font-display text-sm font-semibold text-ink">{sprint.name}</h3>
          <TaskGroupList tasks={sprintTasks} sprints={sprints} />
        </div>
      ))}

      {withoutSprint.length > 0 && (
        <div>
          {groups.length > 0 && <h3 className="mb-2 font-display text-sm font-semibold text-ink-soft">Sin sprint</h3>}
          <TaskGroupList tasks={withoutSprint} sprints={sprints} />
        </div>
      )}
    </div>
  );
}
