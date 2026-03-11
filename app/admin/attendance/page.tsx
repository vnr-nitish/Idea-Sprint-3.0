'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';

export default function AdminAttendancePage() {
  const router = useRouter();
  const [registered, setRegistered] = useState<any[]>([]);
  const [campusFilter, setCampusFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [programFilter, setProgramFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');
  const [stayFilter, setStayFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  });
  const [attendanceMap, setAttendanceMap] = useState<Record<string, 'present'|'absent'>>({});

  const reloadRegistered = async () => {
    try {
      if (isSupabaseConfigured()) {
        const rows = await listTeamsWithMembers();
        if (rows) { setRegistered(rows); return; }
      }
    } catch (e) { console.warn(e); }
    try { const reg = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); setRegistered(reg); } catch { setRegistered([]); }
  };

  useEffect(() => { reloadRegistered(); }, []);

  const makeMemberKey = (tName: string, m: any) => {
    const id = String(m.registrationNumber || m.email || m.phoneNumber || m.name || '').trim();
    return `${tName}::${id}`;
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`attendance_${date}`);
      if (raw) setAttendanceMap(JSON.parse(raw));
      else setAttendanceMap({});
    } catch (e) { setAttendanceMap({}); }
  }, [date]);

  const allMembers = registered.flatMap((t:any) => (t.members||[]).map((m:any) => ({ ...m, teamName: t.teamName, domain: t.domain })));

  const filtered = allMembers.filter((m:any) => {
    if (campusFilter !== 'All' && m.campus !== campusFilter) return false;
    if (yearFilter !== 'All' && String(m.yearOfStudy) !== String(yearFilter)) return false;
    if (programFilter !== 'All' && m.program !== programFilter) return false;
    if (branchFilter !== 'All' && m.branch !== branchFilter) return false;
    if (stayFilter !== 'All' && m.stay !== stayFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!((m.name||'').toLowerCase().includes(q) || (m.email||'').toLowerCase().includes(q) || (m.registrationNumber||'').toLowerCase().includes(q) || (m.teamName||'').toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const toggleAttendance = (m:any, status:'present'|'absent') => {
    const key = makeMemberKey(m.teamName, m);
    setAttendanceMap(prev => ({ ...prev, [key]: status }));
  };

  const saveAttendance = () => {
    try {
      localStorage.setItem(`attendance_${date}`, JSON.stringify(attendanceMap));
      alert('Attendance saved');
    } catch (e) { alert('Save failed'); }
  };

  const uniqueCampuses = Array.from(new Set(registered.flatMap(t => (t.members||[]).map((m:any)=>m.campus)).filter(Boolean)));
  const uniquePrograms = Array.from(new Set(registered.flatMap(t => (t.members||[]).map((m:any)=>m.program)).filter(Boolean)));
  const uniqueBranches = Array.from(new Set(registered.flatMap(t => (t.members||[]).map((m:any)=>m.branch)).filter(Boolean)));

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gitam-700">Attendance</h1>
          <div>
            <button onClick={() => router.push('/admin/dashboard')} className="hh-btn-outline">Back to dashboard</button>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-sm">Date:</label>
          <input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="hh-input" />
          <label className="text-sm">Campus:</label>
          <select value={campusFilter} onChange={(e)=>setCampusFilter(e.target.value)} className="hh-input"><option>All</option>{uniqueCampuses.map((c:any)=>(<option key={c}>{c}</option>))}</select>
          <label className="text-sm">Year:</label>
          <select value={yearFilter} onChange={(e)=>setYearFilter(e.target.value)} className="hh-input"><option>All</option><option>1</option><option>2</option><option>3</option><option>4</option></select>
          <label className="text-sm">Program:</label>
          <select value={programFilter} onChange={(e)=>setProgramFilter(e.target.value)} className="hh-input"><option>All</option>{uniquePrograms.map((p:any)=>(<option key={p}>{p}</option>))}</select>
          <input value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} placeholder="Search team/name/reg/phone/email" className="hh-input min-w-[260px]" />
        </div>

        <div className="overflow-x-auto hh-card">
          <table className="w-full text-sm border-collapse table-fixed min-w-[1200px]">
            <thead>
              <tr className="hh-table-head text-left">
                <th className="p-2 border-b w-[150px]">Campus</th>
                <th className="p-2 border-b w-[220px]">Team Name</th>
                <th className="p-2 border-b w-[160px]">Domain</th>
                <th className="p-2 border-b w-[180px]">Name</th>
                <th className="p-2 border-b w-[240px]">Email</th>
                <th className="p-2 border-b w-[140px]">Reg No</th>
                <th className="p-2 border-b w-[140px]">Phone No</th>
                <th className="p-2 border-b w-[120px]">Program</th>
                <th className="p-2 border-b w-[120px]">Year</th>
                <th className="p-2 border-b w-[110px]">Stay</th>
                <th className="p-2 border-b w-[150px]">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m:any, idx:number) => {
                const key = makeMemberKey(m.teamName, m);
                const status = attendanceMap[key] || 'absent';
                return (
                  <tr key={idx} className="border-b border-gitam-100">
                    <td className="p-2 whitespace-nowrap">{m.campus||'-'}</td>
                    <td className="p-2 whitespace-nowrap"><div className="truncate" title={m.teamName||''}>{m.teamName||'-'}</div></td>
                    <td className="p-2 whitespace-nowrap"><div className="truncate" title={m.domain||''}>{m.domain||'-'}</div></td>
                    <td className="p-2 whitespace-nowrap"><div className="truncate" title={m.name||''}>{m.name||'-'}</div></td>
                    <td className="p-2 whitespace-nowrap"><div className="truncate" title={m.email||''}>{m.email||'-'}</div></td>
                    <td className="p-2 whitespace-nowrap">{m.registrationNumber||'-'}</td>
                    <td className="p-2 whitespace-nowrap">{m.phoneNumber||'-'}</td>
                    <td className="p-2 whitespace-nowrap">{m.program||'-'}</td>
                    <td className="p-2 whitespace-nowrap">{m.yearOfStudy||'-'}</td>
                    <td className="p-2 whitespace-nowrap">{m.stay||'-'}</td>
                    <td className="p-2 whitespace-nowrap">
                      <div className="flex gap-2">
                        <button onClick={() => toggleAttendance(m, 'present')} className={`px-3 py-1 rounded ${status==='present' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>Present</button>
                        <button onClick={() => toggleAttendance(m, 'absent')} className={`px-3 py-1 rounded ${status==='absent' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>Absent</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          <button onClick={saveAttendance} className="hh-btn px-4 py-2">Save Attendance</button>
        </div>
      </div>
    </main>
  );
}
