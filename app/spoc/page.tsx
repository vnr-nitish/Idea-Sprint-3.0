'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { setStoredSpocUser } from '@/lib/spocSession';

const canonicalPhone = (v: string) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length > 10 ? d.slice(-10) : d;
};

export default function SpocLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const emailTrimmed = email.trim().toLowerCase();
    const phoneTrimmed = canonicalPhone(phone);

    if (!emailTrimmed || !phoneTrimmed) {
      setErr('Both email and phone number are required.');
      return;
    }

    setLoading(true);
    try {
      // Look up SPOCs stored by admin in localStorage
      let spocs: any[] = [];
      try {
        const raw = JSON.parse(localStorage.getItem('reportingSpocs') || '[]');
        spocs = Array.isArray(raw) ? raw : [];
      } catch {
        spocs = [];
      }

      const match = spocs.find((s: any) => {
        const spocEmail = String(s?.email || '').trim().toLowerCase();
        const spocPhone = canonicalPhone(String(s?.phone || ''));
        return spocEmail === emailTrimmed && spocPhone === phoneTrimmed;
      });

      if (match) {
        setStoredSpocUser({
          id: String(match.id || ''),
          name: String(match.name || ''),
          email: emailTrimmed,
          phone: phoneTrimmed,
        });
        router.push('/spoc/dashboard');
      } else {
        setErr('Invalid email or phone number. Please check your credentials with the admin.');
      }
    } catch (e) {
      setErr('Login failed. Please try again.');
    }
    setLoading(false);
  };

  return (
    <main className="hh-page pt-20 pb-12">
      <div className="max-w-6xl mx-auto px-4">
        <div className="hh-card overflow-hidden">
          {/* Hero banner */}
          <div className="bg-gitam p-8 text-antique">
            <h1 className="text-3xl md:text-4xl font-bold">Idea Sprint 3.0</h1>
            <p className="mt-2 md:mt-1">organized by Directorate of Training, Mentoring &amp; Career Guidance</p>
          </div>

          <div className="p-6 md:p-10 flex justify-center">
            <div className="w-full max-w-md hh-surface p-6">
              <h2 className="text-2xl font-bold text-gitam-700 mb-1">SPOC Login</h2>
              <p className="text-gitam-700/75 mb-6 text-sm">Sign in with your credentials provided by the admin.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="spoc-email" className="block text-sm font-semibold text-gitam-700 mb-2">
                    Email Address
                  </label>
                  <input
                    id="spoc-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErr(null); }}
                    placeholder="Enter your email"
                    className="hh-input"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label htmlFor="spoc-phone" className="block text-sm font-semibold text-gitam-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    id="spoc-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setErr(null); }}
                    placeholder="Enter your registered phone number"
                    className="hh-input"
                    autoComplete="tel"
                  />
                </div>

                {err && (
                  <div className="rounded-lg border border-gitam-200 bg-gitam-50 p-3 text-sm text-gitam-700">
                    ⚠️ {err}
                  </div>
                )}

                <button type="submit" disabled={loading} className="hh-btn w-full py-2">
                  {loading ? 'Signing in...' : 'Sign In as SPOC'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <a href="/login" className="text-sm text-gitam-700/60 hover:underline">
                  Team member? Sign in here →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
