import { Navigate, Outlet, useSearchParams } from 'react-router';
import { useSession } from '@/lib/auth';
import { safeNext } from '@/lib/navigation';

/** Sign-in and sign-up pages send already-signed-in users on to the app. */
export function GuestOnly() {
  const { data: session } = useSession();
  const [params] = useSearchParams();
  if (session) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}
