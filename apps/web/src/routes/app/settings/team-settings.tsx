import {
  inviteInput,
  inviteResponse,
  teamMemberSchema,
  USER_ROLES,
  type TeamMember,
  type UserRole,
} from '@pramaan/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, UserPlus, UserX } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Field, FormError } from '@/components/field';
import { Badge } from '@/components/ui/badge';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { queryKeys, teamQuery } from '@/lib/queries';

const ROLE_INFO: Record<UserRole, { label: string; body: string }> = {
  admin: { label: 'Admin', body: 'Everything, including settings, review and the team' },
  field: { label: 'Field staff', body: 'Upload evidence and view projects' },
  viewer: { label: 'Viewer', body: 'View projects, evidence and reports' },
};

export function TeamSettings({ currentUserId }: { currentUserId: string }) {
  const { data: members, isPending, error } = useQuery(teamQuery);

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold tracking-tight">Team</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Invite field staff to upload, and viewers to follow along.
          </p>
        </div>
        <InviteDialog />
      </div>
      <div className="mt-6">
        {isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : error ? (
          <FormError message={`Couldn’t load the team: ${error.message}`} />
        ) : (
          <ul className="divide-y">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} isMe={m.id === currentUserId} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MemberRow({ member, isMe }: { member: TeamMember; isMe: boolean }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.team });

  const changeRole = useMutation({
    mutationFn: (role: UserRole) => api.put(`/users/${member.id}/role`, { role }, teamMemberSchema),
    onSuccess: (m) => {
      void refresh();
      if (isMe) void queryClient.invalidateQueries({ queryKey: queryKeys.session });
      toast.success(`${m.name} is now ${ROLE_INFO[m.role].label.toLowerCase()}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/users/${member.id}`),
    onSuccess: () => {
      void refresh();
      toast.success(`Removed ${member.name}`);
      setConfirming(false);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-medium">
          <span className="truncate">{member.name}</span>
          {isMe && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
          {member.status === 'invited' && <Badge variant="review">Invited</Badge>}
        </p>
        <p className="truncate text-sm text-muted-foreground">{member.email}</p>
      </div>
      <div className="flex items-center gap-2">
        <Select
          value={member.role}
          onValueChange={(v) => changeRole.mutate(v as UserRole)}
          disabled={changeRole.isPending}
        >
          <SelectTrigger className="w-40" aria-label={`Role for ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {USER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_INFO[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isMe && (
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            trigger={
              <Button variant="ghost" size="icon" aria-label={`Remove ${member.name}`}>
                <UserX />
              </Button>
            }
            title={`Remove ${member.name}?`}
            description="They’ll be signed out and can’t sign in again. Their past uploads and review decisions stay on record."
            confirmLabel="Remove"
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        )}
      </div>
    </li>
  );
}

function InviteDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            You’ll get a one-time link to send them. It expires in 7 days.
          </DialogDescription>
        </DialogHeader>
        {open && <InviteForm />}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<UserRole>('field');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const roleId = useId();

  const invite = useMutation({
    mutationFn: (input: unknown) => api.post('/users/invite', input, inviteResponse),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.team });
      setLink(res.inviteUrl);
    },
    onError: (err) => {
      const { fields, message } = describeError(err);
      setErrors(fields);
      setMessage(message);
    },
  });

  if (link) {
    return (
      <div className="grid gap-4">
        <p className="text-sm">Send this link to your teammate. It only works once.</p>
        <div className="flex gap-2">
          <Input
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.target.select()}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Copy invite link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopied(true);
              } catch {
                toast.error('Couldn’t copy. Select the link and copy it manually.');
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      </div>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    const result = validate(inviteInput, { ...form, role });
    setErrors(result.errors ?? {});
    setMessage(null);
    if (result.data) invite.mutate(result.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormError message={message} />
      <Field label="Name" error={errors.name}>
        {(p) => <Input {...p} name="name" autoComplete="off" />}
      </Field>
      <Field label="Email" error={errors.email}>
        {(p) => <Input {...p} name="email" type="email" autoComplete="off" />}
      </Field>
      <div className="grid gap-2">
        <Label htmlFor={roleId}>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
          <SelectTrigger id={roleId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {USER_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_INFO[r].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{ROLE_INFO[role].body}</p>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={invite.isPending}>
          {invite.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Create invite link
        </Button>
      </DialogFooter>
    </form>
  );
}
