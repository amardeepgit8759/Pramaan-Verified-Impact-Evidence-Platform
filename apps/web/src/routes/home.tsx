import { useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { healthQuery } from '@/lib/queries';

export function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Pramaan</h1>
        <p className="max-w-2xl text-muted-foreground">
          Verified impact evidence for NGOs, CSR teams and funders. Every claim links back to a
          photo.
        </p>
      </section>
      <SystemStatus />
    </div>
  );
}

function SystemStatus() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery(healthQuery);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>System status</CardTitle>
        <CardDescription>Live connection to the Pramaan API and database.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" aria-hidden /> Checking…
          </p>
        ) : isError ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm text-destructive">
              <CircleAlert aria-hidden /> Can't reach the API: {error.message}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Try again
            </Button>
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-muted-foreground">API</dt>
            <dd>v{data.version}</dd>
            <dt className="text-muted-foreground">Database</dt>
            <dd>
              <StatusLabel ok={data.database.connected} okText="Connected" badText="Unreachable" />
            </dd>
            <dt className="text-muted-foreground">Vector search</dt>
            <dd>
              <StatusLabel ok={data.database.pgvector} okText="Enabled" badText="Missing" />
            </dd>
            {data.database.latencyMs !== null && (
              <>
                <dt className="text-muted-foreground">DB latency</dt>
                <dd>{data.database.latencyMs} ms</dd>
              </>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function StatusLabel({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1.5 text-success">
      <CircleCheck className="size-4" aria-hidden /> {okText}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-destructive">
      <CircleAlert className="size-4" aria-hidden /> {badText}
    </span>
  );
}
