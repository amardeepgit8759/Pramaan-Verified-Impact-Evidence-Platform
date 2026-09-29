import { Compass, RefreshCw, TriangleAlert } from 'lucide-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';

/**
 * After a deploy, a tab opened earlier may ask for page chunks that no longer exist.
 * That's not a crash: reloading picks up the new version.
 */
function isStaleChunk(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Loading chunk/i.test(
    message,
  );
}

const reload = () => window.location.reload();

export function NotFoundPage() {
  return (
    <Message
      icon={Compass}
      title="Page not found"
      body="The page you’re looking for doesn’t exist or has moved."
    />
  );
}

/** The 500 page: anything that stopped a page outside the app shell from rendering. */
export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (isStaleChunk(error)) {
    return (
      <Message
        icon={RefreshCw}
        title="Pramaan has been updated"
        body="Reload to get the latest version."
        reload
      />
    );
  }
  return (
    <Message
      icon={TriangleAlert}
      title="Something went wrong"
      body="An unexpected error stopped this page from loading. Try again, or head back home."
      reload
    />
  );
}

function Message({
  icon: Icon,
  title,
  body,
  reload: showReload = false,
}: {
  icon: typeof Compass;
  title: string;
  body: string;
  reload?: boolean;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Icon className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-4xl tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        <div className="flex gap-2">
          {showReload && (
            <Button onClick={reload}>
              <RefreshCw /> Reload
            </Button>
          )}
          <Button asChild variant={showReload ? 'outline' : 'default'}>
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

/** 404 inside the signed-in app, keeping the navigation around it. */
export function AppNotFoundPage() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      action={
        <Button asChild>
          <Link to="/app">Back to dashboard</Link>
        </Button>
      }
    >
      The page you’re looking for doesn’t exist or has moved.
    </EmptyState>
  );
}

/** A page inside the app crashed: say so in place, keeping the navigation usable. */
export function AppRouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <AppNotFoundPage />;
  const stale = isStaleChunk(error);
  return (
    <EmptyState
      icon={stale ? RefreshCw : TriangleAlert}
      title={stale ? 'Pramaan has been updated' : 'This page hit a problem'}
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reload}>
            <RefreshCw /> Reload
          </Button>
          <Button asChild variant="outline">
            <Link to="/app">Back to dashboard</Link>
          </Button>
        </div>
      }
    >
      {stale
        ? 'Reload to get the latest version.'
        : 'Something unexpected went wrong while showing this page. Reloading usually fixes it; your data is safe.'}
    </EmptyState>
  );
}
