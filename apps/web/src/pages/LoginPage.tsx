import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Profile, useAuth } from '../lib/auth-store';
import { Button, inputClass } from '../components/ui';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  requiresTenantSelection: boolean;
  user: Profile;
};

export function LoginPage() {
  const [email, setEmail] = useState('owner@acme.demo');
  const [password, setPassword] = useState('ChangeMe!Owner1');
  const [error, setError] = useState('');
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } });
      setSession(result.accessToken, result.refreshToken, result.user);
      if (result.requiresTenantSelection || (result.user.isPlatformAdmin && !result.user.tenantId)) {
        navigate(result.user.isPlatformAdmin ? '/tenants' : '/select-tenant');
        return;
      }
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in');
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden lg:flex bg-navy text-white p-14 flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_18%_18%,#14b8a6,transparent_32%),radial-gradient(circle_at_88%_78%,#0284c7,transparent_28%)]" />
        <div className="relative flex items-center gap-3">
          <span className="h-12 w-12 rounded-2xl bg-accent grid place-items-center display text-2xl">R</span>
          <div>
            <p className="display text-3xl leading-none">Refurbicon</p>
            <p className="mt-2 text-teal-300 uppercase tracking-[0.25em] text-[11px]">Sales · Service · People · Accounts</p>
          </div>
        </div>
        <div className="relative max-w-lg">
          <h1 className="display text-5xl leading-[1.1]">Every record has a list, a view and an edit page.</h1>
          <p className="mt-6 text-slate-300 text-lg">
            Quote to cash, RMA, payroll, dispatch and banking in one tenant-safe workspace.
          </p>
        </div>
        <p className="relative text-sm text-slate-500">SRS v1.0 · Multi-tenant ERP</p>
      </section>
      <section className="flex items-center justify-center p-6 lg:p-10">
        <form onSubmit={onSubmit} className="w-full max-w-md bg-card border border-line rounded-3xl p-8 surface">
          <h2 className="display text-3xl">Welcome back</h2>
          <p className="text-ink-soft mt-2 text-sm">Sign in to your tenant workspace.</p>
          <label className="block mt-6 text-sm font-medium">
            Email
            <input className={`${inputClass} mt-1.5`} value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label className="block mt-4 text-sm font-medium">
            Password
            <input className={`${inputClass} mt-1.5`} value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
          </label>
          {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
          <Button className="mt-6 w-full py-2.5" type="submit">
            Continue
          </Button>
          <p className="mt-4 text-xs text-ink-soft leading-relaxed">
            Owner: owner@acme.demo / ChangeMe!Owner1
            <br />
            Superadmin: admin@refurbicon.local / ChangeMe!Admin1
          </p>
        </form>
      </section>
    </div>
  );
}
