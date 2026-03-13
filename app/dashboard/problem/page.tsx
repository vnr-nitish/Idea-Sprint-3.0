'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTeamProblemSelection, listProblemStatements, upsertTeamProblemSelection } from '@/lib/problemBackend';
import { isSupabaseConfigured } from '@/lib/supabaseClient';

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
  const [isLead, setIsLead] = useState(false);
  const [problems, setProblems] = useState<ProblemStatement[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [pendingCode, setPendingCode] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string>('');
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

  const saveProblemSelection = async () => {
    if (!team) return;
    setSaving(true);
    setSaveMsg('');
    try {
      const normalizedCode = String(pendingCode || '').trim();
      const ok = isSupabaseConfigured()
        ? await upsertTeamProblemSelection(String(team.teamName || ''), normalizedCode)
        : true;
      if (ok) {
        setSelectedCode(normalizedCode);
        setPendingCode(normalizedCode);
        // update localStorage session
        try {
          const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
          if (current?.team) {
            const updated = { ...current, team: { ...current.team, selectedProblem: normalizedCode || null, selectedProblemStatement: normalizedCode || null } };
            localStorage.setItem('currentTeam', JSON.stringify(updated));
          }
        } catch { /* ignore */ }
        setSaveMsg('Saved successfully!');
      } else {
        setSaveMsg('Save failed. Please try again.');
      }
    } catch {
      setSaveMsg('Save failed. Please try again.');
    }
    setSaving(false);
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
    const load = async () => {
      try {
        const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
        if (current) {
          const teamData = current.team;
          setTeam(teamData);

          // Detect if current user is the team lead using same token matching as profile page
          const normalizeId = (v: unknown) => String(v || '').toLowerCase().replace(/[^a-z0-9@_.]/g, '').trim();
          const currentIdentifier = normalizeId(current.identifier || current.identifierNormalized || '');
          const members: any[] = Array.isArray(teamData.members) ? teamData.members : [];
          const leadMember = members.find((m: any) => {
            const n = String(m?.name || '').toLowerCase();
            const e = String(m?.email || '').toLowerCase();
            return n.includes('lead') || e.includes('.lead@');
          }) || members[0];
          const leadTokens = [leadMember?.email, leadMember?.phoneNumber, leadMember?.registrationNumber].map((v: any) => normalizeId(v));
          setIsLead(!!(currentIdentifier && leadTokens.includes(currentIdentifier)));

          try {
            const remotePs = await listProblemStatements();
            if (Array.isArray(remotePs)) {
              setProblems(remotePs as any[]);
            } else {
              const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
              setProblems(Array.isArray(ps) ? ps : []);
            }
          } catch {
            const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
            setProblems(Array.isArray(ps) ? ps : []);
          }

          let currentCode = String(teamData.selectedProblemStatement || teamData.selectedProblem || '').trim();
          try {
            const remoteCode = await getTeamProblemSelection(String(teamData.teamName || ''));
            if (remoteCode !== null) currentCode = String(remoteCode).trim();
          } catch {
            // keep local fallback
          }
          setSelectedCode(currentCode);
          setPendingCode(currentCode);
        }
        setLoading(false);
      } catch (error) {
        console.error(error);
        setLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    const reload = async () => {
      try {
        const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
        if (current?.team) {
          setTeam(current.team);
          let currentCode = String(current.team.selectedProblemStatement || current.team.selectedProblem || '').trim();
          try {
            const remoteCode = await getTeamProblemSelection(String(current.team.teamName || ''));
            if (remoteCode !== null) currentCode = String(remoteCode).trim();
          } catch {
            // keep local fallback
          }
          setSelectedCode(currentCode);
          setPendingCode(currentCode);
        }
      } catch {
        // ignore
      }

      try {
        const remotePs = await listProblemStatements();
        if (Array.isArray(remotePs)) {
          setProblems(remotePs as any[]);
        } else {
          const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
          setProblems(Array.isArray(ps) ? ps : []);
        }
      } catch {
        try {
          const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
          setProblems(Array.isArray(ps) ? ps : []);
        } catch {
          setProblems([]);
        }
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith('problem_') || e.key === 'currentTeam' || e.key === 'registeredTeams' || e.key === 'problemStatements') {
        void reload();
      }
    };

    window.addEventListener('storage', onStorage);
    const poll = setInterval(() => {
      void reload();
    }, 2500);
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
            <h2 className="text-xl font-semibold text-gitam-700 mb-4">Select Problem Statement</h2>
            {!isLead ? (
              <div className="bg-antique/60 border-2 border-gitam-200 rounded-xl p-5 text-gitam-700/75">
                Only the team lead can select a problem statement. Your current selection is shown below.
                {selectedCode ? (
                  <div className="mt-3 font-semibold text-gitam-700">Selected: {selectedCode}</div>
                ) : (
                  <div className="mt-3 text-gitam-700/60">No problem statement selected yet.</div>
                )}
                {selectedProblem ? (
                  <div className="mt-4 rounded-xl border border-gitam-200 bg-white/80 p-4 space-y-2">
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Code:</span> {selectedProblem.code || '-'}</div>
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Title:</span> {selectedProblem.title || selectedProblem.code || '-'}</div>
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Description:</span> {selectedProblem.description || '-'}</div>
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Outcome:</span> {selectedProblem.outcome || '-'}</div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-gitam-700">Domain</label>
                  <input
                    type="text"
                    readOnly
                    value={normalizeDomain(team?.domain) || '-'}
                    className="border-2 border-gitam-200 rounded-xl px-4 py-2 bg-gitam-50/60 text-gitam-700 font-medium cursor-not-allowed w-full max-w-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-semibold text-gitam-700">Problem Statement Code</label>
                  {domainProblems.length === 0 ? (
                    <p className="text-gitam-700/60 text-sm">No problem statements available for your domain yet.</p>
                  ) : (
                    <select
                      value={pendingCode}
                      onChange={(e) => { setPendingCode(e.target.value); setSaveMsg(''); }}
                      className="border-2 border-gitam-200 rounded-xl px-4 py-2 bg-antique text-gitam-700 font-medium w-full max-w-sm focus:outline-none focus:border-gitam-700"
                    >
                      <option value="">-- Select a problem code --</option>
                      {domainProblems.map((ps) => (
                        <option key={ps.id} value={ps.code}>{ps.code}{ps.title ? ` — ${ps.title}` : ''}</option>
                      ))}
                    </select>
                  )}
                </div>
                {selectedCode && (
                  <div className="text-sm text-gitam-700/75">
                    Currently saved: <span className="font-semibold text-gitam-700">{selectedCode}</span>
                  </div>
                )}
                {selectedProblem ? (
                  <div className="rounded-xl border border-gitam-200 bg-gitam-50/40 p-4 space-y-2">
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Code:</span> {selectedProblem.code || '-'}</div>
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Title:</span> {selectedProblem.title || selectedProblem.code || '-'}</div>
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Description:</span> {selectedProblem.description || '-'}</div>
                    <div className="text-sm"><span className="font-semibold text-gitam-700">Outcome:</span> {selectedProblem.outcome || '-'}</div>
                  </div>
                ) : null}
                <button
                  onClick={() => void saveProblemSelection()}
                  disabled={saving || !pendingCode || pendingCode === selectedCode}
                  className="hh-btn px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saveMsg && (
                  <p className={`text-sm font-medium ${saveMsg.startsWith('Saved') ? 'text-green-700' : 'text-red-600'}`}>{saveMsg}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
