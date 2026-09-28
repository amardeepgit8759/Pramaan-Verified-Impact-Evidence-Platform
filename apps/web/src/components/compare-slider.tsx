import { ChevronsLeftRight } from 'lucide-react';
import { useId, useState } from 'react';

/**
 * Before/after on top of each other, with a divider you can drag (or move with the arrow
 * keys: it's a range input underneath, so it's keyboard and screen-reader friendly).
 */
export function CompareSlider({
  before,
  after,
}: {
  before: { src: string; alt: string; label: string };
  after: { src: string; alt: string; label: string };
}) {
  const [position, setPosition] = useState(50);
  const id = useId();

  return (
    <figure className="space-y-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border bg-muted select-none">
        <img
          src={after.src}
          alt={after.alt}
          className="absolute inset-0 size-full object-cover"
          draggable={false}
        />
        <img
          src={before.src}
          alt={before.alt}
          className="absolute inset-0 size-full object-cover"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          draggable={false}
        />
        <span className="absolute top-3 left-3 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-medium text-white">
          {before.label}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-medium text-white">
          {after.label}
        </span>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.2)]"
          style={{ left: `${position}%` }}
        >
          <span className="absolute top-1/2 left-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-lift">
            <ChevronsLeftRight className="size-5" />
          </span>
        </div>
        <label htmlFor={id} className="sr-only">
          Compare: move left to show more of the after photo, right to show more of the before photo
        </label>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          className="absolute inset-0 size-full cursor-ew-resize appearance-none bg-transparent opacity-0 focus-visible:opacity-0"
          aria-valuetext={`${position}% before`}
        />
      </div>
    </figure>
  );
}
