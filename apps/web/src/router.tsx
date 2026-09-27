import { createBrowserRouter } from 'react-router';
import { HomePage } from './routes/home';
import { NotFoundPage, RouteErrorPage } from './routes/not-found';
import { RootLayout } from './routes/root-layout';

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
