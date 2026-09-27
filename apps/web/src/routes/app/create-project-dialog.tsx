import {
  CSR_CATEGORY_SUGGESTIONS,
  projectInput,
  projectSummarySchema,
  SDG_GOALS,
  SDG_INFO,
} from '@pramaan/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { api } from '@/lib/api';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function CreateProjectDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus /> New project
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Evidence is checked against the project’s dates, so set them as they really are.
          </DialogDescription>
        </DialogHeader>
        {open && <CreateProjectForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateProjectForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [sdgGoals, setSdgGoals] = useState<number[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const listId = useId();

  const create = useMutation({
    mutationFn: (input: unknown) => api.post('/projects', input, projectSummarySchema),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success(`Created “${project.name}”`);
      onDone();
    },
    onError: (err) => {
      const { fields, message } = describeError(err);
      setErrors(fields);
      setMessage(message);
    },
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();
    const values = {
      name: text('name'),
      description: text('description'),
      startDate: text('startDate'),
      endDate: text('endDate') || null,
      csrCategory: text('csrCategory') || null,
      sdgGoals,
    };
    const result = validate(projectInput, values);
    setErrors(result.errors ?? {});
    setMessage(null);
    if (result.data) create.mutate(result.data);
  }

  const toggleGoal = (goal: number) =>
    setSdgGoals((goals) =>
      goals.includes(goal) ? goals.filter((g) => g !== goal) : [...goals, goal],
    );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormError message={message} />
      <Field label="Project name" error={errors.name}>
        {(p) => <Input {...p} name="name" placeholder="e.g. Borewell Project – Phase 2" />}
      </Field>
      <Field
        label="Description"
        hint="Optional. Shown to funders on share pages."
        error={errors.description}
      >
        {(p) => <Textarea {...p} name="description" rows={3} />}
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Start date" error={errors.startDate}>
          {(p) => <Input {...p} name="startDate" type="date" />}
        </Field>
        <Field label="End date" hint="Leave empty if ongoing." error={errors.endDate}>
          {(p) => <Input {...p} name="endDate" type="date" />}
        </Field>
      </div>
      <Field
        label="CSR category"
        hint="Optional. Pick a suggestion or type your own."
        error={errors.csrCategory}
      >
        {(p) => (
          <>
            <Input {...p} name="csrCategory" list={listId} autoComplete="off" />
            <datalist id={listId}>
              {CSR_CATEGORY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      <fieldset className="grid gap-3">
        <legend className="mb-3 text-sm font-medium">SDG goals this project contributes to</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SDG_GOALS.map((goal) => {
            const info = SDG_INFO[goal]!;
            const selected = sdgGoals.includes(goal);
            return (
              <button
                key={goal}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleGoal(goal)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-xs transition-colors duration-150',
                  selected ? 'border-primary bg-verified-soft' : 'hover:bg-accent',
                )}
              >
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-md text-[11px] font-semibold text-white"
                  style={{ backgroundColor: info.color }}
                >
                  {goal}
                </span>
                <span className="line-clamp-2 leading-tight">{info.name}</span>
              </button>
            );
          })}
        </div>
        {errors.sdgGoals && <p className="text-sm text-destructive">{errors.sdgGoals}</p>}
      </fieldset>

      <DialogFooter>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Create project
        </Button>
      </DialogFooter>
    </form>
  );
}
