import type { AssetDetail, Site } from '@pramaan/shared';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, CheckCircle2, CircleAlert, ImageUp, RotateCw, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { BandBadge } from '@/components/band-badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { queryKeys } from '@/lib/queries';
import { uploadEvidence, type UploadStage } from '@/lib/upload';
import { cn } from '@/lib/utils';

/** Files uploaded at once; the rest wait their turn. */
const CONCURRENCY = 3;
const AUTO_SITE = 'auto';

interface Item {
  id: string;
  file: File;
  /** The site chosen when the file was added (null: match from GPS). */
  siteId: string | null;
  stage: UploadStage | 'queued' | 'done' | 'error';
  progress: number;
  asset?: AssetDetail;
  error?: string;
}

const STAGE_LABEL: Record<Item['stage'], string> = {
  queued: 'Waiting…',
  signing: 'Preparing…',
  uploading: 'Uploading',
  verifying: 'Verifying…',
  done: 'Verified',
  error: 'Failed',
};

const formatBytes = (n: number) =>
  n < 1_000_000 ? `${Math.round(n / 1000)} KB` : `${(n / 1_000_000).toFixed(1)} MB`;

export function Uploader({ projectId, sites }: { projectId: string; sites: Site[] }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [siteId, setSiteId] = useState(AUTO_SITE);
  const [dragging, setDragging] = useState(false);
  const running = useRef(0);
  const queue = useRef<Item[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const siteLabelId = useId();

  const update = (id: string, patch: Partial<Item>) =>
    setItems((all) => all.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  async function process(item: Item) {
    try {
      const asset = await uploadEvidence(
        item.file,
        { projectId, siteId: item.siteId },
        {
          stage: (stage) => update(item.id, { stage }),
          progress: (progress) => update(item.id, { progress }),
        },
      );
      update(item.id, { stage: 'done', progress: 1, asset });
      // Duplicates can re-score evidence in other projects too, so refresh them all.
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    } catch (err) {
      update(item.id, { stage: 'error', error: (err as Error).message });
    }
  }

  /** Up to CONCURRENCY workers, each taking files off the queue until it's empty. */
  function pump() {
    while (running.current < CONCURRENCY && queue.current.length > 0) {
      running.current++;
      void (async () => {
        try {
          for (let item = queue.current.shift(); item; item = queue.current.shift()) {
            await process(item);
          }
        } finally {
          running.current--;
        }
      })();
    }
  }

  function enqueue(files: FileList | File[]) {
    const added = [...files]
      .filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'))
      .map((file) => ({
        id: crypto.randomUUID(),
        file,
        siteId: siteId === AUTO_SITE ? null : siteId,
        stage: 'queued' as const,
        progress: 0,
      }));
    setItems((all) => [...added, ...all]);
    queue.current.push(...added);
    pump();
  }

  function retry(item: Item) {
    const again = { ...item, stage: 'queued' as const, progress: 0, error: undefined };
    update(item.id, again);
    queue.current.push(again);
    pump();
  }

  const finished = items.filter((i) => i.stage === 'done' || i.stage === 'error');

  return (
    <section aria-label="Upload evidence" className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          enqueue(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed bg-card/60 px-6 py-8 text-center transition-colors duration-150',
          dragging && 'border-primary bg-verified-soft/60',
        )}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-verified-soft text-verified">
          <ImageUp className="size-6" aria-hidden />
        </span>
        <div>
          <p className="font-medium">Drop photos or videos here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Each file is checked for copies, location and date as soon as it lands.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => cameraInput.current?.click()} className="sm:hidden">
            <Camera /> Take a photo
          </Button>
          <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
            <ImageUp /> Choose files
          </Button>
        </div>
        <div className="grid w-full max-w-xs gap-1.5 text-left">
          <Label id={siteLabelId}>Site</Label>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger aria-labelledby={siteLabelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_SITE}>Match from each photo’s GPS</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) enqueue(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            if (e.target.files) enqueue(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="rounded-2xl border bg-card shadow-soft">
          <div className="flex items-center justify-between border-b px-4 py-3 text-sm">
            <span className="font-medium" aria-live="polite">
              {finished.length} of {items.length} processed
            </span>
            {finished.length === items.length && (
              <Button variant="ghost" size="sm" onClick={() => setItems([])}>
                <X /> Clear
              </Button>
            )}
          </div>
          <ul className="max-h-80 divide-y overflow-y-auto">
            <AnimatePresence initial={false}>
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <UploadRow item={item} onRetry={() => retry(item)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </section>
  );
}

function UploadRow({ item, onRetry }: { item: Item; onRetry: () => void }) {
  const active = item.stage !== 'done' && item.stage !== 'error';
  return (
    <>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">{item.file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatBytes(item.file.size)}
          </span>
        </p>
        {active ? (
          <div className="flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={`Uploading ${item.file.name}`}
              aria-valuenow={Math.round(item.progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  'h-full rounded-full bg-primary transition-[width] duration-150',
                  item.stage === 'verifying' && 'animate-pulse',
                )}
                style={{
                  width: `${Math.max(item.progress, item.stage === 'verifying' ? 1 : 0.02) * 100}%`,
                }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
              {STAGE_LABEL[item.stage]}
              {item.stage === 'uploading' && ` ${Math.round(item.progress * 100)}%`}
            </span>
          </div>
        ) : item.stage === 'error' ? (
          <p className="flex items-center gap-1.5 text-xs text-flagged">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden /> {item.error}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 shrink-0 text-verified" aria-hidden />
            {item.asset?.siteName ? `Matched to ${item.asset.siteName}` : 'No site matched'}
          </p>
        )}
      </div>
      {item.stage === 'done' && item.asset && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18 }}
          className="flex shrink-0 items-center gap-2"
        >
          <span
            className="text-lg font-semibold tabular"
            aria-label={`Trust score ${item.asset.trustScore}`}
          >
            {item.asset.trustScore}
          </span>
          <BandBadge band={item.asset.trustBand} />
        </motion.div>
      )}
      {item.stage === 'error' && (
        <Button variant="ghost" size="sm" onClick={onRetry}>
          <RotateCw /> Retry
        </Button>
      )}
    </>
  );
}
