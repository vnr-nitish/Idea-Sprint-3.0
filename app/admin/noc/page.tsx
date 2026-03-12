'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteNoc as deleteNocBackend,
  getNoc as getNocBackend,
  getNocDeadline,
  listNocUploadsForTeams,
  MAX_NOC_BYTES,
  setNocDeadline,
  subscribeAdminNocChanges,
  upsertNoc,
} from '@/lib/nocBackend';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';

export default function AdminNOCPage(){
  const router = useRouter();
  const [registered, setRegistered] = useState<any[]>([]);
  const [tab, setTab] = useState<'teams'|'individuals'>('teams');
  const [campusFilter, setCampusFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [teamSizeFilter, setTeamSizeFilter] = useState('All');
  const [attendanceFilter, setAttendanceFilter] = useState('All');
  const [zoneFilter, setZoneFilter] = useState('All');
  const [spocFilter, setSpocFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [fileStatusFilter, setFileStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [selectedTeams, setSelectedTeams] = useState<Record<string, boolean>>({});
  const [bulkTeamDeadlineInput, setBulkTeamDeadlineInput] = useState('');
  const [selectedIndividuals, setSelectedIndividuals] = useState<Record<string, boolean>>({});
  const [bulkDeadlineInput, setBulkDeadlineInput] = useState('');

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

  const [selectedTeam, setSelectedTeam] = useState<any|null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string|null>(null);
  const [individualView, setIndividualView] = useState<any|null>(null);
  const [editingDeadlineForMember, setEditingDeadlineForMember] = useState<string|null>(null);
  const [deadlineInputValue, setDeadlineInputValue] = useState<string>('');

  const [backendUploads, setBackendUploads] = useState<Record<string, { fileName: string; filePath: string; uploadedAt: string }>>({});
  const [backendCounts, setBackendCounts] = useState<Record<string, number>>({});
  const [adminSelectedFiles, setAdminSelectedFiles] = useState<Record<string, File | null>>({});
  const [adminUploadingRows, setAdminUploadingRows] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const navbar = document.querySelector('nav');
    if (navbar) (navbar as HTMLElement).style.display = 'none';
    return () => {
      const navbar = document.querySelector('nav');
      if (navbar) (navbar as HTMLElement).style.display = '';
    };
  }, []);

  useEffect(()=>{
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
      try{ const r = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); setRegistered(r); }catch(e){ setRegistered([]); }
    })();
  },[]);

  useEffect(() => {
    const poll = setInterval(() => {
      if (Object.values(adminUploadingRows).some(Boolean)) return;
      reloadRegistered();
      try {
        const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
        setAssignments(map || {});
      } catch {
        setAssignments({});
      }
      if (isSupabaseConfigured()) {
        void refreshBackendUploads();
      }
    }, 3000);

    return () => clearInterval(poll);
  }, [adminUploadingRows, registered]);

  useEffect(() => {
    try {
      const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
      setAssignments(map || {});
    } catch {
      setAssignments({});
    }

  }, []);

  const memberKey = (teamName: string, memberId: string) => `${teamName}::${memberId}`;

  const getMemberId = (m: any): string => String(m?.id || m?.memberId || m?.registrationNumber || m?.email || m?.name || '');

  const refreshBackendUploads = async () => {
    if (!isSupabaseConfigured()) return;
    const teamNames = Array.from(new Set(registered.map((t:any)=>String(t.teamName||'')).filter(Boolean)));
    if (!teamNames.length) {
      setBackendUploads({});
      setBackendCounts({});
      return;
    }

    const rows = await listNocUploadsForTeams(teamNames);
    const map: Record<string, { fileName: string; filePath: string; uploadedAt: string }> = {};
    const counts: Record<string, number> = {};
    rows.forEach((r) => {
      map[memberKey(r.teamName, r.memberId)] = { fileName: r.fileName, filePath: r.filePath, uploadedAt: r.uploadedAt };
      counts[r.teamName] = (counts[r.teamName] || 0) + 1;
    });
    setBackendUploads(map);
    setBackendCounts(counts);
  };

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    refreshBackendUploads();
    const unsub = subscribeAdminNocChanges(() => {
      refreshBackendUploads();
      // If admin is viewing a member, refresh that member's signed URL too.
      if (selectedTeam && selectedMemberId) {
        (async () => {
          try {
            const rec = await getNocBackend(selectedTeam.teamName, String(selectedMemberId));
            if (rec) {
              setIndividualView((prev:any) => {
                if (!prev?.member) return prev;
                return { ...prev, file: { file: { name: rec.fileName, data: rec.url }, uploadedAt: Date.parse(rec.uploadedAt) } };
              });
            } else {
              setIndividualView((prev:any) => (prev ? { ...prev, file: null } : prev));
            }
          } catch (e) {
            // ignore
          }
        })();
      }
    });
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registered, selectedTeam?.teamName, selectedMemberId]);

  const reloadRegistered = () => {
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
      try{ const r = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); setRegistered(r); }catch(e){ setRegistered([]); }
    })();
  };

  const getZoneForTeam = (teamName: string) => {
    return assignments[teamName]?.venue || '-';
  };

  const getSpocForTeam = (teamName: string) => {
    return String(assignments[teamName]?.spoc?.name || '-');
  };

  const getTeamAttendance = (teamName: string): string => {
    try {
      const saved = localStorage.getItem(`team_attendance_${teamName}`) || '';
      return saved === 'Present' || saved === 'Absent' ? saved : '-';
    } catch {
      return '-';
    }
  };

  const teamRowKey = (team: any) => `${String(team?.teamName || '')}::${String((team?.members || [])[0]?.campus || '')}`;

  const uniqueCampuses = useMemo(()=> Array.from(new Set(registered.flatMap(t => (t.members||[]).map((m:any)=>m.campus)).filter(Boolean))), [registered]);
  const uniqueDomains = DOMAIN_OPTIONS;
  const uniqueTeamSizes = ['3', '4'];
  const uniqueZones = useMemo(() => {
    return Array.from(new Set(Object.values(assignments).map((a:any) => a?.venue).filter(Boolean)));
  }, [assignments]);
  const uniqueSpocs = useMemo(() => {
    return Array.from(new Set(Object.values(assignments).map((a:any) => a?.spoc?.name).filter(Boolean)));
  }, [assignments]);

  const makeKey = (teamName:string, memberId?:string) => `noc_${encodeURIComponent(teamName)}${memberId ? `_${encodeURIComponent(String(memberId))}` : ''}`;

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

  const openPreviewTab = (url: string) => {
    const previewTab = window.open('about:blank', '_blank');
    if (!previewTab) {
      alert('Popup blocked. Please allow popups for this site.');
      return;
    }
    try {
      previewTab.location.replace(url);
    } catch {
      previewTab.location.href = url;
    }
  };

  const readNocForTeam = (team:any) => {
    if(!team) return null;
    try{
      const keyPlain = `noc_${team.teamName}`;
      const keyEnc = makeKey(team.teamName);
      const raw = localStorage.getItem(keyEnc) || localStorage.getItem(keyPlain) || null;
      if(raw){ try{ return JSON.parse(raw); }catch(e){ return raw; } }
    }catch(e){}
    return null;
  };

  const readNocForMember = (team:any, memberId:string) => {
    if(!team || !memberId) return null;
    if (isSupabaseConfigured()) {
      // sync read is not possible for backend; callers should use backendUploads + getNocBackend for selected member.
      const k = memberKey(team.teamName, String(memberId));
      return backendUploads[k] ? { file: { name: backendUploads[k].fileName, data: '' }, uploadedAt: backendUploads[k].uploadedAt } : null;
    }
    try{
      const keyEnc = makeKey(team.teamName, memberId);
      const keyPlain = `noc_${team.teamName}_${memberId}`;
      const raw = localStorage.getItem(keyEnc) || localStorage.getItem(keyPlain) || null;
      if(raw){ return JSON.parse(raw); }
      // fallback to team-level file
      const teamRaw = readNocForTeam(team);
      if(teamRaw && typeof teamRaw === 'object' && teamRaw.file) return teamRaw;
    }catch(e){}
    return null;
  };

  const countUploadsForTeam = (team:any) => {
    if(!team || !Array.isArray(team.members)) return 0;
    if (isSupabaseConfigured()) {
      return backendCounts[String(team.teamName)] || 0;
    }
    let count = 0;
    team.members.forEach((m:any)=>{
      const id = getMemberId(m);
      if(id){ const f = readNocForMember(team, id); if(f) count++; }
    });
    return count;
  };

  const openTeam = (team:any) => {
    setSelectedTeam(team);
    setSelectedMemberId(null);
    setIndividualView(null);
    // default select first member and load their file
    const first = (team.members||[])[0];
    if(first){
      const id = getMemberId(first);
      setSelectedMemberId(id);
      if (isSupabaseConfigured()) {
        (async () => {
          try {
            const rec = await getNocBackend(team.teamName, String(id));
            const fileObj = rec ? { file: { name: rec.fileName, data: rec.url }, uploadedAt: Date.parse(rec.uploadedAt) } : null;
            setIndividualView({ member: first, file: fileObj });
          } catch (e) {
            setIndividualView({ member: first, file: null });
          }
        })();
      } else {
        const fileObj = readNocForMember(team, id);
        setIndividualView({ member: first, file: fileObj });
      }
    }
  };

  const openMember = (member:any) => {
    const id = getMemberId(member);
    setSelectedMemberId(id);
    const team = selectedTeam || registered.find(r=>r.teamName===member.teamName);
    if (isSupabaseConfigured() && team) {
      (async () => {
        try {
          const rec = await getNocBackend(team.teamName, String(id));
          const fileObj = rec ? { file: { name: rec.fileName, data: rec.url }, uploadedAt: Date.parse(rec.uploadedAt) } : null;
          setIndividualView({ member, file: fileObj });

          try {
            const deadlineIso = await getNocDeadline(team.teamName, String(id));
            if (deadlineIso) setDeadlineInputValue(new Date(deadlineIso).toISOString().slice(0, 16));
          } catch {
            // ignore
          }
        } catch (e) {
          setIndividualView({ member, file: null });
        }
      })();
      return;
    }

    const fileObj = readNocForMember(team, id);
    setIndividualView({ member, file: fileObj });
  };

  // Flatten individuals
  const individuals = useMemo(
    () =>
      registered.flatMap((t) =>
        (t.members || []).map((m: any) => ({
          ...m,
          teamName: t.teamName,
          domain: t.domain,
          campus: m.campus || (t.members || [])[0]?.campus,
        }))
      ),
    [registered]
  );

  const filteredTeams = useMemo(() => {
    return registered.filter((t:any)=>{
      const camp = (t.members||[])[0]?.campus||'';
      const size = (t.members||[]).length;
      const attendance = getTeamAttendance(String(t.teamName || ''));
      const venue = getZoneForTeam(String(t.teamName || ''));
      const spoc = getSpocForTeam(String(t.teamName || ''));
      const uploads = countUploadsForTeam(t);
      const status = uploads >= size ? 'Completed' : 'Incomplete';
      if(campusFilter!=='All' && camp!==campusFilter) return false;
      if(domainFilter!=='All' && normalizeDomain(t.domain)!==domainFilter) return false;
      if(teamSizeFilter!=='All' && String(size)!==teamSizeFilter) return false;
      if(attendanceFilter!=='All' && attendance!==attendanceFilter) return false;
      if(zoneFilter!=='All' && venue!==zoneFilter) return false;
      if(spocFilter!=='All' && spoc!==spocFilter) return false;
      if(statusFilter!=='All' && status!==statusFilter) return false;
      if(search.trim()){
        const q=search.toLowerCase();
        if(!String(t.teamName||'').toLowerCase().includes(q) && !String((t.members||[])[0]?.name||'').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [registered, campusFilter, domainFilter, teamSizeFilter, attendanceFilter, zoneFilter, spocFilter, statusFilter, search, assignments, backendCounts]);

  const selectedTeamsCount = useMemo(() => Object.values(selectedTeams).filter(Boolean).length, [selectedTeams]);
  const allMatchingTeamsSelected = useMemo(() => {
    if (filteredTeams.length === 0) return false;
    return filteredTeams.every((t:any) => !!selectedTeams[teamRowKey(t)]);
  }, [filteredTeams, selectedTeams]);

  useEffect(() => {
    const allowed = new Set(filteredTeams.map((t:any) => teamRowKey(t)));
    setSelectedTeams((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([k, v]) => {
        if (v && allowed.has(k)) next[k] = true;
      });
      return next;
    });
  }, [filteredTeams]);

  const filteredIndividuals = useMemo(() => {
    return individuals.filter((m:any)=>{
      const attendance = getTeamAttendance(String(m.teamName || ''));
      const spoc = getSpocForTeam(String(m.teamName || ''));
      const hasFile = Boolean(
        isSupabaseConfigured()
          ? backendUploads[memberKey(String(m.teamName || ''), String(getMemberId(m)))]
          : readNocForMember({ teamName: m.teamName, members: [{ campus: m.campus }] }, String(getMemberId(m)))?.file
      );
      if(campusFilter!=='All' && m.campus!==campusFilter) return false;
      if(domainFilter!=='All' && normalizeDomain(m.domain)!==domainFilter) return false;
      if(attendanceFilter!=='All' && attendance!==attendanceFilter) return false;
      if(zoneFilter!=='All' && getZoneForTeam(String(m.teamName || ''))!==zoneFilter) return false;
      if(spocFilter!=='All' && spoc!==spocFilter) return false;
      if(fileStatusFilter==='Uploaded' && !hasFile) return false;
      if(fileStatusFilter==='Not Uploaded' && hasFile) return false;
      if(search.trim()){
        const q=search.toLowerCase();
        const name = String(m.name||'').toLowerCase();
        const teamName = String(m.teamName||'').toLowerCase();
        const reg = String(m.registrationNumber||'').toLowerCase();
        const email = String(m.email||'').toLowerCase();
        const mobile = String(m.phoneNumber||'').toLowerCase();
        const mobileAlt = String((m as any).phone||'').toLowerCase();
        if(!name.includes(q) && !teamName.includes(q) && !reg.includes(q) && !email.includes(q) && !mobile.includes(q) && !mobileAlt.includes(q)) return false;
      }
      return true;
    });
  }, [individuals, campusFilter, domainFilter, attendanceFilter, zoneFilter, spocFilter, fileStatusFilter, search, assignments, backendUploads]);

  const selectedIndividualsCount = useMemo(() => Object.values(selectedIndividuals).filter(Boolean).length, [selectedIndividuals]);

  const applyBulkExtendTeams = async () => {
    if (!bulkTeamDeadlineInput || selectedTeamsCount === 0) return;
    const iso = new Date(bulkTeamDeadlineInput).toISOString();
    const targets = filteredTeams.filter((t:any) => selectedTeams[teamRowKey(t)]);
    try {
      for (const t of targets) {
        const members = Array.isArray(t.members) ? t.members : [];
        for (const m of members) {
          const memberId = String(getMemberId(m));
          if (!memberId) continue;
          if (isSupabaseConfigured()) {
            await setNocDeadline(String(t.teamName || ''), memberId, iso);
          } else {
            const deadlineKey = `noc_deadline_${encodeURIComponent(String(t.teamName || ''))}_${encodeURIComponent(memberId)}`;
            localStorage.setItem(deadlineKey, iso);
          }
        }
      }
      setSelectedTeams({});
      setBulkTeamDeadlineInput('');
      alert('Bulk extension applied');
    } catch {
      alert('Bulk extension failed');
    }
  };

  const applyBulkExtendIndividuals = async () => {
    if (!bulkDeadlineInput || selectedIndividualsCount === 0) return;
    const iso = new Date(bulkDeadlineInput).toISOString();
    const selectedRows = filteredIndividuals.filter((m:any) => selectedIndividuals[`${m.teamName}::${getMemberId(m)}`]);
    try {
      for (const m of selectedRows) {
        const memberId = String(getMemberId(m));
        if (isSupabaseConfigured()) {
          await setNocDeadline(m.teamName, memberId, iso);
        } else {
          const deadlineKey = `noc_deadline_${encodeURIComponent(m.teamName)}_${encodeURIComponent(memberId)}`;
          localStorage.setItem(deadlineKey, iso);
        }
      }
      setSelectedIndividuals({});
      setBulkDeadlineInput('');
      alert('Bulk extension applied');
    } catch {
      alert('Bulk extension failed');
    }
  };

  const toCsvCell = (value: any) => {
    const str = String(value ?? '');
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };

  const exportTeamsCsv = () => {
    if (!filteredTeams.length) {
      alert('No team rows to export.');
      return;
    }

    const headers = ['Campus', 'Domain', 'Team Name', 'Team Lead', 'Team Size', 'Attendance', 'Venue', 'SPOC', 'No. of Uploads', 'Status'];
    const rows = filteredTeams.map((t: any) => {
      const uploads = countUploadsForTeam(t);
      const size = (t.members || []).length;
      const teamName = String(t.teamName || '-');
      const lead = String((t.members || [])[0]?.name || '-');
      const campus = String((t.members || [])[0]?.campus || '-');
      const domain = String(normalizeDomain(t.domain) || '-');
      const teamSize = String(size);
      const attendance = String(getTeamAttendance(teamName) || '-');
      const venue = String(getZoneForTeam(teamName) || '-');
      const spoc = String(getSpocForTeam(teamName) || '-');
      const uploadedCount = String(uploads);
      const status = uploads >= size ? 'Completed' : 'Incomplete';
      return [campus, domain, teamName, lead, teamSize, attendance, venue, spoc, uploadedCount, status].map(toCsvCell).join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `noc-teams-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportIndividualsCsv = async () => {
    if (!filteredIndividuals.length) {
      alert('No individual rows to export.');
      return;
    }

    const headers = ['Campus', 'Team Name', 'Name', 'Reg No', 'Email', 'Phone', 'Zone', 'File Uploaded', 'Deadline'];

    const rows = await Promise.all(filteredIndividuals.map(async (m: any) => {
      const memberId = String(getMemberId(m));
      const fileKey = `noc_${encodeURIComponent(m.teamName)}_${encodeURIComponent(memberId)}`;
      const backendMeta = isSupabaseConfigured() ? backendUploads[memberKey(m.teamName, memberId)] : null;
      const fileData = isSupabaseConfigured()
        ? (backendMeta ? { file: { name: backendMeta.fileName } } : null)
        : (() => {
            try {
              const raw = localStorage.getItem(fileKey);
              if (raw) return JSON.parse(raw);
            } catch {
              // ignore
            }
            return null;
          })();

      let deadline = '-';
      try {
        if (isSupabaseConfigured()) {
          const d = await getNocDeadline(m.teamName, memberId);
          deadline = d ? new Date(d).toLocaleString() : '-';
        } else {
          const key = `noc_deadline_${encodeURIComponent(m.teamName)}_${encodeURIComponent(memberId)}`;
          const d = localStorage.getItem(key);
          deadline = d ? new Date(d).toLocaleString() : '-';
        }
      } catch {
        deadline = '-';
      }

      const fileUploaded = fileData?.file ? 'Yes' : 'No';
      return [
        String(m.campus || '-'),
        String(m.teamName || '-'),
        String(m.name || '-'),
        String(m.registrationNumber || '-'),
        String(m.email || '-'),
        String(m.phoneNumber || (m as any).phone || '-'),
        String(getZoneForTeam(String(m.teamName || '')) || '-'),
        fileUploaded,
        deadline,
      ].map(toCsvCell).join(',');
    }));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `noc-individuals-${new Date().toISOString().slice(0, 10)}.csv`;
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
            <h1 className="text-3xl font-bold text-gitam-700">NOC - Admin</h1>
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
            <button onClick={()=>setTab('teams')} className={`px-6 py-2 rounded-lg font-semibold transition ${tab==='teams' ? 'bg-gitam-700 text-antique shadow':'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}>Teams</button>
            <button onClick={()=>setTab('individuals')} className={`px-6 py-2 rounded-lg font-semibold transition ${tab==='individuals' ? 'bg-gitam-700 text-antique shadow':'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}>Individuals</button>
          </div>
        </div>

        {tab==='teams' && (
          <>
          <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6">
            <div className="mb-4 p-4 rounded-lg border-2 border-gitam-200 bg-antique/60">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                  <div className="w-full lg:max-w-[420px]">
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Bulk Extend Deadline (selected teams)</label>
                  <input type="datetime-local" value={bulkTeamDeadlineInput} onChange={(e)=>setBulkTeamDeadlineInput(e.target.value)} disabled={selectedTeamsCount===0} className="hh-input w-full border-2 border-gitam-200 disabled:opacity-60" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={applyBulkExtendTeams} disabled={selectedTeamsCount===0 || !bulkTeamDeadlineInput} className="hh-btn px-4 py-2 whitespace-nowrap disabled:opacity-50">Apply Bulk Extend</button>
                    <button onClick={()=>{ setSelectedTeams({}); setBulkTeamDeadlineInput(''); }} className="hh-btn-outline px-4 py-2 whitespace-nowrap border-2">Clear</button>
                    <button onClick={exportTeamsCsv} className="hh-btn-outline px-4 py-2 whitespace-nowrap border-2">Export CSV</button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gitam-700/75">
                  <div>Selected: {selectedTeamsCount} team(s)</div>
                  <div>Use row checkboxes to select teams, then apply the deadline in one go.</div>
                </div>
              </div>
            </div>

            <div className="mb-6 pb-6 border-b-2 border-gitam-300">
              <div className="grid grid-cols-1 lg:grid-cols-8 gap-3 items-end">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
                  <select value={campusFilter} onChange={(e)=>setCampusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueCampuses.map((c:any)=>(<option key={c}>{c}</option>))}</select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain</label>
                  <select value={domainFilter} onChange={(e)=>setDomainFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueDomains.map((d:any)=>(<option key={d}>{d}</option>))}</select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Team Size</label>
                  <select value={teamSizeFilter} onChange={(e)=>setTeamSizeFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueTeamSizes.map((s:any)=>(<option key={s}>{s}</option>))}</select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Attendance</label>
                  <select value={attendanceFilter} onChange={(e)=>setAttendanceFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option><option>Present</option><option>Absent</option></select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
                  <select value={zoneFilter} onChange={(e)=>setZoneFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueZones.map((z:any)=>(<option key={z}>{z}</option>))}</select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">SPOC</label>
                  <select value={spocFilter} onChange={(e)=>setSpocFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueSpocs.map((s:any)=>(<option key={s}>{s}</option>))}</select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Status</label>
                  <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option><option>Completed</option><option>Incomplete</option></select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
                  <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Team name / lead" className="hh-input w-full border-2 border-gitam-200" />
                </div>
              </div>
            </div>

              <div className="mb-2 text-sm font-semibold text-gitam-700">Showing {filteredTeams.length} teams</div>

              <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
                <table className="w-full text-sm border-collapse min-w-[1100px]">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300 text-left">
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">
                      <input
                        type="checkbox"
                        checked={allMatchingTeamsSelected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next: Record<string, boolean> = {};
                          if (checked) {
                            filteredTeams.forEach((t:any) => { next[teamRowKey(t)] = true; });
                          }
                          setSelectedTeams(next);
                        }}
                      />
                    </th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Campus</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Domain</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Team Lead</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Team Size</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Attendance</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Venue</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">SPOC</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">No. of Uploads</th>
                    <th className="p-3 font-semibold text-gitam-700 border-r border-gitam-200">Status</th>
                    <th className="p-3 font-semibold text-gitam-700">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((t:any,i:number)=> (
                    <tr key={i} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100">
                      <td className="p-3 border-r border-gitam-200">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedTeams[teamRowKey(t)])}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSelectedTeams((prev) => ({ ...prev, [teamRowKey(t)]: checked }));
                          }}
                        />
                      </td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{(t.members||[])[0]?.campus||'-'}</td>
                      <td className="p-3 border-r border-gitam-200"><div className="truncate" title={normalizeDomain(t.domain)||''}>{normalizeDomain(t.domain)||'-'}</div></td>
                      <td className="p-3 border-r border-gitam-200"><div className="truncate" title={t.teamName}>{t.teamName}</div></td>
                      <td className="p-3 border-r border-gitam-200"><div className="truncate" title={(t.members||[])[0]?.name || ''}>{(t.members||[])[0]?.name || '-'}</div></td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{(t.members||[]).length}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getTeamAttendance(String(t.teamName || ''))}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getZoneForTeam(String(t.teamName || ''))}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getSpocForTeam(String(t.teamName || ''))}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{countUploadsForTeam(t)}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{countUploadsForTeam(t) >= (t.members||[]).length ? 'Completed' : 'Incomplete'}</td>
                      <td className="p-3"><button onClick={()=>openTeam(t)} className="hh-btn px-3 py-1">Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {/* render selected team as a modal popup */}
            {selectedTeam && (
              <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 z-40">
                <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border-2 border-gitam-300 p-5 md:p-6 max-h-[92vh] overflow-hidden">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-lg text-gitam-700">{selectedTeam.teamName} — Members</h3>
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedTeam(null); setSelectedMemberId(null); setIndividualView(null); }} className="hh-btn-ghost px-3 py-1">Close</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 max-h-[76vh] overflow-hidden">
                    <div className="col-span-1">
                      <div className="space-y-3 max-h-[76vh] overflow-y-auto pr-1">
                        {(selectedTeam.members||[]).map((m:any,idx:number)=> {
                          const id = getMemberId(m);
                          const hasFile = (() => { try{ return !!readNocForMember(selectedTeam, String(id))?.file; }catch(e){ return false; } })();
                          return (
                            <div key={idx} className={`p-3 border-2 rounded-lg cursor-pointer ${selectedMemberId === id ? 'border-gitam-500 bg-gitam-50':'border-gitam-200 hover:border-gitam-300'}`} onClick={()=>{ openMember(m); setSelectedMemberId(String(id)); }}>
                              <div className="font-semibold truncate" title={m.name || ''}>Member {idx+1}: {m.name}</div>
                              <div className="text-sm text-gitam-700/75 truncate">Reg: {m.registrationNumber||'-'}</div>
                              <div className={`text-xs mt-1 ${hasFile ? 'text-gitam-700' : 'text-gitam-700/60'}`}>{hasFile ? 'NOC uploaded' : 'No upload yet'}</div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const team = selectedTeam;
                                    if (!team) return;
                                    (async () => {
                                      try{
                                        if (isSupabaseConfigured()) {
                                          await deleteNocBackend(team.teamName, String(id));
                                          setBackendUploads((prev) => {
                                            const next = { ...prev };
                                            delete next[memberKey(team.teamName, String(id))];
                                            return next;
                                          });
                                          setBackendCounts((prev) => ({
                                            ...prev,
                                            [team.teamName]: Math.max(0, (prev[team.teamName] || 0) - 1),
                                          }));
                                        } else {
                                          const keyEnc = `noc_${encodeURIComponent(team.teamName)}_${encodeURIComponent(String(id))}`;
                                          const keyPlain = `noc_${team.teamName}_${String(id)}`;
                                          localStorage.removeItem(keyEnc);
                                          localStorage.removeItem(keyPlain);
                                        }

                                        if (String(selectedMemberId) === String(id)) {
                                          setIndividualView((prev:any) => (prev ? { ...prev, file: null } : prev));
                                        }
                                        reloadRegistered();
                                        alert('Deleted');
                                      }catch(err){
                                        alert('Delete failed');
                                      }
                                    })();
                                  }}
                                  disabled={!hasFile}
                                  className="hh-btn-outline px-2 py-1 text-xs disabled:opacity-50"
                                >
                                  Delete
                                </button>

                                {editingDeadlineForMember === String(id) ? (
                                  <div className="flex items-center gap-2" onClick={(e)=>e.stopPropagation()}>
                                    <input
                                      type="datetime-local"
                                      value={deadlineInputValue}
                                      onChange={(e)=>setDeadlineInputValue(e.target.value)}
                                      className="px-3 py-2 rounded-lg border-2 border-gitam-200 bg-white text-gitam-700 focus:outline-none focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition text-xs"
                                    />
                                    <button
                                      disabled={!deadlineInputValue}
                                      onClick={() => {
                                        const team = selectedTeam;
                                        if (!team) return;
                                        (async () => {
                                          try{
                                            if (deadlineInputValue) {
                                              const iso = new Date(deadlineInputValue).toISOString();
                                              if (isSupabaseConfigured()) {
                                                await setNocDeadline(team.teamName, String(id), iso);
                                              } else {
                                                const deadlineKey = `noc_deadline_${encodeURIComponent(team.teamName)}_${encodeURIComponent(String(id))}`;
                                                localStorage.setItem(deadlineKey, iso);
                                              }
                                            }
                                            setEditingDeadlineForMember(null);
                                            setDeadlineInputValue('');
                                            alert('Deadline updated');
                                          }catch(err){
                                            alert('Failed');
                                          }
                                        })();
                                      }}
                                      className="hh-btn px-3 py-1 text-xs disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => { setEditingDeadlineForMember(null); setDeadlineInputValue(''); }}
                                      className="hh-btn-ghost px-2 py-1 text-xs"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const team = selectedTeam;
                                      if (!team) return;
                                      setEditingDeadlineForMember(String(id));
                                      (async () => {
                                        try {
                                          if (isSupabaseConfigured()) {
                                            const exist = await getNocDeadline(team.teamName, String(id));
                                            setDeadlineInputValue(exist ? (new Date(exist)).toISOString().slice(0, 16) : '');
                                            return;
                                          }
                                          const key = `noc_deadline_${encodeURIComponent(team.teamName)}_${encodeURIComponent(String(id))}`;
                                          const exist = localStorage.getItem(key);
                                          setDeadlineInputValue(exist ? (new Date(exist)).toISOString().slice(0,16) : '');
                                        } catch {
                                          setDeadlineInputValue('');
                                        }
                                      })();
                                    }}
                                    className="hh-btn-outline px-3 py-1 text-xs border-2"
                                  >
                                    Extend
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="col-span-2 max-h-[76vh] overflow-y-auto pr-1">
                      {individualView ? (
                        <div className="rounded-xl border-2 border-gitam-200 p-4 bg-antique/50">
                          <h4 className="font-semibold mb-2">{individualView.member.name} — Details</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-sm text-gitam-700/75">Email</div>
                              <div className="font-medium">{individualView.member.email||'-'}</div>

                              <div className="text-sm text-gitam-700/75 mt-2">Phone</div>
                              <div className="font-medium">{individualView.member.phoneNumber || individualView.member.phone || '-'}</div>

                              <div className="text-sm text-gitam-700/75 mt-2">Reg No</div>
                              <div className="font-medium">{individualView.member.registrationNumber||'-'}</div>
                            </div>

                            <div>
                              <div className="text-sm text-gitam-700/75">School</div>
                              <div className="font-medium">{individualView.member.school||'-'}</div>

                              <div className="text-sm text-gitam-700/75 mt-2">Program</div>
                              <div className="font-medium">{individualView.member.program||individualView.member.programOther||'-'}</div>

                              <div className="text-sm text-gitam-700/75 mt-2">Campus</div>
                              <div className="font-medium">{individualView.member.campus||'-'}</div>
                            </div>
                          </div>

                          <div className="mt-4 p-3 bg-gitam-50 rounded border border-gitam-100">
                            <div className="text-sm text-gitam-700/75">Uploaded File</div>
                            {individualView.file && individualView.file.file ? (
                              <div className="mt-2">
                                <div className="font-medium">{individualView.file.file.name}</div>
                                <div className="mt-2 flex gap-2">
                                  <a href={individualView.file.file.data} download={individualView.file.file.name} className="hh-btn-outline px-3 py-1 inline-block">View / Download</a>
                                  <button onClick={() => {
                                    const team = selectedTeam;
                                    if (!team) return;
                                    const id = individualView.member.registrationNumber || individualView.member.email || individualView.member.name;
                                    (async () => {
                                      try{
                                        if (isSupabaseConfigured()) {
                                          await deleteNocBackend(team.teamName, String(id));
                                          setBackendUploads((prev) => {
                                            const next = { ...prev };
                                            delete next[memberKey(team.teamName, String(id))];
                                            return next;
                                          });
                                          setBackendCounts((prev) => ({
                                            ...prev,
                                            [team.teamName]: Math.max(0, (prev[team.teamName] || 0) - 1),
                                          }));
                                        } else {
                                          const keyEnc = `noc_${encodeURIComponent(team.teamName)}_${encodeURIComponent(String(id))}`;
                                          const keyPlain = `noc_${team.teamName}_${String(id)}`;
                                          localStorage.removeItem(keyEnc);
                                          localStorage.removeItem(keyPlain);
                                        }
                                        setIndividualView({ ...individualView, file: null });
                                        reloadRegistered();
                                        alert('Deleted');
                                      }catch(e){
                                        alert('Delete failed');
                                      }
                                    })();
                                  }} className="hh-btn-outline px-3 py-1">Delete</button>
                                  {editingDeadlineForMember === (individualView.member.registrationNumber || individualView.member.email || individualView.member.name) ? (
                                    <div className="flex items-center gap-2">
                                      <input type="datetime-local" value={deadlineInputValue} onChange={(e)=>setDeadlineInputValue(e.target.value)} className="px-3 py-2 rounded-lg border-2 border-gitam-200 bg-white text-gitam-700 focus:outline-none focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition" />
                                      <button disabled={!deadlineInputValue} onClick={() => {
                                        const team = selectedTeam;
                                        if (!team) return;
                                        const id = individualView.member.registrationNumber || individualView.member.email || individualView.member.name;
                                        (async () => {
                                          try{
                                            if (deadlineInputValue) {
                                              const iso = new Date(deadlineInputValue).toISOString();
                                              if (isSupabaseConfigured()) {
                                                await setNocDeadline(team.teamName, String(id), iso);
                                              } else {
                                                const deadlineKey = `noc_deadline_${encodeURIComponent(team.teamName)}_${encodeURIComponent(String(id))}`;
                                                localStorage.setItem(deadlineKey, iso);
                                              }
                                            }
                                            setEditingDeadlineForMember(null);
                                            setDeadlineInputValue('');
                                            alert('Deadline updated');
                                          }catch(e){
                                            alert('Failed');
                                          }
                                        })();
                                      }} className="hh-btn px-3 py-1 disabled:opacity-50" aria-disabled={!deadlineInputValue}>Save</button>
                                      <button onClick={() => { setEditingDeadlineForMember(null); setDeadlineInputValue(''); }} className="hh-btn-ghost px-2 py-1">Cancel</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => {
                                      const team = selectedTeam;
                                      if (!team) return;
                                      const id = individualView.member.registrationNumber || individualView.member.email || individualView.member.name;
                                      setEditingDeadlineForMember(String(id));
                                      (async () => {
                                        try {
                                          if (isSupabaseConfigured()) {
                                            const exist = await getNocDeadline(team.teamName, String(id));
                                            setDeadlineInputValue(exist ? (new Date(exist)).toISOString().slice(0, 16) : '');
                                            return;
                                          }
                                          const key = `noc_deadline_${encodeURIComponent(team.teamName)}_${encodeURIComponent(String(id))}`;
                                          const exist = localStorage.getItem(key);
                                          setDeadlineInputValue(exist ? (new Date(exist)).toISOString().slice(0,16) : '');
                                        } catch {
                                          setDeadlineInputValue('');
                                        }
                                      })();
                                    }} className="hh-btn-outline px-3 py-1">Extend Deadline</button>
                                  )}
                                </div>

                                {/* Inline PDF preview for quick verification */}
                                {!!individualView.file.file.data && (
                                  <div className="mt-3">
                                    <iframe title="NOC Preview" src={individualView.file.file.data} className="w-full h-[60vh] rounded border border-gitam-100 bg-antique" />
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="text-sm text-gitam-700/75 mt-2">No file uploaded</div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gitam-700/75">Select a member on the left to view their NOC and details.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {tab==='individuals' && (
          <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6">
            <div className="mb-4 grid grid-cols-1 lg:grid-cols-7 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
                <select value={campusFilter} onChange={(e)=>setCampusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueCampuses.map((c:any)=>(<option key={c}>{c}</option>))}</select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain</label>
                <select value={domainFilter} onChange={(e)=>setDomainFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueDomains.map((d:any)=>(<option key={d}>{d}</option>))}</select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Attendance</label>
                <select value={attendanceFilter} onChange={(e)=>setAttendanceFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option><option>Present</option><option>Absent</option></select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
                <select value={zoneFilter} onChange={(e)=>setZoneFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueZones.map((z:any)=>(<option key={z}>{z}</option>))}</select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">SPOC</label>
                <select value={spocFilter} onChange={(e)=>setSpocFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option>{uniqueSpocs.map((s:any)=>(<option key={s}>{s}</option>))}</select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">File Status</label>
                <select value={fileStatusFilter} onChange={(e)=>setFileStatusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200"><option>All</option><option>Uploaded</option><option>Not Uploaded</option></select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
                <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Team / Name / Reg No / Email / Phone" className="hh-input w-full border-2 border-gitam-200" />
              </div>
            </div>

            <div className="mb-4 p-4 rounded-lg border-2 border-gitam-200 bg-gitam-50/60">
              <div className="flex flex-col md:flex-row md:items-end gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Bulk Extend For Selected Individuals</label>
                  <input type="datetime-local" value={bulkDeadlineInput} onChange={(e)=>setBulkDeadlineInput(e.target.value)} disabled={selectedIndividualsCount===0} className="hh-input border-2 border-gitam-200 disabled:opacity-60" />
                </div>
                <div className="flex gap-2">
                  <button className="hh-btn px-3 py-2 disabled:opacity-50" disabled={selectedIndividualsCount===0 || !bulkDeadlineInput} onClick={applyBulkExtendIndividuals}>Apply Bulk Extend</button>
                  <button className="hh-btn-outline px-3 py-2 border-2" onClick={() => setSelectedIndividuals({})}>Clear Selection</button>
                  <button className="hh-btn-outline px-3 py-2 border-2" onClick={exportIndividualsCsv}>Export CSV</button>
                </div>
                <div className="text-sm text-gitam-700/80">Selected: {selectedIndividualsCount}</div>
              </div>
            </div>

            <div className="mb-2 text-sm font-semibold text-gitam-700">Showing {filteredIndividuals.length} individuals</div>

            <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
              <table className="w-full text-sm border-collapse min-w-[1800px]">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300 text-left">
                    <th className="p-3 border-r border-gitam-200"><input type="checkbox" checked={filteredIndividuals.length>0 && filteredIndividuals.every((m:any)=>selectedIndividuals[`${m.teamName}::${getMemberId(m)}`])} onChange={(e)=>{
                      if (!e.target.checked) { setSelectedIndividuals({}); return; }
                      const next: Record<string, boolean> = {};
                      filteredIndividuals.forEach((m:any) => { next[`${m.teamName}::${getMemberId(m)}`] = true; });
                      setSelectedIndividuals(next);
                    }} /></th>
                    <th className="p-3 border-r border-gitam-200">Campus</th>
                    <th className="p-3 border-r border-gitam-200">Domain</th>
                    <th className="p-3 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 border-r border-gitam-200">Name</th>
                    <th className="p-3 border-r border-gitam-200">Reg No</th>
                    <th className="p-3 border-r border-gitam-200">Email</th>
                    <th className="p-3 border-r border-gitam-200">Phone</th>
                    <th className="p-3 border-r border-gitam-200">Attendance</th>
                    <th className="p-3 border-r border-gitam-200">Venue</th>
                    <th className="p-3 border-r border-gitam-200">SPOC</th>
                    <th className="p-3 border-r border-gitam-200">File Status</th>
                    <th className="p-3 border-r border-gitam-200">File Link</th>
                    <th className="p-3 border-r border-gitam-200">Admin Upload</th>
                    <th className="p-3 border-r border-gitam-200">Delete</th>
                    <th className="p-3">Extend Deadline</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIndividuals.map((m:any, idx:number)=> {
                    const memberId = String(getMemberId(m));
                    const rowKey = `${m.teamName}::${memberId}`;
                    const fileKey = `noc_${encodeURIComponent(m.teamName)}_${encodeURIComponent(memberId)}`;
                    const backendMeta = isSupabaseConfigured() ? backendUploads[memberKey(m.teamName, memberId)] : null;
                    const fileData = isSupabaseConfigured()
                      ? (backendMeta ? { file: { name: backendMeta.fileName, data: null }, uploadedAt: backendMeta.uploadedAt } : null)
                      : (() => { try{ const raw = localStorage.getItem(fileKey); if(raw){ return JSON.parse(raw); } }catch(e){} return null; })();
                    const hasFile = Boolean(fileData?.file);
                    const selectedAdminFile = adminSelectedFiles[rowKey] || null;
                    const isUploading = Boolean(adminUploadingRows[rowKey]);

                    const handleAdminUpload = async () => {
                      if (!selectedAdminFile) return;
                      if (selectedAdminFile.type !== 'application/pdf') {
                        alert('Only PDF allowed');
                        return;
                      }
                      if (typeof selectedAdminFile.size === 'number' && selectedAdminFile.size > MAX_NOC_BYTES) {
                        alert(`Max NOC size is ${Math.round(MAX_NOC_BYTES / (1024 * 1024))} MB.`);
                        return;
                      }

                      setAdminUploadingRows((prev) => ({ ...prev, [rowKey]: true }));

                      try {
                        if (isSupabaseConfigured()) {
                          await upsertNoc(m.teamName, memberId, selectedAdminFile);
                          await refreshBackendUploads();
                        } else {
                          const reader = new FileReader();
                          await new Promise<void>((resolve, reject) => {
                            reader.onload = () => {
                              try {
                                const payload = { name: selectedAdminFile.name, data: String(reader.result || '') };
                                localStorage.setItem(fileKey, JSON.stringify({ file: payload, uploadedAt: Date.now() }));
                                resolve();
                              } catch (e) {
                                reject(e);
                              }
                            };
                            reader.onerror = () => reject(new Error('read failed'));
                            reader.readAsDataURL(selectedAdminFile);
                          });
                        }

                        setAdminSelectedFiles((prev) => ({ ...prev, [rowKey]: null }));
                        reloadRegistered();
                        alert('NOC uploaded');
                      } catch {
                        alert('Upload failed');
                      } finally {
                        setAdminUploadingRows((prev) => ({ ...prev, [rowKey]: false }));
                      }
                    };

                    return (
                    <tr key={idx} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100">
                      <td className="p-3 border-r border-gitam-200"><input type="checkbox" checked={!!selectedIndividuals[`${m.teamName}::${memberId}`]} onChange={(e)=>setSelectedIndividuals((prev)=>({ ...prev, [`${m.teamName}::${memberId}`]: e.target.checked }))} /></td>
                      <td className="p-3 border-r border-gitam-200">{m.campus||'-'}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{normalizeDomain(m.domain)||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.teamName||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.name||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.registrationNumber||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.email||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.phoneNumber || (m as any).phone || '-'}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getTeamAttendance(String(m.teamName || ''))}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getZoneForTeam(String(m.teamName || ''))}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getSpocForTeam(String(m.teamName || ''))}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{hasFile ? 'Uploaded' : 'Not Uploaded'}</td>
                      <td className="p-3 border-r border-gitam-200">
                        {hasFile ? (
                          <div className="flex items-center gap-2">
                            {isSupabaseConfigured() ? (
                              <button
                                onClick={async () => {
                                  const previewTab = window.open('about:blank', '_blank');
                                  if (!previewTab) {
                                    alert('Popup blocked. Please allow popups for this site.');
                                    return;
                                  }
                                  try {
                                    previewTab.document.title = 'Opening NOC...';
                                    previewTab.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 16px;">Loading NOC...</p>';
                                  } catch {
                                    // ignore
                                  }

                                  try {
                                    const rec = await getNocBackend(m.teamName, memberId);
                                    if (rec?.url) {
                                      try {
                                        previewTab.location.replace(rec.url);
                                      } catch {
                                        previewTab.location.href = rec.url;
                                      }
                                    } else {
                                      previewTab.close();
                                      alert('View failed');
                                    }
                                  } catch {
                                    previewTab.close();
                                    alert('View failed');
                                  }
                                }}
                                className="hh-btn px-2 py-1 text-xs"
                              >
                                Open
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const blob = dataUrlToBlob(String(fileData?.file?.data || ''));
                                  if (!blob) {
                                    alert('View failed');
                                    return;
                                  }
                                  const blobUrl = URL.createObjectURL(blob);
                                  openPreviewTab(blobUrl);
                                  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
                                }}
                                className="hh-btn px-2 py-1 text-xs"
                              >
                                Open
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gitam-700/60">-</span>
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
                          onClick={() => {
                            (async () => {
                              try{
                                if (isSupabaseConfigured()) {
                                  await deleteNocBackend(m.teamName, memberId);
                                  setBackendUploads((prev) => {
                                    const next = { ...prev };
                                    delete next[memberKey(m.teamName, memberId)];
                                    return next;
                                  });
                                  setBackendCounts((prev) => ({
                                    ...prev,
                                    [m.teamName]: Math.max(0, (prev[m.teamName] || 0) - 1),
                                  }));
                                } else {
                                  localStorage.removeItem(fileKey);
                                }
                                alert('NOC deleted');
                                reloadRegistered();
                              }catch(e){
                                alert('Delete failed');
                              }
                            })();
                          }}
                          disabled={!hasFile}
                          className="hh-btn-outline px-2 py-1 text-xs disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </td>
                      <td className="p-3">
                        {editingDeadlineForMember === getMemberId(m) ? (
                          <div className="flex items-center gap-2">
                            <input type="datetime-local" value={deadlineInputValue} onChange={(e)=>setDeadlineInputValue(e.target.value)} className="px-2 py-1 rounded-lg border-2 border-gitam-100 bg-antique/70 text-gitam-700 focus:outline-none focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition" />
                            <button
                              disabled={!deadlineInputValue}
                              onClick={() => {
                                (async () => {
                                  try{
                                    if (deadlineInputValue) {
                                      const iso = new Date(deadlineInputValue).toISOString();
                                      if (isSupabaseConfigured()) {
                                        await setNocDeadline(m.teamName, memberId, iso);
                                      } else {
                                        const deadlineKey = `noc_deadline_${encodeURIComponent(m.teamName)}_${encodeURIComponent(memberId)}`;
                                        localStorage.setItem(deadlineKey, iso);
                                      }
                                    }
                                    setEditingDeadlineForMember(null);
                                    setDeadlineInputValue('');
                                    reloadRegistered();
                                    alert('Deadline extended');
                                  }catch(e){
                                    alert('Failed');
                                  }
                                })();
                              }}
                              className="px-2 py-1 bg-gitam-700 text-antique rounded text-xs disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button onClick={() => { setEditingDeadlineForMember(null); setDeadlineInputValue(''); }} className="hh-btn-ghost px-2 py-1 text-xs">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingDeadlineForMember(getMemberId(m));
                              (async () => {
                                try {
                                  if (isSupabaseConfigured()) {
                                    const exist = await getNocDeadline(m.teamName, memberId);
                                    setDeadlineInputValue(exist ? (new Date(exist)).toISOString().slice(0,16) : '');
                                    return;
                                  }
                                  const key = `noc_deadline_${encodeURIComponent(m.teamName)}_${encodeURIComponent(memberId)}`;
                                  const exist = localStorage.getItem(key);
                                  setDeadlineInputValue(exist ? (new Date(exist)).toISOString().slice(0,16) : '');
                                } catch {
                                  setDeadlineInputValue('');
                                }
                              })();
                            }}
                            className="hh-btn-outline px-2 py-1 text-xs"
                          >
                            Extend
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>
    </main>
  );
}
