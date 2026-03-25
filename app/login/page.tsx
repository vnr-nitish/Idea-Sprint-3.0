'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { loginWithIdentifierAndPassword } from '@/lib/teamsBackend';
import { listReportingSpocs } from '@/lib/reportingBackend';
import { setStoredSpocUser } from '@/lib/spocSession';

type SpocRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

const SPOC_PASSWORD_BY_EMAIL: Record<string, string> = {
  'smathala@gitam.in': 'Sindhu$538',
  'ethottem@gitam.in': 'Eesha@457',
  'baripill@gitam.in': 'Bhavana#914',
  'aakanksh@gitam.in': 'Akanksha$051',
  'sgurugub@gitam.in': 'Sathwik@889',
  'anistala@gitam.in': 'Anuradha$792',
  'mdwarapu2@gitam.in': 'Monisha&638',
  'sjoseph@student.gitam.edu': 'Step$029',
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

const normalizeSpocPasswordInput = (value: string) =>
  String(value || '').replace(/\s+/g, '').toLowerCase();

const buildSpocPassword = (name: string, phone: string) => {
  const compactName = String(name || '').replace(/\s+/g, '');
  const phoneDigits = String(phone || '').replace(/\D/g, '');
  return `${compactName}${phoneDigits}`.toLowerCase();
};

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const canonicalPhone = (value: string) => {
  const digits = normalizePhone(value);
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const isPhoneSecretMatch = (memberPhone: string, inputSecret: string) => {
  const memberDigits = canonicalPhone(memberPhone);
  const inputDigits = canonicalPhone(inputSecret);
  if (!memberDigits || !inputDigits) return false;
  return memberDigits === inputDigits;
};

const LOGIN_REQUEST_TIMEOUT_MS = 12000;

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
};

const isValidSpocPassword = (spoc: SpocRecord, inputPassword: string) => {
  const email = String(spoc?.email || '').trim().toLowerCase();
  const custom = SPOC_PASSWORD_BY_EMAIL[email];
  if (typeof custom === 'string') {
    return String(inputPassword || '').trim() === custom;
  }
  return normalizeSpocPasswordInput(inputPassword) === buildSpocPassword(String(spoc?.name || ''), String(spoc?.phone || ''));
};

export default function LoginPage() {
  const [formData, setFormData] = useState({
    identifier: '',
    password: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string>('');

  const normalizeId = useCallback((value: string) => {
    const trimmed = (value || '').trim();
    // If user entered a phone-like value, normalize to digits only.
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) return digitsOnly;
    return trimmed.toLowerCase();
  }, []);

  useEffect(() => {
    // Dev-only: seed demo team when visiting /login?seed=1
    try {
      if (process.env.NODE_ENV === 'production') return;
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      if (params.get('seed') !== '1') return;

      const demoTeam = {
        teamName: 'Demo Team',
        domain: 'AI/ML',
        teamPassword: 'Demo@1234',
        teamSize: 5,
        branch: 'CSE',
        program: 'B.Tech',
        programOther: '',
        members: [
          {
            name: 'Demo Lead',
            registrationNumber: '24HACK001',
            email: 'demo.lead@gitam.in',
            phoneNumber: '9000000001',
            school: 'School of CSE',
            program: 'B.Tech',
            programOther: '',
            branch: 'CSE',
            campus: 'Visakhapatnam',
            stay: 'Hostel',
            yearOfStudy: '3rd Year',
          },
          {
            name: 'Demo Member',
            registrationNumber: '24HACK002',
            email: 'demo.member@gitam.in',
            phoneNumber: '9000000002',
            school: 'School of CSE',
            program: 'B.Tech',
            programOther: '',
            branch: 'CSE',
            campus: 'Visakhapatnam',
            stay: 'Hostel',
            yearOfStudy: '3rd Year',
          },
          {
            name: 'Demo Member 2',
            registrationNumber: '24HACK003',
            email: 'demo.member2@gitam.in',
            phoneNumber: '9000000003',
            school: 'School of CSE',
            program: 'B.Tech',
            programOther: '',
            branch: 'CSE',
            campus: 'Visakhapatnam',
            stay: 'Hostel',
            yearOfStudy: '3rd Year',
          },
          {
            name: 'Demo Member 3',
            registrationNumber: '24HACK004',
            email: 'demo.member3@gitam.in',
            phoneNumber: '9000000004',
            school: 'School of CSE',
            program: 'B.Tech',
            programOther: '',
            branch: 'CSE',
            campus: 'Visakhapatnam',
            stay: 'Hostel',
            yearOfStudy: '3rd Year',
          },
          {
            name: 'Demo Member 4',
            registrationNumber: '24HACK005',
            email: 'demo.member4@gitam.in',
            phoneNumber: '9000000005',
            school: 'School of CSE',
            program: 'B.Tech',
            programOther: '',
            branch: 'CSE',
            campus: 'Visakhapatnam',
            stay: 'Hostel',
            yearOfStudy: '3rd Year',
          },
        ],
        selectedProblem: null,
      };

      localStorage.setItem('registeredTeams', JSON.stringify([demoTeam]));
      localStorage.setItem('currentTeam', JSON.stringify({ team: demoTeam, identifier: normalizeId(demoTeam.members[0].email) }));

      setFormData({ identifier: 'demo.lead@gitam.in', password: 'Demo@1234' });
      setInfoMessage('Demo data seeded (dev only). Signing in now...');
      // Auto-redirect in dev so the user lands on dashboard immediately
      setTimeout(() => { window.location.href = '/dashboard'; }, 300);
    } catch (e) {
      console.warn(e);
    }
  }, [normalizeId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.identifier.trim()) {
      newErrors.identifier = 'Email / Phone / Reg. No is required';
    }

    if (!formData.password) {
      newErrors.password = 'Team password or phone number is required';
    }

    return newErrors;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setInfoMessage('');

    try {
      // Admin credentials (shared with admin login)
      const ADMIN_USER = 'tcd_gcgc@gitam.edu';
      const ADMIN_PASS = 'TCD#GITAM@123';
      const idRaw = normalizeId(formData.identifier);
      const emailRaw = String(formData.identifier || '').trim().toLowerCase();
      const passwordRaw = String(formData.password || '').trim();

      // If Supabase is configured, try Auth-based login first.
      if (isSupabaseConfigured()) {
      // Admin login via Supabase Auth (recommended for RLS-based admin).
      if (idRaw === ADMIN_USER && formData.password === ADMIN_PASS) {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setErrors({ password: 'Supabase client unavailable. Check environment variables and reload.' });
          setIsLoading(false);
          return;
        }

        const adminSignIn = await withTimeout(
          supabase.auth.signInWithPassword({ email: ADMIN_USER, password: ADMIN_PASS }),
          LOGIN_REQUEST_TIMEOUT_MS
        );
        const error = adminSignIn?.error;
        if (!adminSignIn) {
          setErrors({ password: 'Login timed out. Please try again.' });
          setIsLoading(false);
          return;
        }
        if (error) {
          setErrors({ password: 'Admin Supabase sign-in failed. Verify Auth password for tcd_gcgc@gitam.edu.' });
          setIsLoading(false);
          return;
        }

        try { localStorage.setItem('adminLoggedIn', '1'); localStorage.setItem('adminUser', JSON.stringify({ user: ADMIN_USER })); } catch (e) {}
        window.location.href = '/admin/dashboard';
        return;
      }

      // Fast SPOC login from local snapshot first.
      try {
        const spocs: SpocRecord[] = readLocalSpocs();
        localStorage.setItem('reportingSpocs', JSON.stringify(spocs));

        const matchedSpoc = spocs.find((s) => s.email === emailRaw);
        if (
          matchedSpoc
          && passwordRaw
          && isValidSpocPassword(matchedSpoc, passwordRaw)
        ) {
          setStoredSpocUser({
            id: matchedSpoc.id,
            name: matchedSpoc.name,
            email: matchedSpoc.email,
            phone: matchedSpoc.phone,
          });
          window.location.href = '/spoc/dashboard';
          return;
        }
      } catch (e) {
        console.warn(e);
      }

      try {
        const session = await withTimeout(
          loginWithIdentifierAndPassword(formData.identifier, formData.password),
          LOGIN_REQUEST_TIMEOUT_MS
        );
        if (session?.team) {
          localStorage.setItem(
            'currentTeam',
            JSON.stringify({
              team: session.team,
              identifier: session.identifierNormalized,
              identifierNormalized: session.identifierNormalized,
              memberId: session.memberId,
              teamId: session.teamId,
            })
          );
          window.location.href = '/dashboard';
          return;
        }
      } catch (e) {
        console.warn(e);
      }

      // SPOC login fallback via backend fetch only when team login did not succeed.
      try {
        const remoteSpocs = await withTimeout(listReportingSpocs(), 5000);
        if (Array.isArray(remoteSpocs) && remoteSpocs.length) {
          const spocs: SpocRecord[] = remoteSpocs
            .map((s: any) => ({
              id: String(s?.id || '').trim(),
              name: String(s?.name || '').trim(),
              email: String(s?.email || '').trim().toLowerCase(),
              phone: String(s?.phone || '').trim(),
            }))
            .filter((s) => s.id && s.email);

          localStorage.setItem('reportingSpocs', JSON.stringify(spocs));
          const matchedSpoc = spocs.find((s) => s.email === emailRaw);
          if (matchedSpoc && passwordRaw && isValidSpocPassword(matchedSpoc, passwordRaw)) {
            setStoredSpocUser({
              id: matchedSpoc.id,
              name: matchedSpoc.name,
              email: matchedSpoc.email,
              phone: matchedSpoc.phone,
            });
            window.location.href = '/spoc/dashboard';
            return;
          }
        }
      } catch (e) {
        console.warn(e);
      }
      }

      // Legacy localStorage login
      if (idRaw === ADMIN_USER && formData.password === ADMIN_PASS) {
        try { localStorage.setItem('adminLoggedIn', '1'); localStorage.setItem('adminUser', JSON.stringify({ user: ADMIN_USER })); } catch (e) {}
        window.location.href = '/admin/dashboard';
        return;
      }

      // SPOC login fallback from local storage records.
      try {
        const spocs: SpocRecord[] = readLocalSpocs();
        localStorage.setItem('reportingSpocs', JSON.stringify(spocs));
        const matchedSpoc = spocs.find((s) => s.email === emailRaw);
        if (
          matchedSpoc
          && passwordRaw
          && isValidSpocPassword(matchedSpoc, passwordRaw)
        ) {
          setStoredSpocUser({
            id: matchedSpoc.id,
            name: matchedSpoc.name,
            email: matchedSpoc.email,
            phone: matchedSpoc.phone,
          });
          window.location.href = '/spoc/dashboard';
          return;
        }
      } catch (e) {
        console.warn(e);
      }

      let registered = [];
      try { registered = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); } catch { registered = []; }
      const id = normalizeId(formData.identifier);
      const match = registered.find((team: any) => {
        return team.members.some((m: any) => {
          const tokens = [m.email, m.phoneNumber, m.registrationNumber].map((s: string) => normalizeId(s || ''));
          if (!tokens.includes(id)) return false;

          const teamPasswordMatch = String(team.teamPassword || '') === String(formData.password || '');
          const phoneSecretMatch = isPhoneSecretMatch(String(m.phoneNumber || ''), String(formData.password || ''));
          return teamPasswordMatch || phoneSecretMatch;
        });
      });

      if (match) {
        localStorage.setItem('currentTeam', JSON.stringify({ team: match, identifier: id, identifierNormalized: id }));
        window.location.href = '/dashboard';
      } else {
        alert('Invalid credentials. Please check identifier and use team password or member phone number.');
        setIsLoading(false);
      }
    } catch (e) {
      console.warn(e);
      setErrors({ password: 'Login failed due to a temporary error. Please try again.' });
      setIsLoading(false);
    }
  };

  // demo seeding removed from UI for privacy

  const [activePanel, setActivePanel] = useState<string | null>(null);

  const togglePanel = (key: string) => setActivePanel(prev => prev === key ? null : key);

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
              <h2 className="text-2xl font-bold text-gitam-700 mb-2">Welcome Back</h2>
              <p className="text-gitam-700/75 mb-6">Sign in to your hackathon account</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {infoMessage ? (
                  <div className="text-sm rounded-lg px-3 py-2 bg-gitam-50 text-gitam-700 border border-gitam-100">
                    {infoMessage}
                  </div>
                ) : null}
                <div>
                  <label htmlFor="identifier" className="block text-sm font-semibold text-gitam-700 mb-2">Email / Phone / Reg. No</label>
                  <input
                    type="text"
                    id="identifier"
                    name="identifier"
                    value={formData.identifier}
                    onChange={handleChange}
                    placeholder="you@example.com or 9999999999 or REG001"
                    className={`hh-input ${errors.identifier ? 'border-gitam-600 bg-antique-100' : ''}`}
                  />
                  {errors.identifier && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.identifier}</p>}
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-gitam-700 mb-2">Password</label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Team password or your phone number"
                    className={`hh-input ${errors.password ? 'border-gitam-600 bg-antique-100' : ''}`}
                  />
                  {errors.password && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.password}</p>}
                </div>

                <div className="flex items-center justify-end">
                  <Link href="#" className="text-gitam text-sm font-semibold hover:underline">Forgot password?</Link>
                </div>

                <button type="submit" disabled={isLoading} className="hh-btn w-full py-2">
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>

              <p className="text-center text-gitam-700/80 mt-4">Don&apos;t have an account? <Link href="/register" className="text-gitam font-semibold hover:underline">Register here</Link></p>
            </div>
            </div>
        </div>
      </div>
    </main>
  );
}
