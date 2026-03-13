'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';
import { loginWithIdentifierAndPassword } from '@/lib/teamsBackend';

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
      newErrors.password = 'Password is required';
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

    setTimeout(async () => {
      // Admin credentials (shared with admin login)
      const ADMIN_USER = 'tcd_gcgc@gitam.edu';
      const ADMIN_PASS = 'TCD#GITAM@123';
      const idRaw = normalizeId(formData.identifier);

      // If Supabase is configured, try Auth-based login first.
      if (isSupabaseConfigured()) {
        // Admin login via Supabase Auth (recommended for RLS-based admin).
        if (idRaw === ADMIN_USER && formData.password === ADMIN_PASS) {
          try {
            const supabase = getSupabaseClient();
            await supabase?.auth.signInWithPassword({ email: ADMIN_USER, password: ADMIN_PASS });
          } catch (e) {
            // ignore and fall back to legacy admin flag
          }
          try { localStorage.setItem('adminLoggedIn', '1'); localStorage.setItem('adminUser', JSON.stringify({ user: ADMIN_USER })); } catch (e) {}
          window.location.href = '/admin/dashboard';
          return;
        }

        try {
          const session = await loginWithIdentifierAndPassword(formData.identifier, formData.password);
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
      }

      // Legacy localStorage login
      if (idRaw === ADMIN_USER && formData.password === ADMIN_PASS) {
        try { localStorage.setItem('adminLoggedIn', '1'); localStorage.setItem('adminUser', JSON.stringify({ user: ADMIN_USER })); } catch (e) {}
        window.location.href = '/admin/dashboard';
        return;
      }
      let registered = [];
      try { registered = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); } catch { registered = []; }
      const id = normalizeId(formData.identifier);
      const match = registered.find((team: any) => {
        if (team.teamPassword !== formData.password) return false;
        return team.members.some((m: any) => {
          const tokens = [m.email, m.phoneNumber, m.registrationNumber].map((s: string) => normalizeId(s || ''));
          return tokens.includes(id);
        });
      });

      if (match) {
        localStorage.setItem('currentTeam', JSON.stringify({ team: match, identifier: id, identifierNormalized: id }));
        window.location.href = '/dashboard';
      } else {
        alert('Invalid credentials. Please check identifier and team password.');
        setIsLoading(false);
      }
    }, 600);
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
                    placeholder="Team password"
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
