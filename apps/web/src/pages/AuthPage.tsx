import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button, Field } from '../components/ui';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';

const loginSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
const registerSchema = loginSchema.extend({
  displayName: z.string().trim().min(2, 'Use at least two characters.').max(120),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export const AuthPage = ({ mode }: { mode: 'login' | 'register' }) => {
  const { login, register, session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = mode === 'login' ? loginSchema : registerSchema;
  const form = useForm<LoginValues & Partial<RegisterValues>>({
    resolver: zodResolver(schema),
    defaultValues: { displayName: '', email: '', password: '' },
  });

  if (session) return <Navigate replace to="/" />;

  const submit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      if (mode === 'register')
        await register(values.displayName ?? '', values.email, values.password);
      else await login(values.email, values.password);
      const redirect = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(redirect, { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'The API could not be reached.');
    }
  });

  return (
    <section className="auth-layout page-frame">
      <div className="auth-layout__statement">
        <span className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Start building'}</span>
        <h1>
          {mode === 'login' ? (
            <>
              Return to
              <br />
              your work.
            </>
          ) : (
            <>
              Your next proof
              <br />
              of work starts here.
            </>
          )}
        </h1>
        <p>
          One account connects project discovery, applications, team delivery, and portfolio
          evidence.
        </p>
        <div className="auth-layout__coordinates">
          <span>10.773° N</span>
          <span>106.660° E</span>
          <span>HCMUT</span>
        </div>
      </div>
      <div className="auth-panel">
        <div className="auth-panel__header">
          <span>{mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'}</span>
          <b>{mode === 'login' ? '01' : '02'}</b>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          {mode === 'register' ? (
            <Field
              autoComplete="name"
              error={form.formState.errors.displayName?.message}
              label="Display name"
              {...form.register('displayName')}
            />
          ) : null}
          <Field
            autoComplete="email"
            error={form.formState.errors.email?.message}
            label="Email"
            type="email"
            {...form.register('email')}
          />
          <Field
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            error={form.formState.errors.password?.message}
            hint={mode === 'register' ? '12–128 characters' : undefined}
            label="Password"
            type="password"
            {...form.register('password')}
          />
          {serverError ? (
            <p className="form-error" role="alert">
              {serverError}
            </p>
          ) : null}
          <Button disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting
              ? 'Connecting…'
              : mode === 'login'
                ? 'Log in'
                : 'Create account'}
          </Button>
        </form>
        <p className="auth-panel__switch">
          {mode === 'login' ? (
            <>
              New to SkillBridge? <Link to="/register">Create an account</Link>
            </>
          ) : (
            <>
              Already a member? <Link to="/login">Log in</Link>
            </>
          )}
        </p>
      </div>
    </section>
  );
};
