import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppLayout } from './routes/app/app-layout';
import { DashboardPage } from './routes/app/dashboard';
import { ProjectsPage } from './routes/app/projects';
import { GuestOnly } from './routes/auth/guest-only';
import { SetPasswordPage } from './routes/auth/set-password';
import { SignInPage } from './routes/auth/sign-in';
import { SignUpPage } from './routes/auth/sign-up';
import { LandingPage } from './routes/landing';
import { NotFoundPage, RouteErrorPage } from './routes/not-found';

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
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
