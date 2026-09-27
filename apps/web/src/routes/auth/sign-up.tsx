import { signupInput } from '@pramaan/shared';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Field, FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSignup } from '@/lib/auth';
import { describeError, validate, type FieldErrors } from '@/lib/forms';
import { AuthLayout } from './auth-layout';

export function SignUpPage() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = validate(signupInput, Object.fromEntries(new FormData(e.currentTarget)));
    setErrors(result.errors ?? {});
    setMessage(null);
    if (!result.data) return;
    signup.mutate(result.data, {
      onSuccess: () => navigate('/app', { replace: true }),
      onError: (err) => {
        const { fields, message } = describeError(err);
        setErrors(fields);
        setMessage(message);
      },
    });
  }

  return (
    <AuthLayout
      title="Create your organisation"
      subtitle={
        <>
          Already have an account?{' '}
          <Link to="/signin" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5">
        <FormError message={message} />
        <Field label="Organisation name" error={errors.orgName}>
          {(p) => <Input {...p} name="orgName" autoComplete="organization" autoFocus />}
        </Field>
        <Field label="Your name" error={errors.name}>
          {(p) => <Input {...p} name="name" autoComplete="name" />}
        </Field>
        <Field label="Work email" error={errors.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" />}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={errors.password}>
          {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" />}
        </Field>
        <Button type="submit" size="lg" disabled={signup.isPending}>
          {signup.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Create organisation
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          You’ll be the admin. You can invite field staff and viewers afterwards.
        </p>
      </form>
    </AuthLayout>
  );
}
