'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getReportingAssignmentForTeam } from '@/lib/reportingBackend';
import { refreshCurrentTeamSession } from '@/lib/teamSession';

export default function SpocPage() {
  const router = useRouter();
  const [teamData, setTeamData] = useState<any>(null);
  const [assignment, setAssignment] = useState<any>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);

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
      } catch (e) {
        console.warn(e);
      }
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
    if (!teamData?.teamName) return;
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

  if (!sessionLoaded) {
    return <main className="hh-page" />;
  }

  if (!teamData) {
    return (
      <main className="hh-page flex items-center justify-center">
        <div className="hh-card p-6">No session found. Please login.</div>
      </main>
    );
  }

  const spoc = assignment?.spoc;

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="hh-card border-2 border-gitam-200 p-6 mb-6 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-bold text-gitam-700">SPOC Details</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        <div className="hh-card p-6 border-2 border-gitam-200">
          {spoc ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5">
                <div className="text-sm text-gitam-700/70 mb-2">SPOC Name</div>
                <div className="text-2xl font-semibold text-gitam-700 break-words">{spoc.name || '-'}</div>
              </div>
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5">
                <div className="text-sm text-gitam-700/70 mb-2">Email ID</div>
                <div className="text-2xl font-semibold text-gitam-700 break-words">{spoc.email || '-'}</div>
              </div>
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5">
                <div className="text-sm text-gitam-700/70 mb-2">Phone Number</div>
                <div className="text-2xl font-semibold text-gitam-700">{spoc.phone || '-'}</div>
              </div>
            </div>
          ) : (
            <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5 text-gitam-700/75">
              SPOC details will be shared soon.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}