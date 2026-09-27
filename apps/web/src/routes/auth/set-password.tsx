import { passwordSchema } from '@pramaan/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSetPassword } from '@/lib/auth';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { AuthLayout } from './auth-layout';

const form = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] });

export function SetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const setPassword = useSetPassword();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <AuthLayout
        title="This link is incomplete"
        subtitle="Open the full invite link your admin sent you, or ask them for a new one."
      >
        <Button asChild variant="outline">
          <Link to="/signin">Go to sign in</Link>
        </Button>
      </AuthLayout>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validate(form, Object.fromEntries(new FormData(e.currentTarget)));
    setErrors(result.errors ?? {});
    setMessage(null);
    if (!result.data || !token) return;
    setPassword.mutate(
      { token, password: result.data.password },
      {
        onSuccess: () => navigate('/app', { replace: true }),
        onError: (err) => {
          const { fields, message } = describeError(err);
          setErrors(fields);
          setMessage(message);
        },
      },
    );
  }

  return (
    <AuthLayout
      title="Set your password"
      subtitle="You’ve been invited to your team’s Pramaan workspace."
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FormError message={message} />
        <Field label="New password" hint="At least 8 characters." error={errors.password}>
          {(p) => (
            <Input {...p} name="password" type="password" autoComplete="new-password" autoFocus />
          )}
        </Field>
        <Field label="Confirm password" error={errors.confirm}>
          {(p) => <Input {...p} name="confirm" type="password" autoComplete="new-password" />}
        </Field>
        <Button type="submit" size="lg" disabled={setPassword.isPending}>
          {setPassword.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Set password and continue
        </Button>
      </form>
    </AuthLayout>
  );
}
