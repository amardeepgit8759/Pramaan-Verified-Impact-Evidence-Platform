import {
  DEFAULT_ORG_SETTINGS,
  orgSettingsSchema,
  rescoreSummarySchema,
  saveSettingsResponse,
  type OrgSettings,
  type RescoreSummary,
  type TrustWeights,
} from '@pramaan/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, RotateCcw } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { api } from '@/lib/api';
import { BAND_META } from '@/lib/bands';
import { queryKeys } from '@/lib/queries';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';

const WEIGHTS: { key: keyof TrustWeights; label: string; hint: string }[] = [
  { key: 'exact_duplicate', label: 'Exact copy', hint: 'Same file used in another project' },
  { key: 'near_duplicate', label: 'Near-copy', hint: 'Resized, cropped or re-saved photo' },
  { key: 'wrong_location', label: 'Wrong location', hint: 'Outside the site radius' },
  {
    key: 'wrong_location_far',
    label: 'Far from site',
    hint: 'Beyond the “far away” multiple of the radius',
  },
  { key: 'wrong_time', label: 'Wrong date', hint: 'Captured outside the project dates' },
  { key: 'missing_metadata', label: 'Missing metadata', hint: 'No GPS or capture date' },
  { key: 'late_upload', label: 'Late upload', hint: 'Uploaded long after capture' },
];

type NumberKey = Exclude<keyof OrgSettings, 'weights'>;

const THRESHOLDS: { key: NumberKey; label: string; unit: string; hint: string; max: number }[] = [
  {
    key: 'phashThreshold',
    label: 'Near-copy sensitivity',
    unit: 'bits',
    hint: 'Max differing bits (of 64) between two photos to call them near-copies',
    max: 64,
  },
  {
    key: 'lateUploadDays',
    label: 'Late upload after',
    unit: 'days',
    hint: 'Time between capture and upload',
    max: 3650,
  },
  {
    key: 'gapDays',
    label: 'Documentation gap after',
    unit: 'days',
    hint: 'A site with no verified evidence for this long is flagged',
    max: 365,
  },
  {
    key: 'duplicateBurstDays',
    label: 'Retry window',
    unit: 'days',
    hint: 'Re-uploading the same file to the same project within this is not a duplicate',
    max: 365,
  },
  {
    key: 'farLocationMultiplier',
    label: '“Far away” at',
    unit: '× radius',
    hint: 'Beyond this multiple of the site radius, the heavier deduction applies',
    max: 1000,
  },
];

export function TrustSettings({ saved, isAdmin }: { saved: OrgSettings; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OrgSettings>(saved);
  const parsed = orgSettingsSchema.safeParse(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  // Ask the server what these settings would do, once the sliders settle.
  const debounced = useDebounced(draft, 400);
  const debouncedValid = orgSettingsSchema.safeParse(debounced);
  const preview = useQuery({
    queryKey: ['settings-preview', debounced],
    queryFn: ({ signal }) =>
      api.post('/settings/preview', debounced, rescoreSummarySchema, { signal }),
    // Compare the settled draft (not the live one) so a stale value is never previewed.
    enabled:
      isAdmin && debouncedValid.success && JSON.stringify(debounced) !== JSON.stringify(saved),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const save = useMutation({
    mutationFn: (next: OrgSettings) => api.put('/settings', next, saveSettingsResponse),
    onSuccess: (res) => {
      queryClient.setQueryData(queryKeys.settings, {
        settings: res.settings,
        updatedAt: res.updatedAt,
      });
      // Scores changed everywhere.
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      toast.success(
        res.rescored.bandChanged > 0
          ? `Saved. ${res.rescored.bandChanged} of ${res.rescored.total} assets changed band.`
          : 'Saved. No asset changed band.',
      );
    },
    onError: (err) => toast.error(`Couldn’t save settings: ${err.message}`),
  });

  const setWeight = (key: keyof TrustWeights, value: number) =>
    setDraft((d) => ({ ...d, weights: { ...d.weights, [key]: value } }));
  const setNumber = (key: NumberKey, value: number) => setDraft((d) => ({ ...d, [key]: value }));

  const bandError = parsed.success
    ? null
    : (parsed.error.issues.find((i) => i.path[0] === 'bandVerifiedMin')?.message ?? null);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <SectionTitle
          title="Deductions"
          body="Every asset starts at 100 and loses these points for each check it fails."
        />
        <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {WEIGHTS.map(({ key, label, hint }) => (
            <SliderField
              key={key}
              label={label}
              hint={hint}
              value={draft.weights[key]}
              suffix="pts"
              max={100}
              disabled={!isAdmin}
              onChange={(v) => setWeight(key, v)}
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <SectionTitle
          title="Bands"
          body="Where the score lands decides whether evidence is verified, needs review or is flagged."
        />
        <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          <SliderField
            label={`${BAND_META.verified.label} from`}
            value={draft.bandVerifiedMin}
            max={100}
            disabled={!isAdmin}
            onChange={(v) => setNumber('bandVerifiedMin', v)}
          />
          <SliderField
            label={`${BAND_META.review.label} from`}
            hint="Anything lower is flagged."
            value={draft.bandReviewMin}
            max={100}
            disabled={!isAdmin}
            onChange={(v) => setNumber('bandReviewMin', v)}
          />
        </div>
        {bandError && <p className="mt-4 text-sm text-destructive">{bandError}</p>}
      </section>

      <section className="rounded-2xl border bg-card p-6 shadow-soft">
        <SectionTitle title="Thresholds" body="When a check counts as failed." />
        <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {THRESHOLDS.map((t) => (
            <NumberField
              key={t.key}
              label={t.label}
              unit={t.unit}
              hint={t.hint}
              max={t.max}
              value={draft[t.key]}
              disabled={!isAdmin}
              onChange={(v) => setNumber(t.key, v)}
            />
          ))}
        </div>
      </section>

      {isAdmin ? (
        <div
          className={cn(
            'sticky bottom-20 z-20 flex flex-col gap-4 rounded-2xl border bg-card/95 p-4 shadow-lift backdrop-blur sm:flex-row sm:items-center sm:justify-between lg:bottom-6',
            !dirty && 'opacity-90',
          )}
        >
          <PreviewSummary
            dirty={dirty}
            valid={parsed.success}
            loading={preview.isFetching}
            summary={preview.data}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDraft(DEFAULT_ORG_SETTINGS)}
              disabled={JSON.stringify(draft) === JSON.stringify(DEFAULT_ORG_SETTINGS)}
            >
              <RotateCcw /> Defaults
            </Button>
            <Button variant="outline" onClick={() => setDraft(saved)} disabled={!dirty}>
              Discard
            </Button>
            <Button
              onClick={() => parsed.success && save.mutate(parsed.data)}
              disabled={!dirty || !parsed.success || save.isPending}
            >
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Save and re-score
            </Button>
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          These settings are shown so everyone can see how scores are worked out. Only admins can
          change them.
        </p>
      )}
    </div>
  );
}

function PreviewSummary({
  dirty,
  valid,
  loading,
  summary,
}: {
  dirty: boolean;
  valid: boolean;
  loading: boolean;
  summary: RescoreSummary | undefined;
}) {
  const headline = !dirty
    ? 'Adjust a setting to see how it would affect your evidence.'
    : !valid
      ? 'Fix the highlighted setting to see a preview.'
      : !summary
        ? 'Working out what would change…'
        : summary.total === 0
          ? 'No evidence yet, so nothing would change.'
          : summary.bandChanged === 0
            ? `No asset would change band (${summary.scoreChanged} of ${summary.total} scores would move).`
            : `${summary.bandChanged} of ${summary.total} assets would change band.`;
  const transitions = dirty && valid && summary ? summary.transitions : [];

  return (
    <div className="min-w-0 text-sm text-muted-foreground" aria-live="polite">
      <p
        className={cn(
          'inline-flex items-center gap-2',
          transitions.length > 0 && 'font-semibold text-foreground',
        )}
      >
        {dirty && valid && loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {headline}
      </p>
      {transitions.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {transitions.map((t) => (
            <li
              key={`${t.from}-${t.to}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            >
              {BAND_META[t.from].label} <ArrowRight className="size-3" aria-label="to" />{' '}
              {BAND_META[t.to].label}: {t.count}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionTitle({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2 className="font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function SliderField({
  label,
  hint,
  value,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  max: number;
  suffix?: string;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid content-start gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-semibold tabular">
          {value}
          {suffix && <span className="ml-0.5 font-normal text-muted-foreground">{suffix}</span>}
        </span>
      </div>
      <Slider
        min={0}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v ?? 0)}
        disabled={disabled}
        thumbLabel={label}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberField({
  label,
  unit,
  hint,
  max,
  value,
  disabled,
  onChange,
}: {
  label: string;
  unit: string;
  hint: string;
  max: number;
  value: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          className="w-28 tabular"
          value={Number.isFinite(value) ? value : ''}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
