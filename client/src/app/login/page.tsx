"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, ShieldCheck, ArrowRight, Server, AlertCircle, KeyRound } from 'lucide-react';
import { api, setStoredUser } from '@/lib/api';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError('');
    setMsg('');
    setSubmitting(true);

    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const payload = isRegister
        ? { email, username, password }
        : { identifier, password, rememberMe };

      const data = await api<{ user?: any; message?: string }>(endpoint, {
        method: 'POST',
        json: payload,
      });

      if (isRegister) {
        setMsg(data.message || 'Registration successful. Waiting for admin approval.');
        setIsRegister(false);
        setPassword('');
      } else {
        if (data.user) setStoredUser(data.user);
        router.push('/');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-bg-base">
      {/* Left pane — visual identity. Uses one accent only.
          No gradient (the AI-slop tell). */}
      <div className="hidden lg:flex flex-col w-1/2 p-12 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full opacity-50 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(closest-side, var(--brand-soft), transparent)' }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-md bg-brand inline-flex items-center justify-center">
            <Server className="w-4 h-4 text-text-inverse" />
          </span>
          <span className="text-base font-semibold text-text-primary tracking-tight">
            VPS Manager
          </span>
        </div>

        <div className="relative mt-auto mb-auto pt-24 max-w-md">
          <h1 className="text-4xl font-semibold text-text-primary leading-[1.1] tracking-tight">
            One console for every server you operate.
          </h1>
          <p className="mt-5 text-text-secondary text-[15px] leading-relaxed">
            Live metrics, terminals, file access, and rule-based alerts — streamed from
            each host over a single secure channel.
          </p>

          <ul className="mt-10 space-y-3 text-sm text-text-secondary">
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Real-time CPU, memory, and network telemetry
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              In-browser terminal with replay
            </li>
            <li className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Rule-based alerts with recovery notifications
            </li>
          </ul>
        </div>

        <p className="relative text-xs text-text-muted">
          v2.0 · Multi-tenant · End-to-end gRPC
        </p>
      </div>

      {/* Right pane — auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-2.5 mb-10 justify-center">
            <span className="h-9 w-9 rounded-md bg-brand inline-flex items-center justify-center">
              <Server className="w-5 h-5 text-text-inverse" />
            </span>
            <span className="text-lg font-semibold text-text-primary tracking-tight">
              VPS Manager
            </span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="bg-bg-raised border border-border rounded-xl p-7 shadow-soft"
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-text-primary tracking-tight">
                {isRegister ? 'Create an account' : 'Sign in'}
              </h2>
              <p className="text-text-secondary text-sm mt-1">
                {isRegister
                  ? 'Request access to your team’s console.'
                  : 'Enter your credentials to continue.'}
              </p>
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  role="alert"
                  className="mb-5 px-3.5 py-2.5 bg-status-error/10 border border-status-error/30 rounded-md flex items-start gap-2.5 text-sm text-status-error"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </motion.div>
              )}
              {msg && (
                <motion.div
                  key="msg"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  role="status"
                  aria-live="polite"
                  className="mb-5 px-3.5 py-2.5 bg-status-success/10 border border-status-success/30 rounded-md flex items-start gap-2.5 text-sm text-status-success"
                >
                  <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{msg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!isRegister ? (
                <>
                  <div>
                    <label htmlFor="identifier" className="block text-sm font-medium text-text-primary mb-1.5">
                      Email or username
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                      <input
                        id="identifier"
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        required
                        disabled={submitting}
                        autoComplete="username"
                        className="w-full h-10 pl-9 pr-3 bg-bg-sunken border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand transition-colors disabled:opacity-50"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-text-primary mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                      <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={submitting}
                        autoComplete="current-password"
                        className="w-full h-10 pl-9 pr-3 bg-bg-sunken border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand transition-colors disabled:opacity-50"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={submitting}
                      className="h-4 w-4 rounded border-border bg-bg-sunken text-brand focus:ring-2 focus:ring-brand focus:ring-offset-1 focus:ring-offset-bg-raised cursor-pointer accent-[var(--brand)]"
                    />
                    <span className="text-sm text-text-secondary">Remember me for 30 days</span>
                  </label>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-text-primary mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                      <input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        disabled={submitting}
                        autoComplete="username"
                        className="w-full h-10 pl-9 pr-3 bg-bg-sunken border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand transition-colors disabled:opacity-50"
                        placeholder="your-handle"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-email" className="block text-sm font-medium text-text-primary mb-1.5">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                      <input
                        id="reg-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={submitting}
                        autoComplete="email"
                        className="w-full h-10 pl-9 pr-3 bg-bg-sunken border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand transition-colors disabled:opacity-50"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-password" className="block text-sm font-medium text-text-primary mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                      <input
                        id="reg-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={submitting}
                        autoComplete="new-password"
                        className="w-full h-10 pl-9 pr-3 bg-bg-sunken border border-border rounded-md text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-brand transition-colors disabled:opacity-50"
                        placeholder="At least 8 characters"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="group w-full h-10 mt-2 inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover text-text-inverse text-sm font-medium rounded-md transition-colors active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-border-subtle text-center text-sm text-text-secondary">
              {isRegister ? 'Already have an account? ' : 'No account? '}
              <button
                type="button"
                onClick={() => {
                  setIsRegister(!isRegister);
                  setError('');
                  setMsg('');
                }}
                className="text-brand hover:text-brand-hover font-medium transition-colors"
              >
                {isRegister ? 'Sign in' : 'Request access'}
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
