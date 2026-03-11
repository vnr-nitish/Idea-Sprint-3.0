'use client';

import { useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';

const MAX_TEAMS = 85; // internal hard cap
const SHOW_THRESHOLD = 60; // only show ticker when this many (or fewer) slots remain

export default function RegistrationTicker() {
  const [registeredCount, setRegisteredCount] = useState(0);

  const refreshCount = async () => {
    try {
      if (isSupabaseConfigured()) {
        const rows = await listTeamsWithMembers();
        if (Array.isArray(rows)) {
          setRegisteredCount(rows.length);
          return;
        }
      }
    } catch {
      // fall through to localStorage
    }
    try {
      const stored = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
      if (Array.isArray(stored)) setRegisteredCount(stored.length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshCount();
    const poll = setInterval(refreshCount, 5000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'registeredTeams') refreshCount();
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  const left = useMemo(() => Math.max(0, MAX_TEAMS - registeredCount), [registeredCount]);

  // Only show the ticker once 60 or fewer slots remain (after at least 25 teams have registered)
  if (left > SHOW_THRESHOLD) return null;

  const closed = left === 0;
  const segment = closed
    ? 'Registrations are Closed \u2022 Registrations are Closed \u2022 Registrations are Closed \u2022'
    : `${left} registrations are left \u2022 ${left} registrations are left \u2022 ${left} registrations are left \u2022`;

  return (
    <div
      className={`w-full overflow-hidden py-3 ${
        closed ? 'bg-red-600 text-antique' : 'bg-antique border-y-2 border-red-500 text-red-700'
      }`}
    >
      <div className="ticker-track whitespace-nowrap font-semibold text-sm tracking-widest uppercase">
        {segment}
      </div>
      <style jsx>{`
        .ticker-track {
          display: inline-block;
          animation: slide-left 14s linear infinite;
        }
        @keyframes slide-left {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
