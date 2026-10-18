'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { signInAction, signUpAction, type AuthResult } from '@/lib/auth/actions';
import type { Locale } from '@/lib/types';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn-primary btn-md w-full">
      {pending ? '…' : label}
    </button>
  );
}

export function SignInForm({ locale, next }: { locale: Locale; next?: string }) {
  const t = getDictionary(locale);
  const [state, formAction] = useActionState<AuthResult | null, FormData>(signInAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div>
        <label htmlFor="signin-email" className="label">{t.account.email}</label>
        <input
          id="signin-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
          aria-describedby={state?.error ? 'signin-error' : undefined}
        />
      </div>

      <div>
        <label htmlFor="signin-password" className="label">{t.account.password}</label>
        <input
          id="signin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="input"
        />
      </div>

      {state?.error ? (
        <p id="signin-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={t.account.signInCta} />
    </form>
  );
}

export function SignUpForm({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const [state, formAction] = useActionState<AuthResult | null, FormData>(signUpAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />

      <div>
        <label htmlFor="signup-name" className="label">{t.account.displayName}</label>
        <input id="signup-name" name="displayName" type="text" className="input" autoComplete="name" />
      </div>

      <div>
        <label htmlFor="signup-email" className="label">{t.account.email}</label>
        <input id="signup-email" name="email" type="email" required className="input" autoComplete="email" />
      </div>

      <div>
        <label htmlFor="signup-password" className="label">{t.account.password}</label>
        <input
          id="signup-password"
          name="password"
          type="password"
          required
          className="input"
          autoComplete="new-password"
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="mt-1 text-xs text-ink-muted">
          At least 12 characters, with an uppercase letter, a lowercase letter, a digit and a symbol.
        </p>
      </div>

      <div>
        <label htmlFor="signup-confirm" className="label">{t.account.confirmPassword}</label>
        <input
          id="signup-confirm"
          name="confirmPassword"
          type="password"
          required
          className="input"
          autoComplete="new-password"
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <SubmitButton label={t.account.signUpCta} />
    </form>
  );
}
