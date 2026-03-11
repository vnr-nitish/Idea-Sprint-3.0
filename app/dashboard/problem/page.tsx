'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProblemStatement {
  id: string;
  domain: string;
  code: string;
  title?: string;
  description: string;
  outcome: string;
  createdAt: string;
}

export default function DashboardProblemPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'view' | 'select'>('view');
  const [team, setTeam] = useState<any>(null);
  const [problems, setProblems] = useState<ProblemStatement[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const normalizeDomain = (value: unknown) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'app development') return 'App Development';
    if (raw === 'cybersecurity' || raw === 'cyber security') return 'Cyber Security';
    if (raw === 'artificial intelligence' || raw === 'ai') return 'AI';
    if (raw === 'machine learning and data science' || raw === 'ml & data science' || raw === 'ml & ds') return 'ML & DS';
    return String(value || '').trim();
  };

  useEffect(() => {
    const navbar = document.querySelector('nav');
    if (navbar) (navbar as HTMLElement).style.display = 'none';
    return () => {
      const navbar = document.querySelector('nav');
      if (navbar) (navbar as HTMLElement).style.display = '';
    };
  }, []);

  useEffect(() => {
    try {
      const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
      if (current) {
        const teamData = current.team;
        setTeam(teamData);

        try {
          const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
          setProblems(Array.isArray(ps) ? ps : []);
        } catch {
          setProblems([]);
        }

        const currentCode = String(teamData.selectedProblemStatement || teamData.selectedProblem || '').trim();
        setSelectedCode(currentCode);
      }
      setLoading(false);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const reload = () => {
      try {
        const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
        if (current?.team) {
          setTeam(current.team);
          const currentCode = String(current.team.selectedProblemStatement || current.team.selectedProblem || '').trim();
          setSelectedCode(currentCode);
        }
      } catch {
        // ignore
      }

      try {
        const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
        setProblems(Array.isArray(ps) ? ps : []);
      } catch {
        setProblems([]);
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('problem_') || e.key === 'currentTeam' || e.key === 'registeredTeams' || e.key === 'problemStatements') {
        reload();
      }
    };

    window.addEventListener('storage', onStorage);
    const poll = setInterval(reload, 2500);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  if (loading) {
    return (
      <main className="hh-page p-6">
        <div className="max-w-6xl mx-auto text-center text-gitam-700">
          <p>Loading...</p>
        </div>
      </main>
    );
  }

  if (!team) {
    return (
      <main className="hh-page p-6">
        <div className="max-w-6xl mx-auto">
          <div className="hh-card border-2 border-gitam-200 p-6 mb-6">
            <h1 className="text-4xl font-bold text-gitam-700">Problem Statement</h1>
          </div>
          <div className="hh-card border-2 border-gitam-200 p-6">
            <p className="text-gitam-700">You are not part of any team. Please register first.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="hh-btn px-4 py-2 mt-4"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const teamDomain = normalizeDomain(team?.domain);
  const domainProblems = problems.filter((p) => normalizeDomain(p.domain) === teamDomain);
  const selectedProblem = problems.find((p) => String(p.code || '').trim() === selectedCode) || null;

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="hh-card border-2 border-gitam-200 p-6 mb-6 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-bold text-gitam-700">Problem Statement</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        <div className="mb-6 flex gap-3">
          <button
            onClick={() => setTab('view')}
            className={`px-5 py-2 rounded-xl border-2 font-semibold transition ${tab === 'view' ? 'bg-gitam-700 text-antique border-gitam-700' : 'bg-antique border-gitam-200 text-gitam-700'}`}
          >
            View Statements
          </button>
          <button
            onClick={() => setTab('select')}
            className={`px-5 py-2 rounded-xl border-2 font-semibold transition ${tab === 'select' ? 'bg-gitam-700 text-antique border-gitam-700' : 'bg-antique border-gitam-200 text-gitam-700'}`}
          >
            Select Statement
          </button>
        </div>

        {tab === 'view' ? (
          <div className="hh-card p-6 border-2 border-gitam-200 mb-6 overflow-x-auto">
            {domainProblems.length === 0 ? (
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5 text-gitam-700/75">
                No problem statements available for your domain yet.
              </div>
            ) : (
              <table className="w-full text-sm border-collapse border border-gitam-200">
                <thead>
                  <tr className="bg-gitam-50 text-gitam-700">
                    <th className="p-3 text-left font-semibold border border-gitam-200">Code</th>
                    <th className="p-3 text-left font-semibold border border-gitam-200">Title</th>
                    <th className="p-3 text-left font-semibold border border-gitam-200">Description</th>
                    <th className="p-3 text-left font-semibold border border-gitam-200">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {domainProblems.map((ps) => (
                    <tr key={ps.id} className="hover:bg-gitam-50/40">
                      <td className="p-3 text-gitam-700 border border-gitam-200 font-semibold">{ps.code}</td>
                      <td className="p-3 text-gitam-700 border border-gitam-200">{ps.title || ps.code}</td>
                      <td className="p-3 text-gitam-700 border border-gitam-200">{ps.description || '-'}</td>
                      <td className="p-3 text-gitam-700 border border-gitam-200">{ps.outcome || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="hh-card p-6 border-2 border-gitam-200 mb-6">
            <h2 className="text-xl font-semibold text-gitam-700 mb-4">Selected Problem Statement</h2>
            <div className="space-y-4">
              <div className="border-2 border-gitam-200 rounded-lg p-4 bg-antique/60">
                <h3 className="text-lg font-semibold text-gitam-700 mb-3">Selected Problem Statement</h3>
                {selectedProblem ? (
                  <div className="rounded-xl border-2 border-gitam-200 bg-antique p-4">
                    <ul className="list-disc pl-5 space-y-2 text-gitam-700">
                      <li><span className="font-semibold">PS Code:</span> {selectedProblem.code || '-'}</li>
                      <li><span className="font-semibold">Title:</span> {selectedProblem.title || selectedProblem.code || '-'}</li>
                      <li><span className="font-semibold">Description:</span> {selectedProblem.description || '-'}</li>
                      <li><span className="font-semibold">Outcome:</span> {selectedProblem.outcome || '-'}</li>
                    </ul>
                  </div>
                ) : (
                  <p className="text-gitam-700/75">Not yet selected.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
