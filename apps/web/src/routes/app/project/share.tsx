import { SHARE_LINK_DAYS, shareLinkSchema, type ShareLink } from '@pramaan/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Link2, Loader2, Lock, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
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
import { formatIsoDate, relativeTime } from '@/lib/format';
import { queryKeys, shareLinksQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useProject } from './project-layout';

const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;

export function ProjectShare() {
  const { project, isAdmin } = useProject();
  if (!isAdmin) {
    return (
      <EmptyState icon={Lock} title="Only admins manage funder links">
        Ask an admin in your organisation for a link to share this project.
      </EmptyState>
    );
  }
  return <ShareLinks projectId={project.id} />;
}

function ShareLinks({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const links = useQuery(shareLinksQuery(projectId));
  const [days, setDays] = useState<string>('30');
  const selectId = useId();
  const create = useMutation({
    mutationFn: () =>
      api.post(
        `/projects/${projectId}/share-links`,
        { expiresInDays: Number(days) },
        shareLinkSchema,
      ),
    onSuccess: async (link) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.shareLinks(projectId) });
      const copied = await navigator.clipboard
        ?.writeText(shareUrl(link.token))
        .then(() => true)
        .catch(() => false);
      toast.success(copied ? 'Link created and copied' : 'Link created');
    },
    onError: (err) => toast.error(`Couldn’t create the link: ${err.message}`),
  });

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
        <div className="space-y-1">
          <h2 className="font-semibold tracking-tight">Funder links</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A funder link opens a read-only page with this project’s verified evidence, map, metrics
            and reports. No sign-in is needed, nothing can be changed through it, and it stops
            working when it expires or you revoke it.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label id={selectId}>Expires after</Label>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger aria-labelledby={selectId} className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHARE_LINK_DAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Link2 />} Create link
          </Button>
        </div>
      </section>

      {links.isPending ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : links.error ? (
        <FormError message={`Couldn’t load links: ${links.error.message}`} />
      ) : links.data.length === 0 ? (
        <EmptyState icon={Link2} title="No funder links yet">
          Create a link above to give a funder or CSR partner a read-only view of this project.
        </EmptyState>
      ) : (
        <ul className="grid gap-3" aria-label="Funder links">
          {links.data.map((link) => (
            <li key={link.id}>
              <ShareLinkRow link={link} projectId={projectId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ShareLinkRow({ link, projectId }: { link: ShareLink; projectId: string }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const url = shareUrl(link.token);
  const revoke = useMutation({
    mutationFn: () => api.delete(`/share-links/${link.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.shareLinks(projectId) });
      toast.success('Link revoked');
      setConfirmOpen(false);
    },
    onError: (err) => toast.error(`Couldn’t revoke the link: ${err.message}`),
  });

  return (
    <article
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft',
        link.expired && 'opacity-70',
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-mono text-sm" title={url}>
          {url}
        </p>
        <p className="text-xs text-muted-foreground">
          {link.expired ? (
            <span className="font-medium text-flagged">
              Expired {formatIsoDate(link.expiresAt.slice(0, 10))}
            </span>
          ) : (
            <>Expires {formatIsoDate(link.expiresAt.slice(0, 10))}</>
          )}
          {' · '}created {relativeTime(link.createdAt)}
          {link.createdBy ? ` by ${link.createdBy}` : ''}
        </p>
      </div>
      <div className="flex gap-1">
        {!link.expired && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard?.writeText(url).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink /> Open
              </a>
            </Button>
          </>
        )}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          trigger={
            <Button variant="ghost" size="sm" aria-label="Revoke link">
              <Trash2 />
              <span className="hidden sm:inline">{link.expired ? 'Remove' : 'Revoke'}</span>
            </Button>
          }
          title={link.expired ? 'Remove this expired link?' : 'Revoke this link?'}
          description="Anyone who opens it will see that it no longer works. You can create a new link at any time."
          confirmLabel={link.expired ? 'Remove link' : 'Revoke link'}
          pending={revoke.isPending}
          onConfirm={() => revoke.mutate()}
        />
      </div>
    </article>
  );
}
