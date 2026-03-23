'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStoredSpocUser, isSpocLoggedIn } from '@/lib/spocSession';

const MODULES = [
  { key: 'team-profiles', icon: '👥', label: 'Team Profiles', href: '/spoc/team-profiles' },
  { key: 'reporting', icon: '🗓️', label: 'Reporting', href: '/spoc/reporting' },
  { key: 'food-coupons', icon: '🍽️', label: 'Food Coupons', href: '/spoc/food-coupons' },
  { key: 'noc', icon: '📄', label: 'NOC', href: '/spoc/noc' },
  { key: 'ppt', icon: '📊', label: 'PPT', href: '/spoc/ppt' },
  { key: 'problem-statements', icon: '🧩', label: 'Problem Statements', href: '/spoc/problem-statements' },
  { key: 'id-cards-certificates', icon: '🪪', label: 'ID Cards & Certificates', href: '/spoc/id-cards-certificates' },
  { key: 'others', icon: '🔗', label: 'Others', href: '/spoc/others' },
];

export default function SpocDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState('SPOC');

  useEffect(() => {
    if (!isSpocLoggedIn()) {
      router.push('/spoc');
      return;
    }
    const user = getStoredSpocUser();
    setName(String(user?.name || 'SPOC'));
  }, [router]);

  return (
    <main className="min-h-screen bg-antique p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          <h1 className="text-3xl font-bold text-gitam-700">SPOC Dashboard</h1>
          <p className="text-gitam-700/80 mt-2">Welcome, {name}. You can access only teams assigned to you.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {MODULES.map((m) => (
            <button
              key={m.key}
              onClick={() => router.push(m.href)}
              className="p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center"
            >
              <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">{m.icon}</div>
              <div className="mt-3 text-gitam-700 text-center">{m.label}</div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
