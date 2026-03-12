'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';
import { listReportingAssignments, upsertManyReportingAssignments } from '@/lib/reportingBackend';

type TeamRow = {
  teamName: string;
  domain: string;
  campus: string;
  leadName: string;
  teamSize: number;
};

type ReportingAssignment = {
  venue?: string;
  date?: string;
  time?: string;
  spoc?: { name?: string; email?: string; phone?: string };
  updatedAt?: string;
};

const VENUE_OPTIONS = ['Shivaji Auditorium', 'Zone-1', 'Zone-2', 'Zone-3', 'Zone-4', 'Zone-5'];
const DOMAIN_OPTIONS = ['App Development', 'Cyber Security', 'AI', 'ML & DS'];

const readLocalJSON = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
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

const formatDisplayDate = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return raw;

  const year = match[1];
  const monthNum = Number(match[2]);
  const day = String(Number(match[3]));
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const month = months[monthNum - 1];
  if (!month) return raw;
  return `${day} ${month} ${year}`;
};

export default function AdminReportingPage() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, ReportingAssignment>>({});
  const [drafts, setDrafts] = useState<Record<string, ReportingAssignment>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const [campusFilter, setCampusFilter] = useState<string>('All');
  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [venueFilter, setVenueFilter] = useState<string>('All');
  const [spocFilter, setSpocFilter] = useState<string>('All');
  const [attendanceFilter, setAttendanceFilter] = useState<string>('All');
  const [teamSizeFilter, setTeamSizeFilter] = useState<string>('All');
  const [search, setSearch] = useState<string>('');

  // Hide global navbar on this page
  useEffect(() => {
    const navbar = document.querySelector('nav');
    if (navbar) {
      navbar.style.display = 'none';
    }
    return () => {
      if (navbar) {
        navbar.style.display = '';
      }
    };
  }, []);

  const [bulkVenue, setBulkVenue] = useState<string>('');
  const [bulkDate, setBulkDate] = useState<string>('');
  const [bulkTime, setBulkTime] = useState<string>('');

  useEffect(() => {
    try {
      const a = localStorage.getItem('adminLoggedIn');
      if (!a) {
        router.push('/admin');
        return;
      }
      setOk(true);
    } catch {
      router.push('/admin');
    }
  }, [router]);

  useEffect(() => {
    if (!ok) return;

    const load = async () => {
      let rows: any[] | null = null;
      try {
        if (isSupabaseConfigured()) {
          rows = await listTeamsWithMembers();
        }
      } catch {
        rows = null;
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        rows = readLocalJSON<any[]>('registeredTeams', []);
      }
      setTeams(Array.isArray(rows) ? rows : []);

      const map = readLocalJSON<Record<string, ReportingAssignment>>('reportingAssignments', {});
      setAssignments(map || {});

      if (isSupabaseConfigured()) {
        try {
          const remoteAssignments = await listReportingAssignments();
          if (remoteAssignments && Object.keys(remoteAssignments).length) {
            setAssignments(remoteAssignments as Record<string, ReportingAssignment>);
            localStorage.setItem('reportingAssignments', JSON.stringify(remoteAssignments));
          }
        } catch {
          // Keep local fallback assignments.
        }
      }

      const nextDrafts: Record<string, ReportingAssignment> = {};
      (rows || []).forEach((t: any) => {
        const teamName = String(t?.teamName || '');
        if (!teamName) return;
        const existing = map?.[teamName] || {};
        nextDrafts[teamName] = {
          venue: existing.venue || '',
          date: existing.date || '',
          time: existing.time || '',
        };
      });
      setDrafts(nextDrafts);
      setEditing({});
      setSelected({});
    };

    load();
  }, [ok]);

  const normalizedTeams: TeamRow[] = useMemo(() => {
    return (teams || [])
      .map((t: any) => {
        const members = Array.isArray(t?.members) ? t.members : [];
        const lead = members[0] || {};
        return {
          teamName: String(t?.teamName || ''),
          domain: normalizeDomain(t?.domain),
          campus: String(lead?.campus || ''),
          leadName: String(lead?.name || ''),
          teamSize: Number(t?.teamSize || members.length || 0),
        } satisfies TeamRow;
      })
      .filter((t) => t.teamName);
  }, [teams]);

  const uniqueCampuses = useMemo(() => {
    return Array.from(new Set(normalizedTeams.map((t) => t.campus).filter(Boolean))).sort();
  }, [normalizedTeams]);

  const uniqueTeamSizes = ['3', '4'];

  const uniqueDomains = DOMAIN_OPTIONS;

  const uniqueVenues = useMemo(() => {
    const venues = normalizedTeams
      .map((t) => {
        const saved = assignments[t.teamName] || {};
        return String(saved.venue || '');
      })
      .filter(Boolean);
    return Array.from(new Set(venues)).sort();
  }, [normalizedTeams, assignments]);

  const uniqueSpocs = useMemo(() => {
    const spocs = normalizedTeams
      .map((t) => {
        const saved = assignments[t.teamName] || {};
        return String(saved.spoc?.name || '');
      })
      .filter(Boolean);
    return Array.from(new Set(spocs)).sort();
  }, [normalizedTeams, assignments]);

  const teamAttendanceMap = useMemo(() => {
    const map: Record<string, string> = {};
    normalizedTeams.forEach((t) => {
      const saved = localStorage.getItem(`team_attendance_${t.teamName}`) || '';
      if (saved === 'Present' || saved === 'Absent') {
        map[t.teamName] = saved;
      }
    });
    return map;
  }, [normalizedTeams]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return normalizedTeams.filter((t) => {
      if (campusFilter !== 'All' && t.campus !== campusFilter) return false;
      if (domainFilter !== 'All' && t.domain !== domainFilter) return false;
      if (teamSizeFilter !== 'All' && String(t.teamSize) !== teamSizeFilter) return false;
      if (venueFilter !== 'All') {
        const saved = assignments[t.teamName] || {};
        if (String(saved.venue || '') !== venueFilter) return false;
      }
      if (spocFilter !== 'All') {
        const saved = assignments[t.teamName] || {};
        if (String(saved.spoc?.name || '') !== spocFilter) return false;
      }
      if (attendanceFilter !== 'All') {
        if (String(teamAttendanceMap[t.teamName] || '') !== attendanceFilter) return false;
      }
      if (q) {
        const hay = `${t.teamName} ${t.leadName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [normalizedTeams, campusFilter, domainFilter, teamSizeFilter, venueFilter, spocFilter, attendanceFilter, assignments, search, teamAttendanceMap]);

  // Keep selection aligned to current filters (so bulk apply affects only matching teams)
  useEffect(() => {
    const allowed = new Set(filteredTeams.map((t) => t.teamName));
    setSelected((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([teamName, isSelected]) => {
        if (isSelected && allowed.has(teamName)) next[teamName] = true;
      });
      return next;
    });
  }, [filteredTeams]);

  const selectedCount = useMemo(() => {
    return Object.values(selected).filter(Boolean).length;
  }, [selected]);

  const allMatchingSelected = useMemo(() => {
    if (filteredTeams.length === 0) return false;
    return filteredTeams.every((t) => !!selected[t.teamName]);
  }, [filteredTeams, selected]);

  const toggleSelected = (teamName: string, next: boolean) => {
    setSelected((prev) => ({ ...prev, [teamName]: next }));
  };

  const setSelectAllMatching = (next: boolean) => {
    const allowed = new Set(filteredTeams.map((t) => t.teamName));
    if (!next) {
      // Clear all matching selections
      setSelected({});
      return;
    }

    // Select exactly all teams matching current filters
    const copy: Record<string, boolean> = {};
    allowed.forEach((teamName) => {
      copy[teamName] = true;
    });
    setSelected(copy);
  };

  const clearSelection = () => {
    setSelected({});
    setBulkVenue('');
    setBulkDate('');
    setBulkTime('');
  };

  const updateDraft = (teamName: string, patch: Partial<ReportingAssignment>) => {
    setDrafts((prev) => ({
      ...prev,
      [teamName]: {
        ...(prev[teamName] || {}),
        ...patch,
      },
    }));
  };

  const startEdit = (teamName: string) => {
    setEditing((prev) => ({ ...prev, [teamName]: true }));
  };

  const cancelEdit = (teamName: string) => {
    const saved = assignments[teamName] || {};
    setDrafts((prev) => ({
      ...prev,
      [teamName]: {
        ...(prev[teamName] || {}),
        venue: String(saved.venue || ''),
        date: String(saved.date || ''),
        time: String(saved.time || ''),
      },
    }));
    setEditing((prev) => ({ ...prev, [teamName]: false }));
  };

  const saveTeam = (teamName: string) => {
    const d = drafts[teamName] || {};
    const venue = String(d.venue || '').trim();
    const date = String(d.date || '').trim();
    const time = String(d.time || '').trim();

    if (!venue || !date || !time) return;

    const current = readLocalJSON<Record<string, ReportingAssignment>>('reportingAssignments', {});
    const existing = current?.[teamName] || {};

    const next: Record<string, ReportingAssignment> = {
      ...(current || {}),
      [teamName]: {
        ...existing,
        venue,
        date,
        time,
        updatedAt: new Date().toISOString(),
      },
    };

    try {
      localStorage.setItem('reportingAssignments', JSON.stringify(next));
      setAssignments(next);
      if (isSupabaseConfigured()) {
        void upsertManyReportingAssignments(next as any);
      }
      // Keep drafts normalized to the saved/trimmed values.
      setDrafts((prev) => ({
        ...prev,
        [teamName]: {
          ...(prev[teamName] || {}),
          venue,
          date,
          time,
        },
      }));
      // Once assigned/saved, lock the row again.
      setEditing((prev) => ({ ...prev, [teamName]: false }));
      alert('Saved');
    } catch {
      alert('Save failed');
    }
  };

  const bulkComplete = !!(bulkVenue && bulkDate && bulkTime);
  const canBulkSave = selectedCount > 0 && bulkComplete;

  const assignedTeams = useMemo(() => {
    return filteredTeams.filter((t) => {
      const saved = assignments[t.teamName] || {};
      return !!(saved.venue && saved.date && saved.time);
    });
  }, [filteredTeams, assignments]);

  const exportToExcel = () => {
    if (assignedTeams.length === 0) {
      alert('No assigned teams to export');
      return;
    }

    const headers = ['Campus', 'Team Name', 'Lead', 'Team Size', 'Domain', 'Attendance', 'Venue', 'Date', 'Time'];
    const rows = assignedTeams.map((t) => {
      const saved = assignments[t.teamName] || {};
      return [
        t.campus,
        t.teamName,
        t.leadName,
        t.teamSize,
        t.domain,
        teamAttendanceMap[t.teamName] || '-',
        saved.venue || '',
        saved.date || '',
        saved.time || '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '\\"')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `reporting_assignments_${new Date().toISOString().split('T')[0]}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyBulkAndSave = () => {
    if (!canBulkSave) return;

    const venue = bulkVenue.trim();
    const date = bulkDate.trim();
    const time = bulkTime.trim();

    const current = readLocalJSON<Record<string, ReportingAssignment>>('reportingAssignments', {});
    const next: Record<string, ReportingAssignment> = { ...(current || {}) };
    const now = new Date().toISOString();

    Object.entries(selected)
      .filter(([, isSelected]) => !!isSelected)
      .forEach(([teamName]) => {
        const existing = next[teamName] || {};
        next[teamName] = {
          ...existing,
          venue,
          date,
          time,
          updatedAt: now,
        };
      });

    try {
      localStorage.setItem('reportingAssignments', JSON.stringify(next));
      setAssignments(next);
      if (isSupabaseConfigured()) {
        void upsertManyReportingAssignments(next as any);
      }

      // keep drafts in sync with saved values for selected teams
      setDrafts((prev) => {
        const copy = { ...prev };
        Object.entries(selected)
          .filter(([, isSelected]) => !!isSelected)
          .forEach(([teamName]) => {
            copy[teamName] = { ...(copy[teamName] || {}), venue, date, time };
          });
        return copy;
      });

      // Lock affected rows after bulk save.
      setEditing((prev) => {
        const copy = { ...prev };
        Object.entries(selected)
          .filter(([, isSelected]) => !!isSelected)
          .forEach(([teamName]) => {
            copy[teamName] = false;
          });
        return copy;
      });

      alert(`Saved ${selectedCount} team(s)`);
    } catch {
      alert('Save failed');
    }
  };

  if (!ok) return null;

  return (
    <main className="min-h-screen bg-antique p-6">
      <div className="max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gitam-700">Reporting - Admin</h1>
              <p className="text-sm text-gitam-600 mt-2">Assign venue, reporting date and time for each team. Save is enabled only after all three fields are filled.</p>
            </div>
            <button onClick={() => router.push('/admin/dashboard')} className="hh-btn-outline px-4 py-2 border-2">← Back to dashboard</button>
          </div>
        </div>

        {/* Filters and Bulk Assign */}
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          {/* Filter Section */}
          <div className="mb-6 pb-6 border-b-2 border-gitam-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
                <select className="hh-input w-full border-2 border-gitam-200" value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)}>
                  <option value="All">All</option>
                  {uniqueCampuses.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain</label>
                <select className="hh-input w-full border-2 border-gitam-200" value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
                  <option value="All">All</option>
                  {uniqueDomains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Team Size</label>
                <select className="hh-input w-full border-2 border-gitam-200" value={teamSizeFilter} onChange={(e) => setTeamSizeFilter(e.target.value)}>
                  <option value="All">All</option>
                  {uniqueTeamSizes.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Attendance</label>
                <select className="hh-input w-full border-2 border-gitam-200" value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value)}>
                  <option value="All">All</option>
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">SPOC</label>
                <select className="hh-input w-full border-2 border-gitam-200" value={spocFilter} onChange={(e) => setSpocFilter(e.target.value)}>
                  <option value="All">All</option>
                  {uniqueSpocs.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
                <select className="hh-input w-full border-2 border-gitam-200" value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)}>
                  <option value="All">All</option>
                  {uniqueVenues.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
                <input
                  className="hh-input w-full border-2 border-gitam-200"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Team / lead name"
                />
              </div>
            </div>
          </div>

          {/* Bulk Assign Section */}
          <div className="p-4 bg-gitam-50 rounded-lg border-2 border-gitam-200 flex flex-col md:flex-row md:items-end gap-4">
            <div className="text-sm text-gitam-700">
              <div className="font-semibold">Bulk Assign</div>
              <div>Selected: <span className="font-semibold text-gitam-800">{selectedCount}</span> teams</div>
              {selectedCount === 0 && <div className="text-xs text-gitam-600 mt-1">(select teams to enable)</div>}
            </div>
            <div className={`flex-1 ${selectedCount === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
              <select className="hh-input w-full border-2 border-gitam-200" value={bulkVenue} onChange={(e) => setBulkVenue(e.target.value)} disabled={selectedCount === 0}>
                <option value="" disabled hidden>Select venue</option>
                {VENUE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className={`${selectedCount === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Date</label>
              <input className="hh-input border-2 border-gitam-200" type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} disabled={selectedCount === 0} />
            </div>
            <div className={`${selectedCount === 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Time</label>
              <input className="hh-input border-2 border-gitam-200" type="time" value={bulkTime} onChange={(e) => setBulkTime(e.target.value)} disabled={selectedCount === 0} />
            </div>
            <div className="flex gap-2">
              <button className="hh-btn px-4 py-2" disabled={!canBulkSave} onClick={applyBulkAndSave}>Apply & Save</button>
              <button className="hh-btn-outline px-4 py-2 border-2" disabled={selectedCount === 0} onClick={clearSelection}>Clear</button>
              <button className="hh-btn px-4 py-2" onClick={exportToExcel} disabled={assignedTeams.length === 0}>📥 Export</button>
            </div>
          </div>
        </div>

        {/* Assigned Count */}
        <div className="mb-4 text-sm text-gitam-700">
          <p>Assigned: <span className="font-semibold text-gitam-800">{assignedTeams.length}</span> / Showing: <span className="font-semibold text-gitam-800">{filteredTeams.length}</span></p>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-3 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gitam-50 border-b-2 border-gitam-300">
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">
                  <input
                    type="checkbox"
                    checked={allMatchingSelected}
                    onChange={(e) => setSelectAllMatching(e.target.checked)}
                    aria-label="Select all teams matching filters"
                  />
                </th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Campus</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Name</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Lead</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Size</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Domain</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Attendance</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">SPOC</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Venue</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Date</th>
                <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Time</th>
                <th className="p-3 text-left font-semibold text-gitam-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.length === 0 ? (
                <tr>
                  <td className="p-3 text-center text-gitam-600" colSpan={12}>
                    No teams match the current filters.
                  </td>
                </tr>
              ) : (
                filteredTeams.map((t) => {
                  const draft = drafts[t.teamName] || {};
                  const saved = assignments[t.teamName] || {};
                  const assigned = !!(saved.venue && saved.date && saved.time);
                  const isEditing = !!editing[t.teamName];
                  const locked = assigned && !isEditing;
                  const complete = !!(draft.venue && draft.date && draft.time);
                  const changed =
                    String(draft.venue || '') !== String(saved.venue || '') ||
                    String(draft.date || '') !== String(saved.date || '') ||
                    String(draft.time || '') !== String(saved.time || '');
                  const isSelected = !!selected[t.teamName];

                  return (
                    <tr key={t.teamName} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100 transition">
                      <td className="p-3 border-r border-gitam-100">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelected(t.teamName, e.target.checked)}
                          aria-label={`Select ${t.teamName}`}
                        />
                      </td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{t.campus || '-'}</td>
                      <td className="p-3 font-semibold text-gitam-700 border-r border-gitam-100">{t.teamName}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{t.leadName || '-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{t.teamSize || '-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{t.domain || '-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{teamAttendanceMap[t.teamName] || '-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{String(saved.spoc?.name || '-')}</td>
                      <td className="p-3 border-r border-gitam-100">
                        {locked ? (
                          <div className="px-2 py-1 bg-gitam-50 rounded text-gitam-600">{String(saved.venue || '-')}</div>
                        ) : (
                          <select
                            className="hh-input border-2 border-gitam-200"
                            value={String(draft.venue || '')}
                            onChange={(e) => updateDraft(t.teamName, { venue: e.target.value })}
                          >
                            <option value="" disabled hidden>Select venue</option>
                            {VENUE_OPTIONS.map((v) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="p-3 border-r border-gitam-100">
                        {locked ? (
                          <div className="px-2 py-1 bg-gitam-50 rounded text-gitam-600">{formatDisplayDate(String(saved.date || ''))}</div>
                        ) : (
                          <input
                            type="date"
                            className="hh-input border-2 border-gitam-200"
                            value={String(draft.date || '')}
                            onChange={(e) => updateDraft(t.teamName, { date: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="p-3 border-r border-gitam-100">
                        {locked ? (
                          <div className="px-2 py-1 bg-gitam-50 rounded text-gitam-600">{String(saved.time || '-')}</div>
                        ) : (
                          <input
                            type="time"
                            className="hh-input border-2 border-gitam-200"
                            value={String(draft.time || '')}
                            onChange={(e) => updateDraft(t.teamName, { time: e.target.value })}
                          />
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {locked ? (
                            <button className="hh-btn px-3 py-1 text-xs" onClick={() => startEdit(t.teamName)}>✏️ Edit</button>
                          ) : (
                            <>
                              <button
                                className="hh-btn px-3 py-1 text-xs"
                                disabled={!complete || !changed}
                                onClick={() => saveTeam(t.teamName)}
                                title={!complete ? 'Fill venue, date and time to enable save' : !changed ? 'No changes to save' : 'Save'}
                              >
                                Save
                              </button>
                              {assigned && isEditing ? (
                                <button className="hh-btn-outline px-2 py-1 text-xs border-2" onClick={() => cancelEdit(t.teamName)}>Cancel</button>
                              ) : null}
                            </>
                          )}
                          <span className="text-xs text-gitam-700/70 whitespace-nowrap">
                            {assigned ? '✓ Assigned' : 'Pending'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
