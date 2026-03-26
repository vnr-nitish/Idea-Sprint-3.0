'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { listTeamsWithMembers } from '@/lib/teamsBackend';
import { replaceIdCardCertificatesForTeam } from '@/lib/idCardCertificateBackend';
import { listReportingAssignments } from '@/lib/reportingBackend';
import { filterTeamsForSpoc, getStoredSpocUser, isSpocLoggedIn, SpocUser } from '@/lib/spocSession';

export default function AdminIdCardsCertificatesPage(){
  const router = useRouter();
  const pathname = usePathname();
  const isSpocView = (pathname || '').startsWith('/spoc');
  const [spocUser, setSpocUser] = useState<SpocUser | null>(null);
  const [registered, setRegistered] = useState<any[]>([]);
  const [tab, setTab] = useState<'teams'|'individuals'>('teams');
  const [campusFilter, setCampusFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [teamSizeFilter, setTeamSizeFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<any|null>(null);
  const [teamCoupons, setTeamCoupons] = useState<any[]|null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string|null>(null);
  const [individualEditor, setIndividualEditor] = useState<any|null>(null);
  const [individualModal, setIndividualModal] = useState<any|null>(null);
  const [individualModalAllCoupons, setIndividualModalAllCoupons] = useState<any[]|null>(null);
  const [stayFilter, setStayFilter] = useState('All');
  const [assignments, setAssignments] = useState<Record<string, any>>({});
  const [venueFilter, setVenueFilter] = useState('All');
  const [spocFilter, setSpocFilter] = useState('All');
  const [attendanceFilter, setAttendanceFilter] = useState('All');
  const [dinnerRedeemFilter, setDinnerRedeemFilter] = useState('All');
  const [lunchRedeemFilter, setLunchRedeemFilter] = useState('All');
  const isAnyModalOpen = !!selectedTeam || !!individualModal;

  const canonicalTeamKey = useCallback((teamName: string) => String(teamName || '').trim().toLowerCase(), []);

  const assignmentsIndex = useMemo(() => {
    const next: Record<string, any> = {};
    Object.entries(assignments || {}).forEach(([teamName, value]) => {
      const key = canonicalTeamKey(teamName);
      if (key) next[key] = value;
    });
    return next;
  }, [assignments, canonicalTeamKey]);

  const syncReportingAssignments = useCallback(async () => {
    let localMap: Record<string, any> = {};
    try {
      const stored = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
      localMap = (stored && typeof stored === 'object') ? stored : {};
    } catch {
      localMap = {};
    }

    if (!isSupabaseConfigured()) {
      setAssignments(localMap);
      return;
    }

    try {
      const remoteMap = await listReportingAssignments();
      if (remoteMap && typeof remoteMap === 'object') {
        const merged: Record<string, any> = { ...localMap };
        Object.entries(remoteMap).forEach(([teamName, assignment]) => {
          const key = canonicalTeamKey(teamName);
          const existingKey = Object.keys(merged).find((k) => canonicalTeamKey(k) === key);
          const saved = (existingKey ? merged[existingKey] : {}) || {};
          merged[teamName] = {
            ...saved,
            ...assignment,
            venue: String((assignment as any)?.venue || saved?.venue || ''),
            spoc: {
              name: String((assignment as any)?.spoc?.name || saved?.spoc?.name || ''),
              email: String((assignment as any)?.spoc?.email || saved?.spoc?.email || ''),
              phone: String((assignment as any)?.spoc?.phone || saved?.spoc?.phone || ''),
            },
          };
        });
        setAssignments(merged);
        localStorage.setItem('reportingAssignments', JSON.stringify(merged));
        return;
      }
    } catch {
      // fall back to local map
    }

    setAssignments(localMap);
  }, [canonicalTeamKey]);

  useEffect(() => {
    if (!isSpocView) return;
    if (!isSpocLoggedIn()) {
      router.push('/spoc');
      return;
    }
    setSpocUser(getStoredSpocUser());
  }, [isSpocView, router]);

  useEffect(() => {
    const navbar = document.querySelector('nav');
    if (navbar) (navbar as HTMLElement).style.display = 'none';
    return () => {
      const navbar = document.querySelector('nav');
      if (navbar) (navbar as HTMLElement).style.display = '';
    };
  }, [syncReportingAssignments]);
  useEffect(() => {
    if (!isAnyModalOpen) return;

    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPaddingRight = document.body.style.paddingRight;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.paddingRight = prevBodyPaddingRight;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [isAnyModalOpen]);

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
      void (async () => {
        try {
          if (isSupabaseConfigured()) {
            const rows = await listTeamsWithMembers();
            if (rows) {
              setRegistered(rows);
            }
          } else {
            const r = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
            setRegistered(Array.isArray(r) ? r : []);
          }
        } catch {
          // ignore
        }

        await syncReportingAssignments();
      })();
    }, 2000);

    return () => clearInterval(poll);
  }, [syncReportingAssignments]);

  useEffect(() => {
    void syncReportingAssignments();
  }, [syncReportingAssignments]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'reportingAssignments') return;
      void syncReportingAssignments();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [syncReportingAssignments]);

  const getAssignmentForTeam = (teamName: string) => {
    const direct = assignments[String(teamName || '').trim()];
    if (direct) return direct;
    return assignmentsIndex[canonicalTeamKey(teamName)] || {};
  };

  const getVenueForTeam = (teamName: string) => {
    return getAssignmentForTeam(teamName)?.venue || '-';
  };

  const getSpocForTeam = (teamName: string) => {
    return getAssignmentForTeam(teamName)?.spoc?.name || '-';
  };

  const getTeamAttendance = (teamName: string): string => {
    try {
      const saved = localStorage.getItem(`team_attendance_${teamName}`) || '';
      return saved === 'Present' || saved === 'Absent' ? saved : '-';
    } catch {
      return '-';
    }
  };

  const getMemberAttendanceDisplay = (teamName: string, memberKey: string): string => {
    try {
      const memberSaved = localStorage.getItem(`member_attendance_${teamName}_${memberKey}`) || '';
      if (memberSaved === 'Present' || memberSaved === 'Absent') return memberSaved;
      return getTeamAttendance(teamName);
    } catch {
      return '-';
    }
  };

  const getCouponsForTeam = (teamName: string): any[] => {
    if (selectedTeam?.teamName === teamName && Array.isArray(teamCoupons)) return teamCoupons;
    if (individualModal?.teamName === teamName && Array.isArray(individualModalAllCoupons)) return individualModalAllCoupons;
    try {
      const keyEnc = `idCardsCertificates_${encodeURIComponent(teamName)}`;
      const keyPlain = `idCardsCertificates_${teamName}`;
      const raw = localStorage.getItem(keyEnc) || localStorage.getItem(keyPlain) || '[]';
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const getCouponMemberId = (member: any, fallbackIndex?: number): string => {
    return String(
      member?.registrationNumber ||
      member?.email ||
      member?.name ||
      (fallbackIndex !== undefined ? `member${fallbackIndex}` : '')
    );
  };

  const getMealRedeemedCountForTeam = (teamName: string, meal: 'ID Cards' | 'Certificates'): number => {
    const arr = getCouponsForTeam(teamName);
    const redeemedMemberIds = new Set<string>();
    arr.forEach((c: any) => {
      if (String(c?.meal || '') === meal && !!c?.redeemed) {
        redeemedMemberIds.add(String(c?.memberId || ''));
      }
    });
    return redeemedMemberIds.size;
  };

  const getTeamMealFilterValue = (teamName: string, meal: 'ID Cards' | 'Certificates'): string => {
    return getMealRedeemedCountForTeam(teamName, meal) > 0 ? 'Redeemed' : 'Not redeemed';
  };

  const getMemberMealStatus = (teamName: string, memberKey: string, meal: 'ID Cards' | 'Certificates'): string => {
    const arr = getCouponsForTeam(teamName);
    const found = arr.find((c: any) => String(c?.memberId || '') === String(memberKey) && String(c?.meal || '') === meal);
    return found?.redeemed ? 'Redeemed' : 'Not redeemed';
  };
  const closeIndividualModal = () => {
    setIndividualModal(null);
    setIndividualModalAllCoupons(null);
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

  const scopedRegistered = useMemo(() => {
    if (!isSpocView) return registered;
    return filterTeamsForSpoc(registered, assignments, spocUser);
  }, [registered, assignments, spocUser, isSpocView]);

  const uniqueCampuses = useMemo(()=> Array.from(new Set(scopedRegistered.flatMap(t => (t.members||[]).map((m:any)=>m.campus)).filter(Boolean))), [scopedRegistered]);
  const uniqueDomains = ['App Development', 'Cyber Security', 'AI', 'ML & DS'];
  const uniqueVenues = useMemo(() => {
    return Array.from(new Set(Object.values(assignments).map((a: any) => a?.venue).filter(Boolean)));
  }, [assignments]);

  const uniqueSpocs = useMemo(() => {
    return Array.from(new Set(Object.values(assignments).map((a: any) => a?.spoc?.name).filter(Boolean)));
  }, [assignments]);

  // Itinerary order must match the user-facing app.
  const mealsDef = [
    { label: 'ID Cards', code: 'D1-ID' },
    { label: 'Certificates', code: 'D1-CR' },
  ];

  const makeKey = (teamName:string) => `idCardsCertificates_${encodeURIComponent(teamName)}`;

  const syncCouponsBackend = (teamName: string, coupons: any[]) => {
    if (isSupabaseConfigured()) {
      void replaceIdCardCertificatesForTeam(teamName, coupons || []);
    }
  };

  const ensureCouponsForTeam = (team:any) => {
    const keyEnc = makeKey(team.teamName);
    const keyPlain = `idCardsCertificates_${team.teamName}`;
    const makeId = ()=>{ try{ if(typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID(); }catch(e){} return `${Math.random().toString(36).slice(2)}${Date.now()}`; };
    let parsed:any[] = [];
    try{
      const raw = localStorage.getItem(keyEnc) || localStorage.getItem(keyPlain);
      if(raw){ parsed = JSON.parse(raw) || []; }
    }catch(e){ parsed = []; }

    // Always normalize so each member has all meals.
    const members = Array.isArray(team.members) && team.members.length ? team.members : [{ name: team.teamName }];
    const existingByKey: Record<string, any> = {};
    const unassignedByMeal: Record<string, any[]> = {};
    parsed.forEach((p:any)=>{
      const mid = p?.memberId;
      const meal = p?.meal;
      if (mid && meal) existingByKey[`${String(mid)}::${String(meal)}`] = p;
      else if (meal) (unassignedByMeal[String(meal)] ||= []).push(p);
    });

    const normalized:any[] = [];
    members.forEach((m:any, mi:number) => {
      const memberId = m.registrationNumber || m.email || m.name || `member${mi}`;
      const memberName = m.name || m.registrationNumber || m.email || `Member ${mi+1}`;
      mealsDef.forEach((meal) => {
        const key = `${String(memberId)}::${String(meal.label)}`;
        if (existingByKey[key]) {
          normalized.push({
            ...existingByKey[key],
            memberId,
            memberName,
            meal: meal.label,
            redeemed: !!existingByKey[key].redeemed,
          });
          return;
        }
        const pool = unassignedByMeal[meal.label] || [];
        if (pool.length) {
          const used = pool.shift();
          normalized.push({
            ...used,
            memberId,
            memberName,
            meal: meal.label,
            redeemed: !!used?.redeemed,
          });
          return;
        }
        normalized.push({
          day: 'Day 1',
          meal: meal.label,
          memberId,
          memberName,
          qr: `${team.teamName}::${encodeURIComponent(String(memberId))}::${meal.code}::${makeId()}`,
          redeemed: false,
        });
      });
    });

    try{ localStorage.setItem(keyEnc, JSON.stringify(normalized)); localStorage.setItem(keyPlain, JSON.stringify(normalized)); }catch(e){}
    return normalized;
  };

  const openTeam = (team:any) => {
    setSelectedTeam(team);
    const arr = ensureCouponsForTeam(team);
    setTeamCoupons(arr);
    const first = (team.members || [])[0];
    if (first) {
      const id = first.registrationNumber || first.email || first.name;
      setSelectedMemberId(id);
      const mealOrder = new Map(mealsDef.map((m, i) => [m.label, i]));
      const couponsForMember = (arr||[])
        .filter((c:any)=>String(c.memberId)===String(id))
        .sort((a:any, b:any) => (mealOrder.get(a.meal) ?? 999) - (mealOrder.get(b.meal) ?? 999));
      setIndividualEditor({ memberId: id, memberName: first.name||first.registrationNumber||first.email, teamName: team.teamName, coupons: couponsForMember });
    } else {
      setSelectedMemberId(null);
      setIndividualEditor(null);
    }
  };

  const saveTeamCoupons = () => {
    if(!selectedTeam || !teamCoupons) return;
    const key = makeKey(selectedTeam.teamName);
    try{
      localStorage.setItem(key, JSON.stringify(teamCoupons));
      localStorage.setItem(`idCardsCertificates_${selectedTeam.teamName}`, JSON.stringify(teamCoupons));
      syncCouponsBackend(String(selectedTeam.teamName || ''), teamCoupons);
      // persist then close modal
      setSelectedTeam(null);
      setTeamCoupons(null);
      setIndividualEditor(null);
      setSelectedMemberId(null);
      alert('Saved');
    }catch(e){ alert('Save failed'); }
  };

  const updateCouponRedeemed = (memberId:string, meal:string, redeemed:boolean) => {
    if (!teamCoupons) return;
    const updated = teamCoupons.map((t:any)=>{
      if(String(t.memberId)===String(memberId) && t.meal===meal){
        return { ...t, redeemed: !!redeemed };
      }
      return t;
    });
    setTeamCoupons(updated);
  };

  const saveSingleCoupon = (memberId:string, meal:string) => {
    if(!selectedTeam || !teamCoupons) return;
    const updated = [...teamCoupons];
    try{
      const key = makeKey(selectedTeam.teamName);
      localStorage.setItem(key, JSON.stringify(updated));
      localStorage.setItem(`idCardsCertificates_${selectedTeam.teamName}`, JSON.stringify(updated));
      syncCouponsBackend(String(selectedTeam.teamName || ''), updated);
      setTeamCoupons(updated);
      alert('Saved');
    }catch(e){ alert('Save failed'); }
  };

  const saveSingleCouponForEditor = (index:number) => {
    if(!individualEditor || !teamCoupons) return;
    const c = individualEditor.coupons?.[index];
    if(!c) return;
    const teamName = individualEditor.teamName || selectedTeam?.teamName;
    if(!teamName) return;
    const updated = teamCoupons.map((t:any)=>{
      if(String(t.memberId)===String(individualEditor.memberId) && t.meal===c.meal){
        return { ...t, redeemed: !!c.redeemed };
      }
      return t;
    });
    try{
      const key = makeKey(teamName);
      localStorage.setItem(key, JSON.stringify(updated));
      localStorage.setItem(`idCardsCertificates_${teamName}`, JSON.stringify(updated));
      syncCouponsBackend(String(teamName || ''), updated);
      setTeamCoupons(updated);
      alert('Saved');
    }catch(e){ alert('Save failed'); }
  };

  const openMember = (member:any) => {
    const id = member.registrationNumber || member.email || member.name;
    setSelectedMemberId(id);
    // Ensure we have team coupons loaded for the team
    let team = selectedTeam;
    if(!team && member.teamName){ team = scopedRegistered.find(r=>r.teamName === member.teamName) || null; }
    let arr = teamCoupons;
    if(!arr && team){ arr = ensureCouponsForTeam(team); setTeamCoupons(arr); }
    const couponsForMember = (arr||[]).filter((c:any)=>String(c.memberId)===String(id));
    // If no coupons found (edge case), normalize and try again
    const normalizedAll = team ? ensureCouponsForTeam(team) : [];
    const finalCouponsRaw = couponsForMember.length ? couponsForMember : normalizedAll.filter((c:any)=>String(c.memberId)===String(id));
    if (!couponsForMember.length && normalizedAll.length) {
      setTeamCoupons(normalizedAll);
    }
    const mealOrder = new Map(mealsDef.map((m, i) => [m.label, i]));
    const finalCoupons = [...finalCouponsRaw].sort((a:any, b:any) => (mealOrder.get(a.meal) ?? 999) - (mealOrder.get(b.meal) ?? 999));
    setIndividualEditor({ memberId: id, memberName: member.name||member.registrationNumber||member.email, teamName: team?.teamName || member.teamName, coupons: finalCoupons });
  };

  const openIndividualModal = (member:any) => {
    const team = scopedRegistered.find((r:any)=>String(r.teamName)===String(member.teamName));
    if(!team) return;

    // Close team modal state if any.
    setSelectedTeam(null);
    setTeamCoupons(null);
    setSelectedMemberId(null);
    setIndividualEditor(null);

    const all = ensureCouponsForTeam(team);
    const id = member.registrationNumber || member.email || member.name;
    const mealOrder = new Map(mealsDef.map((m, i) => [m.label, i]));
    const couponsForMember = (all||[])
      .filter((c:any)=>String(c.memberId)===String(id))
      .sort((a:any, b:any) => (mealOrder.get(a.meal) ?? 999) - (mealOrder.get(b.meal) ?? 999));

    setIndividualModalAllCoupons(all);
    setIndividualModal({
      teamName: team.teamName,
      memberId: id,
      memberName: member.name || member.registrationNumber || member.email,
      coupons: couponsForMember,
    });
  };

  const updateIndividualModalRedeemed = (meal:string, redeemed:boolean) => {
    if(!individualModal) return;
    setIndividualModal((prev:any)=>{
      if(!prev) return prev;
      const nextCoupons = [...(prev.coupons || [])];
      const idx = nextCoupons.findIndex((c:any)=>c.meal===meal);
      if(idx>=0) nextCoupons[idx] = { ...nextCoupons[idx], redeemed: !!redeemed };
      return { ...prev, coupons: nextCoupons };
    });
    setIndividualModalAllCoupons((prev:any[]|null)=>{
      if(!prev) return prev;
      return prev.map((c:any)=>{
        if(String(c.memberId)===String(individualModal.memberId) && c.meal===meal){
          return { ...c, redeemed: !!redeemed };
        }
        return c;
      });
    });
  };

  const saveIndividualModalCoupon = (meal:string) => {
    if(!individualModal || !individualModalAllCoupons) return;
    const teamName = individualModal.teamName;
    if(!teamName) return;
    try{
      const key = makeKey(teamName);
      localStorage.setItem(key, JSON.stringify(individualModalAllCoupons));
      localStorage.setItem(`idCardsCertificates_${teamName}`, JSON.stringify(individualModalAllCoupons));
      syncCouponsBackend(String(teamName || ''), individualModalAllCoupons);
      closeIndividualModal();
      alert('Saved');
    }catch(e){
      alert('Save failed');
    }
  };

  const saveIndividual = () => {
    if(!selectedTeam || !individualEditor) return;
    const all = ensureCouponsForTeam(selectedTeam);
    const updated = all.map((c:any) => {
      if(String(c.memberId) === String(individualEditor.memberId)){
        const found = individualEditor.coupons.find((x:any)=>x.meal===c.meal);
        return found ? { ...c, redeemed: !!found.redeemed } : c;
      }
      return c;
    });
    try{ const key = makeKey(selectedTeam.teamName); localStorage.setItem(key, JSON.stringify(updated)); localStorage.setItem(`idCardsCertificates_${selectedTeam.teamName}`, JSON.stringify(updated)); syncCouponsBackend(String(selectedTeam.teamName || ''), updated); setTeamCoupons(updated); alert('Saved'); setIndividualEditor(null); }catch(e){ alert('Save failed'); }
  };

  // Individuals list flattened
  const individuals = useMemo(()=> scopedRegistered.flatMap(t => (t.members||[]).map((m:any, idx:number)=>({
    ...m,
    couponMemberId: getCouponMemberId(m, idx),
    teamName: t.teamName,
    campus: m.campus|| (t.members||[])[0]?.campus,
    memberKey: m.email || m.registrationNumber || idx,
  }))), [registered]);
  const uniqueStays = useMemo(()=> Array.from(new Set(individuals.map((m:any)=>m.stay).filter(Boolean))), [individuals]);

  const filteredTeams = scopedRegistered.filter((t: any) => {
    const camp = (t.members || [])[0]?.campus || '';
    if (campusFilter !== 'All' && camp !== campusFilter) return false;
    if (domainFilter !== 'All' && normalizeDomain(t.domain) !== String(domainFilter)) return false;
    if (teamSizeFilter !== 'All') {
      const size = (t.members || []).length;
      if (teamSizeFilter === '3' && size !== 3) return false;
      if (teamSizeFilter === '4' && size !== 4) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      const lead = ((t.members || [])[0]?.name || '').toLowerCase();
      if (!String(t.teamName || '').toLowerCase().includes(q) && !lead.includes(q)) return false;
    }
    if (venueFilter !== 'All' && getVenueForTeam(t.teamName) !== venueFilter) return false;
    if (attendanceFilter !== 'All' && getTeamAttendance(t.teamName) !== attendanceFilter) return false;
    if (spocFilter !== 'All' && getSpocForTeam(t.teamName) !== spocFilter) return false;
    return true;
  });

  const filteredIndividuals = individuals.filter((m: any) => {
    if (campusFilter !== 'All' && m.campus !== campusFilter) return false;
    if (stayFilter !== 'All' && m.stay !== stayFilter) return false;
    if (venueFilter !== 'All' && getVenueForTeam(m.teamName) !== venueFilter) return false;
    if (spocFilter !== 'All' && getSpocForTeam(m.teamName) !== spocFilter) return false;
    if (attendanceFilter !== 'All' && getMemberAttendanceDisplay(m.teamName, String(m.memberKey)) !== attendanceFilter) return false;
    if (dinnerRedeemFilter !== 'All' && getMemberMealStatus(m.teamName, String(m.couponMemberId), 'ID Cards') !== dinnerRedeemFilter) return false;
    if (lunchRedeemFilter !== 'All' && getMemberMealStatus(m.teamName, String(m.couponMemberId), 'Certificates') !== lunchRedeemFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = String(m.name || '').toLowerCase();
      const teamName = String(m.teamName || '').toLowerCase();
      const reg = String(m.registrationNumber || '').toLowerCase();
      const email = String(m.email || '').toLowerCase();
      const phoneNumber = String(m.phoneNumber || '').toLowerCase();
      const phone = String((m as any).phone || '').toLowerCase();
      if (!name.includes(q) && !teamName.includes(q) && !reg.includes(q) && !email.includes(q) && !phoneNumber.includes(q) && !phone.includes(q)) return false;
    }
    return true;
  });

  return (
    <main className="min-h-screen bg-antique p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gitam-700">ID Card & Certificates - Admin</h1>
            <button
              onClick={() => router.push(isSpocView ? '/spoc/dashboard' : '/admin/dashboard')}
              className="hh-btn-outline px-4 py-2 border-2"
            >
              ← Back to dashboard
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-4 mb-6">
          <div className="flex gap-2">
            <button 
              onClick={()=>setTab('teams')} 
              className={`px-6 py-2 rounded-lg font-semibold transition ${tab==='teams' ? 'bg-gitam-700 text-antique shadow':'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}>
              Teams
            </button>
            <button 
              onClick={()=>setTab('individuals')} 
              className={`px-6 py-2 rounded-lg font-semibold transition ${tab==='individuals' ? 'bg-gitam-700 text-antique shadow':'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}>
              Individuals
            </button>
          </div>
        </div>

        {tab==='teams' && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-gitam-300 p-6">
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-3">
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Campus</label>
                <select value={campusFilter} onChange={(e)=>setCampusFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueCampuses.map((c:any)=>(<option key={c}>{c}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Domain</label>
                <select value={domainFilter} onChange={(e)=>setDomainFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueDomains.map((d:any)=>(<option key={d}>{d}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Team Size</label>
                <select value={teamSizeFilter} onChange={(e)=>setTeamSizeFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option><option>3</option><option>4</option></select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Attendance</label>
                <select value={attendanceFilter} onChange={(e)=>setAttendanceFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option><option>Present</option><option>Absent</option></select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">SPOC</label>
                <select value={spocFilter} onChange={(e)=>setSpocFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueSpocs.map((s:any)=>(<option key={s}>{s}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Venue</label>
                <select value={venueFilter} onChange={(e)=>setVenueFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueVenues.map((v:any)=>(<option key={v}>{v}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Search</label>
                <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by team name or lead" className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition" />
              </div>
            </div>

            <div className="mb-3 text-sm text-gitam-700/80">Showing {filteredTeams.length} teams</div>

            <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300">
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Campus</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Domain</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Lead</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Size</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Venue</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">SPOC</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Attendance</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">ID Cards Redeemed</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Certificates Redeemed</th>
                    <th className="p-3 text-left font-semibold text-gitam-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((t:any,i:number)=> (
                    <tr key={i} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100 transition-colors">
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{(t.members||[])[0]?.campus||'-'}</td>
                      <td className="p-3 border-r border-gitam-200"><div className="truncate" title={normalizeDomain(t.domain)||''}>{normalizeDomain(t.domain)||'-'}</div></td>
                      <td className="p-3 border-r border-gitam-200"><div className="truncate" title={t.teamName}>{t.teamName}</div></td>
                      <td className="p-3 border-r border-gitam-200"><div className="truncate" title={(t.members||[])[0]?.name||''}>{(t.members||[])[0]?.name||'-'}</div></td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap text-center">{(t.members||[]).length}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getVenueForTeam(t.teamName)}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getSpocForTeam(t.teamName)}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getTeamAttendance(t.teamName)}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getMealRedeemedCountForTeam(t.teamName, 'ID Cards')}/{(t.members||[]).length}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getMealRedeemedCountForTeam(t.teamName, 'Certificates')}/{(t.members||[]).length}</td>
                      <td className="p-3"><button onClick={()=>openTeam(t)} className="px-4 py-2 bg-gitam-700 text-antique rounded-lg hover:bg-gitam-600 transition-colors">Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

            {tab==='individuals' && (
          <div className="bg-white rounded-xl shadow-lg border-2 border-gitam-300 p-6">
            <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-8 gap-3">
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Campus</label>
                <select value={campusFilter} onChange={(e)=>setCampusFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueCampuses.map((c:any)=>(<option key={c}>{c}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Stay</label>
                <select value={stayFilter} onChange={(e)=>setStayFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueStays.map((s:any)=>(<option key={s}>{s}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Venue</label>
                <select value={venueFilter} onChange={(e)=>setVenueFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueVenues.map((v:any)=>(<option key={v}>{v}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">SPOC</label>
                <select value={spocFilter} onChange={(e)=>setSpocFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option>{uniqueSpocs.map((s:any)=>(<option key={s}>{s}</option>))}</select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Attendance</label>
                <select value={attendanceFilter} onChange={(e)=>setAttendanceFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option><option>Present</option><option>Absent</option></select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">ID Cards</label>
                <select value={dinnerRedeemFilter} onChange={(e)=>setDinnerRedeemFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option><option>Redeemed</option><option>Not redeemed</option></select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Certificates</label>
                <select value={lunchRedeemFilter} onChange={(e)=>setLunchRedeemFilter(e.target.value)} className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"><option>All</option><option>Redeemed</option><option>Not redeemed</option></select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gitam-700 mb-1">Search</label>
                <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by team, name, email, reg, phone" className="w-full px-3 py-2 border-2 border-gitam-200 rounded-lg focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition" />
              </div>
            </div>

            <div className="mb-3 text-sm text-gitam-700/80">Showing {filteredIndividuals.length} individuals</div>

            <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300">
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Campus</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Name</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Email</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Reg No</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Phone No</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Stay</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Venue</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">SPOC</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Attendance</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">ID Cards Redeemed</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Certificates Redeemed</th>
                    <th className="p-3 text-left font-semibold text-gitam-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIndividuals.map((m:any, idx:number)=> (
                    <tr key={idx} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100 transition-colors">
                      <td className="p-3 border-r border-gitam-200">{m.campus||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.teamName||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.name||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.email||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.registrationNumber||'-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.phoneNumber || (m as any).phone || '-'}</td>
                      <td className="p-3 border-r border-gitam-200">{m.stay||'-'}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getVenueForTeam(m.teamName)}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getSpocForTeam(m.teamName)}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getMemberAttendanceDisplay(m.teamName, String(m.memberKey))}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getMemberMealStatus(m.teamName, String(m.couponMemberId), 'ID Cards')}</td>
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">{getMemberMealStatus(m.teamName, String(m.couponMemberId), 'Certificates')}</td>
                      <td className="p-3"><div className="flex gap-2"><button onClick={()=>openIndividualModal(m)} className="px-4 py-2 bg-gitam-700 text-antique rounded-lg hover:bg-gitam-600 transition-colors">Open</button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        )}

      </div>
      {/* Modals */}
      {individualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border-2 border-gitam-300 p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-gitam-700">{individualModal.memberName} — {individualModal.memberId}</h3>
                <div className="text-sm text-gitam-600">Team: {individualModal.teamName}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={closeIndividualModal} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">Close</button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gitam-100 border-b-2 border-gitam-300">
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200 w-28">Itinerary</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Status</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(individualModal.coupons || []).map((c:any, i:number) => (
                    <tr key={`${c.meal}_${i}`} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100 transition-colors">
                      <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                        <div className="font-semibold text-gitam-700">{c.meal}</div>
                      </td>
                      <td className="p-3 border-r border-gitam-200">
                        <select
                          value={c.redeemed ? 'redeemed' : 'not'}
                          onChange={(e)=>updateIndividualModalRedeemed(c.meal, e.target.value === 'redeemed')}
                          className="w-full px-3 py-2 rounded-lg border-2 border-gitam-200 bg-white text-gitam-700 focus:outline-none focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"
                        >
                          <option value="not">Not redeemed</option>
                          <option value="redeemed">Redeemed</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <button onClick={()=>saveIndividualModalCoupon(c.meal)} className="px-4 py-2 bg-gitam-700 text-antique rounded-lg hover:bg-gitam-600 transition-colors">Save</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedTeam && teamCoupons && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border-2 border-gitam-300 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gitam-700">{selectedTeam.teamName} — ID Card &amp; Certificates</h3>
              <div className="flex gap-2">
                <button onClick={() => { setSelectedTeam(null); setTeamCoupons(null); setIndividualEditor(null); setSelectedMemberId(null); }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors">Cancel</button>
                <button onClick={() => { saveTeamCoupons(); }} className="px-4 py-2 bg-gitam-700 text-antique rounded-lg hover:bg-gitam-600 transition-colors">Save All</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                  {(selectedTeam.members||[]).map((m:any, idx:number) => {
                    const id = m.registrationNumber || m.email || m.name;
                    return (
                      <div
                        key={idx}
                        className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${selectedMemberId === id ? 'border-gitam-600 bg-gitam-50' : 'border-gitam-200 hover:border-gitam-400'}`}
                        onClick={() => openMember(m)}
                      >
                        <div className="font-semibold text-gitam-700">Member {idx+1}: {m.name || '-'}</div>
                        <div className="text-sm text-gitam-600">Reg: {m.registrationNumber||'-'}</div>
                        <div className="text-sm text-gitam-600">Email: {m.email||'-'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-2">
                {individualEditor ? (
                  <div className="p-4 border-2 border-gitam-300 rounded-lg bg-white">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div>
                        <div className="font-semibold text-gitam-700 text-lg">{individualEditor.memberName} — Itinerary</div>
                        <div className="text-sm text-gitam-600">Select redeemed status and click Save per item.</div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border-2 border-gitam-300">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-gitam-100 border-b-2 border-gitam-300">
                            <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200 w-28">Itinerary</th>
                            <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Status</th>
                            <th className="p-3 text-left font-semibold text-gitam-700 w-20">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(individualEditor.coupons || []).map((c:any, i:number) => (
                            <tr key={`${c.meal}_${i}`} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100 transition-colors">
                              <td className="p-3 border-r border-gitam-200 whitespace-nowrap">
                                <div className="font-semibold text-gitam-700">{c.meal}</div>
                              </td>
                              <td className="p-3 border-r border-gitam-200">
                                <select
                                  value={c.redeemed ? 'redeemed' : 'not'}
                                  onChange={(e)=>{
                                    const redeemed = e.target.value === 'redeemed';
                                    updateCouponRedeemed(String(individualEditor.memberId), c.meal, redeemed);
                                    const copy = { ...individualEditor };
                                    copy.coupons = [...(copy.coupons || [])];
                                    copy.coupons[i] = { ...copy.coupons[i], redeemed };
                                    setIndividualEditor(copy);
                                  }}
                                  className="w-full px-3 py-2 rounded-lg border-2 border-gitam-200 bg-white text-gitam-700 focus:outline-none focus:border-gitam-600 focus:ring-2 focus:ring-gitam/25 transition"
                                >
                                  <option value="not">Not redeemed</option>
                                  <option value="redeemed">Redeemed</option>
                                </select>
                              </td>
                              <td className="p-3">
                                <button onClick={()=>saveSingleCoupon(String(individualEditor.memberId), c.meal)} className="px-4 py-2 bg-gitam-700 text-antique rounded-lg hover:bg-gitam-600 transition-colors">Save</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gitam-600 p-4">Select a member on the left to view itinerary.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}



