import React, { useMemo, useState } from 'react';

type AuthMode = 'signIn' | 'signUp';
type AuthAction = 'signIn' | 'signUp' | 'google' | null;

type AuthScreenProps = {
  onEmailPasswordAuth: (mode: AuthMode, email: string, password: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
  authError: string | null;
  authNotice: string | null;
  pendingAction: AuthAction;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_SIGNUP_PASSWORD_LENGTH = 8;

const AuthScreen: React.FC<AuthScreenProps> = ({
  onEmailPasswordAuth,
  onGoogleSignIn,
  authError,
  authNotice,
  pendingAction,
}) => {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const emailValidationError = useMemo(() => {
    if (!email.trim()) return 'Email is required.';
    if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address.';
    return null;
  }, [email]);

  const passwordValidationError = useMemo(() => {
    if (!password) return 'Password is required.';
    if (mode === 'signUp' && password.length < MIN_SIGNUP_PASSWORD_LENGTH) {
      return `Use at least ${MIN_SIGNUP_PASSWORD_LENGTH} characters for sign up.`;
    }
    return null;
  }, [mode, password]);

  const canSubmit = !emailValidationError && !passwordValidationError;
  const isAnyActionPending = pendingAction !== null;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttemptedSubmit(true);
    if (!canSubmit || isAnyActionPending) return;
    await onEmailPasswordAuth(mode, email.trim(), password);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-md items-center px-4 py-8">
        <div className="w-full rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_2px_20px_rgba(0,0,0,0.04)] sm:p-7">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight text-stone-900">NutriVoice</h1>
            <p className="mt-2 text-sm text-stone-500">Track your nutrition and keep your data synced securely.</p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-xl bg-stone-100 p-1" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signIn'}
              onClick={() => setMode('signIn')}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                mode === 'signIn' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-800'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signUp'}
              onClick={() => setMode('signUp')}
              className={`h-10 rounded-lg text-sm font-semibold transition ${
                mode === 'signUp' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600 hover:text-stone-800'
              }`}
            >
              Sign up
            </button>
          </div>

          {authError && (
            <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {authError}
            </div>
          )}
          {authNotice && (
            <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
              {authNotice}
            </div>
          )}

          <form className="space-y-3" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="text-sm font-medium text-stone-700">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300"
                aria-invalid={attemptedSubmit && !!emailValidationError}
                aria-describedby={attemptedSubmit && emailValidationError ? 'auth-email-error' : undefined}
                disabled={isAnyActionPending}
              />
              {attemptedSubmit && emailValidationError && (
                <p id="auth-email-error" className="text-xs text-red-600">
                  {emailValidationError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="text-sm font-medium text-stone-700">
                Password
              </label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={isPasswordVisible ? 'text' : 'password'}
                  autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'signIn' ? 'Enter your password' : 'Create a strong password'}
                  className="h-11 w-full rounded-lg border border-stone-200 bg-white px-3 pr-20 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300"
                  aria-invalid={attemptedSubmit && !!passwordValidationError}
                  aria-describedby={attemptedSubmit && passwordValidationError ? 'auth-password-error' : undefined}
                  disabled={isAnyActionPending}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300"
                  onClick={() => setIsPasswordVisible((prev) => !prev)}
                  disabled={isAnyActionPending}
                  aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                >
                  {isPasswordVisible ? 'Hide' : 'Show'}
                </button>
              </div>
              {attemptedSubmit && passwordValidationError && (
                <p id="auth-password-error" className="text-xs text-red-600">
                  {passwordValidationError}
                </p>
              )}
              {mode === 'signUp' && (
                <p className="text-xs text-stone-500">Use 8+ characters for better account security.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isAnyActionPending || !canSubmit}
              className="mt-1 h-11 w-full rounded-lg bg-stone-900 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
              aria-busy={pendingAction === mode}
            >
              {pendingAction === mode ? (mode === 'signIn' ? 'Signing in...' : 'Creating account...') : mode === 'signIn' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3" aria-hidden>
            <div className="h-px flex-1 bg-stone-200" />
            <span className="text-xs font-medium uppercase tracking-wide text-stone-400">or continue with</span>
            <div className="h-px flex-1 bg-stone-200" />
          </div>

          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={isAnyActionPending}
            className="h-11 w-full rounded-lg border border-stone-300 bg-white px-4 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:text-stone-400"
            aria-busy={pendingAction === 'google'}
          >
            {pendingAction === 'google' ? 'Redirecting to Google...' : 'Continue with Google'}
          </button>

          <p className="mt-4 text-center text-xs text-stone-500">Your nutrition data is private and tied to your secure account.</p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
