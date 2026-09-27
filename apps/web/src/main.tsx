import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './index.css';
import { ThemedToaster } from './components/themed-toaster';
import { ThemeProvider } from './lib/theme';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    // Short-lived caching; live events invalidate queries when data changes.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <ThemedToaster />
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  </StrictMode>,
);
