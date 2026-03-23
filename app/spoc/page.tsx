'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listReportingSpocs } from '@/lib/reportingBackend';
import { clearStoredSpocUser, setStoredSpocUser } from '@/lib/spocSession';

type SpocRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

const TEST_SPOC: SpocRecord = {
  id: 'SPOC1',
  name: 'Spoc One',
  email: 'spoc.one@hackhub.test',
  phone: 'SpocOne@7391',
};

const mergeSpocs = (list: SpocRecord[]): SpocRecord[] => {
  const byId = new Map<string, SpocRecord>();
  (list || []).forEach((s) => {
    const id = String(s?.id || '').trim();
    const email = String(s?.email || '').trim().toLowerCase();
    if (!id || !email) return;
    byId.set(id, {
      id,
      name: String(s?.name || '').trim(),
      email,
      phone: String(s?.phone || '').trim(),
    });
  });

  if (!Array.from(byId.values()).some((s) => s.email === TEST_SPOC.email)) {
    byId.set(TEST_SPOC.id, TEST_SPOC);
  }

  return Array.from(byId.values());
};

const readLocalSpocs = (): SpocRecord[] => {
  try {
    const raw = JSON.parse(localStorage.getItem('reportingSpocs') || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .map((s: any) => ({
        id: String(s?.id || '').trim(),
        name: String(s?.name || '').trim(),
        email: String(s?.email || '').trim().toLowerCase(),
        phone: String(s?.phone || '').trim(),
      }))
      .filter((s) => s.id && s.email);
  } catch {
    return [];
  }
};

export default function SpocLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    clearStoredSpocUser();
    try {
      const seeded = mergeSpocs(readLocalSpocs());
      localStorage.setItem('reportingSpocs', JSON.stringify(seeded));
    } catch {
      // ignore
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr(null);

    try {
      let spocs: SpocRecord[] = mergeSpocs(readLocalSpocs());
      if (isSupabaseConfigured()) {
        try {
          const remote = await listReportingSpocs();
          if (Array.isArray(remote) && remote.length) {
            const remoteMapped = remote.map((s: any) => ({
              id: String(s?.id || '').trim(),
              name: String(s?.name || '').trim(),
              email: String(s?.email || '').trim().toLowerCase(),
              phone: String(s?.phone || '').trim(),
            }));
            spocs = mergeSpocs(remoteMapped);
            localStorage.setItem('reportingSpocs', JSON.stringify(spocs));
          }
        } catch {
          // keep local fallback
        }
      }

      const inputEmail = String(email || '').trim().toLowerCase();
      const inputPassword = String(password || '').trim();
      const matched = spocs.find((s) => s.email === inputEmail);

      // Temporary SPOC auth policy: password equals SPOC phone number.
      if (!matched || !inputPassword || inputPassword !== String(matched.phone || '').trim()) {
        setErr('Invalid SPOC credentials');
        setLoading(false);
        return;
      }

      setStoredSpocUser({
        id: matched.id,
        name: matched.name,
        email: matched.email,
        phone: matched.phone,
      });
      router.push('/spoc/dashboard');
    } catch {
      setErr('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="hh-page flex items-center justify-center p-6">
      <div className="w-full max-w-md hh-card rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-4 text-gitam-700">SPOC Login</h1>
        <p className="text-sm text-gitam-700/80 mb-4">Use your SPOC email and phone number as password.</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="hh-input mt-1 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="hh-input mt-1 w-full" />
          </div>
          {err ? <div className="rounded-lg border border-gitam-200 bg-gitam-50 p-2 text-sm text-gitam-700">{err}</div> : null}
          <div className="flex items-center justify-between">
            <button type="submit" disabled={loading} className="hh-btn">
              {loading ? 'Signing in...' : 'Login'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="hh-btn-outline"
            >
              Admin Login
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
