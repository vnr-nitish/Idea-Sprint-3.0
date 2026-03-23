'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { clearStoredSpocUser, isSpocLoggedIn } from '@/lib/spocSession';

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [spocLoggedIn, setSpocLoggedIn] = useState(false);

  const isAdminRoute = (pathname || '').startsWith('/admin');
  const isSpocRoute = (pathname || '').startsWith('/spoc');
  const isMemberRoute = (pathname || '').startsWith('/dashboard');
  const isDashboardSubRoute = (pathname || '').startsWith('/dashboard/');
  const showAuthButtons = (pathname || '') === '/';

  useEffect(() => {
    // Prefetch the register route so navigating to it feels instant
    try {
      router.prefetch('/register');
    } catch (e) {
      // ignore in dev if prefetch not available
    }

    try {
      const a = localStorage.getItem('adminLoggedIn');
      setAdminLoggedIn(!!a);
    } catch (e) {
      setAdminLoggedIn(false);
    }

    try {
      setSpocLoggedIn(isSpocLoggedIn());
    } catch (e) {
      setSpocLoggedIn(false);
    }

    try {
      const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
      // validate shape: expect { team: { teamName: string, ... } }
      const isValid = current && ((current.team && current.team.teamName) || current.teamName);
      setLoggedIn(!!isValid);
    } catch (e) {
      setLoggedIn(false);
    }
  }, [router, pathname]);

  useEffect(() => {
    const onStorage = () => {
      try {
        const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
        setLoggedIn(!!current);
      } catch (e) {
        setLoggedIn(false);
      }

      try {
        const a = localStorage.getItem('adminLoggedIn');
        setAdminLoggedIn(!!a);
      } catch (e) {
        setAdminLoggedIn(false);
      }

      try {
        setSpocLoggedIn(isSpocLoggedIn());
      } catch (e) {
        setSpocLoggedIn(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = getSupabaseClient();
      if (supabase) await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }

    try {
      localStorage.removeItem('currentTeam');
      localStorage.removeItem('adminLoggedIn');
      localStorage.removeItem('adminUser');
      clearStoredSpocUser();
    } catch (e) {
      // ignore
    }

    setLoggedIn(false);
    setAdminLoggedIn(false);
    setSpocLoggedIn(false);
    router.push('/');
  };

  const isAnyLoggedIn = loggedIn || adminLoggedIn || spocLoggedIn;

  const homeHref = (() => {
    if (isAdminRoute || adminLoggedIn) return '/admin/dashboard';
    if (isSpocRoute || spocLoggedIn) return '/spoc/dashboard';
    if (isMemberRoute || loggedIn) return '/dashboard';
    return '/';
  })();

  if (isDashboardSubRoute) return null;

  return (
    <nav className="w-full bg-antique shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <Link href={homeHref} className="text-2xl font-bold text-gitam-700">TMCG GITAM</Link>

          {/* Auth / Logout Buttons */}
          <div className="flex gap-4">
            {showAuthButtons ? (
              <>
                <Link
                  href="/login"
                  className="hh-btn-outline"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  onMouseEnter={() => router.prefetch('/register')}
                  className="hh-btn"
                >
                  Register
                </Link>
              </>
            ) : null}

            {!showAuthButtons && isAnyLoggedIn ? (
              <button
                onClick={handleLogout}
                className="hh-btn"
              >
                Logout
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
