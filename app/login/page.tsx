'use client';

import { FormEvent, useCallback, useState } from 'react';
import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listReportingSpocs } from '@/lib/reportingBackend';
import { setStoredSpocUser } from '@/lib/spocSession';

type SpocRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
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

export default function LoginPage() {
  const [formData, setFormData] = useState({
    registrationNumber: '',
    mobile: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // const normalizeId = useCallback((value: string) => (value || '').trim().toLowerCase(), []);

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
    if (!formData.registrationNumber.trim()) {
      newErrors.registrationNumber = 'Registration number or email is required';
    }
    if (!String(formData.mobile || '').trim()) {
      newErrors.mobile = 'Registered mobile number is required';
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

    try {
      // 1. Check if user is a SPOC via Database or LocalStorage
      const inputEmail = formData.registrationNumber.toLowerCase().trim();
      const inputPhone = canonicalPhone(formData.mobile);

      const dbSpocs = await listReportingSpocs();
      const allSpocs = dbSpocs && dbSpocs.length > 0 ? dbSpocs : readLocalSpocs();

      const matchedSpoc = allSpocs.find(s =>
        s.email.toLowerCase() === inputEmail &&
        canonicalPhone(s.phone) === inputPhone
      );

      if (matchedSpoc) {
        setStoredSpocUser({
          id: matchedSpoc.id,
          name: matchedSpoc.name,
          email: matchedSpoc.email,
          phone: matchedSpoc.phone
        });
        window.location.href = '/spoc/dashboard';
        return;
      }

      // 2. If not SPOC, proceed with Member Login
      const res = await fetch('/api/auth/resolve-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: formData.registrationNumber,
          mobile: formData.mobile,
        }),
      });
      const data = await res.json();
      if (data.ok && data.member && data.team) {
        // Store session in localStorage
        const sessionPayload = {
          team: data.team,
          memberId: data.member.id,
          teamId: data.team.teamId,
          identifier: formData.registrationNumber, // This is the user's input (registration number or email)
        };
        localStorage.setItem('currentMember', JSON.stringify(data.member));
        localStorage.setItem('currentTeam', JSON.stringify(sessionPayload));
        window.location.href = '/dashboard';
        return;
      } else {
        if (data.error === 'resolver_not_configured') {
          setErrors({ mobile: 'System Error: Supabase backend is not configured securely. Please add SUPABASE_SERVICE_ROLE_KEY to your Vercel Environment Variables.' });
        } else {
          setErrors({ mobile: 'Invalid registration number/email or mobile number.' });
        }
      }
    } catch (e) {
      setErrors({ mobile: 'Login failed due to a temporary error. Please try again.' });
    }
    setIsLoading(false);
  };

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
                <div>
                  <label htmlFor="registrationNumber" className="block text-sm font-semibold text-gitam-700 mb-2">Registration Number or Email</label>
                  <input
                    type="text"
                    id="registrationNumber"
                    name="registrationNumber"
                    value={formData.registrationNumber}
                    onChange={handleChange}
                    placeholder="Enter your registration number or email"
                    className={`hh-input ${errors.registrationNumber ? 'border-gitam-600 bg-antique-100' : ''}`}
                  />
                  {errors.registrationNumber && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.registrationNumber}</p>}
                </div>

                <div>
                  <label htmlFor="mobile" className="block text-sm font-semibold text-gitam-700 mb-2">Registered Mobile Number</label>
                  <input
                    type="text"
                    id="mobile"
                    name="mobile"
                    value={formData.mobile}
                    onChange={handleChange}
                    placeholder="Enter your registered mobile number"
                    className={`hh-input ${errors.mobile ? 'border-gitam-600 bg-antique-100' : ''}`}
                  />
                  {errors.mobile && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.mobile}</p>}
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
