import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './routes/app/app-layout';
import { DashboardPage } from './routes/app/dashboard';
import { ProjectCompare } from './routes/app/project/compare';
import { ProjectEvidence } from './routes/app/project/evidence';
import { ProjectMap } from './routes/app/project/project-map';
import { ProjectReport } from './routes/app/project/report-view';
import { ProjectReports } from './routes/app/project/reports';
import { ProjectReview } from './routes/app/project/review-queue';
import { ProjectShare } from './routes/app/project/share';
import { ProjectTimeline } from './routes/app/project/timeline';
import { ProjectOverview } from './routes/app/project/overview';
import { ProjectLayout } from './routes/app/project/project-layout';
import { ProjectSites } from './routes/app/project/sites';
import { ProjectsPage } from './routes/app/projects';
import { SearchPage } from './routes/app/search-page';
import { SettingsPage } from './routes/app/settings/settings-page';
import { GuestOnly } from './routes/auth/guest-only';
import { SetPasswordPage } from './routes/auth/set-password';
import { SignInPage } from './routes/auth/sign-in';
import { SignUpPage } from './routes/auth/sign-up';
import { LandingPage } from './routes/landing';
import { SharePage } from './routes/share/share-page';
import { AppNotFoundPage, NotFoundPage, RouteErrorPage } from './routes/not-found';

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <LandingPage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: 'signin', element: <SignInPage /> },
          { path: 'signup', element: <SignUpPage /> },
        ],
      },
      { path: 'set-password', element: <SetPasswordPage /> },
      {
        path: 'app',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          {
            path: 'projects/:projectId',
            element: <ProjectLayout />,
            children: [
              { index: true, element: <ProjectOverview /> },
              { path: 'evidence', element: <ProjectEvidence /> },
              { path: 'map', element: <ProjectMap /> },
              { path: 'timeline', element: <ProjectTimeline /> },
              { path: 'compare', element: <ProjectCompare /> },
              { path: 'review', element: <ProjectReview /> },
              { path: 'reports', element: <ProjectReports /> },
              { path: 'reports/:reportId', element: <ProjectReport /> },
              { path: 'sites', element: <ProjectSites /> },
              { path: 'share', element: <ProjectShare /> },
            ],
          },
          { path: 'search', element: <SearchPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <AppNotFoundPage /> },
        ],
      },
      // Public funder view: no session, the token is the key.
      { path: 'share/:token', element: <SharePage /> },
      { path: 'share/:token/reports/:reportId', element: <SharePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
