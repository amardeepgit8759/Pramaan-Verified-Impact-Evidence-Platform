import { siteInput, siteSchema, type Site } from '@pramaan/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, LocateFixed } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { api } from '@/lib/api';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { queryKeys } from '@/lib/queries';

const SitePickerMap = lazy(() => import('@/components/map/site-picker-map'));

/** Radius slider range; the API accepts 10 m – 100 km, typed values can go beyond this. */
const RADIUS_SLIDER = { min: 50, max: 5000, step: 50 };
const NEW_SITE_RADIUS_M = 500;

export function SiteDialog({
  projectId,
  site,
  otherSites,
  open,
  onOpenChange,
}: {
  projectId: string;
  /** Present when editing. */
  site?: Site;
  otherSites: Site[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{site ? `Edit ${site.name}` : 'Add a site'}</DialogTitle>
          <DialogDescription>
            Click the map to place the centre. Photos taken outside the radius are flagged as the
            wrong location.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <SiteForm
            projectId={projectId}
            site={site}
            otherSites={otherSites}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SiteForm({
  projectId,
  site,
  otherSites,
  onDone,
}: {
  projectId: string;
  site?: Site;
  otherSites: Site[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(site?.name ?? '');
  const [lat, setLat] = useState(site ? String(site.lat) : '');
  const [lng, setLng] = useState(site ? String(site.lng) : '');
  const [radius, setRadius] = useState(String(site?.radiusM ?? NEW_SITE_RADIUS_M));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const point =
    lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : null;
  const radiusM = Number(radius) > 0 ? Number(radius) : NEW_SITE_RADIUS_M;

  const save = useMutation({
    mutationFn: (input: unknown) =>
      site
        ? api.put(`/sites/${site.id}`, input, siteSchema)
        : api.post(`/projects/${projectId}/sites`, input, siteSchema),
    onSuccess: (saved) => {
      // Moving a site re-scores its evidence, so refresh the project as well as the list.
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects, exact: true });
      toast.success(site ? `Saved ${saved.name}` : `Added ${saved.name}`);
      onDone();
    },
    onError: (err) => {
      const { fields, message } = describeError(err);
      setErrors(fields);
      setMessage(message);
    },
  });

  function locateMe() {
    if (!navigator.geolocation) {
      setMessage('This browser can’t share its location. Click the map instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setMessage('Couldn’t get your location. Allow location access, or click the map.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const values = {
      name,
      lat: lat === '' ? undefined : Number(lat),
      lng: lng === '' ? undefined : Number(lng),
      radiusM: radius === '' ? undefined : Number(radius),
    };
    const result = validate(siteInput, values);
    setErrors(result.errors ?? {});
    setMessage(null);
    if (result.data) save.mutate(result.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormError message={message} />
      <Field label="Site name" error={errors.name}>
        {(p) => (
          <Input
            {...p}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Village Rampur"
          />
        )}
      </Field>

      <div className="grid gap-3">
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl sm:h-72" />}>
          <SitePickerMap
            point={point}
            radiusM={radiusM}
            otherSites={otherSites.filter((s) => s.id !== site?.id)}
            onPick={(p) => {
              setLat(String(p.lat));
              setLng(String(p.lng));
            }}
          />
        </Suspense>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={locateMe}
          disabled={locating}
        >
          {locating ? <Loader2 className="animate-spin" aria-hidden /> : <LocateFixed />}
          Use my current location
        </Button>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Latitude" error={errors.lat}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="28.470000"
            />
          )}
        </Field>
        <Field label="Longitude" error={errors.lng}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="77.030000"
            />
          )}
        </Field>
      </div>

      <Field
        label="Radius (metres)"
        hint="How far from the centre a photo can be taken and still count as this site."
        error={errors.radiusM}
      >
        {(p) => (
          <div className="flex items-center gap-4">
            <Slider
              min={RADIUS_SLIDER.min}
              max={RADIUS_SLIDER.max}
              step={RADIUS_SLIDER.step}
              value={[Math.min(Math.max(radiusM, RADIUS_SLIDER.min), RADIUS_SLIDER.max)]}
              onValueChange={([v]) => setRadius(String(v))}
              thumbLabel="Radius"
            />
            <Input
              {...p}
              inputMode="numeric"
              className="w-28 shrink-0 tabular"
              value={radius}
              onChange={(e) => setRadius(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
        )}
      </Field>

      <DialogFooter>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {site ? 'Save site' : 'Add site'}
        </Button>
      </DialogFooter>
    </form>
  );
}
