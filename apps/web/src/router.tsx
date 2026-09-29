import type { ComponentType } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './routes/app/app-layout';
import { ProjectLayout } from './routes/app/project/project-layout';
import { GuestOnly } from './routes/auth/guest-only';
import {
  AppNotFoundPage,
  AppRouteErrorPage,
  NotFoundPage,
  RouteErrorPage,
} from './routes/not-found';
import { StartupSkeleton } from './routes/startup-skeleton';

/**
 * Each page is its own chunk, loaded when first visited, so the landing page and sign-in
 * don't download charts, maps or the report reader. Layouts stay in the main bundle.
 */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  return async () => ({ Component: (await load())[name] });
}

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    hydrateFallbackElement: <StartupSkeleton />,
    children: [
      { index: true, lazy: page(() => import('./routes/landing'), 'LandingPage') },
      {
        element: <GuestOnly />,
        children: [
          { path: 'signin', lazy: page(() => import('./routes/auth/sign-in'), 'SignInPage') },
          { path: 'signup', lazy: page(() => import('./routes/auth/sign-up'), 'SignUpPage') },
        ],
      },
      {
        path: 'set-password',
        lazy: page(() => import('./routes/auth/set-password'), 'SetPasswordPage'),
      },
      {
        path: 'app',
        element: <AppLayout />,
        children: [
          {
            // A crash inside a page keeps the navigation, so people can move on.
            errorElement: <AppRouteErrorPage />,
            children: [
              { index: true, lazy: page(() => import('./routes/app/dashboard'), 'DashboardPage') },
              {
                path: 'projects',
                lazy: page(() => import('./routes/app/projects'), 'ProjectsPage'),
              },
              {
                path: 'projects/:projectId',
                element: <ProjectLayout />,
                children: [
                  {
                    index: true,
                    lazy: page(() => import('./routes/app/project/overview'), 'ProjectOverview'),
                  },
                  {
                    path: 'evidence',
                    lazy: page(() => import('./routes/app/project/evidence'), 'ProjectEvidence'),
                  },
                  {
                    path: 'map',
                    lazy: page(() => import('./routes/app/project/project-map'), 'ProjectMap'),
                  },
                  {
                    path: 'timeline',
                    lazy: page(() => import('./routes/app/project/timeline'), 'ProjectTimeline'),
                  },
                  {
                    path: 'compare',
                    lazy: page(() => import('./routes/app/project/compare'), 'ProjectCompare'),
                  },
                  {
                    path: 'review',
                    lazy: page(() => import('./routes/app/project/review-queue'), 'ProjectReview'),
                  },
                  {
                    path: 'reports',
                    lazy: page(() => import('./routes/app/project/reports'), 'ProjectReports'),
                  },
                  {
                    path: 'reports/:reportId',
                    lazy: page(() => import('./routes/app/project/report-view'), 'ProjectReport'),
                  },
                  {
                    path: 'sites',
                    lazy: page(() => import('./routes/app/project/sites'), 'ProjectSites'),
                  },
                  {
                    path: 'share',
                    lazy: page(() => import('./routes/app/project/share'), 'ProjectShare'),
                  },
                ],
              },
              {
                path: 'search',
                lazy: page(() => import('./routes/app/search-page'), 'SearchPage'),
              },
              {
                path: 'settings',
                lazy: page(() => import('./routes/app/settings/settings-page'), 'SettingsPage'),
              },
              { path: '*', element: <AppNotFoundPage /> },
            ],
          },
        ],
      },
      // Public funder view: no session, the token is the key.
      {
        path: 'share/:token',
        lazy: page(() => import('./routes/share/share-page'), 'SharePage'),
      },
      {
        path: 'share/:token/reports/:reportId',
        lazy: page(() => import('./routes/share/share-page'), 'SharePage'),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
