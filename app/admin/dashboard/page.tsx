'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';

export default function AdminDashboard() {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  const [reportJSON, setReportJSON] = useState('');
  const [registered, setRegistered] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [campusFilter, setCampusFilter] = useState<string>('All');
  const [yearFilter, setYearFilter] = useState<string>('All');
  const [programFilter, setProgramFilter] = useState<string>('All');
  const [branchFilter, setBranchFilter] = useState<string>('All');
  const [stayFilter, setStayFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editTeam, setEditTeam] = useState<any | null>(null);
  const [selectedTab, setSelectedTab] = useState<'teams' | 'individuals'>('teams');
  const [selectedTeamIndex, setSelectedTeamIndex] = useState<number | null>(null);
  const [selectedTeamDraft, setSelectedTeamDraft] = useState<any | null>(null);
  const [showFullView, setShowFullView] = useState<boolean>(false);
  const [teamName, setTeamName] = useState('');
  const [teamCoupons, setTeamCoupons] = useState<any[] | null>(null);

  useEffect(() => {
    try {
      const a = localStorage.getItem('adminLoggedIn');
      if (!a) { router.push('/admin'); return; }
      setOk(true);
      const r = localStorage.getItem('reportingAssignments');
      setReportJSON(r || JSON.stringify({ "Demo Team": { date: '2026-02-10', time: '09:00 AM', venue: 'Main Auditorium', spoc: { name: 'SPOC Name', email: 'spoc@example.com', phone: '9876543210' } } }, null, 2));
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
        try { const reg = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); setRegistered(reg); } catch { setRegistered([]); }
      })();
      try { const ps = JSON.parse(localStorage.getItem('problemStatements') || '[]'); /* loaded later into state */ (window as any).__admin_problem_statements = Array.isArray(ps) ? ps : []; } catch { (window as any).__admin_problem_statements = []; }
      try { const s = JSON.parse(localStorage.getItem('reportingSpocs') || '[]'); (window as any).__admin_spocs = Array.isArray(s) ? s : []; } catch { (window as any).__admin_spocs = []; }
      try { const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}'); (window as any).__admin_reporting_map = map || {}; } catch { (window as any).__admin_reporting_map = {}; }
    } catch (e) {}
  }, [router]);

  const saveReporting = () => {
    try {
      // validate JSON
      JSON.parse(reportJSON);
      localStorage.setItem('reportingAssignments', reportJSON);
      alert('Saved');
    } catch (e) { alert('Invalid JSON'); }
  };

  const refreshTeams = () => {
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
      try { const reg = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); setRegistered(reg); } catch { setRegistered([]); }
    })();
  };

  const uniqueCampuses = Array.from(new Set(registered.flatMap(t => (t.members || []).map((m: any) => m.campus)).filter(Boolean)));
  const uniquePrograms = Array.from(new Set(registered.flatMap(t => (t.members || []).map((m: any) => m.program)).filter(Boolean)));
  const uniqueBranches = Array.from(new Set(registered.flatMap(t => (t.members || []).map((m: any) => m.branch)).filter(Boolean)));

  const filteredTeams = registered.filter((t: any) => {
    if (campusFilter !== 'All') {
      const teamCampuses = Array.from(new Set((t.members || []).map((m: any) => m.campus)));
      if (!teamCampuses.includes(campusFilter)) return false;
    }
    if (yearFilter !== 'All') {
      const years = (t.members || []).map((m: any) => m.yearOfStudy || '').filter(Boolean);
      if (!years.includes(yearFilter)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!(t.teamName || '').toLowerCase().includes(q) && !((t.members?.[0]?.name || '').toLowerCase().includes(q)) && !((t.members?.[0]?.email || '').toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const exportCSV = (rows: any[]) => {
    const cols = ['teamName','domain','teamPassword','memberIndex','memberName','registrationNumber','email','phoneNumber','school','program','branch','campus','yearOfStudy','stay'];
    const lines = [cols.join(',')];
    rows.forEach((t: any) => {
      (t.members || []).forEach((m: any, idx: number) => {
        const values = [t.teamName, t.domain, t.teamPassword, idx+1, m.name, m.registrationNumber, m.email, m.phoneNumber, m.school, m.program, m.branch, m.campus, m.yearOfStudy, m.stay];
        const esc = values.map(v => `"${String(v || '').replace(/"/g,'""')}"`);
        lines.push(esc.join(','));
      });
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'registered_teams.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const openEdit = (idx: number) => {
    setEditIndex(idx);
    setEditTeam(JSON.parse(JSON.stringify(registered[idx] || null)));
  };

  const selectTeam = (idx: number) => {
    setSelectedTeamIndex(idx);
    setSelectedTeamDraft(JSON.parse(JSON.stringify(registered[idx] || null)));
    setSelectedTab('teams');
    setShowFullView(true);
  };

  const saveSelectedTeam = () => {
    if (selectedTeamIndex === null || !selectedTeamDraft) return;
    const copy = [...registered];
    copy[selectedTeamIndex] = selectedTeamDraft;
    try { localStorage.setItem('registeredTeams', JSON.stringify(copy)); setRegistered(copy); setSelectedTeamIndex(null); setSelectedTeamDraft(null); alert('Saved'); } catch (e) { alert('Save failed'); }
  };

  const saveEdit = () => {
    if (editIndex === null || !editTeam) return;
    const copy = [...registered];
    copy[editIndex] = editTeam;
    try { localStorage.setItem('registeredTeams', JSON.stringify(copy)); setRegistered(copy); setEditIndex(null); setEditTeam(null); alert('Saved'); } catch (e) { alert('Save failed'); }
  };


  const loadCoupons = () => {
    const key = `foodCoupons_${teamName}`;
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      setTeamCoupons(data || []);
    } catch (e) { setTeamCoupons([]); }
  };

  const toggleRedeem = (idx: number) => {
    if (!teamName) return;
    const key = `foodCoupons_${teamName}`;
    const arr = teamCoupons ? [...teamCoupons] : [];
    arr[idx] = { ...arr[idx], redeemed: !arr[idx].redeemed };
    setTeamCoupons(arr);
    try { localStorage.setItem(key, JSON.stringify(arr)); alert('Updated'); } catch (e) {}
  };

  // Extended coupons management for admin (teams and individuals views)
  const [couponsTab, setCouponsTab] = useState<'teams'|'individuals'>('teams');
  const [couponsEditorTeam, setCouponsEditorTeam] = useState<string | null>(null);
  const [couponsEditor, setCouponsEditor] = useState<any[] | null>(null);
  const [individualEditor, setIndividualEditor] = useState<{ teamName: string; memberId: string; memberName: string; coupons: any[] } | null>(null);

  const mealsDef = [
    { label: 'Snacks', code: 'D1-SN' },
    { label: 'Dinner', code: 'D1-DN' },
    { label: 'Breakfast', code: 'D1-BF' },
    { label: 'Lunch', code: 'D1-LN' },
  ];

  const makeCouponKey = (team: string) => {
    return `foodCoupons_${encodeURIComponent(team)}`;
  };

  const readCouponsForTeam = (team: any) => {
    if (!team) return [];
    const keyEnc = makeCouponKey(team.teamName);
    const keyPlain = `foodCoupons_${team.teamName}`;
    try {
      const raw = localStorage.getItem(keyEnc) || localStorage.getItem(keyPlain) || null;
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) { }
    // generate initial coupons similar to client FoodPage
    const members = Array.isArray(team.members) && team.members.length ? team.members : [{ name: team.teamName }];
    const makeId = () => { try { if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') return (crypto as any).randomUUID(); } catch (e) {} return `${Math.random().toString(36).slice(2)}${Date.now()}`; };
    const initial: any[] = [];
    members.forEach((m: any, mi: number) => {
      const memberId = m.registrationNumber || m.email || m.name || `member${mi}`;
      const memberName = m.name || m.registrationNumber || m.email || `Member ${mi+1}`;
      mealsDef.forEach(meal => {
        initial.push({ day: 'Day 1', meal: meal.label, memberName, memberId, qr: `${team.teamName}::${encodeURIComponent(memberId)}::${meal.code}::${makeId()}`, redeemed: false });
      });
    });
    try {
      localStorage.setItem(keyEnc, JSON.stringify(initial));
      localStorage.setItem(keyPlain, JSON.stringify(initial));
    } catch (e) {}
    return initial;
  };

  const loadCouponsForTeamName = (tname: string) => {
    const team = registered.find(r => r.teamName === tname);
    if (!team) { setCouponsEditor(null); setCouponsEditorTeam(null); return; }
    const arr = readCouponsForTeam(team);
    setCouponsEditor(arr);
    setCouponsEditorTeam(team.teamName);
  };

  const saveCouponsForTeam = (tname: string, arr: any[]) => {
    const key = makeCouponKey(tname);
    try { localStorage.setItem(key, JSON.stringify(arr)); localStorage.setItem(`foodCoupons_${tname}`, JSON.stringify(arr)); alert('Saved'); } catch (e) { alert('Save failed'); }
  };

  const openIndividualEditor = (teamNameParam: string, member: any) => {
    const team = registered.find(r => r.teamName === teamNameParam);
    if (!team) return;
    const allRaw = readCouponsForTeam(team);
    const all = Array.isArray(allRaw) ? allRaw : [];
    const memberId = member.registrationNumber || member.email || member.name;
    const memberCoupons = all.filter((c: any) => String(c.memberId) === String(memberId));
    setIndividualEditor({ teamName: team.teamName, memberId, memberName: member.name || member.registrationNumber || member.email || memberId, coupons: memberCoupons });
  };

  const saveIndividualEditor = () => {
    if (!individualEditor) return;
    const team = registered.find(r => r.teamName === individualEditor.teamName);
    if (!team) return;
    const allRaw = readCouponsForTeam(team);
    const all = Array.isArray(allRaw) ? allRaw : [];
    // replace coupons for this member (match by memberId + meal)
    const updated = all.map((c: any) => {
      if (String(c.memberId) === String(individualEditor.memberId)) {
        const found = individualEditor.coupons.find((x:any) => x.meal === c.meal);
        return found ? { ...c, redeemed: !!found.redeemed } : c;
      }
      return c;
    });
    saveCouponsForTeam(team.teamName, updated);
    setIndividualEditor(null);
  };

  // Problem statements state
  const [problemDomain, setProblemDomain] = useState('');
  const [problemTitle, setProblemTitle] = useState('');
  const [problemDesc, setProblemDesc] = useState('');
  const [problemStatements, setProblemStatements] = useState<any[]>([]);

  // Reporting SPOCs and assignments
  const [spocs, setSpocs] = useState<any[]>([]);
  const [spocForm, setSpocForm] = useState({ name: '', email: '', phone: '' });
  const [reportingAssignmentsMap, setReportingAssignmentsMap] = useState<Record<string, any>>({});
  const [reportingTab, setReportingTab] = useState<'spocs'|'teams'>('spocs');

  // Initialize these states from previously-loaded temp values
  useEffect(() => {
    try { setProblemStatements(Array.isArray((window as any).__admin_problem_statements) ? (window as any).__admin_problem_statements : []); } catch (e) { setProblemStatements([]); }
    try { setSpocs(Array.isArray((window as any).__admin_spocs) ? (window as any).__admin_spocs : []); } catch (e) { setSpocs([]); }
    try { setReportingAssignmentsMap((window as any).__admin_reporting_map || {}); } catch (e) { setReportingAssignmentsMap({}); }
  }, []);

  if (!ok) return null;

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gitam-700">Admin Panel</h1>
        </div>
        {/* Top action tiles - icons */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <button onClick={() => router.push('/admin/team-profiles')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-700 text-antique flex items-center justify-center text-2xl">👥</div>
            <div className="text-sm font-semibold text-gitam-700">Team Profiles</div>
          </button>
          <button onClick={() => router.push('/admin/reporting')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-600 text-antique flex items-center justify-center text-2xl">🗓️</div>
            <div className="text-sm font-semibold text-gitam-700">Reporting</div>
          </button>
          <button onClick={() => router.push('/admin/food-coupons')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-500 text-antique flex items-center justify-center text-2xl">🍽️</div>
            <div className="text-sm font-semibold text-gitam-700">Food Coupons</div>
          </button>
          <button onClick={() => router.push('/admin/noc')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-600 text-antique flex items-center justify-center text-2xl">📄</div>
            <div className="text-sm font-semibold text-gitam-700">NOC</div>
          </button>
          <button onClick={() => router.push('/admin/ppt')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-300 text-antique flex items-center justify-center text-2xl">📊</div>
            <div className="text-sm font-semibold text-gitam-700">PPT Submission</div>
          </button>
          <button onClick={() => router.push('/admin/problem-statements')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-500 text-antique flex items-center justify-center text-2xl">🧩</div>
            <div className="text-sm font-semibold text-gitam-700">Problem Statements</div>
          </button>
          <button onClick={() => router.push('/admin/spoc')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-600 text-antique flex items-center justify-center text-2xl">🧑‍💼</div>
            <div className="text-sm font-semibold text-gitam-700">SPOC</div>
          </button>
          <button onClick={() => router.push('/admin/others')} className="hh-card p-6 rounded-2xl border-2 border-gitam-200 flex flex-col items-center gap-3 hover:shadow-lg hover:border-gitam-400 transition">
            <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-700 text-antique flex items-center justify-center text-2xl">🔗</div>
            <div className="text-sm font-semibold text-gitam-700">Others</div>
          </button>
        </div>

        {/* Sections appear only when corresponding tile is active */}
        {activeSection === 'reporting' && (
          <div className="hh-modal-backdrop flex items-start justify-center p-6 z-40">
            <div className="w-full max-w-5xl hh-modal p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold">Reporting Details</h2>
                <div className="flex gap-2">
                  <button onClick={() => setActiveSection(null)} className="hh-btn-ghost px-3 py-1">Close</button>
                </div>
              </div>

              <div className="mb-3 flex gap-2">
                <button onClick={() => setReportingTab('spocs')} className={`px-3 py-1 rounded ${reportingTab === 'spocs' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>SPOCs</button>
                <button onClick={() => setReportingTab('teams')} className={`px-3 py-1 rounded ${reportingTab === 'teams' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>Teams</button>
              </div>

              {reportingTab === 'spocs' && (
                <div className="hh-card p-4">
                  <h3 className="font-semibold mb-2">Add SPOC</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                    <input placeholder="Name" value={spocForm.name} onChange={(e)=>setSpocForm({...spocForm, name: e.target.value})} className="hh-input" />
                    <input placeholder="Email" value={spocForm.email} onChange={(e)=>setSpocForm({...spocForm, email: e.target.value})} className="hh-input" />
                    <input placeholder="Phone" value={spocForm.phone} onChange={(e)=>setSpocForm({...spocForm, phone: e.target.value})} className="hh-input" />
                  </div>
                  <div className="flex gap-2 mb-4">
                    <button onClick={() => {
                      if(!spocForm.name || !spocForm.email) return alert('Name and email required');
                      const next = [...spocs, {...spocForm, id: `${Date.now()}_${Math.random().toString(36).slice(2)}`}];
                      setSpocs(next); localStorage.setItem('reportingSpocs', JSON.stringify(next)); setSpocForm({name:'',email:'',phone:''});
                    }} className="hh-btn px-3 py-1">Add SPOC</button>
                    <button onClick={() => { setSpocForm({name:'',email:'',phone:''}); }} className="hh-btn-outline px-3 py-1">Reset</button>
                  </div>

                  <h4 className="font-semibold mb-2">Saved SPOCs</h4>
                  <div className="space-y-2">
                    {spocs.length === 0 && <div className="text-sm text-gitam-700/75">No SPOCs saved yet.</div>}
                    {spocs.map((s:any, i:number)=> (
                      <div key={s.id||i} className="flex items-center justify-between p-2 border border-gitam-100 rounded-xl bg-antique/60">
                        <div>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-sm text-gitam-700/75">{s.email} {s.phone ? `• ${s.phone}` : ''}</div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { const next = spocs.filter((x:any,idx:number)=>idx!==i); setSpocs(next); localStorage.setItem('reportingSpocs', JSON.stringify(next)); }} className="hh-btn-outline px-2 py-1 text-xs">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reportingTab === 'teams' && (
                <div className="hh-card p-4">
                  <h3 className="font-semibold mb-2">Teams & Assign SPOC</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="hh-table-head text-left">
                          <th className="p-2 border-b">Team Name</th>
                          <th className="p-2 border-b">Campus</th>
                          <th className="p-2 border-b">Domain</th>
                          <th className="p-2 border-b">Team Lead</th>
                          <th className="p-2 border-b">Team Size</th>
                          <th className="p-2 border-b">Assigned SPOC</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registered.map((t:any, idx:number)=> (
                          <tr key={idx} className="border-b border-gitam-100">
                            <td className="p-2">{t.teamName}</td>
                            <td className="p-2">{(t.members||[])[0]?.campus||'-'}</td>
                            <td className="p-2">{t.domain||'-'}</td>
                            <td className="p-2">{(t.members||[])[0]?.name||'-'}</td>
                            <td className="p-2">{(t.members||[]).length}</td>
                            <td className="p-2">
                              <select value={reportingAssignmentsMap[t.teamName]?.id || ''} onChange={(e)=>{
                                const sid = e.target.value; const sp = spocs.find((x:any)=>x.id===sid) || null; const copy = {...reportingAssignmentsMap}; if(sp){ copy[t.teamName] = sp; } else { delete copy[t.teamName]; } setReportingAssignmentsMap(copy); localStorage.setItem('reportingAssignments', JSON.stringify(copy)); setReportJSON(JSON.stringify(copy, null, 2));
                              }} className="hh-input">
                                <option value="">-- none --</option>
                                {spocs.map((s:any)=>(<option key={s.id} value={s.id}>{s.name} — {s.email}</option>))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'problemStatements' && (
          <div className="hh-modal-backdrop flex items-start justify-center p-6 z-40">
            <div className="w-full max-w-5xl hh-modal p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold">Problem Statements</h2>
                <div className="flex gap-2">
                  <button onClick={() => setActiveSection(null)} className="hh-btn-ghost px-3 py-1">Close</button>
                </div>
              </div>

              <div className="hh-card p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                  <select value={problemDomain} onChange={(e)=>setProblemDomain(e.target.value)} className="hh-input">
                    <option value="">Select domain</option>
                    {Array.from(new Set(registered.map(r=>r.domain).filter(Boolean))).map((d:any)=>(<option key={d} value={d}>{d}</option>))}
                  </select>
                  <input placeholder="Title" value={problemTitle} onChange={(e)=>setProblemTitle(e.target.value)} className="hh-input" />
                  <div />
                </div>
                <textarea placeholder="Description (optional)" value={problemDesc} onChange={(e)=>setProblemDesc(e.target.value)} className="hh-input w-full mb-2" />
                <div className="flex gap-2">
                  <button onClick={() => {
                    if(!problemDomain || !problemTitle) return alert('Domain and title required');
                    const next = [{ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, domain: problemDomain, title: problemTitle, description: problemDesc, createdAt: new Date().toISOString() }, ...problemStatements];
                    setProblemStatements(next); localStorage.setItem('problemStatements', JSON.stringify(next)); setProblemDomain(''); setProblemTitle(''); setProblemDesc('');
                  }} className="hh-btn px-3 py-1">Save</button>
                  <button onClick={() => { setProblemDomain(''); setProblemTitle(''); setProblemDesc(''); }} className="hh-btn-outline px-3 py-1">Cancel</button>
                </div>
              </div>

              <div className="space-y-3">
                {problemStatements.length===0 && <div className="text-sm text-gitam-700/75">No problem statements yet.</div>}
                {problemStatements.map((p:any, i:number)=> (
                  <div key={p.id||i} className="p-3 bg-antique/60 border border-gitam-100 rounded-xl">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold">{p.title}</div>
                        <div className="text-sm text-gitam-700/75">Domain: {p.domain} • {new Date(p.createdAt).toLocaleString()}</div>
                        {p.description && <p className="mt-2 text-sm">{p.description}</p>}
                      </div>
                      <div>
                        <button onClick={()=>{ const next = problemStatements.filter((x:any,idx:number)=>idx!==i); setProblemStatements(next); localStorage.setItem('problemStatements', JSON.stringify(next)); }} className="hh-btn-outline px-2 py-1 text-xs">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'teamProfiles' && (
          <section className="mb-8">
            <h2 className="font-semibold mb-2">Team Profiles</h2>
            <div className="mb-3 flex gap-2">
              <button onClick={() => setSelectedTab('teams')} className={`px-3 py-1 rounded ${selectedTab === 'teams' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>Teams</button>
              <button onClick={() => setSelectedTab('individuals')} className={`px-3 py-1 rounded ${selectedTab === 'individuals' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>Individuals</button>
            </div>

            {selectedTab === 'teams' && (
              showFullView && selectedTeamDraft ? (
                <div className="hh-card p-4">
                  <div className="flex justify-between items-center mb-4">
                    <button onClick={() => { setSelectedTeamIndex(null); setSelectedTeamDraft(null); setShowFullView(false); }} className="hh-btn-outline px-2 py-1">Back to list</button>
                    <div className="flex gap-2">
                      <button onClick={() => { setSelectedTeamDraft(JSON.parse(JSON.stringify(registered[selectedTeamIndex!] || null))); }} className="hh-btn-outline px-3 py-1">Reset</button>
                      <button onClick={saveSelectedTeam} className="hh-btn px-3 py-1">Save</button>
                    </div>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedTeamDraft.teamName}</h3>
                      <div className="text-sm text-gitam-700/75">Domain: {selectedTeamDraft.domain || '-'}</div>
                      <div className="text-sm text-gitam-700/75">Password: {selectedTeamDraft.teamPassword || '-'}</div>
                      <div className="text-sm text-gitam-700/75">Campus: {(selectedTeamDraft.members || [])[0]?.campus || '-'}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(selectedTeamDraft.members || []).map((m:any, idx:number) => (
                      <div key={idx} className="p-3 border border-gitam-100 rounded-xl bg-antique/60">
                        <div className="font-semibold mb-1">Member {idx+1}: {m.name}</div>
                        <div className="space-y-2">
                          <input value={m.name} onChange={(e)=> { const copy = {...selectedTeamDraft}; copy.members[idx].name = e.target.value; setSelectedTeamDraft(copy); }} className="hh-input w-full" />
                          <input value={m.email} onChange={(e)=> { const copy = {...selectedTeamDraft}; copy.members[idx].email = e.target.value; setSelectedTeamDraft(copy); }} className="hh-input w-full" />
                          <input value={m.registrationNumber} onChange={(e)=> { const copy = {...selectedTeamDraft}; copy.members[idx].registrationNumber = e.target.value; setSelectedTeamDraft(copy); }} className="hh-input w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="md:flex md:gap-4">
                  <div className="md:w-1/2 overflow-x-auto">
                    <div className="mb-3 flex flex-col md:flex-row md:items-center md:gap-3">
                      <div className="flex items-center gap-2 mb-2 md:mb-0">
                        <label className="text-sm">Campus:</label>
                        <select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} className="hh-input">
                          <option>All</option>
                          {uniqueCampuses.map((c: string) => <option key={c}>{c}</option>)}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 mb-2 md:mb-0">
                        <label className="text-sm">Year:</label>
                        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="hh-input">
                          <option>All</option>
                          <option>1</option>
                          <option>2</option>
                          <option>3</option>
                          <option>4</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 flex-1">
                        <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search team, lead or email" className="hh-input flex-1" />
                        <button onClick={() => exportCSV(filteredTeams)} className="hh-btn px-3 py-1">Export CSV</button>
                        <button onClick={refreshTeams} className="hh-btn-outline px-3 py-1">Refresh</button>
                      </div>
                    </div>

                    <table className="w-full text-sm border-collapse hh-card">
                      <thead>
                        <tr className="hh-table-head text-left">
                          <th className="p-2 border-b">Team Name</th>
                          <th className="p-2 border-b">Campus</th>
                          <th className="p-2 border-b">Domain</th>
                          <th className="p-2 border-b">Team Size</th>
                          <th className="p-2 border-b">Lead</th>
                          <th className="p-2 border-b">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTeams.map((t: any, i: number) => (
                          <tr key={i} className="border-b border-gitam-100 hover:bg-gitam-50 cursor-pointer">
                            <td className="p-2" onClick={() => window.open(`/admin/team?idx=${i}`, '_blank')}>{t.teamName}</td>
                            <td className="p-2" onClick={() => window.open(`/admin/team?idx=${i}`, '_blank')}>{(t.members || [])[0]?.campus || '-'}</td>
                            <td className="p-2" onClick={() => window.open(`/admin/team?idx=${i}`, '_blank')}>{t.domain || '-'}</td>
                            <td className="p-2" onClick={() => window.open(`/admin/team?idx=${i}`, '_blank')}>{(t.members || []).length}</td>
                            <td className="p-2" onClick={() => window.open(`/admin/team?idx=${i}`, '_blank')}>{(t.members || [])[0]?.name || '-'}</td>
                            <td className="p-2">
                              <div className="flex gap-2">
                                <button onClick={() => window.open(`/admin/team?idx=${i}`, '_blank')} className="hh-btn px-2 py-1">Open</button>
                                <button onClick={() => exportCSV([t])} className="hh-btn-outline px-2 py-1">Export</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:w-1/2 mt-4 md:mt-0">
                    {selectedTeamDraft ? (
                      <div className="hh-card p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-semibold">{selectedTeamDraft.teamName}</h3>
                            <div className="text-sm text-gitam-700/75">Domain: {selectedTeamDraft.domain || '-'}</div>
                            <div className="text-sm text-gitam-700/75">Password: {selectedTeamDraft.teamPassword || '-'}</div>
                            <div className="text-sm text-gitam-700/75">Campus: {(selectedTeamDraft.members || [])[0]?.campus || '-'}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => { setSelectedTeamDraft(JSON.parse(JSON.stringify(registered[selectedTeamIndex!] || null))); }} className="hh-btn-outline px-3 py-1">Reset</button>
                            <button onClick={saveSelectedTeam} className="hh-btn px-3 py-1">Save</button>
                          </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(selectedTeamDraft.members || []).map((m:any, idx:number) => (
                            <div key={idx} className="p-3 border border-gitam-100 rounded-xl bg-antique/60">
                              <div className="font-semibold mb-1">Member {idx+1}: {m.name}</div>
                              <div className="space-y-2">
                                <input value={m.name} onChange={(e)=> { const copy = {...selectedTeamDraft}; copy.members[idx].name = e.target.value; setSelectedTeamDraft(copy); }} className="hh-input w-full" />
                                <input value={m.email} onChange={(e)=> { const copy = {...selectedTeamDraft}; copy.members[idx].email = e.target.value; setSelectedTeamDraft(copy); }} className="hh-input w-full" />
                                <input value={m.registrationNumber} onChange={(e)=> { const copy = {...selectedTeamDraft}; copy.members[idx].registrationNumber = e.target.value; setSelectedTeamDraft(copy); }} className="hh-input w-full" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gitam-700/75">Select a team to view details and edit members.</div>
                    )}
                  </div>
                </div>
              )
            )}

            {selectedTab === 'individuals' && (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <label className="text-sm">Campus:</label>
                  <select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} className="px-2 py-1 border rounded">
                    <option>All</option>
                    {uniqueCampuses.map((c: string) => <option key={c}>{c}</option>)}
                  </select>
                  <label className="text-sm">Year:</label>
                  <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="px-2 py-1 border rounded">
                    <option>All</option>
                    <option>1</option>
                    <option>2</option>
                    <option>3</option>
                    <option>4</option>
                  </select>
                  <label className="text-sm">Program:</label>
                  <select value={programFilter} onChange={(e) => setProgramFilter(e.target.value)} className="px-2 py-1 border rounded">
                    <option>All</option>
                    {uniquePrograms.map((p: string) => <option key={p}>{p}</option>)}
                  </select>
                  <label className="text-sm">Branch:</label>
                  <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="px-2 py-1 border rounded">
                    <option>All</option>
                    {uniqueBranches.map((b: string) => <option key={b}>{b}</option>)}
                  </select>
                  <label className="text-sm">Stay:</label>
                  <select value={stayFilter} onChange={(e) => setStayFilter(e.target.value)} className="px-2 py-1 border rounded">
                    <option>All</option>
                    <option>Hostel</option>
                    <option>Day Scholar</option>
                  </select>
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search person, email, reg no, team" className="px-2 py-1 border rounded flex-1 min-w-[200px]" />
                  <button onClick={() => {
                    const members = registered.flatMap((t:any) => (t.members || []).map((m:any) => ({...m, teamName: t.teamName, domain: t.domain}))).filter((m:any) => {
                      if (campusFilter !== 'All' && m.campus !== campusFilter) return false;
                      if (yearFilter !== 'All' && String(m.yearOfStudy) !== String(yearFilter)) return false;
                      if (programFilter !== 'All' && m.program !== programFilter) return false;
                      if (branchFilter !== 'All' && m.branch !== branchFilter) return false;
                      if (stayFilter !== 'All' && m.stay !== stayFilter) return false;
                      if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); if (!(m.name || '').toLowerCase().includes(q) && !(m.email || '').toLowerCase().includes(q) && !(m.registrationNumber || '').toLowerCase().includes(q) && !(m.teamName||'').toLowerCase().includes(q)) return false; }
                      return true;
                    });
                    const cols = ['campus','teamName','name','email','registrationNumber','phoneNumber','school','program','programOther','branch','yearOfStudy','stay'];
                    const lines = [cols.join(',')];
                    members.forEach((m:any) => { const vals = [m.campus,m.teamName,m.name,m.email,m.registrationNumber,m.phoneNumber,m.school,m.program,m.programOther,m.branch,m.yearOfStudy,m.stay]; lines.push(vals.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')); });
                    const blob = new Blob([lines.join('\n')], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'individuals.csv'; a.click(); URL.revokeObjectURL(url);
                  }} className="hh-btn px-3 py-1">Export CSV</button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2 border-b">Campus</th>
                        <th className="p-2 border-b">Team Name</th>
                        <th className="p-2 border-b">Name</th>
                        <th className="p-2 border-b">Email</th>
                        <th className="p-2 border-b">Reg No</th>
                        <th className="p-2 border-b">Phone No</th>
                        <th className="p-2 border-b">School</th>
                        <th className="p-2 border-b">Program</th>
                        <th className="p-2 border-b">Program Other</th>
                        <th className="p-2 border-b">Branch</th>
                        <th className="p-2 border-b">Year</th>
                        <th className="p-2 border-b">Stay</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registered.flatMap((t:any) => (t.members || []).map((m:any) => ({...m, teamName: t.teamName, domain: t.domain}))).filter((m:any) => {
                        if (campusFilter !== 'All' && m.campus !== campusFilter) return false;
                        if (yearFilter !== 'All' && String(m.yearOfStudy) !== String(yearFilter)) return false;
                        if (programFilter !== 'All' && m.program !== programFilter) return false;
                        if (branchFilter !== 'All' && m.branch !== branchFilter) return false;
                        if (stayFilter !== 'All' && m.stay !== stayFilter) return false;
                        if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); if (!(m.name||'').toLowerCase().includes(q) && !(m.email||'').toLowerCase().includes(q) && !(m.registrationNumber||'').toLowerCase().includes(q) && !(m.teamName||'').toLowerCase().includes(q)) return false; }
                        return true;
                      }).map((m:any, idx:number) => (
                        <tr key={idx} className="border-b">
                          <td className="p-2">{m.campus || '-'}</td>
                          <td className="p-2">{m.teamName || '-'}</td>
                          <td className="p-2">{m.name || '-'}</td>
                          <td className="p-2">{m.email || '-'}</td>
                          <td className="p-2">{m.registrationNumber || '-'}</td>
                          <td className="p-2">{m.phoneNumber || '-'}</td>
                          <td className="p-2">{m.school || '-'}</td>
                          <td className="p-2">{m.program || '-'}</td>
                          <td className="p-2">{m.programOther || '-'}</td>
                          <td className="p-2">{m.branch || '-'}</td>
                          <td className="p-2">{m.yearOfStudy || '-'}</td>
                          <td className="p-2">{m.stay || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        )}

        {activeSection === 'coupons' && (
          <section className="mb-8">
            <h2 className="font-semibold mb-2">Food Coupon Redemption</h2>

            <div className="mb-3 flex justify-between items-center">
              <div className="flex gap-2">
                <button onClick={() => setCouponsTab('teams')} className={`px-3 py-1 rounded ${couponsTab === 'teams' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>Teams</button>
                <button onClick={() => setCouponsTab('individuals')} className={`px-3 py-1 rounded ${couponsTab === 'individuals' ? 'bg-gitam-700 text-antique' : 'bg-gitam-50 text-gitam-700'}`}>Individuals</button>
              </div>
              <div className="flex items-center gap-2">
                <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Team Name (exact)" className="hh-input" />
                <button onClick={() => loadCouponsForTeamName(teamName)} className="hh-btn">Load Team</button>
              </div>
            </div>

            {couponsTab === 'teams' && (
              <div className="md:flex md:gap-4">
                <div className="md:w-1/2 overflow-x-auto">
                  <div className="mb-3 flex flex-col md:flex-row md:items-center md:gap-3">
                    <div className="flex items-center gap-2 mb-2 md:mb-0">
                      <label className="text-sm">Campus:</label>
                      <select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} className="hh-input">
                        <option>All</option>
                        {uniqueCampuses.map((c: string) => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search team, lead or email" className="hh-input flex-1" />
                      <button onClick={refreshTeams} className="hh-btn-outline px-3 py-1">Refresh</button>
                    </div>
                  </div>

                  <table className="w-full text-sm border-collapse hh-card">
                    <thead>
                      <tr className="hh-table-head text-left">
                        <th className="p-2 border-b">Team Name</th>
                        <th className="p-2 border-b">Campus</th>
                        <th className="p-2 border-b">Domain</th>
                        <th className="p-2 border-b">Team Size</th>
                        <th className="p-2 border-b">Lead</th>
                        <th className="p-2 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTeams.map((t: any, i: number) => (
                        <tr key={i} className="border-b border-gitam-100 hover:bg-gitam-50">
                          <td className="p-2">{t.teamName}</td>
                          <td className="p-2">{(t.members || [])[0]?.campus || '-'}</td>
                          <td className="p-2">{t.domain || '-'}</td>
                          <td className="p-2">{(t.members || []).length}</td>
                          <td className="p-2">{(t.members || [])[0]?.name || '-'}</td>
                          <td className="p-2">
                            <div className="flex gap-2">
                              <button onClick={() => loadCouponsForTeamName(t.teamName)} className="hh-btn px-2 py-1">Open</button>
                              <button onClick={() => { const arr = readCouponsForTeam(t); saveCookies: saveCouponsForTeam(t.teamName, arr); }} className="hh-btn-outline px-2 py-1">Export</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="md:w-1/2 mt-4 md:mt-0">
                  {couponsEditorTeam ? (
                    <div className="hh-card p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-lg font-semibold">Coupons — {couponsEditorTeam}</h3>
                        <div className="flex gap-2">
                          <button onClick={() => { setCouponsEditorTeam(null); setCouponsEditor(null); }} className="hh-btn-ghost px-2 py-1">Close</button>
                          <button onClick={() => couponsEditor && saveCouponsForTeam(couponsEditorTeam, couponsEditor)} className="hh-btn px-3 py-1">Save</button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {couponsEditor && couponsEditor.length === 0 && <div className="text-sm text-gitam-700/75">No coupons generated.</div>}
                        {couponsEditor && couponsEditor.map((c, idx) => (
                          <div key={idx} className="p-3 border border-gitam-100 rounded-xl bg-antique/60 flex items-center justify-between">
                            <div>
                              <div className="font-semibold">{c.day} — {c.meal}</div>
                              <div className="text-sm text-gitam-700/75">Member: {c.memberName} — QR: {c.qr}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <select value={c.redeemed ? 'redeemed' : 'not'} onChange={(e) => { const copy = couponsEditor.slice(); copy[idx] = { ...copy[idx], redeemed: e.target.value === 'redeemed' }; setCouponsEditor(copy); }} className="hh-input">
                                <option value="not">Not redeemed</option>
                                <option value="redeemed">Redeemed</option>
                              </select>
                              <button onClick={() => { const copy = couponsEditor.slice(); copy.splice(idx,1); setCouponsEditor(copy); }} className="hh-btn-outline px-2 py-1">Remove</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gitam-700/75">Open a team to view and edit coupon statuses.</div>
                  )}
                </div>
              </div>
            )}

            {couponsTab === 'individuals' && (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <label className="text-sm">Campus:</label>
                  <select value={campusFilter} onChange={(e) => setCampusFilter(e.target.value)} className="px-2 py-1 border rounded">
                    <option>All</option>
                    {uniqueCampuses.map((c: string) => <option key={c}>{c}</option>)}
                  </select>
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search person, email, reg no, team" className="px-2 py-1 border rounded flex-1 min-w-[200px]" />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse hh-card">
                    <thead>
                      <tr className="hh-table-head text-left">
                        <th className="p-2 border-b">Campus</th>
                        <th className="p-2 border-b">Team Name</th>
                        <th className="p-2 border-b">Name</th>
                        <th className="p-2 border-b">Reg No</th>
                        <th className="p-2 border-b">Email</th>
                        <th className="p-2 border-b">Phone</th>
                        <th className="p-2 border-b">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {registered.flatMap((t:any) => (t.members || []).map((m:any) => ({...m, teamName: t.teamName, campus: m.campus || (t.members||[])[0]?.campus}))).filter((m:any) => {
                        if (campusFilter !== 'All' && m.campus !== campusFilter) return false;
                        if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); if (!(m.name||'').toLowerCase().includes(q) && !(m.email||'').toLowerCase().includes(q) && !(m.registrationNumber||'').toLowerCase().includes(q) && !(m.teamName||'').toLowerCase().includes(q)) return false; }
                        return true;
                      }).map((m:any, idx:number) => (
                        <tr key={idx} className="border-b border-gitam-100">
                          <td className="p-2">{m.campus||'-'}</td>
                          <td className="p-2">{m.teamName||'-'}</td>
                          <td className="p-2">{m.name||'-'}</td>
                          <td className="p-2">{m.registrationNumber||'-'}</td>
                          <td className="p-2">{m.email||'-'}</td>
                          <td className="p-2">{m.phoneNumber||'-'}</td>
                          <td className="p-2"><div className="flex gap-2"><button onClick={() => openIndividualEditor(m.teamName, m)} className="hh-btn px-2 py-1">Open</button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {individualEditor && (
                  <div className="mt-4 hh-card p-4">
                    <div className="flex justify-between items-center mb-3">
                      <div>
                        <h3 className="font-semibold">{individualEditor.memberName} — {individualEditor.teamName}</h3>
                        <div className="text-sm text-gitam-700/75">Member ID: {individualEditor.memberId}</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setIndividualEditor(null)} className="hh-btn-ghost px-2 py-1">Close</button>
                        <button onClick={saveIndividualEditor} className="hh-btn px-3 py-1">Save</button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {individualEditor.coupons.map((c:any, i:number) => (
                        <div key={i} className="p-3 border border-gitam-100 rounded-xl bg-antique/60 flex items-center justify-between">
                          <div>
                            <div className="font-semibold">{c.meal}</div>
                            <div className="text-sm text-gitam-700/75">QR: {c.qr}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <select value={c.redeemed ? 'redeemed' : 'not'} onChange={(e) => { const copy = { ...individualEditor }; copy.coupons[i] = { ...copy.coupons[i], redeemed: e.target.value === 'redeemed' }; setIndividualEditor(copy); }} className="hh-input">
                              <option value="not">Not redeemed</option>
                              <option value="redeemed">Redeemed</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </section>
        )}
        {/* Edit Modal */}
        {editTeam && (
          <div className="hh-modal-backdrop flex items-center justify-center p-4">
            <div className="w-full max-w-3xl hh-modal p-6 overflow-auto max-h-[90vh]">
              <h3 className="text-lg font-semibold mb-4">Edit Team: {editTeam.teamName}</h3>
              <div className="grid grid-cols-1 gap-3 mb-3">
                <label className="text-sm">Team Name</label>
                <input value={editTeam.teamName} onChange={(e) => setEditTeam((prev:any)=> ({...prev, teamName: e.target.value}))} className="hh-input" />
                <label className="text-sm">Domain</label>
                <input value={editTeam.domain} onChange={(e) => setEditTeam((prev:any)=> ({...prev, domain: e.target.value}))} className="hh-input" />
                <label className="text-sm">Team Password</label>
                <input value={editTeam.teamPassword} onChange={(e) => setEditTeam((prev:any)=> ({...prev, teamPassword: e.target.value}))} className="hh-input" />
              </div>
              <div className="mb-4">
                <h4 className="font-semibold mb-2">Members</h4>
                <div className="space-y-3">
                  {(editTeam.members || []).map((m:any, idx:number) => (
                    <div key={idx} className="p-3 border border-gitam-100 rounded-xl bg-antique/60 grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input value={m.name} onChange={(e)=> { const copy = {...editTeam}; copy.members[idx].name = e.target.value; setEditTeam(copy); }} className="hh-input" />
                      <input value={m.email} onChange={(e)=> { const copy = {...editTeam}; copy.members[idx].email = e.target.value; setEditTeam(copy); }} className="hh-input" />
                      <input value={m.registrationNumber} onChange={(e)=> { const copy = {...editTeam}; copy.members[idx].registrationNumber = e.target.value; setEditTeam(copy); }} className="hh-input" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setEditIndex(null); setEditTeam(null); }} className="hh-btn-outline px-3 py-1">Cancel</button>
                <button onClick={saveEdit} className="hh-btn px-3 py-1">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
