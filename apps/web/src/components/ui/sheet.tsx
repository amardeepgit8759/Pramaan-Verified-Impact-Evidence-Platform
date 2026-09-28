import { XIcon } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '@/lib/utils';

// shadcn/ui Sheet (a side drawer), kept on React.forwardRef so refs work on React 18.
const Sheet = SheetPrimitive.Root;
const SheetClose = SheetPrimitive.Close;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex h-full w-full flex-col border-l bg-background shadow-lift duration-200 sm:max-w-2xl data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
        className,
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close className="absolute top-4 right-4 z-10 rounded-lg bg-background/80 p-1.5 text-muted-foreground backdrop-blur transition-colors hover:bg-accent hover:text-foreground">
        <XIcon className="size-4" />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Content>
  </SheetPrimitive.Portal>
));
SheetContent.displayName = 'SheetContent';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold tracking-tight', className)}
    {...props}
  />
));
SheetTitle.displayName = 'SheetTitle';

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = 'SheetDescription';

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle };
