'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';
import {
  deletePpt as deletePptBackend,
  getPpt as getPptBackend,
  getPptDeadline,
  listPptUploadsForTeams,
  MAX_PPT_BYTES,
  setPptDeadline,
  subscribeAdminPptChanges,
  upsertPpt,
} from '@/lib/pptBackend';

export default function AdminPPTPage() {
  const router = useRouter();
  const [registered, setRegistered] = useState<any[]>([]);
  const [campusFilter, setCampusFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [teamSizeFilter, setTeamSizeFilter] = useState('All');
  const [attendanceFilter, setAttendanceFilter] = useState('All');
  const [venueFilter, setVenueFilter] = useState('All');
  const [spocFilter, setSpocFilter] = useState('All');
  const [pptStatusFilter, setPptStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [assignments, setAssignments] = useState<Record<string, any>>({});

  const DEFAULT_DEADLINE_INPUT = '2026-03-28T14:00';
  const [selectedTeams, setSelectedTeams] = useState<Record<string, boolean>>({});
  const [bulkDeadlineInput, setBulkDeadlineInput] = useState(DEFAULT_DEADLINE_INPUT);

  const [backendUploads, setBackendUploads] = useState<Record<string, { fileName: string; filePath: string; uploadedAt: string }>>({});
  const [adminSelectedFiles, setAdminSelectedFiles] = useState<Record<string, File | null>>({});
  const [adminUploadingRows, setAdminUploadingRows] = useState<Record<string, boolean>>({});

  const keyFor = (teamId: string, campus: string) => `${teamId}::${campus}`;
  const localKeyFor = (teamName: string, campus: string) => `ppt_${encodeURIComponent(teamName)}_${encodeURIComponent(campus)}`;
  const localDeadlineKeyFor = (teamName: string, campus: string) => `ppt_deadline_${encodeURIComponent(teamName)}_${encodeURIComponent(campus)}`;

  const DOMAIN_OPTIONS = ['App Development', 'Cyber Security', 'AI', 'ML & DS'];
  const normalizeDomain = (value: any) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'app development') return 'App Development';
    if (raw === 'cybersecurity' || raw === 'cyber security') return 'Cyber Security';
    if (raw === 'artificial intelligence' || raw === 'ai') return 'AI';
    if (raw === 'machine learning and data science' || raw === 'ml & data science' || raw === 'ml & ds') return 'ML & DS';
    return String(value);
  };

  const getZoneForTeam = (teamName: string) => assignments[teamName]?.venue || '-';
  const getVenueForTeam = (teamName: string) => getZoneForTeam(teamName);
  const getSpocForTeam = (teamName: string) => String(assignments[teamName]?.spoc?.name || '-');

  const getTeamAttendance = (teamName: string): string => {
    try {
      const saved = localStorage.getItem(`team_attendance_${teamName}`) || '';
      return saved === 'Present' || saved === 'Absent' ? saved : '-';
    } catch {
      return '-';
    }
  };

  const getTeamSelectedCode = (team: any): string => {
    return String(team?.selectedProblemStatement || team?.selectedProblem || '').trim() || '-';
  };

  const hasPptForTeam = (team: any): boolean => {
    const campus = String(team?.members?.[0]?.campus || '');
    const teamId = String(team?.teamId || team?.id || '');
    if (isSupabaseConfigured() && teamId) {
      return Boolean(backendUploads[keyFor(teamId, campus)]);
    }
    try {
      const localKey = localKeyFor(String(team?.teamName || ''), campus);
      const raw = localStorage.getItem(localKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed?.file);
    } catch {
      return false;
    }
  };

  const refreshBackendUploads = async (teams: any[]) => {
    if (!isSupabaseConfigured()) return;
    const teamIds = Array.from(new Set(teams.map((t: any) => String(t.teamId || t.id || '')).filter(Boolean)));
    if (!teamIds.length) {
      setBackendUploads({});
      return;
    }

    const rows = await listPptUploadsForTeams(teamIds);
    const map: Record<string, { fileName: string; filePath: string; uploadedAt: string }> = {};
    rows.forEach((r) => {
      map[keyFor(r.teamId, r.campus)] = { fileName: r.fileName, filePath: r.filePath, uploadedAt: r.uploadedAt };
    });
    setBackendUploads(map);
  };

  const reload = () => {
    (async () => {
      try {
        if (isSupabaseConfigured()) {
          const rows = await listTeamsWithMembers();
          if (rows) {
            setRegistered(rows);
            await refreshBackendUploads(rows);
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
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      if (Object.values(adminUploadingRows).some(Boolean)) return;
      reload();
      try {
        const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
        setAssignments(map || {});
      } catch {
        setAssignments({});
      }
    }, 2000);

    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUploadingRows]);

  useEffect(() => {
    const navbar = document.querySelector('nav');
    if (navbar) (navbar as HTMLElement).style.display = 'none';
    return () => {
      const nav = document.querySelector('nav');
      if (nav) (nav as HTMLElement).style.display = '';
    };
  }, []);

  useEffect(() => {
    try {
      const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
      setAssignments(map || {});
    } catch {
      setAssignments({});
    }

    try {
      const existing = localStorage.getItem('ppt_general_deadline');
      if (existing) {
        setBulkDeadlineInput(new Date(existing).toISOString().slice(0, 16));
      } else {
        const iso = new Date(DEFAULT_DEADLINE_INPUT).toISOString();
        localStorage.setItem('ppt_general_deadline', iso);
        setBulkDeadlineInput(DEFAULT_DEADLINE_INPUT);
      }
    } catch {
      setBulkDeadlineInput(DEFAULT_DEADLINE_INPUT);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const unsub = subscribeAdminPptChanges(() => {
      refreshBackendUploads(registered);
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registered]);

  const formatDate = (s?: string) => {
    if (!s) return '';
    try {
      return new Date(s).toLocaleString();
    } catch {
      return s;
    }
  };

  const dataUrlToBlob = (dataUrl: string): Blob | null => {
    try {
      const parts = String(dataUrl || '').split(',');
      if (parts.length < 2) return null;
      const meta = parts[0];
      const base64 = parts.slice(1).join(',');
      const mimeMatch = meta.match(/data:(.*?);base64/);
      const mime = mimeMatch?.[1] || 'application/pdf';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    } catch {
      return null;
    }
  };

  

  const filteredTeams = useMemo(() => {
    return registered.filter((t: any) => {
      const campus = String(t.members?.[0]?.campus || '');
      const domain = normalizeDomain(t.domain);
      const size = (t.members || []).length;
      const teamName = String(t.teamName || '');
      const leadName = String(t.members?.[0]?.name || '');
      const attendance = getTeamAttendance(teamName);
      const venue = getVenueForTeam(teamName);
      const spoc = getSpocForTeam(teamName);
      const psCode = getTeamSelectedCode(t);
      const hasPpt = hasPptForTeam(t);

      if (campusFilter !== 'All' && campus !== campusFilter) return false;
      if (domainFilter !== 'All' && domain !== domainFilter) return false;
      if (teamSizeFilter !== 'All' && String(size) !== teamSizeFilter) return false;
      if (attendanceFilter !== 'All' && attendance !== attendanceFilter) return false;
      if (venueFilter !== 'All' && venue !== venueFilter) return false;
      if (spocFilter !== 'All' && spoc !== spocFilter) return false;
      if (pptStatusFilter === 'Uploaded' && !hasPpt) return false;
      if (pptStatusFilter === 'Not Uploaded' && hasPpt) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        if (!teamName.toLowerCase().includes(q) && !leadName.toLowerCase().includes(q) && !psCode.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registered, campusFilter, domainFilter, teamSizeFilter, attendanceFilter, venueFilter, spocFilter, pptStatusFilter, search, assignments, backendUploads]);

  const uniqueCampuses = useMemo(() => Array.from(new Set(registered.map((r) => r.members?.[0]?.campus).filter(Boolean))), [registered]);
  const uniqueDomains = DOMAIN_OPTIONS;
  const uniqueTeamSizes = ['3', '4'];
  const uniqueVenues = useMemo(() => Array.from(new Set(Object.values(assignments).map((a: any) => a?.venue).filter(Boolean))), [assignments]);
  const uniqueSpocs = useMemo(() => Array.from(new Set(Object.values(assignments).map((a: any) => a?.spoc?.name).filter(Boolean))), [assignments]);

  const selectedTeamsCount = useMemo(() => Object.values(selectedTeams).filter(Boolean).length, [selectedTeams]);
  const allMatchingSelected = useMemo(() => {
    if (filteredTeams.length === 0) return false;
    return filteredTeams.every((t: any) => {
      const campus = String(t.members?.[0]?.campus || '');
      const teamId = String(t.teamId || t.id || '');
      const rowKey = teamId ? keyFor(teamId, campus) : `${String(t.teamName || '')}::${campus}`;
      return !!selectedTeams[rowKey];
    });
  }, [filteredTeams, selectedTeams]);

  useEffect(() => {
    const allowed = new Set(filteredTeams.map((t: any) => {
      const campus = String(t.members?.[0]?.campus || '');
      const teamId = String(t.teamId || t.id || '');
      return teamId ? keyFor(teamId, campus) : `${String(t.teamName || '')}::${campus}`;
    }));
    setSelectedTeams((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (v && allowed.has(k)) next[k] = true;
      });
      return next;
    });
  }, [filteredTeams]);

  const clearBulkSelection = () => {
    setSelectedTeams({});
    setBulkDeadlineInput('');
  };

  const applyBulkExtendTeams = async () => {
    if (!bulkDeadlineInput || selectedTeamsCount === 0) return;
    const iso = new Date(bulkDeadlineInput).toISOString();
    const targets = filteredTeams.filter((t: any) => {
      const campus = String(t.members?.[0]?.campus || '');
      const teamId = String(t.teamId || t.id || '');
      const rowKey = teamId ? keyFor(teamId, campus) : `${String(t.teamName || '')}::${campus}`;
      return selectedTeams[rowKey];
    });

    try {
      for (const t of targets) {
        const campus = String(t.members?.[0]?.campus || '');
        const teamId = String(t.teamId || t.id || '');
        if (isSupabaseConfigured() && teamId) {
          await setPptDeadline(teamId, campus, iso);
        } else {
          localStorage.setItem(localDeadlineKeyFor(String(t.teamName || ''), campus), iso);
        }
      }
      localStorage.setItem('ppt_general_deadline', iso);
      setSelectedTeams({});
      setBulkDeadlineInput('');
      alert('Bulk extension applied');
    } catch {
      alert('Failed to apply bulk extension');
    }
  };

  const toCsvCell = (value: any) => {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const exportTeamsCsv = async () => {
    if (!filteredTeams.length) {
      alert('No team rows to export.');
      return;
    }

    const headers = ['Campus', 'Team Name', 'Team Lead', 'Domain', 'Team Size', 'Zone', 'PPT', 'Uploaded At', 'Deadline'];
    const rows = await Promise.all(filteredTeams.map(async (t: any) => {
      const campus = String(t.members?.[0]?.campus || '');
      const teamId = String(t.teamId || t.id || '');
      const localKey = localKeyFor(String(t.teamName || ''), campus);
      const rawLocal = (() => {
        try {
          const r = localStorage.getItem(localKey);
          if (r) return JSON.parse(r);
        } catch {
          // ignore
        }
        return null;
      })();
      const rawBackend = (isSupabaseConfigured() && teamId) ? backendUploads[keyFor(teamId, campus)] : null;

      let deadline = '-';
      try {
        if (isSupabaseConfigured() && teamId) {
          const d = await getPptDeadline(teamId, campus);
          deadline = d ? new Date(d).toLocaleString() : '-';
        } else {
          const d = localStorage.getItem(localDeadlineKeyFor(String(t.teamName || ''), campus));
          if (d) {
            deadline = new Date(d).toLocaleString();
          } else {
            const g = localStorage.getItem('ppt_general_deadline');
            deadline = g ? new Date(g).toLocaleString() : '-';
          }
        }
      } catch {
        deadline = '-';
      }

      const pptName = String(rawBackend?.fileName || rawLocal?.file?.name || 'Not uploaded');
      const uploadedAt = formatDate((rawBackend?.uploadedAt || rawLocal?.uploadedAt) || '') || '-';

      return [
        String(campus || '-'),
        String(t.teamName || '-'),
        String(t.members?.[0]?.name || '-'),
        String(normalizeDomain(t.domain) || '-'),
        String((t.members || []).length),
        String(getZoneForTeam(String(t.teamName || '')) || '-'),
        pptName,
        uploadedAt,
        deadline,
      ].map(toCsvCell).join(',');
    }));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ppt-teams-${new Date().toISOString().slice(0, 10)}.csv`;
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
            <h1 className="text-3xl font-bold text-gitam-700">PPT - Admin</h1>
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="hh-btn-outline px-4 py-2 border-2"
            >
              ← Back to dashboard
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-4 mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-8 gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
              <select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueCampuses.map((c: any) => (<option key={c}>{c}</option>))}</select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain</label>
              <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueDomains.map((d: any) => (<option key={d}>{d}</option>))}</select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Team Size</label>
              <select value={teamSizeFilter} onChange={(e) => setTeamSizeFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueTeamSizes.map((s: any) => (<option key={s}>{s}</option>))}</select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Attendance</label>
              <select value={attendanceFilter} onChange={(e) => setAttendanceFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option><option>Present</option><option>Absent</option></select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
              <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueVenues.map((v: any) => (<option key={v}>{v}</option>))}</select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">SPOC</label>
              <select value={spocFilter} onChange={(e) => setSpocFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueSpocs.map((s: any) => (<option key={s}>{s}</option>))}</select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">PPT Status</label>
              <select value={pptStatusFilter} onChange={(e) => setPptStatusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option><option>Uploaded</option><option>Not Uploaded</option></select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Team / Lead / PS Code" className="hh-input w-full border-2 border-gitam-200" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-4 mb-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
              <div className="w-full lg:max-w-[380px]">
              <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Bulk Extend Deadline (selected teams)</label>
              <input
                type="datetime-local"
                value={bulkDeadlineInput}
                onChange={(e) => setBulkDeadlineInput(e.target.value)}
                disabled={selectedTeamsCount === 0}
                className="hh-input w-full border-2 border-gitam-200 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={applyBulkExtendTeams} disabled={!bulkDeadlineInput || selectedTeamsCount === 0} className="hh-btn px-4 py-2 whitespace-nowrap disabled:opacity-50">Apply Bulk Save</button>
                <button onClick={clearBulkSelection} className="hh-btn-outline px-4 py-2 whitespace-nowrap border-2">Clear</button>
                <button onClick={exportTeamsCsv} className="hh-btn-outline px-4 py-2 whitespace-nowrap border-2">Export CSV</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gitam-700/75">
              <div>Selected: {selectedTeamsCount} team(s)</div>
              <div>Select teams and choose a deadline, then apply. After saving, selection and date reset.</div>
            </div>
          </div>
        </div>

        <div className="mb-2 text-sm font-semibold text-gitam-700">Showing {filteredTeams.length} teams</div>

        <div className="overflow-x-auto rounded-lg border-2 border-gitam-300 bg-white">
          <table className="w-full text-sm border-collapse table-auto">
            <thead>
              <tr className="bg-gitam-100 border-b-2 border-gitam-300 text-left">
                <th className="p-3 border-r border-gitam-200">
                  <input
                    type="checkbox"
                    checked={allMatchingSelected}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      const next: Record<string, boolean> = {};
                      if (checked) {
                        filteredTeams.forEach((t: any) => {
                          const campus = String(t.members?.[0]?.campus || '');
                          const teamId = String(t.teamId || t.id || '');
                          const rowKey = teamId ? keyFor(teamId, campus) : `${String(t.teamName || '')}::${campus}`;
                          next[rowKey] = true;
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
                <th className="p-3 border-r border-gitam-200">PPT Status</th>
                <th className="p-3 border-r border-gitam-200">PPT Link</th>
                <th className="p-3 border-r border-gitam-200">Admin Upload</th>
                <th className="p-3 border-r border-gitam-200">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((t: any, idx: number) => {
                const campus = String(t.members?.[0]?.campus || '');
                const teamId = String(t.teamId || t.id || '');
                const rowKey = teamId ? keyFor(teamId, campus) : `${String(t.teamName || '')}::${campus}`;
                const localKey = localKeyFor(String(t.teamName || ''), campus);

                const rawLocal = (() => {
                  try {
                    const r = localStorage.getItem(localKey);
                    if (r) return JSON.parse(r);
                  } catch {
                    // ignore
                  }
                  return null;
                })();
                const rawBackend = (isSupabaseConfigured() && teamId) ? backendUploads[keyFor(teamId, campus)] : null;
                const hasPpt = isSupabaseConfigured() && teamId ? Boolean(rawBackend) : Boolean(rawLocal?.file);
                const selectedAdminFile = adminSelectedFiles[rowKey] || null;
                const isUploading = Boolean(adminUploadingRows[rowKey]);

                const handleAdminUpload = async () => {
                  if (!selectedAdminFile) return;
                  if (selectedAdminFile.type !== 'application/pdf') {
                    alert('Only PDF format is accepted for PPT submissions.');
                    return;
                  }
                  if (typeof selectedAdminFile.size === 'number' && selectedAdminFile.size > MAX_PPT_BYTES) {
                    alert(`Max PPT size is ${Math.round(MAX_PPT_BYTES / (1024 * 1024))} MB.`);
                    return;
                  }

                  setAdminUploadingRows((prev) => ({ ...prev, [rowKey]: true }));

                  try {
                    if (isSupabaseConfigured() && teamId) {
                      await upsertPpt(teamId, campus, selectedAdminFile);
                      await refreshBackendUploads(registered);
                    } else {
                      const reader = new FileReader();
                      await new Promise<void>((resolve, reject) => {
                        reader.onload = () => {
                          try {
                            const payload = { name: selectedAdminFile.name, data: String(reader.result || '') };
                            const at = Date.now();
                            localStorage.setItem(localKey, JSON.stringify({ file: payload, uploadedAt: at, teamName: t.teamName, campus }));
                            resolve();
                          } catch (e) {
                            reject(e);
                          }
                        };
                        reader.onerror = () => reject(new Error('read failed'));
                        reader.readAsDataURL(selectedAdminFile);
                      });
                      reload();
                    }

                    setAdminSelectedFiles((prev) => ({ ...prev, [rowKey]: null }));
                    alert('PPT uploaded successfully.');
                  } catch {
                    alert('Failed to upload PPT.');
                  } finally {
                    setAdminUploadingRows((prev) => ({ ...prev, [rowKey]: false }));
                  }
                };

                return (
                  <tr key={idx} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100">
                    <td className="p-3 border-r border-gitam-200">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedTeams[rowKey])}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedTeams((prev) => ({ ...prev, [rowKey]: checked }));
                        }}
                      />
                    </td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{campus || '-'}</td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{normalizeDomain(t.domain) || '-'}</td>
                    <td className="p-3 border-r border-gitam-200"><div className="truncate max-w-[220px]" title={t.teamName || ''}>{t.teamName || '-'}</div></td>
                    <td className="p-3 border-r border-gitam-200"><div className="truncate max-w-[180px]" title={(t.members?.[0]?.name) || ''}>{(t.members?.[0]?.name) || '-'}</div></td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{(t.members || []).length}</td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getTeamAttendance(String(t.teamName || ''))}</td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getVenueForTeam(String(t.teamName || ''))}</td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getSpocForTeam(String(t.teamName || ''))}</td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getTeamSelectedCode(t)}</td>
                    <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{hasPpt ? 'Uploaded' : 'Not Uploaded'}</td>
                    <td className="p-3 border-r border-gitam-200">
                      {isSupabaseConfigured() && teamId ? (
                        rawBackend ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={async () => {
                                const previewTab = window.open('about:blank', '_blank');
                                if (!previewTab) {
                                  alert('Popup blocked. Please allow popups for this site.');
                                  return;
                                }

                                try {
                                  previewTab.document.title = 'Opening PPT...';
                                  previewTab.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 16px;">Loading PPT...</p>';
                                } catch {
                                  // ignore if browser prevents document access
                                }

                                try {
                                  const rec = await getPptBackend(teamId, campus);
                                  if (rec?.url) {
                                    try {
                                      previewTab.location.replace(rec.url);
                                    } catch {
                                      previewTab.location.href = rec.url;
                                    }
                                  } else {
                                    previewTab.close();
                                    alert('Could not open PPT');
                                  }
                                } catch {
                                  previewTab.close();
                                  alert('Could not open PPT');
                                }
                              }}
                              className="hh-btn px-2 py-1 text-xs"
                            >
                              Open
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-gitam-700/60">-</span>
                        )
                      ) : (
                        rawLocal?.file ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const previewTab = window.open('about:blank', '_blank');
                                if (!previewTab) {
                                  alert('Popup blocked. Please allow popups for this site.');
                                  return;
                                }

                                const blob = dataUrlToBlob(String(rawLocal.file.data || ''));
                                if (!blob) {
                                  previewTab.close();
                                  alert('Could not open PPT');
                                  return;
                                }

                                const blobUrl = URL.createObjectURL(blob);
                                try {
                                  previewTab.location.replace(blobUrl);
                                } catch {
                                  previewTab.location.href = blobUrl;
                                }

                                setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
                              }}
                              className="hh-btn px-2 py-1 text-xs"
                            >
                              Open
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm text-gitam-700/60">-</span>
                        )
                      )}
                    </td>
                    <td className="p-3 border-r border-gitam-200">
                      <div className="flex flex-col gap-2">
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setAdminSelectedFiles((prev) => ({ ...prev, [rowKey]: f }));
                          }}
                          className="text-xs"
                        />
                        <button
                          onClick={handleAdminUpload}
                          disabled={!selectedAdminFile || isUploading}
                          className="hh-btn px-2 py-1 text-xs disabled:opacity-50"
                        >
                          {isUploading ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                    </td>
                    <td className="p-3 border-r border-gitam-200">
                      <button
                        disabled={isSupabaseConfigured() && teamId ? !rawBackend : !rawLocal?.file}
                        onClick={async () => {
                          try {
                            if (isSupabaseConfigured() && teamId) {
                              await deletePptBackend(teamId, campus);
                              alert('PPT deleted');
                              await refreshBackendUploads(registered);
                              return;
                            }
                            localStorage.removeItem(localKey);
                            alert('PPT deleted');
                            reload();
                          } catch {
                            alert('Failed');
                          }
                        }}
                        className="hh-btn-outline px-2 py-1 text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

