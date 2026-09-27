import { orgSchema, orgUpdateInput } from '@pramaan/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { queryKeys, settingsQuery } from '@/lib/queries';
import { TeamSettings } from './team-settings';
import { TrustSettings } from './trust-settings';

export function SettingsPage() {
  const { data: session } = useSession();
  const { data, isPending, error } = useQuery(settingsQuery);
  if (!session) return null;
  const isAdmin = session.user.role === 'admin';

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          How Trust Scores are worked out for {session.org.name}
          {isAdmin && ', and who can use Pramaan'}.
        </p>
      </header>

      {isAdmin && <OrgNameCard name={session.org.name} />}

      {isPending ? (
        <div className="space-y-6" aria-busy="true">
          <span className="sr-only">Loading settings…</span>
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      ) : error ? (
        <FormError message={`Couldn’t load settings: ${error.message}`} />
      ) : (
        // Re-mount when the saved settings change so the draft starts from them.
        <TrustSettings key={data.updatedAt} saved={data.settings} isAdmin={isAdmin} />
      )}

      {isAdmin && <TeamSettings currentUserId={session.user.id} />}
    </div>
  );
}

function OrgNameCard({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(name);
  const [errors, setErrors] = useState<FieldErrors>({});
  const save = useMutation({
    mutationFn: (input: unknown) => api.put('/org', input, orgSchema),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      toast.success('Organisation name saved');
    },
    onError: (err) => setErrors(describeError(err).fields),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = validate(orgUpdateInput, { name: value });
    setErrors(result.errors ?? {});
    if (result.data) save.mutate(result.data);
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-soft sm:flex-row sm:items-end"
    >
      <Field label="Organisation name" error={errors.name} className="flex-1">
        {(p) => <Input {...p} value={value} onChange={(e) => setValue(e.target.value)} />}
      </Field>
      <Button type="submit" variant="outline" disabled={save.isPending || value.trim() === name}>
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
        Save name
      </Button>
    </form>
  );
}
