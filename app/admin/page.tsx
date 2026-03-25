'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabaseClient';

export default function AdminLoginPage() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Hardcoded dev credentials
  // Hardcoded admin credentials (production should use a secure backend)
  const ADMIN_USER = 'tcd_gcgc@gitam.edu';
  const ADMIN_PASS = 'TCD#GITAM@123';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (!supabase) {
          setErr('Supabase client is not available. Check environment variables and reload.');
          return;
        }

        const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_USER, password: ADMIN_PASS });
        if (error) {
          console.warn('Admin Supabase sign-in failed, proceeding with local offline session.', error);
          // We used to block login here, but for hackathons, fallback to local session if DB RLS allows it
        }
      }
      try {
        localStorage.setItem('adminLoggedIn', '1');
        localStorage.setItem('adminUser', JSON.stringify({ user: ADMIN_USER }));
      } catch (e) { }
      router.push('/admin/dashboard');
    } else {
      setErr('Invalid credentials');
    }
  };

  return (
    <main className="hh-page flex items-center justify-center p-6">
      <div className="w-full max-w-md hh-card rounded-2xl p-6">
        <h1 className="text-2xl font-bold mb-4 text-gitam-700">Admin Login</h1>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium">Username</label>
            <input value={user} onChange={(e) => setUser(e.target.value)} className="hh-input mt-1 w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium">Password</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} className="hh-input mt-1 w-full" />
          </div>
          {err && (
            <div className="rounded-lg border border-gitam-200 bg-gitam-50 p-2 text-sm text-gitam-700">{err}</div>
          )}
          <div className="flex justify-between items-center">
            <button type="submit" className="hh-btn">Login</button>
            <div className="text-sm text-gitam-700/60">Admin credential: <span className="font-mono">tcd_gcgc@gitam.edu / TCD#GITAM@123</span></div>
          </div>
        </form>
      </div>
    </main>
  );
}
