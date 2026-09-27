import { Compass } from 'lucide-react';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <Message
      title="Page not found"
      body="The page you’re looking for doesn’t exist or has moved."
    />
  );
}

export function RouteErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <Message
      title="Something went wrong"
      body="An unexpected error stopped this page from loading. Try again, or head back home."
    />
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <Compass className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-4xl tracking-tight">{title}</h1>
        <p className="text-muted-foreground">{body}</p>
        <Button asChild>
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}
