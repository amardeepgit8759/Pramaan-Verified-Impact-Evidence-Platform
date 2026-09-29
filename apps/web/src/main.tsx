import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import './fonts.css';
import './index.css';
import { ThemedToaster } from './components/themed-toaster';
import { sessionQuery } from './lib/queries';
import { createQueryClient } from './lib/query-client';
import { ThemeProvider } from './lib/theme';
import { router } from './router';

const queryClient = createQueryClient();
// Every page needs to know who's signed in: ask while the page's code is still loading.
void queryClient.prefetchQuery(sessionQuery);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ThemedToaster />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
