'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';
import {
  deleteReportingSpoc,
  listReportingAssignments,
  listReportingSpocs,
  upsertManyReportingAssignments,
  upsertReportingSpocs,
} from '@/lib/reportingBackend';
import { ensureDefaultSpocs } from '@/lib/spocDefaults';

type Spoc = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  updatedAt?: string;
};

type ReportingAssignment = {
  date?: string;
  time?: string;
  venue?: string;
  spocId?: string;
  spoc?: { name: string; email: string; phone: string };
  updatedAt?: string;
};

const SPOCS_KEY = 'reportingSpocs';
const ASSIGNMENTS_KEY = 'reportingAssignments';
const VENUE_OPTIONS = [
  'Shivaji Auditorium',
  'ICT 105',
  'ICT 106',
  'ICT 107',
  'ICT 111',
  'ICT 112',
  'ICT 113',
  'ICT 118',
  'ICT 119',
  'ICT 122',
];

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
};

const canonicalTeamKey = (teamName: string) => String(teamName || '').trim().toLowerCase();

const buildAssignmentIndex = (map: Record<string, ReportingAssignment>) => {
  const index: Record<string, ReportingAssignment> = {};
  Object.entries(map || {}).forEach(([teamName, assignment]) => {
    const key = canonicalTeamKey(teamName);
    if (key) index[key] = assignment;
  });
  return index;
};

const mergeAssignmentsSafely = (
  localAssignments: Record<string, ReportingAssignment>,
  remoteAssignments: Record<string, ReportingAssignment>,
): Record<string, ReportingAssignment> => {
  const merged: Record<string, ReportingAssignment> = { ...(localAssignments || {}) };
  Object.entries(remoteAssignments || {}).forEach(([teamName, remote]) => {
    const key = canonicalTeamKey(teamName);
    const localMatchKey = Object.keys(merged).find((k) => canonicalTeamKey(k) === key) || '';
    const local = merged[teamName] || merged[localMatchKey] || {};
    merged[teamName] = {
      ...local,
      ...remote,
      venue: String(remote?.venue || local?.venue || ''),
      date: String(remote?.date || local?.date || ''),
      time: String(remote?.time || local?.time || ''),
      spocId: String(remote?.spocId || local?.spocId || '').trim() || undefined,
      spoc: {
        name: String(remote?.spoc?.name || local?.spoc?.name || ''),
        email: String(remote?.spoc?.email || local?.spoc?.email || ''),
        phone: String(remote?.spoc?.phone || local?.spoc?.phone || ''),
      },
      updatedAt: String(remote?.updatedAt || local?.updatedAt || ''),
    };
  });
  return merged;
};

const normalizeEmail = (s: string) => String(s || '').trim().toLowerCase();

const nextSpocId = (spocs: Spoc[]) => {
  const nums = spocs
    .map((s) => {
      const m = String(s.id || '').match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `SPOC${next}`;
};

const teamCampus = (t: any): string => {
  const fromMember = t?.members?.[0]?.campus;
  const fromTeam = t?.campus;
  return String(fromMember || fromTeam || '').trim() || '—';
};

const teamLead = (t: any): string => {
  const lead = t?.members?.[0];
  const name = String(lead?.name || '').trim();
  const email = String(lead?.email || '').trim();
  if (name) return name;
  if (email) return email;
  return '—';
};

const teamSize = (t: any): number | string => {
  const membersLen = Array.isArray(t?.members) ? t.members.length : 0;
  return Number(t?.teamSize) || membersLen || '—';
};

const normalizeDomain = (value: any) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'app development') return 'App Development';
  if (raw === 'cybersecurity' || raw === 'cyber security') return 'Cyber Security';
  if (raw === 'artificial intelligence' || raw === 'ai') return 'AI';
  if (raw === 'machine learning and data science' || raw === 'ml & data science' || raw === 'ml & ds') return 'ML & DS';
  return String(value);
};

export default function AdminSpocPage() {
  const router = useRouter();

  const [teams, setTeams] = useState<any[]>([]);
  const [tab, setTab] = useState<'spocs' | 'teams'>('spocs');

  const [spocs, setSpocs] = useState<Spoc[]>([]);
  const [assignments, setAssignments] = useState<Record<string, ReportingAssignment>>({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSpocId, setEditingSpocId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });

  const [draftAssignments, setDraftAssignments] = useState<Record<string, string>>({});
  const [teamSearch, setTeamSearch] = useState('');
  const [campusFilter, setCampusFilter] = useState<string>('All');
  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [teamSizeFilter, setTeamSizeFilter] = useState<string>('All');
  const [attendanceFilter, setAttendanceFilter] = useState<string>('All');
  const [zoneFilter, setZoneFilter] = useState<string>('All');
  const [spocFilter, setSpocFilter] = useState<string>('All');
  const [selectedTeams, setSelectedTeams] = useState<Record<string, boolean>>({});
  const [bulkSpocId, setBulkSpocId] = useState('');
  const syncedAssignmentsRef = useState<Record<string, ReportingAssignment>>({})[0];

  // Hide navbar
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
      const a = localStorage.getItem('adminLoggedIn');
      if (!a) {
        router.push('/admin');
        return;
      }
    } catch {
      router.push('/admin');
      return;
    }

    (async () => {
      const localSpocs = ensureDefaultSpocs(readJson<Spoc[]>(SPOCS_KEY, []));
      const localAssignments = readJson<Record<string, ReportingAssignment>>(ASSIGNMENTS_KEY, {});
      setSpocs(localSpocs);
      setAssignments(localAssignments);
      writeJson(SPOCS_KEY, localSpocs);
      if (isSupabaseConfigured()) {
        void upsertReportingSpocs(localSpocs as any[]);
      }

      if (isSupabaseConfigured()) {
        try {
          const [remoteSpocs, remoteAssignments] = await Promise.all([
            listReportingSpocs(),
            listReportingAssignments(),
          ]);

          if (Array.isArray(remoteSpocs) && remoteSpocs.length) {
            const mergedSpocs = ensureDefaultSpocs(remoteSpocs as Spoc[]);
            setSpocs(mergedSpocs as Spoc[]);
            writeJson(SPOCS_KEY, mergedSpocs);
            void upsertReportingSpocs(mergedSpocs as any[]);
          }
          if (remoteAssignments && typeof remoteAssignments === 'object') {
            const merged = mergeAssignmentsSafely(localAssignments, remoteAssignments as Record<string, ReportingAssignment>);
            setAssignments(merged);
            writeJson(ASSIGNMENTS_KEY, merged);
          }
        } catch {
          // Keep local fallback.
        }
      }

      try {
        if (isSupabaseConfigured()) {
          const rows = await listTeamsWithMembers();
          if (rows) {
            setTeams(rows);
            return;
          }
        }
      } catch {
        // ignore
      }

      setTeams(readJson<any[]>('registeredTeams', []));
    })();
  }, [router]);

  useEffect(() => {
    const poll = setInterval(() => {
      void (async () => {
        try {
          if (isSupabaseConfigured()) {
            const [rows, remoteSpocs, remoteAssignments] = await Promise.all([
              listTeamsWithMembers(),
              listReportingSpocs(),
              listReportingAssignments(),
            ]);
            if (Array.isArray(rows)) setTeams(rows);
            if (Array.isArray(remoteSpocs)) {
              setSpocs(remoteSpocs as Spoc[]);
              writeJson(SPOCS_KEY, remoteSpocs);
            }
            if (remoteAssignments && typeof remoteAssignments === 'object') {
              const localAssignments = readJson<Record<string, ReportingAssignment>>(ASSIGNMENTS_KEY, {});
              const merged = mergeAssignmentsSafely(localAssignments, remoteAssignments as Record<string, ReportingAssignment>);
              setAssignments(merged);
              writeJson(ASSIGNMENTS_KEY, merged);
            }
            return;
          }
        } catch {
          // fall back to local
        }

        setTeams(readJson<any[]>('registeredTeams', []));
        setSpocs(ensureDefaultSpocs(readJson<Spoc[]>(SPOCS_KEY, [])) as Spoc[]);
        setAssignments(readJson<Record<string, ReportingAssignment>>(ASSIGNMENTS_KEY, {}));
      })();
    }, 2000);

    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    // Keep draft values stable while the user is selecting from a dropdown.
    setDraftAssignments((prev) => {
      const next: Record<string, string> = { ...prev };
      const lastSynced = syncedAssignmentsRef as unknown as Record<string, ReportingAssignment>;

      Object.keys(assignments || {}).forEach((teamName) => {
        const savedId = String(assignments?.[teamName]?.spocId || '').trim();
        const previousSavedId = String(lastSynced?.[teamName]?.spocId || '').trim();
        const previousDraftId = String(prev?.[teamName] || '').trim();

        if (!(teamName in prev) || previousDraftId === previousSavedId) {
          next[teamName] = savedId;
        }
      });

      Object.keys(prev || {}).forEach((teamName) => {
        if (!(teamName in (assignments || {})) && !String(prev[teamName] || '').trim()) {
          delete next[teamName];
        }
      });

      Object.keys(lastSynced).forEach((key) => {
        delete lastSynced[key];
      });
      Object.assign(lastSynced, assignments || {});

      return next;
    });
  }, [assignments, syncedAssignmentsRef]);

  const spocById = useMemo(() => {
    const m = new Map<string, Spoc>();
    spocs.forEach((s) => m.set(s.id, s));
    return m;
  }, [spocs]);

  const assignmentsIndex = useMemo(() => buildAssignmentIndex(assignments), [assignments]);

  const getAssignmentForTeam = useCallback((teamName: string): ReportingAssignment => {
    const direct = assignments?.[teamName];
    if (direct) return direct;
    return assignmentsIndex[canonicalTeamKey(teamName)] || {};
  }, [assignments, assignmentsIndex]);

  const getZoneForTeam = (teamName: string) => {
    return getAssignmentForTeam(teamName)?.venue || '-';
  };

  const getTeamAttendance = (teamName: string): string => {
    try {
      const saved = localStorage.getItem(`team_attendance_${teamName}`) || '';
      return saved === 'Present' || saved === 'Absent' ? saved : '-';
    } catch {
      return '-';
    }
  };

  const campusOptions = useMemo(() => {
    const opts = teams
      .map((t: any) => teamCampus(t))
      .filter((c: any) => c && c !== '—')
      .map(String);
    return Array.from(new Set(opts));
  }, [teams]);

  const domainOptions = useMemo(() => {
    const opts = teams
      .map((t: any) => String(t?.domain || '').trim())
      .filter(Boolean);
    return Array.from(new Set(opts));
  }, [teams]);

  const teamSizeOptions = useMemo(() => {
    const nums = teams
      .map((t: any) => {
        const n = Number(teamSize(t));
        return Number.isFinite(n) && n > 0 ? n : null;
      })
      .filter((n: any) => n !== null) as number[];
    return Array.from(new Set(nums)).sort((a, b) => a - b).map(String);
  }, [teams]);

  const zoneOptions = useMemo(() => {
    const zones = Array.from(new Set(
      teams
        .map((t: any) => getZoneForTeam(String(t?.teamName || '')))
        .filter((z) => z && z !== '-')
    ));
    const extras = zones.filter((z) => !VENUE_OPTIONS.includes(z)).sort();
    return [...VENUE_OPTIONS, ...extras];
  }, [teams, assignments]);

  const getSpocNameForTeam = useCallback((teamName: string): string => {
    const saved = getAssignmentForTeam(teamName);
    const assignedId = String(draftAssignments[teamName] || saved?.spocId || '').trim();
    if (assignedId) {
      const byId = spocById.get(assignedId);
      if (byId?.name) return byId.name;
    }
    return String(saved?.spoc?.name || '').trim() || '-';
  }, [draftAssignments, getAssignmentForTeam, spocById]);

  const spocOptions = useMemo(() => {
    const names = teams
      .map((t: any) => getSpocNameForTeam(String(t?.teamName || '').trim()))
      .filter((name) => name && name !== '-');
    return Array.from(new Set(names));
  }, [teams, getSpocNameForTeam]);

  const selectedTeamsCount = useMemo(() => Object.values(selectedTeams).filter(Boolean).length, [selectedTeams]);

  useEffect(() => {
    if (selectedTeamsCount === 0 && bulkSpocId) {
      setBulkSpocId('');
    }
  }, [selectedTeamsCount, bulkSpocId]);

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    return teams.filter((t: any) => {
      const tn = String(t?.teamName || '').toLowerCase();
      const leadName = String(t?.members?.[0]?.name || '').toLowerCase();

      if (campusFilter !== 'All') {
        if (teamCampus(t) !== campusFilter) return false;
      }
      if (domainFilter !== 'All') {
        if (String(t?.domain || '').trim() !== domainFilter) return false;
      }
      if (teamSizeFilter !== 'All') {
        const n = Number(teamSize(t));
        if (!Number.isFinite(n) || String(n) !== teamSizeFilter) return false;
      }
      if (zoneFilter !== 'All') {
        const zone = getZoneForTeam(String(t?.teamName || ''));
        if (zone !== zoneFilter) return false;
      }
      if (attendanceFilter !== 'All') {
        const attendance = getTeamAttendance(String(t?.teamName || ''));
        if (attendance !== attendanceFilter) return false;
      }
      if (spocFilter !== 'All') {
        const spocName = getSpocNameForTeam(String(t?.teamName || '').trim());
        if (spocName !== spocFilter) return false;
      }

      if (q) {
        if (!tn.includes(q) && !leadName.includes(q)) return false;
      }
      return true;
    });
  }, [teams, teamSearch, campusFilter, domainFilter, teamSizeFilter, attendanceFilter, zoneFilter, spocFilter, getSpocNameForTeam]);

  // Keep selection aligned to current filters so bulk apply only works on visible selected rows.
  useEffect(() => {
    const allowed = new Set(
      filteredTeams
        .map((t: any) => String(t?.teamName || '').trim())
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

  const saveSpocs = (next: Spoc[]) => {
    setSpocs(next);
    writeJson(SPOCS_KEY, next);
    if (isSupabaseConfigured()) {
      void upsertReportingSpocs(next as any[]);
    }
  };

  const saveAssignments = (next: Record<string, ReportingAssignment>) => {
    setAssignments(next);
    writeJson(ASSIGNMENTS_KEY, next);
    if (isSupabaseConfigured()) {
      void upsertManyReportingAssignments(next as any);
    }
    setDraftAssignments((prev) => {
      const copy = { ...prev };
      Object.keys(next || {}).forEach((teamName) => {
        copy[teamName] = String(next[teamName]?.spocId || '').trim();
      });
      return copy;
    });
  };

  const openAdd = () => {
    setForm({ name: '', email: '', phone: '' });
    setShowAddModal(true);
  };

  const closeAdd = () => {
    setShowAddModal(false);
    setForm({ name: '', email: '', phone: '' });
  };

  const openEdit = (id: string) => {
    const s = spocs.find((x) => x.id === id);
    if (!s) return;
    setEditingSpocId(id);
    setForm({ name: s.name || '', email: s.email || '', phone: s.phone || '' });
    setShowEditModal(true);
  };

  const closeEdit = () => {
    setShowEditModal(false);
    setEditingSpocId(null);
    setForm({ name: '', email: '', phone: '' });
  };

  const addSpoc = () => {
    const name = String(form.name || '').trim();
    const email = normalizeEmail(form.email);
    const phone = String(form.phone || '').trim();

    if (!name || !email || !phone) {
      alert('Name, Email, and Phone are required');
      return;
    }

    const existingEmail = spocs.some((s) => normalizeEmail(s.email) === email);
    if (existingEmail) {
      alert('A SPOC with this email already exists');
      return;
    }

    const id = nextSpocId(spocs);
    const next: Spoc[] = [
      { id, name, email, phone, createdAt: new Date().toISOString() },
      ...spocs,
    ];
    saveSpocs(next);
    closeAdd();
  };

  const updateAssignmentsForSpoc = (updated: Spoc, sourceAssignments: Record<string, ReportingAssignment>) => {
    const nextAssignments: Record<string, ReportingAssignment> = { ...(sourceAssignments || {}) };
    Object.keys(nextAssignments).forEach((teamName) => {
      if (nextAssignments[teamName]?.spocId === updated.id) {
        nextAssignments[teamName] = {
          ...nextAssignments[teamName],
          spoc: { name: updated.name, email: updated.email, phone: updated.phone },
          updatedAt: new Date().toISOString(),
        };
      }
    });
    return nextAssignments;
  };

  const editSpoc = () => {
    if (!editingSpocId) return;

    const name = String(form.name || '').trim();
    const email = normalizeEmail(form.email);
    const phone = String(form.phone || '').trim();

    if (!name || !email || !phone) {
      alert('Name, Email, and Phone are required');
      return;
    }

    const existingEmail = spocs.some((s) => s.id !== editingSpocId && normalizeEmail(s.email) === email);
    if (existingEmail) {
      alert('A SPOC with this email already exists');
      return;
    }

    const nextSpocs = spocs.map((s) =>
      s.id === editingSpocId
        ? { ...s, name, email, phone, updatedAt: new Date().toISOString() }
        : s
    );
    saveSpocs(nextSpocs);

    const updated = nextSpocs.find((s) => s.id === editingSpocId);
    if (updated) {
      const nextAssignments = updateAssignmentsForSpoc(updated, assignments || {});
      saveAssignments(nextAssignments);
    }

    closeEdit();
  };

  const deleteSpoc = (id: string) => {
    const sp = spocs.find((s) => s.id === id);
    if (!confirm(`Delete ${sp?.name || id}?`)) return;

    const nextSpocs = spocs.filter((s) => s.id !== id);
    saveSpocs(nextSpocs);
    if (isSupabaseConfigured()) {
      void deleteReportingSpoc(id);
    }

    const nextAssignments: Record<string, ReportingAssignment> = { ...(assignments || {}) };
    Object.keys(nextAssignments).forEach((teamName) => {
      if (nextAssignments[teamName]?.spocId === id) {
        nextAssignments[teamName] = {
          ...nextAssignments[teamName],
          spocId: undefined,
          spoc: undefined,
          updatedAt: new Date().toISOString(),
        };
      }
    });
    saveAssignments(nextAssignments);
  };

  const setDraftForTeam = (teamName: string, spocId: string) => {
    setDraftAssignments((prev) => ({ ...prev, [teamName]: spocId }));
  };

  const saveTeamAssignment = (teamName: string) => {
    const spocId = draftAssignments[teamName] || '';
    if (!spocId) {
      if (!confirm('Save with no SPOC assigned?')) return;
    }

    const sp = spocId ? spocById.get(spocId) : undefined;
    const prev = assignments?.[teamName] || {};

    const next: Record<string, ReportingAssignment> = {
      ...(assignments || {}),
      [teamName]: {
        ...prev,
        spocId: spocId || undefined,
        spoc: sp
          ? { name: sp.name, email: sp.email, phone: sp.phone }
          : undefined,
        updatedAt: new Date().toISOString(),
      },
    };

    saveAssignments(next);
    alert('Saved');
  };

  const applyBulkAssign = () => {
    if (!bulkSpocId) {
      alert('Please select a SPOC first');
      return;
    }

    const allowed = new Set(
      filteredTeams
        .map((t: any) => String(t?.teamName || '').trim())
        .filter(Boolean)
    );
    const selectedTeamNames = Object.keys(selectedTeams).filter((k) => selectedTeams[k] && allowed.has(k));
    if (selectedTeamNames.length === 0) {
      alert('No teams selected');
      return;
    }

    const sp = spocById.get(bulkSpocId);
    if (!sp) {
      alert('SPOC not found');
      return;
    }

    const next: Record<string, ReportingAssignment> = { ...(assignments || {}) };
    selectedTeamNames.forEach((teamName) => {
      const prev = next[teamName] || {};
      next[teamName] = {
        ...prev,
        spocId: bulkSpocId,
        spoc: { name: sp.name, email: sp.email, phone: sp.phone },
        updatedAt: new Date().toISOString(),
      };
    });

    saveAssignments(next);
    setSelectedTeams({});
    setBulkSpocId('');
    alert(`SPOC ${sp.name} assigned to ${selectedTeamNames.length} team(s)`);
  };

  const clearBulkSelection = () => {
    setSelectedTeams({});
    setBulkSpocId('');
  };

  const exportTeamsCsv = () => {
    const toCsvCell = (val: any) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const headers = ['Campus', 'Team Name', 'Lead', 'Domain', 'Team Size', 'Venue', 'SPOC ID', 'SPOC Name', 'SPOC Email', 'SPOC Phone'];
    const rows = filteredTeams.map((t: any) => {
      const teamName = String(t?.teamName || '');
      const assignedId = draftAssignments[teamName] || '';
      const sp = assignedId ? spocById.get(assignedId) : undefined;
      return [
        teamCampus(t),
        teamName,
        teamLead(t),
        normalizeDomain(t?.domain) || '-',
        teamSize(t),
        getZoneForTeam(teamName),
        sp?.id || '-',
        sp?.name || '-',
        sp?.email || '-',
        sp?.phone || '-',
      ].map(toCsvCell).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `spoc-teams-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-antique p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gitam-700">SPOC</h1>
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="hh-btn-outline px-4 py-2 border-2"
            >
              ← Back to dashboard
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-4 mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setTab('spocs')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${tab === 'spocs' ? 'bg-gitam-700 text-antique shadow' : 'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}
            >
              SPOCs
            </button>
            <button
              onClick={() => setTab('teams')}
              className={`px-6 py-2 rounded-lg font-semibold transition ${tab === 'teams' ? 'bg-gitam-700 text-antique shadow' : 'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}
            >
              Teams
            </button>
          </div>
        </div>

        {tab === 'spocs' && (
          <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gitam-700">SPOCs List</h2>
                <p className="text-sm text-gitam-700/75 mt-1">Add and manage SPOC contact details</p>
              </div>
              <button onClick={openAdd} className="hh-btn px-4 py-2">+ Add SPOC</button>
            </div>

            <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300 text-left">
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">ID</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Name</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Email</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Phone Number</th>
                    <th className="p-3 font-semibold text-gitam-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {spocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-gitam-700/75">
                        No SPOCs yet. Click &quot;Add SPOC&quot; to create one.
                      </td>
                    </tr>
                  ) : (
                    spocs.map((s) => (
                      <tr key={s.id} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100">
                        <td className="p-3 border-r border-gitam-200 font-semibold text-gitam-700">{s.id}</td>
                        <td className="p-3 border-r border-gitam-200 text-gitam-700">{s.name}</td>
                        <td className="p-3 border-r border-gitam-200 text-gitam-700">{s.email}</td>
                        <td className="p-3 border-r border-gitam-200 text-gitam-700">{s.phone}</td>
                        <td className="p-3">
                          <div className="flex gap-2">
                            <button onClick={() => openEdit(s.id)} className="hh-btn px-3 py-1 text-sm">Edit</button>
                            <button onClick={() => deleteSpoc(s.id)} className="hh-btn-outline px-3 py-1 text-sm border-2">Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'teams' && (
          <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gitam-700 mb-1">Assign SPOCs to Teams</h2>
              <p className="text-sm text-gitam-700/75">Select teams and assign a SPOC in bulk or individually</p>
            </div>

            <div className="mb-6 p-4 rounded-lg border-2 border-gitam-200 bg-antique/60">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Bulk Assign SPOC (selected teams)</label>
                  <select
                    value={bulkSpocId}
                    onChange={(e) => setBulkSpocId(e.target.value)}
                    disabled={selectedTeamsCount === 0}
                    className="hh-input w-full border-2 border-gitam-200 disabled:opacity-50"
                  >
                    <option value="">Select SPOC...</option>
                    {spocs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id} — {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={applyBulkAssign}
                    disabled={!bulkSpocId || selectedTeamsCount === 0}
                    className="hh-btn px-3 py-2 text-sm whitespace-nowrap disabled:opacity-50"
                  >
                    Apply Bulk Assign
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
                <div className="text-xs text-gitam-700/75 md:col-span-3">Use checkboxes to select teams for bulk assignment.</div>
              </div>
            </div>

            <div className="mb-6 p-4 rounded-lg border-2 border-gitam-200">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
                  <select
                    value={campusFilter}
                    onChange={(e) => setCampusFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option value="All">All</option>
                    {campusOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
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
                    <option value="All">All</option>
                    {domainOptions.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Team Size</label>
                  <select
                    value={teamSizeFilter}
                    onChange={(e) => setTeamSizeFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option value="All">All</option>
                    {teamSizeOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
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
                    <option value="All">All</option>
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
                  <select
                    value={zoneFilter}
                    onChange={(e) => setZoneFilter(e.target.value)}
                    className="hh-input w-full border-2 border-gitam-200"
                  >
                    <option value="All">All</option>
                    {zoneOptions.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
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
                    <option value="All">All</option>
                    {spocOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
                  <input
                    value={teamSearch}
                    onChange={(e) => setTeamSearch(e.target.value)}
                    placeholder="Search team / lead"
                    className="hh-input w-full border-2 border-gitam-200"
                  />
                </div>
              </div>
            </div>

            <div className="mb-3 text-sm text-gitam-700/80">Showing {filteredTeams.length} teams</div>

            <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
              <table className="w-full text-sm border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300 text-left">
                    <th className="p-3 border-r border-gitam-200">
                      <input
                        type="checkbox"
                        checked={filteredTeams.length > 0 && filteredTeams.every((t: any) => selectedTeams[String(t?.teamName || '')])}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next: Record<string, boolean> = {};
                          if (checked) {
                            filteredTeams.forEach((t: any) => {
                              const teamName = String(t?.teamName || '');
                              if (teamName) next[teamName] = true;
                            });
                          }
                          setSelectedTeams(next);
                        }}
                      />
                    </th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Campus</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Domain</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Lead</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Team Size</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Attendance</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Venue</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Assign SPOC</th>
                    <th className="p-3 font-semibold text-gitam-700">Save</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-gitam-700/75">No teams found.</td>
                    </tr>
                  ) : (
                    filteredTeams.map((t: any) => {
                      const teamName = String(t?.teamName || '').trim();
                      const assignedId = draftAssignments[teamName] || '';
                      const assignedSpoc = assignedId ? spocById.get(assignedId) : undefined;

                      return (
                        <tr key={teamName} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100">
                          <td className="p-3 border-r border-gitam-200">
                            <input
                              type="checkbox"
                              checked={Boolean(selectedTeams[teamName])}
                              onChange={(e) => {
                                setSelectedTeams((prev) => ({ ...prev, [teamName]: e.target.checked }));
                              }}
                            />
                          </td>
                          <td className="p-3 border-r border-gitam-200 whitespace-nowrap text-gitam-700">{teamCampus(t)}</td>
                          <td className="p-3 border-r border-gitam-200 whitespace-nowrap text-gitam-700">{normalizeDomain(t?.domain) || '—'}</td>
                          <td className="p-3 border-r border-gitam-200 text-gitam-700">
                            <div className="truncate max-w-[200px]" title={teamName}>{teamName || '—'}</div>
                          </td>
                          <td className="p-3 border-r border-gitam-200 text-gitam-700">
                            <div className="truncate max-w-[180px]" title={teamLead(t)}>{teamLead(t)}</div>
                          </td>
                          <td className="p-3 border-r border-gitam-200 whitespace-nowrap text-gitam-700">{teamSize(t)}</td>
                          <td className="p-3 border-r border-gitam-200 whitespace-nowrap text-gitam-700">{getTeamAttendance(teamName)}</td>
                          <td className="p-3 border-r border-gitam-200 whitespace-nowrap text-gitam-700">{getZoneForTeam(teamName)}</td>
                          <td className="p-3 border-r border-gitam-200">
                            <select
                              value={assignedId}
                              onChange={(e) => setDraftForTeam(teamName, e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border-2 border-gitam-100 bg-antique/70 text-gitam-700 focus:outline-none focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition text-sm"
                            >
                              <option value="">Unassigned</option>
                              {spocs.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.id} — {s.name}
                                </option>
                              ))}
                            </select>
                            {assignedSpoc && (
                              <div className="text-xs text-gitam-700/75 mt-1 truncate" title={`${assignedSpoc.email} • ${assignedSpoc.phone}`}>
                                {assignedSpoc.email}
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <button
                              onClick={() => saveTeamAssignment(teamName)}
                              className="hh-btn px-3 py-1 text-sm"
                              disabled={!teamName}
                            >
                              Save
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border-2 border-gitam-300 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gitam-700">Add SPOC</h3>
              <button onClick={closeAdd} className="hh-btn-ghost px-2 py-1">✕</button>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-gitam-50 border border-gitam-200">
              <div className="text-sm text-gitam-700">
                <span className="font-semibold">SPOC ID:</span> {nextSpocId(spocs)} <span className="text-xs text-gitam-700/75">(auto-generated)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-1.5">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter name" className="hh-input border-2 border-gitam-200" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-1.5">Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter email" className="hh-input border-2 border-gitam-200" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-1.5">Phone Number</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Enter phone" className="hh-input border-2 border-gitam-200" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeAdd} className="hh-btn-outline px-4 py-2 border-2">Cancel</button>
              <button onClick={addSpoc} className="hh-btn px-4 py-2">Save</button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border-2 border-gitam-300 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gitam-700">Edit SPOC</h3>
              <button onClick={closeEdit} className="hh-btn-ghost px-2 py-1">✕</button>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-gitam-50 border border-gitam-200">
              <div className="text-sm text-gitam-700">
                <span className="font-semibold">SPOC ID:</span> {editingSpocId}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-1.5">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter name" className="hh-input border-2 border-gitam-200" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-1.5">Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Enter email" className="hh-input border-2 border-gitam-200" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-1.5">Phone Number</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Enter phone" className="hh-input border-2 border-gitam-200" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={closeEdit} className="hh-btn-outline px-4 py-2 border-2">Cancel</button>
              <button onClick={editSpoc} className="hh-btn px-4 py-2">Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
