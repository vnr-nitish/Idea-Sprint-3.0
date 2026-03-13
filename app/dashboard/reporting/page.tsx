'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getReportingAssignmentForTeam } from '@/lib/reportingBackend';
import { refreshCurrentTeamSession } from '@/lib/teamSession';

const formatDisplayDate = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const year = match[1];
  const month = months[Number(match[2]) - 1];
  const day = String(Number(match[3]));
  return month ? `${day} ${month} ${year}` : raw;
};

export default function ReportingPage() {
  const [teamData, setTeamData] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const router = useRouter();

  const loadAssignment = async (teamName: string) => {
    try {
      const remote = await getReportingAssignmentForTeam(teamName);
      if (remote) {
        setAssignment(remote);
        return;
      }
    } catch {
      // Fall back to local cache.
    }

    try {
      const all = JSON.parse(localStorage.getItem('reportingAssignments') || 'null');
      if (all && all[teamName]) {
        setAssignment(all[teamName]);
        return;
      }
    } catch (e) {
      console.warn(e);
    }

    setAssignment(null);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const current = await refreshCurrentTeamSession();
        if (current) setTeamData(current.team);
      } catch (e) { console.warn(e); }
      finally { setSessionLoaded(true); }
    };

    void load();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'currentTeam') {
        void load();
      }
    };

    window.addEventListener('storage', onStorage);
    const poll = setInterval(() => {
      void load();
    }, 2000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!teamData) return;
    void loadAssignment(teamData.teamName);

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'reportingAssignments') {
        void loadAssignment(teamData.teamName);
      }
    };

    window.addEventListener('storage', onStorage);
    const poll = setInterval(() => {
      void loadAssignment(teamData.teamName);
    }, 2500);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, [teamData]);

  if (!sessionLoaded) return <main className="hh-page" />;

  if (!teamData) return <main className="hh-page flex items-center justify-center"> <div className="hh-card p-6">No session found. Please login.</div></main>;

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="hh-card border-2 border-gitam-200 p-6 mb-6 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-bold text-gitam-700">Reporting Details</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        <div className="hh-card p-6 border-2 border-gitam-200">
          {assignment && (assignment.date || assignment.time || assignment.venue) ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5">
                <div className="text-sm text-gitam-700/70 mb-2">Reporting Date</div>
                <div className="text-2xl font-semibold text-gitam-700">{formatDisplayDate(assignment.date || '')}</div>
              </div>
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5">
                <div className="text-sm text-gitam-700/70 mb-2">Reporting Time</div>
                <div className="text-2xl font-semibold text-gitam-700">{assignment.time || '-'}</div>
              </div>
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5">
                <div className="text-sm text-gitam-700/70 mb-2">Reporting Venue</div>
                <div className="text-2xl font-semibold text-gitam-700">{assignment.venue || '-'}</div>
              </div>
            </div>
          ) : (
            <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5 text-gitam-700/75">
              Reporting schedule will be shared soon.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
