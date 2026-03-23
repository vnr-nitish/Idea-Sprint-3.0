'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SpocLoginRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <main className="hh-page flex items-center justify-center p-6">
      <div className="w-full max-w-md hh-card rounded-2xl p-6 text-center">
        <h1 className="text-2xl font-bold mb-2 text-gitam-700">Redirecting to Login</h1>
        <p className="text-sm text-gitam-700/80">Use one login page for Admin, SPOC, and Team access.</p>
      </div>
    </main>
  );
}
