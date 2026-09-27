import { Slider as SliderPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui Slider, kept on React.forwardRef so refs work on React 18.
const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabel?: string }
>(({ className, thumbLabel, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={thumbLabel}
      className="block size-5 rounded-full border-2 border-primary bg-card shadow-soft transition-[box-shadow] duration-150 outline-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:pointer-events-none"
    />
  </SliderPrimitive.Root>
));
Slider.displayName = 'Slider';

export { Slider };
