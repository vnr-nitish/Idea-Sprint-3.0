'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';
import { filterTeamsForSpoc, getStoredSpocUser, isSpocLoggedIn, SpocUser } from '@/lib/spocSession';
import {
  deleteProblemStatementById,
  listProblemStatements,
  listTeamProblemSelections,
  upsertProblemStatements,
  upsertTeamProblemSelection,
} from '@/lib/problemBackend';

interface ProblemStatement {
  id: string;
  domain: string;
  code: string;
  description: string;
  outcome: string;
  createdAt: string;
  isHidden?: boolean;
}

export default function AdminProblemStatementsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isSpocView = (pathname || '').startsWith('/spoc');
  const [spocUser, setSpocUser] = useState<SpocUser | null>(null);
  const [tab, setTab] = useState<'statements' | 'teams'>('statements');
  const [registered, setRegistered] = useState<any[]>([]);
  const [problems, setProblems] = useState<ProblemStatement[]>([]);
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [teamSelections, setTeamSelections] = useState<Record<string, string>>({});

  // Problem Statement form state
  const [domain, setDomain] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [statementDomainFilter, setStatementDomainFilter] = useState('All');

  // Filters for Teams tab
  const [campusFilter, setCampusFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [attendanceFilter, setAttendanceFilter] = useState('All');
  const [zoneFilter, setZoneFilter] = useState('All');
  const [spocFilter, setSpocFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedTeams, setSelectedTeams] = useState<Record<string, boolean>>({});
  const [bulkDeadlineInput, setBulkDeadlineInput] = useState('');
  const [generalDeadlineInput, setGeneralDeadlineInput] = useState('2026-03-26T19:00');
  const [generalDeadlineLocked, setGeneralDeadlineLocked] = useState(false);
  const [editingTeamKey, setEditingTeamKey] = useState<string | null>(null);
  const [editingTeamPsCode, setEditingTeamPsCode] = useState('');
  const [extendDeadlineInputs, setExtendDeadlineInputs] = useState<Record<string, string>>({});
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [editingDeadlineKey, setEditingDeadlineKey] = useState<string | null>(null);

  const DOMAIN_OPTIONS = ['App Development', 'Cyber Security', 'AI', 'ML & DS'];
  const DEFAULT_DEADLINE_ISO = '2026-03-26T19:00:00';

  const rowKeyFor = (teamName: string, campus: string) => `${teamName}::${campus}`;
  const localDeadlineKeyFor = (teamName: string, campus: string) => `problem_deadline_${encodeURIComponent(teamName)}_${encodeURIComponent(campus)}`;

  const normalizeDomain = (value: any) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'app development') return 'App Development';
    if (raw === 'cybersecurity' || raw === 'cyber security') return 'Cyber Security';
    if (raw === 'artificial intelligence' || raw === 'ai') return 'AI';
    if (raw === 'machine learning and data science' || raw === 'ml & data science' || raw === 'ml & ds') return 'ML & DS';
    return String(value);
  };

  const canonicalTeamKey = useCallback((teamName: string) => String(teamName || '').trim().toLowerCase(), []);

  const assignmentsIndex = useMemo(() => {
    const next: Record<string, any> = {};
    Object.entries(assignments || {}).forEach(([teamName, value]) => {
      const key = canonicalTeamKey(teamName);
      if (key) next[key] = value;
    });
    return next;
  }, [assignments, canonicalTeamKey]);

  const getAssignmentForTeam = useCallback((teamName: string) => {
    const direct = assignments[String(teamName || '').trim()];
    if (direct) return direct;
    return assignmentsIndex[canonicalTeamKey(teamName)] || {};
  }, [assignments, assignmentsIndex, canonicalTeamKey]);

  const getZoneForTeam = useCallback((teamName: string) => getAssignmentForTeam(teamName)?.venue || '-', [getAssignmentForTeam]);

  useEffect(() => {
    if (!isSpocView) return;
    if (!isSpocLoggedIn()) {
      router.push('/spoc');
      return;
    }
    setSpocUser(getStoredSpocUser());
    setTab('teams');
  }, [isSpocView, router]);

  const scopedRegistered = useMemo(() => {
    if (!isSpocView) return registered;
    return filterTeamsForSpoc(registered, assignments, spocUser);
  }, [registered, assignments, spocUser, isSpocView]);

  const getSpocForTeam = useCallback((teamName: string) => {
    return String(getAssignmentForTeam(teamName)?.spoc?.name || '-');
  }, [getAssignmentForTeam]);

  const getTeamAttendance = (teamName: string): string => {
    try {
      const saved = localStorage.getItem(`team_attendance_${teamName}`) || '';
      return saved === 'Present' || saved === 'Absent' ? saved : '-';
    } catch {
      return '-';
    }
  };

  const getTeamSelectedCode = useCallback((team: any) => {
    const teamName = String(team?.teamName || '').trim();
    if (Object.prototype.hasOwnProperty.call(teamSelections || {}, teamName)) {
      return String(teamSelections?.[teamName] || '').trim();
    }
    const raw = String(team?.selectedProblemStatement || team?.selectedProblem || '').trim();
    return raw;
  }, [teamSelections]);

  const formatDate = (iso?: string) => {
    if (!iso) return '-';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  };

  const getGeneralDeadlineIso = () => {
    try {
      return localStorage.getItem('problem_general_deadline') || new Date(DEFAULT_DEADLINE_ISO).toISOString();
    } catch {
      return new Date(DEFAULT_DEADLINE_ISO).toISOString();
    }
  };

  const getTeamCustomDeadlineIso = (teamName: string, campus: string) => {
    try {
      return localStorage.getItem(localDeadlineKeyFor(teamName, campus));
    } catch {
      return null;
    }
  };

  const getEffectiveTeamDeadlineIso = (teamName: string, campus: string) => {
    return getTeamCustomDeadlineIso(teamName, campus) || getGeneralDeadlineIso();
  };

  // Load data on mount
  useEffect(() => {
    const navbar = document.querySelector('nav');
    if (navbar) (navbar as HTMLElement).style.display = 'none';
    return () => {
      const navbar = document.querySelector('nav');
      if (navbar) (navbar as HTMLElement).style.display = '';
    };
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      if (showModal || editingTeamKey || editingDeadlineKey) return;

      void (async () => {
        try {
          if (isSupabaseConfigured()) {
            const rows = await listTeamsWithMembers();
            if (rows) setRegistered(rows);
          } else {
            const r = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
            setRegistered(Array.isArray(r) ? r : []);
          }
        } catch {
          // ignore
        }

        try {
          const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
          setAssignments(map || {});
        } catch {
          setAssignments({});
        }

        if (isSupabaseConfigured()) {
          try {
            const [remoteProblems, remoteSelections] = await Promise.all([
              listProblemStatements(),
              listTeamProblemSelections(),
            ]);
            if (Array.isArray(remoteProblems)) {
              setProblems(remoteProblems as ProblemStatement[]);
              localStorage.setItem('problemStatements', JSON.stringify(remoteProblems));
            }
            if (remoteSelections && typeof remoteSelections === 'object') {
              setTeamSelections(remoteSelections);
            }
          } catch {
            // ignore
          }
        } else {
          try {
            const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
            setProblems(Array.isArray(ps) ? ps : []);
          } catch {
            setProblems([]);
          }
        }
      })();
    }, 2000);

    return () => clearInterval(poll);
  }, [showModal, editingTeamKey, editingDeadlineKey]);

  useEffect(() => {
    (async () => {
      try {
        if (isSupabaseConfigured()) {
          const rows = await listTeamsWithMembers();
          if (rows) {
            setRegistered(rows);
            return;
          }
        }
      } catch (e) {
        console.warn(e);
      }
      try {
        const r = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
        setRegistered(r);
      } catch {
        setRegistered([]);
      }
    })();

    try {
      const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
      setAssignments(map || {});
    } catch {
      setAssignments({});
    }

    try {
      const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]');
      setProblems(Array.isArray(ps) ? ps : []);
    } catch {
      setProblems([]);
    }

    if (isSupabaseConfigured()) {
      void (async () => {
        try {
          const [remoteProblems, remoteSelections] = await Promise.all([
            listProblemStatements(),
            listTeamProblemSelections(),
          ]);
          if (Array.isArray(remoteProblems)) {
            setProblems(remoteProblems as ProblemStatement[]);
            localStorage.setItem('problemStatements', JSON.stringify(remoteProblems));
          }
          if (remoteSelections && typeof remoteSelections === 'object') {
            setTeamSelections(remoteSelections);
          }
        } catch {
          // keep local fallback
        }
      })();
    }

    try {
      const existing = localStorage.getItem('problem_general_deadline');
      if (existing) {
        setGeneralDeadlineInput(new Date(existing).toISOString().slice(0, 16));
      } else {
        const iso = new Date(DEFAULT_DEADLINE_ISO).toISOString();
        localStorage.setItem('problem_general_deadline', iso);
        setGeneralDeadlineInput('2026-03-26T19:00');
      }
      const lock = localStorage.getItem('problem_general_deadline_locked');
      setGeneralDeadlineLocked(lock === 'true');
    } catch {
      setGeneralDeadlineInput('2026-03-26T19:00');
      setGeneralDeadlineLocked(false);
    }
  }, []);

  const saveGeneralDeadline = () => {
    if (!generalDeadlineInput) return;
    const iso = new Date(generalDeadlineInput).toISOString();
    try {
      localStorage.setItem('problem_general_deadline', iso);
      localStorage.setItem('problem_general_deadline_locked', 'false');
      setGeneralDeadlineLocked(false);
      alert('General deadline updated and unfrozen.');
    } catch {
      alert('Could not save general deadline.');
    }
  };

  const freezeGeneralDeadline = () => {
    try {
      localStorage.setItem('problem_general_deadline_locked', 'true');
      setGeneralDeadlineLocked(true);
      alert('Problem statement selection is frozen for all teams.');
    } catch {
      alert('Could not freeze deadline.');
    }
  };

  // Save problem statements to localStorage
  const saveProblems = (next: ProblemStatement[]) => {
    setProblems(next);
    try {
      localStorage.setItem('problemStatements', JSON.stringify(next));
    } catch (e) {
      console.warn(e);
    }
    if (isSupabaseConfigured()) {
      void upsertProblemStatements(next as any);
    }
  };

  // Save or edit problem statement
  const saveProblemStatement = () => {
    if (!domain || !code || !description || !outcome) {
      alert('All fields are required');
      return;
    }

    if (editingId) {
      // Edit mode
      const next = problems.map((p) =>
        p.id === editingId
          ? { ...p, domain, code, description, outcome }
          : p
      );
      saveProblems(next);
      setEditingId(null);
      setDomain('');
      setCode('');
      setDescription('');
      setOutcome('');
      setShowModal(false);
      alert('Problem statement updated');
    } else {
      // New mode
      const newPs: ProblemStatement = {
        id: `ps_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        domain,
        code,
        description,
        outcome,
        createdAt: new Date().toISOString(),
        isHidden: false,
      };
      saveProblems([newPs, ...problems]);
      setDomain('');
      setCode('');
      setDescription('');
      setOutcome('');
      setShowModal(false);
      alert('Problem statement created');
    }
  };

  // Edit a problem statement
  const editProblem = (ps: ProblemStatement) => {
    setEditingId(ps.id);
    setDomain(ps.domain);
    setCode(ps.code);
    setDescription(ps.description);
    setOutcome(ps.outcome);
    setShowModal(true);
  };

  // Delete a problem statement
  const deleteProblem = (id: string) => {
    if (confirm('Delete this problem statement?')) {
      saveProblems(problems.filter((p) => p.id !== id));
      if (isSupabaseConfigured()) {
        void deleteProblemStatementById(id);
      }
    }
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingId(null);
    setDomain('');
    setCode('');
    setDescription('');
    setOutcome('');
    setShowModal(false);
  };

  // Open modal for new problem statement
  const openNewProblemModal = () => {
    setEditingId(null);
    setDomain('');
    setCode('');
    setDescription('');
    setOutcome('');
    setShowModal(true);
  };

  // Get unique values for filters
  const uniqueCampuses = useMemo(() => Array.from(new Set(scopedRegistered.map((r) => r.members?.[0]?.campus).filter(Boolean))), [scopedRegistered]);
  const uniqueDomains = DOMAIN_OPTIONS;
  const ICT_VENUES = [
    'ICT 105',
    'ICT 106',
    'ICT 107',
    'ICT 111',
    'ICT 112',
    'ICT 113',
    'ICT 118',
    'ICT 119',
  ];
  const uniqueSpocs = useMemo(() => Array.from(new Set(Object.values(assignments).map((a: any) => a?.spoc?.name).filter(Boolean))), [assignments]);
  const selectedTeamsCount = useMemo(() => Object.values(selectedTeams).filter(Boolean).length, [selectedTeams]);

  const filteredProblems = useMemo(() => {
    return problems.filter((problem) => {
      const problemDomain = normalizeDomain(problem.domain);
      if (statementDomainFilter !== 'All' && problemDomain !== statementDomainFilter) return false;
      return true;
    });
  }, [problems, statementDomainFilter]);

  // Only non-hidden problems for user-facing (legion) views
  const visibleProblems = useMemo(() => problems.filter((p) => !p.isHidden), [problems]);

  const toggleProblemVisibility = (id: string) => {
    const next = problems.map((p) =>
      p.id === id ? { ...p, isHidden: !p.isHidden } : p
    );
    saveProblems(next);
  };

  useEffect(() => {
    if (selectedTeamsCount === 0 && bulkDeadlineInput) {
      setBulkDeadlineInput('');
    }
  }, [selectedTeamsCount, bulkDeadlineInput]);

  // Filter teams
  const filteredTeams = useMemo(() => {
    return scopedRegistered.filter((t: any) => {
      const campus = String(t.members?.[0]?.campus || '');
      const teamDomain = normalizeDomain(t.domain);
      const psCode = getTeamSelectedCode(t);
      const teamName = String(t.teamName || '');
      const leadName = String(t.members?.[0]?.name || '');
      const zone = getZoneForTeam(String(t.teamName || ''));
      const spoc = getSpocForTeam(String(t.teamName || ''));
      const attendance = getTeamAttendance(String(t.teamName || ''));

      if (campusFilter !== 'All' && campus !== campusFilter) return false;
      if (domainFilter !== 'All' && teamDomain !== domainFilter) return false;
      if (attendanceFilter !== 'All' && attendance !== attendanceFilter) return false;
      if (zoneFilter !== 'All' && zone !== zoneFilter) return false;
      if (spocFilter !== 'All' && spoc !== spocFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        if (!teamName.toLowerCase().includes(q) && !leadName.toLowerCase().includes(q) && !psCode.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [scopedRegistered, campusFilter, domainFilter, attendanceFilter, zoneFilter, spocFilter, search, getTeamSelectedCode, getZoneForTeam, getSpocForTeam]);

  useEffect(() => {
    const allowed = new Set(
      filteredTeams
        .map((t: any) => rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || '')))
        .filter(Boolean)
    );
    setSelectedTeams((prev) => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((k) => {
        if (prev[k] && allowed.has(k)) next[k] = true;
      });
      const prevKeys = Object.keys(prev).filter((k) => prev[k]);
      const nextKeys = Object.keys(next);
      if (prevKeys.length === nextKeys.length && prevKeys.every((k) => next[k])) return prev;
      return next;
    });
  }, [filteredTeams]);

  const applyBulkExtendTeams = () => {
    if (!bulkDeadlineInput || selectedTeamsCount === 0) return;
    const iso = new Date(bulkDeadlineInput).toISOString();
    try {
      const allowed = new Set(
        filteredTeams
          .map((t: any) => rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || '')))
          .filter(Boolean)
      );
      filteredTeams.forEach((t: any) => {
        const teamName = String(t.teamName || '');
        const campus = String(t.members?.[0]?.campus || '');
        const rowKey = rowKeyFor(teamName, campus);
        if (selectedTeams[rowKey] && allowed.has(rowKey)) {
          localStorage.setItem(localDeadlineKeyFor(teamName, campus), iso);
        }
      });
      setSelectedTeams({});
      setBulkDeadlineInput('');
      alert('Bulk extension applied.');
    } catch {
      alert('Failed to apply bulk extension.');
    }
  };

  const toCsvCell = (value: any) => {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const exportTeamsCsv = () => {
    if (!filteredTeams.length) {
      alert('No teams available to export.');
      return;
    }

    const headers = [
      'Campus',
      'Team Name',
      'Team Lead',
      'Domain',
      'Team Size',
      'Attendance',
      'Venue',
      'SPOC',
      'Problem Statement Code',
      'Deadline',
    ];

    const lines = filteredTeams.map((t: any) => {
      const campus = String(t.members?.[0]?.campus || '-');
      const teamName = String(t.teamName || '-');
      const teamLead = String(t.members?.[0]?.name || '-');
      const domain = String(normalizeDomain(t.domain) || '-');
      const teamSize = String((t.members || []).length);
      const attendance = getTeamAttendance(teamName);
      const venue = String(getZoneForTeam(teamName) || '-');
      const spoc = getSpocForTeam(teamName);
      const psCode = getTeamSelectedCode(t) || 'Not selected';
      const deadline = formatDate(getEffectiveTeamDeadlineIso(teamName, campus));

      return [campus, domain, teamName, teamLead, teamSize, attendance, venue, spoc, psCode, deadline]
        .map(toCsvCell)
        .join(',');
    });

    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    link.download = `problem-statements-teams-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const startTeamSelectionEdit = (team: any) => {
    const teamName = String(team?.teamName || '');
    const campus = String(team?.members?.[0]?.campus || '');
    const key = rowKeyFor(teamName, campus);
    setEditingTeamKey(key);
    setEditingTeamPsCode(getTeamSelectedCode(team));
    setEditingTeam(team);
  };

  const cancelTeamSelectionEdit = () => {
    setEditingTeamKey(null);
    setEditingTeamPsCode('');
    setEditingTeam(null);
  };

  const saveTeamSelectionEdit = (team: any) => {
    const teamName = String(team?.teamName || '');
    const campus = String(team?.members?.[0]?.campus || '');
    const key = rowKeyFor(teamName, campus);
    try {
      const nextCode = String(editingTeamPsCode || '').trim();
      const normalizedCode = nextCode;

      const updated = registered.map((r: any) => {
        const rn = String(r?.teamName || '');
        const rc = String(r?.members?.[0]?.campus || '');
        if (rowKeyFor(rn, rc) !== key) return r;
        return {
          ...r,
          selectedProblemStatement: normalizedCode || null,
          selectedProblem: normalizedCode || null,
        };
      });
      setRegistered(updated);
      localStorage.setItem('registeredTeams', JSON.stringify(updated));

      try {
        const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
        if (current?.team?.teamName === teamName) {
          const currentCampus = String(current?.team?.members?.[0]?.campus || '');
          if (currentCampus === campus) {
            const nextCurrent = {
              ...current,
              team: {
                ...current.team,
                selectedProblemStatement: normalizedCode || null,
                selectedProblem: normalizedCode || null,
              },
            };
            localStorage.setItem('currentTeam', JSON.stringify(nextCurrent));
          }
        }
      } catch {
        // ignore current team sync issues
      }

      setEditingTeamKey(null);
      setEditingTeamPsCode('');
      setEditingTeam(null);

      setTeamSelections((prev) => ({ ...prev, [teamName]: normalizedCode || '' }));

      if (isSupabaseConfigured()) {
        void upsertTeamProblemSelection(teamName, normalizedCode || '');
      }
      alert('Team problem statement updated.');
    } catch {
      alert('Failed to update team problem statement.');
    }
  };

  const clearBulkSelection = () => {
    setSelectedTeams({});
    setBulkDeadlineInput('');
  };

  const saveTeamDeadlineEdit = (team: any) => {
    const teamName = String(team?.teamName || '');
    const campus = String(team?.members?.[0]?.campus || '');
    const key = rowKeyFor(teamName, campus);
    const input = String(extendDeadlineInputs[key] || '').trim();
    if (!input) {
      alert('Please select a deadline first.');
      return;
    }

    try {
      const iso = new Date(input).toISOString();
      localStorage.setItem(localDeadlineKeyFor(teamName, campus), iso);
      setEditingDeadlineKey(null);
      alert('Team deadline updated.');
    } catch {
      alert('Failed to update team deadline.');
    }
  };

  const resetTeamDeadlineToGeneral = (team: any) => {
    const teamName = String(team?.teamName || '');
    const campus = String(team?.members?.[0]?.campus || '');
    const key = rowKeyFor(teamName, campus);
    try {
      localStorage.removeItem(localDeadlineKeyFor(teamName, campus));
      setExtendDeadlineInputs((prev) => ({ ...prev, [key]: '' }));
      setEditingDeadlineKey(null);
      alert('Team deadline reset to general deadline.');
    } catch {
      alert('Failed to reset team deadline.');
    }
  };

  return (
    <main className="min-h-screen bg-antique p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Box */}
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gitam-700">Problem Statements</h1>
            <button
              onClick={() => router.push(isSpocView ? '/spoc/dashboard' : '/admin/dashboard')}
              className="hh-btn-outline px-4 py-2 border-2"
            >
              ← Back to dashboard
            </button>
          </div>
                    disabled={selectedTeamsCount === 0}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-4 mb-6">
          <div className="flex gap-2">
            {!isSpocView ? (
            <button
              onClick={() => setTab('statements')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                tab === 'statements'
                  ? 'bg-gitam-700 text-antique shadow'
                  : 'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'
              }`}
            >
              Problem Statements
            </button>
            ) : null}
            <button
              onClick={() => setTab('teams')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${
                tab === 'teams'
                  ? 'bg-gitam-700 text-antique shadow'
                  : 'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'
              }`}
            >
              Teams
            </button>
          </div>
        </div>

        {/* Tab: Problem Statements */}
        {tab === 'statements' && (
          <div className="space-y-6">
            {/* Create Button */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <button
                onClick={openNewProblemModal}
                className="hh-btn px-6 py-2 text-sm font-semibold"
              >
                + Create New Problem Statement
              </button>
              <div className="w-full md:max-w-xs">
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain Filter</label>
                <select
                  value={statementDomainFilter}
                  onChange={(e) => setStatementDomainFilter(e.target.value)}
                  className="hh-input w-full border-2 border-gitam-200"
                >
                  <option value="All">All</option>
                  {DOMAIN_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* List of Problem Statements */}
            <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6">
              <h2 className="text-xl font-bold text-gitam-700 mb-4">All Problem Statements ({filteredProblems.length})</h2>

              <div className="space-y-3">
                {filteredProblems.length === 0 ? (
                  <p className="text-gitam-700/75">No problem statements created yet.</p>
                ) : (
                  filteredProblems.map((ps) => (
                    <div key={ps.id} className={`border-2 border-gitam-200 rounded-lg p-4 hover:border-gitam-300 ${ps.isHidden ? 'opacity-60' : ''}`}>
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <div className="flex-1">
                          <div className="flex gap-2 items-center mb-2">
                            <span className="font-semibold text-gitam-700">{ps.code}</span>
                            <span className="text-xs bg-gitam-100 text-gitam-700 px-2 py-1 rounded">{ps.domain}</span>
                            {ps.isHidden && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Hidden</span>}
                          </div>
                          <p className="text-sm text-gitam-700">{ps.description}</p>
                          <p className="text-xs text-gitam-700/75 mt-2">
                            <strong>Outcome:</strong> {ps.outcome}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => editProblem(ps)}
                            className="hh-btn px-3 py-1 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteProblem(ps.id)}
                            className="hh-btn-outline px-3 py-1 text-sm border-2"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => toggleProblemVisibility(ps.id)}
                            className={`hh-btn-outline px-3 py-1 text-sm border-2 ${ps.isHidden ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}
                          >
                            {ps.isHidden ? 'Unhide' : 'Hide'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Teams */}
        {tab === 'teams' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Bulk Extend Deadline (selected teams)</label>
                  <input
                    type="datetime-local"
                    value={bulkDeadlineInput}
                    onChange={(e) => setBulkDeadlineInput(e.target.value)}
                    disabled={selectedTeamsCount === 0}
                    className="hh-input w-full border-2 border-gitam-200 disabled:opacity-50"
                  />
                </div>
                <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={applyBulkExtendTeams}
                    disabled={!bulkDeadlineInput || selectedTeamsCount === 0}
                    className="hh-btn px-3 py-2 text-sm whitespace-nowrap disabled:opacity-50"
                  >
                    Apply Bulk Extend
                  </button>
                  <button
                    onClick={clearBulkSelection}
                    disabled={selectedTeamsCount === 0}
                    className="hh-btn-outline px-3 py-2 text-sm whitespace-nowrap border-2"
                  >
                    Clear Selection
                  </button>
                  <button
                    onClick={exportTeamsCsv}
                    className="hh-btn-outline px-3 py-2 text-sm whitespace-nowrap border-2"
                  >
                    Export CSV
                  </button>
                  <span className="text-xs text-gitam-700/75 self-center">Selected: {selectedTeamsCount}</span>
                </div>
                <div className="text-xs text-gitam-700/75 md:col-span-3">Use checkboxes in the table to choose teams for extension.</div>
              </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
                  <select
                    value={campusFilter}
                    onChange={(e) => setCampusFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option>All</option>
                    {uniqueCampuses.map((c: any) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain</label>
                  <select
                    value={domainFilter}
                    onChange={(e) => setDomainFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option>All</option>
                    {uniqueDomains.map((d: any) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Attendance</label>
                  <select
                    value={attendanceFilter}
                    onChange={(e) => setAttendanceFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option>All</option>
                    <option>Present</option>
                    <option>Absent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
                  <select
                    value={zoneFilter}
                    onChange={(e) => setZoneFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option>All</option>
                    {ICT_VENUES.map((z: any) => (
                      <option key={z}>{z}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">SPOC</label>
                  <select
                    value={spocFilter}
                    onChange={(e) => setSpocFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option>All</option>
                    {uniqueSpocs.map((s: any) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by team name, lead, or PS code"
                    className="hh-input w-full border-2 border-gitam-200"
                  />
                </div>
              </div>
            </div>

            <div className="mb-3 text-sm text-gitam-700/80">Showing {filteredTeams.length} teams</div>

            {/* Teams Table */}
            <div className="overflow-x-auto rounded-lg border-2 border-gitam-300 bg-white">
              <table className="w-full text-sm border-collapse table-auto">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300 text-left">
                    <th className="p-3 border-r border-gitam-200">
                      <input
                        type="checkbox"
                        checked={filteredTeams.length > 0 && filteredTeams.every((t: any) => {
                          const teamName = String(t.teamName || '');
                          const campus = String(t.members?.[0]?.campus || '');
                          return selectedTeams[rowKeyFor(teamName, campus)];
                        })}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next: Record<string, boolean> = {};
                          if (checked) {
                            filteredTeams.forEach((t: any) => {
                              const teamName = String(t.teamName || '');
                              const campus = String(t.members?.[0]?.campus || '');
                              next[rowKeyFor(teamName, campus)] = true;
                            });
                          }
                          setSelectedTeams(next);
                        }}
                      />
                    </th>
                    <th className="p-3 border-r border-gitam-200">Campus</th>
                    <th className="p-3 border-r border-gitam-200">Domain</th>
                    <th className="p-3 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 border-r border-gitam-200">Team Lead</th>
                    <th className="p-3 border-r border-gitam-200">Team Size</th>
                    <th className="p-3 border-r border-gitam-200">Attendance</th>
                    <th className="p-3 border-r border-gitam-200">Venue</th>
                    <th className="p-3 border-r border-gitam-200">SPOC</th>
                    <th className="p-3 border-r border-gitam-200">PS Code</th>
                    <th className="p-3 border-r border-gitam-200">Actions</th>
                    <th className="p-3">Extend Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((t: any, idx: number) => (
                    <tr key={idx} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100">
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedTeams[rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || ''))])}
                          onChange={(e) => {
                            const teamName = String(t.teamName || '');
                            const campus = String(t.members?.[0]?.campus || '');
                            const key = rowKeyFor(teamName, campus);
                            setSelectedTeams((prev) => ({ ...prev, [key]: e.target.checked }));
                          }}
                        />
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        {t.members?.[0]?.campus || '-'}
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        {normalizeDomain(t.domain) || '-'}
                      </td>
                      <td className="p-3 border-r border-gitam-200">
                        <div className="truncate max-w-[200px]" title={t.teamName || ''}>
                          {t.teamName || '-'}
                        </div>
                      </td>
                      <td className="p-3 border-r border-gitam-200">
                        <div className="truncate max-w-[180px]" title={t.members?.[0]?.name || ''}>
                          {t.members?.[0]?.name || '-'}
                        </div>
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        {(t.members || []).length}
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        {getTeamAttendance(String(t.teamName || ''))}
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        {getZoneForTeam(String(t.teamName || ''))}
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        {getSpocForTeam(String(t.teamName || ''))}
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        {getTeamSelectedCode(t) ? (
                          <span className="bg-gitam-100 text-gitam-700 px-2 py-1 rounded text-xs font-semibold">
                            {getTeamSelectedCode(t)}
                          </span>
                        ) : (
                          <span className="text-gitam-700/60 text-xs">Not selected</span>
                        )}
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        <button
                          onClick={() => startTeamSelectionEdit(t)}
                          className="hh-btn-outline px-3 py-1 text-sm border-2"
                        >
                          Edit PS
                        </button>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {editingDeadlineKey === rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || '')) ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={extendDeadlineInputs[rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || ''))] ?? ''}
                              onChange={(e) => {
                                const key = rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || ''));
                                setExtendDeadlineInputs((prev) => ({ ...prev, [key]: e.target.value }));
                              }}
                              className="hh-input w-[190px] border-2 border-gitam-200"
                            />
                            <button
                              onClick={() => saveTeamDeadlineEdit(t)}
                              disabled={!extendDeadlineInputs[rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || ''))]}
                              className="hh-btn px-2 py-1 text-xs disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingDeadlineKey(null);
                                const key = rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || ''));
                                setExtendDeadlineInputs((prev) => ({ ...prev, [key]: '' }));
                              }}
                              className="hh-btn-ghost px-2 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const key = rowKeyFor(String(t.teamName || ''), String(t.members?.[0]?.campus || ''));
                              setEditingDeadlineKey(key);
                              const existing = getTeamCustomDeadlineIso(String(t.teamName || ''), String(t.members?.[0]?.campus || ''));
                              if (existing) {
                                setExtendDeadlineInputs((prev) => ({ ...prev, [key]: new Date(existing).toISOString().slice(0, 16) }));
                              } else {
                                setExtendDeadlineInputs((prev) => ({ ...prev, [key]: '' }));
                              }
                            }}
                            className="hh-btn-outline px-3 py-1 text-sm border-2"
                          >
                            Extend Deadline
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTeams.length === 0 && (
                <div className="p-6 text-center text-gitam-700/75">No teams match the filters.</div>
              )}
            </div>
          </div>
        )}

        {editingTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-xl border-2 border-gitam-300 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b-2 border-gitam-200 p-5">
                <h2 className="text-xl font-bold text-gitam-700">Edit Team Problem Statement</h2>
                <button onClick={cancelTeamSelectionEdit} className="hh-btn-outline px-3 py-1 border-2">Close</button>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-gitam-700/70">Team</p>
                    <p className="font-semibold text-gitam-700">{String(editingTeam.teamName || '-')}</p>
                  </div>
                  <div>
                    <p className="text-gitam-700/70">Lead</p>
                    <p className="font-semibold text-gitam-700">{String(editingTeam.members?.[0]?.name || '-')}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gitam-700 mb-2">Problem Statement Code</label>
                  <input
                    value={editingTeamPsCode}
                    onChange={(e) => setEditingTeamPsCode(e.target.value)}
                    placeholder="Type the problem statement code"
                    className="hh-input w-full border-2 border-gitam-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t-2 border-gitam-200 p-5">
                <button onClick={cancelTeamSelectionEdit} className="hh-btn-outline px-4 py-2 border-2">Cancel</button>
                <button onClick={() => saveTeamSelectionEdit(editingTeam)} className="hh-btn px-4 py-2">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create/Edit Problem Statement */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-2xl rounded-xl border-2 border-gitam-300 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b-2 border-gitam-200 p-5">
                <h2 className="text-xl font-bold text-gitam-700">
                  {editingId ? 'Edit Problem Statement' : 'Create New Problem Statement'}
                </h2>
                <button
                  onClick={cancelEdit}
                  className="hh-btn-outline px-3 py-1 border-2"
                >
                  Close
                </button>
              </div>

              <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gitam-700">Domain</label>
                    <select
                      value={domain}
                      onChange={(e) => setDomain(e.target.value)}
                      className="hh-input w-full border-2 border-gitam-200"
                    >
                      <option value="">Select Domain</option>
                      {DOMAIN_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-semibold text-gitam-700">Problem Statement Code</label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="e.g., PS-001"
                      className="hh-input w-full border-2 border-gitam-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gitam-700">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter problem statement description"
                    rows={4}
                    className="hh-input w-full border-2 border-gitam-200"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-gitam-700">Expected Outcome</label>
                  <textarea
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="Enter expected outcome description"
                    rows={3}
                    className="hh-input w-full border-2 border-gitam-200"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t-2 border-gitam-200 p-5">
                <button onClick={cancelEdit} className="hh-btn-outline px-4 py-2 border-2">
                  Cancel
                </button>
                <button onClick={saveProblemStatement} className="hh-btn px-4 py-2">
                  {editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
