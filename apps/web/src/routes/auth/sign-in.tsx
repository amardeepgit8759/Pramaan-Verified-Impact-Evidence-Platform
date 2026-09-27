import { loginInput } from '@pramaan/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLogin } from '@/lib/auth';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { safeNext } from '@/lib/navigation';
import { AuthLayout } from './auth-layout';

export function SignInPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useLogin();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = validate(loginInput, Object.fromEntries(form));
    setErrors(result.errors ?? {});
    setMessage(null);
    if (!result.data) return;
    login.mutate(result.data, {
      onSuccess: () => navigate(safeNext(params.get('next')), { replace: true }),
      onError: (err) => {
        const { fields, message } = describeError(err);
        setErrors(fields);
        setMessage(message);
      },
    });
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle={
        <>
          New to Pramaan?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an organisation
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FormError message={message} />
        <Field label="Email" error={errors.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" autoFocus />}
        </Field>
        <Field label="Password" error={errors.password}>
          {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" />}
        </Field>
        <Button type="submit" size="lg" disabled={login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Sign in
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Invited by your team? Use the link your admin sent you to set a password.
        </p>
      </form>
    </AuthLayout>
  );
}
