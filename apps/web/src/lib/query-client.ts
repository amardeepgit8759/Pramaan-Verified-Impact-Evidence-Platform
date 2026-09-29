import { MutationCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { toast } from 'sonner';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** The caller shows this mutation's errors itself (e.g. inline in a form). */
      handlesErrors?: boolean;
    };
  }
}

/**
 * The app's query client. Any action that fails without its own error handling still
 * tells the person, with a toast, so no failure is silent.
 */
export function createQueryClient(defaultOptions: DefaultOptions = {}) {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError || mutation.meta?.handlesErrors) return;
        toast.error(error.message || 'Something went wrong. Try again.');
      },
    }),
    defaultOptions: {
      // Short-lived caching; live events invalidate queries when data changes.
      queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
      ...defaultOptions,
    },
  });
}
