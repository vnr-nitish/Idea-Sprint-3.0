 'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { deleteMember as deleteMemberBackend, deleteTeamAndMembers, listTeamsWithMembers, syncTeamMembers, syncTeamUsersPassword, updateTeam } from '@/lib/teamsBackend';
import { deleteAllNocForTeam } from '@/lib/nocBackend';
import { deleteAllPptForTeam } from '@/lib/pptBackend';
import { listReportingAssignments } from '@/lib/reportingBackend';
import { filterTeamsForSpoc, getStoredSpocUser, isSpocLoggedIn, SpocUser } from '@/lib/spocSession';

export default function TeamProfilesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isSpocView = (pathname || '').startsWith('/spoc');
  const [spocUser, setSpocUser] = useState<SpocUser | null>(null);
  const [registered, setRegistered] = useState<any[]>([]);
  const [campusFilter, setCampusFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [domainFilter, setDomainFilter] = useState('All');
  const [teamSizeFilter, setTeamSizeFilter] = useState('All');
  const [teamFilter, setTeamFilter] = useState('All');
  const [programFilter, setProgramFilter] = useState('All');
  const [schoolFilter, setSchoolFilter] = useState('All');
  const [positionFilter, setPositionFilter] = useState('All');
  const [stayFilter, setStayFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState<'teams'|'individuals'>('teams');
  const [attendanceFilter, setAttendanceFilter] = useState('All');
  const [teamAttendance, setTeamAttendance] = useState<Record<string, string>>({});
  const [memberAttendance, setMemberAttendance] = useState<Record<string, string>>({});
  const [draftTeamAttendance, setDraftTeamAttendance] = useState<Record<string, string>>({});
  const [draftMemberAttendance, setDraftMemberAttendance] = useState<Record<string, string>>({});
  const [venueFilter, setVenueFilter] = useState('All');
  const [spocFilter, setSpocFilter] = useState('All');
  const [teamLeadOverrides, setTeamLeadOverrides] = useState<Record<string, string>>({});
  const [reportingAssignmentsMap, setReportingAssignmentsMap] = useState<Record<string, any>>({});
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

  const [editingTeamIndex, setEditingTeamIndex] = useState<number | null>(null);
  const [teamDraft, setTeamDraft] = useState<any | null>(null);
  const [selectedMemberIndex, setSelectedMemberIndex] = useState<number>(0);
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [isResyncingAll, setIsResyncingAll] = useState(false);
  const [resyncAllStatus, setResyncAllStatus] = useState('');

  // Keep these in sync with registration dropdowns in app/register/MemberField.tsx
  const registrationCampusOptions = ['Visakhapatnam', 'Hyderabad', 'Bangalore'];
  const registrationSchoolOptions = [
    'School of CSE',
    'School of Core Engineering',
    'School of Science',
    'School of Business',
    'School of Humanities',
    'School of Architecture',
    'School of Law',
    'School of Pharmacy',
    'Others',
  ];
  const registrationProgramOptions = ['B.Tech', 'M.Tech', 'B.Sc', 'M.Sc', 'BBA', 'MBA', 'Others'];
  const registrationYearOptions = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
  const DOMAIN_OPTIONS = [
    'App Development',
    'Cyber Security',
    'AI',
    'ML & DS'
  ];

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

  const normalizeDomain = (value: any) => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'app development') return 'App Development';
    if (raw === 'cybersecurity' || raw === 'cyber security') return 'Cyber Security';
    if (raw === 'artificial intelligence' || raw === 'ai') return 'AI';
    if (raw === 'machine learning and data science' || raw === 'ml & data science' || raw === 'ml & ds') return 'ML & DS';
    return String(value);
  };

  const canonicalTeamKey = (teamName: string) => String(teamName || '').trim().toLowerCase();

  const buildReportingAssignmentsIndex = (map: Record<string, any>) => {
    const index: Record<string, any> = {};
    Object.entries(map || {}).forEach(([teamName, assignment]) => {
      const key = canonicalTeamKey(teamName);
      if (key) index[key] = assignment;
    });
    return index;
  };

  const mergeReportingAssignmentsSafely = (
    localAssignments: Record<string, any>,
    remoteAssignments: Record<string, any>,
  ): Record<string, any> => {
    const merged: Record<string, any> = { ...(localAssignments || {}) };
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
        spoc: {
          name: String(remote?.spoc?.name || local?.spoc?.name || ''),
          email: String(remote?.spoc?.email || local?.spoc?.email || ''),
          phone: String(remote?.spoc?.phone || local?.spoc?.phone || ''),
        },
      };
    });
    return merged;
  };

  const reportingAssignmentsIndex = buildReportingAssignmentsIndex(reportingAssignmentsMap);

  useEffect(() => {
    if (!isSpocView) return;
    if (!isSpocLoggedIn()) {
      router.push('/spoc');
      return;
    }
    setSpocUser(getStoredSpocUser());
  }, [isSpocView, router]);

  const scopedRegistered = isSpocView
    ? filterTeamsForSpoc(registered, reportingAssignmentsMap, spocUser)
    : registered;

  const reloadRegistered = async () => {
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
  };

  useEffect(() => {
    reloadRegistered();
    // Load attendance from localStorage
    try {
      const loadedTeamAttendance: Record<string, string> = {};
      const loadedMemberAttendance: Record<string, string> = {};
      const teams = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
      teams.forEach((t: any) => {
        const teamKey = `team_attendance_${t.teamName}`;
        const stored = localStorage.getItem(teamKey);
        if (stored) {
          loadedTeamAttendance[t.teamName] = stored;
        }
        // Load member-level overrides
        (t.members || []).forEach((m: any, idx: number) => {
          const memberKey = `member_attendance_${t.teamName}_${m.email || m.registrationNumber || idx}`;
          const memberStored = localStorage.getItem(memberKey);
          if (memberStored) {
            loadedMemberAttendance[memberKey] = memberStored;
          }
        });
      });
      setTeamAttendance(loadedTeamAttendance);
      setMemberAttendance(loadedMemberAttendance);
    } catch {}

    // Load optional per-team lead overrides
    try {
      const storedLeadOverrides = JSON.parse(localStorage.getItem('teamLeadOverrides') || '{}');
      if (storedLeadOverrides && typeof storedLeadOverrides === 'object') {
        setTeamLeadOverrides(storedLeadOverrides);
      }
    } catch {}

    // Load reporting assignment map for venue/SPOC display in tables and filters.
    let localReportingAssignments: Record<string, any> = {};
    try {
      const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
      if (map && typeof map === 'object') {
        localReportingAssignments = map;
        setReportingAssignmentsMap(map);
      }
    } catch {}

    if (isSupabaseConfigured()) {
      void (async () => {
        try {
          const remoteAssignments = await listReportingAssignments();
          if (remoteAssignments && typeof remoteAssignments === 'object') {
            const merged = mergeReportingAssignmentsSafely(localReportingAssignments, remoteAssignments as Record<string, any>);
            setReportingAssignmentsMap(merged);
            localStorage.setItem('reportingAssignments', JSON.stringify(merged));
          }
        } catch {
          // Keep local fallback.
        }
      })();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key && event.key !== 'reportingAssignments') return;
      try {
        const map = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
        if (map && typeof map === 'object') {
          setReportingAssignmentsMap(map);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      if (editingTeamIndex === null) {
        void reloadRegistered();
      }
    }, 2000);

    return () => clearInterval(poll);
  }, [editingTeamIndex]);

  useEffect(() => {
    if (editingTeamIndex === null || !teamDraft) return;

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
  }, [editingTeamIndex, teamDraft]);

  const getMemberIdentity = (member: any, fallbackIndex: number): string => {
    return String(
      member?.email ||
      member?.registrationNumber ||
      member?.phoneNumber ||
      member?.name ||
      `idx_${fallbackIndex}`
    )
      .trim()
      .toLowerCase();
  };

  const saveTeamLeadOverrides = (next: Record<string, string>) => {
    setTeamLeadOverrides(next);
    try {
      localStorage.setItem('teamLeadOverrides', JSON.stringify(next));
    } catch {}
  };

  const setTeamLead = (teamName: string, members: any[], leadIndex: number) => {
    const safeMembers = Array.isArray(members) ? members : [];
    const leadMember = safeMembers[leadIndex];
    if (!teamName || !leadMember) return;
    const leadKey = getMemberIdentity(leadMember, leadIndex);
    saveTeamLeadOverrides({ ...teamLeadOverrides, [teamName]: leadKey });

    // Keep selected lead at index 0 so other pages/tables reading members[0] stay in sync after save.
    if (teamDraft && String(teamDraft.teamName || '').trim() === String(teamName).trim()) {
      const nextMembers = [leadMember, ...safeMembers.filter((_: any, idx: number) => idx !== leadIndex)];
      setTeamDraft({ ...teamDraft, members: nextMembers });
      setSelectedMemberIndex(0);
    }
  };

  const getLeadMember = (team: any): any => {
    const members = Array.isArray(team?.members) ? team.members : [];
    if (!members.length) return null;
    const teamName = String(team?.teamName || '').trim();
    const overrideKey = teamLeadOverrides[teamName];
    if (!overrideKey) return members[0];
    const matched = members.find((m: any, idx: number) => getMemberIdentity(m, idx) === overrideKey);
    return matched || members[0];
  };

  const openTeamEditor = (team:any, initialMemberIndex: number = 0) => {
    const idx = registered.findIndex((r:any) => String(r.teamName) === String(team.teamName));
    if (idx === -1) {
      alert('Team not found');
      return;
    }
    setEditingTeamIndex(idx);
    try {
      const copy = JSON.parse(JSON.stringify(registered[idx]));
      copy.domain = normalizeDomain(copy.domain);
      const overrideKey = teamLeadOverrides[String(copy.teamName || '').trim()];
      if (overrideKey && Array.isArray(copy.members)) {
        const leadIdx = copy.members.findIndex((m: any, i: number) => getMemberIdentity(m, i) === overrideKey);
        if (leadIdx > 0) {
          const leadMember = copy.members[leadIdx];
          const rest = copy.members.filter((_: any, i: number) => i !== leadIdx);
          copy.members = [leadMember, ...rest];
        }
      }
      setTeamDraft(copy);
    } catch {
      setTeamDraft({ ...registered[idx], domain: normalizeDomain(registered[idx]?.domain) });
    }
    setSelectedMemberIndex(Math.max(0, initialMemberIndex || 0));
  };

  const closeTeamEditor = () => {
    setEditingTeamIndex(null);
    setTeamDraft(null);
    setSelectedMemberIndex(0);
  };

  const persistRegistered = (next:any[]) => {
    setRegistered(next);
    if (!isSupabaseConfigured()) {
      try { localStorage.setItem('registeredTeams', JSON.stringify(next)); } catch { }
    }
  };

  const validateMemberRequired = (member: any): string[] => {
    const m = member || {};
    const missing: string[] = [];
    if (!String(m.name || '').trim()) missing.push('Full Name');
    if (!String(m.registrationNumber || '').trim()) missing.push('Registration Number');
    if (!String(m.email || '').trim()) missing.push('GITAM Mail');
    if (!String(m.phoneNumber || '').trim()) missing.push('Phone Number');
    if (!String(m.school || '').trim()) missing.push('School');
    if (!String(m.program || '').trim()) missing.push('Program');
    if (String(m.program || '').trim() === 'Others' && !String(m.programOther || '').trim()) missing.push('Program (Other)');
    if (!String(m.branch || '').trim()) missing.push('Branch');
    if (!String(m.campus || '').trim()) missing.push('Campus');
    if (!String(m.yearOfStudy || '').trim()) missing.push('Year of Study');
    if (!String(m.stay || '').trim()) missing.push('Stay Type');
    return missing;
  };

  const saveMember = async (memberIdx:number) => {
    if (editingTeamIndex === null || !teamDraft) return;
    const members = Array.isArray(teamDraft.members) ? teamDraft.members : [];
    const missing = validateMemberRequired(members[memberIdx]);
    if (missing.length > 0) {
      alert(`Please fill all mandatory fields before saving. Missing: ${missing.join(', ')}`);
      return;
    }

    if (isSupabaseConfigured() && teamDraft.teamId) {
      try {
        if (teamDraft.domain !== undefined) {
          await updateTeam(String(teamDraft.teamId), { domain: teamDraft.domain, teamName: teamDraft.teamName });
        }
        await syncTeamMembers(String(teamDraft.teamId), members);

        const teamPassword = String(teamDraft.teamPassword || registered[editingTeamIndex]?.teamPassword || '').trim();
        if (teamPassword) {
          try {
            const synced = await syncTeamUsersPassword(String(teamDraft.teamId), teamPassword, { retries: 3 });
            if (!synced) {
              alert('Team data was saved, but member login sync failed. Please click Save again or check server env keys.');
            }
          } catch {
            alert('Team data was saved, but member login sync failed. Please click Save again or check server env keys.');
          }
        }

        await reloadRegistered();
        alert('Saved');
        return;
      } catch (e:any) {
        console.warn(e);
        alert(e?.message || 'Could not save to Supabase');
        return;
      }
    }

    const next = [...registered];
    const baseTeam = next[editingTeamIndex] || {};
    const draftMembers = Array.isArray(teamDraft.members) ? teamDraft.members : [];
    const nextMembers = draftMembers.map((m: any) => ({ ...(m || {}) }));
    next[editingTeamIndex] = { ...baseTeam, members: nextMembers, teamName: teamDraft.teamName, domain: teamDraft.domain };
    persistRegistered(next);
    alert('Saved');
  };

  const saveAllMembers = async () => {
    if (editingTeamIndex === null || !teamDraft) return;

    const members = Array.isArray(teamDraft.members) ? teamDraft.members : [];
    for (let i = 0; i < members.length; i += 1) {
      const missing = validateMemberRequired(members[i]);
      if (missing.length > 0) {
        alert(`Member ${i + 1} is incomplete. Missing: ${missing.join(', ')}`);
        return;
      }
    }

    if (isSupabaseConfigured() && teamDraft.teamId) {
      try {
        const oldTeamName = String(registered[editingTeamIndex]?.teamName || '').trim();
        const newTeamName = String(teamDraft.teamName || '').trim();
        await updateTeam(String(teamDraft.teamId), { domain: teamDraft.domain, teamName: teamDraft.teamName });
        // Migrate reporting assignment if team name changed
        if (oldTeamName && newTeamName && oldTeamName !== newTeamName) {
          try {
            const assignments = JSON.parse(localStorage.getItem('reportingAssignments') || '{}');
            if (assignments[oldTeamName]) {
              assignments[newTeamName] = assignments[oldTeamName];
              delete assignments[oldTeamName];
              localStorage.setItem('reportingAssignments', JSON.stringify(assignments));
              setReportingAssignmentsMap((prev: any) => {
                const next = { ...prev };
                if (next[oldTeamName]) {
                  next[newTeamName] = next[oldTeamName];
                  delete next[oldTeamName];
                }
                return next;
              });
            }
          } catch {}
        }
        await syncTeamMembers(String(teamDraft.teamId), members);

        // Best effort: update/create auth users for all current member emails so login works for new members too.
        const teamPassword = String(teamDraft.teamPassword || registered[editingTeamIndex]?.teamPassword || '').trim();
        if (teamPassword) {
          try {
            const synced = await syncTeamUsersPassword(String(teamDraft.teamId), teamPassword, { retries: 3 });
            if (!synced) {
              alert('Team data was saved, but member login sync failed. Please click Save again or check server env keys.');
            }
          } catch {
            alert('Team data was saved, but member login sync failed. Please click Save again or check server env keys.');
          }
        }

        await reloadRegistered();
        closeTeamEditor();
        alert('Saved');
        return;
      } catch (e:any) {
        console.warn(e);
        alert(e?.message || 'Could not save to Supabase');
        return;
      }
    }

    const next = [...registered];
    next[editingTeamIndex] = { ...next[editingTeamIndex], ...teamDraft };
    persistRegistered(next);
    closeTeamEditor();
    alert('Saved');
  };

  const addMemberToTeam = () => {
    if (!teamDraft) return;
    const currentMembers = Array.isArray(teamDraft.members) ? teamDraft.members : [];
    if (currentMembers.length >= 4) {
      alert('Cannot add more than 4 members to a team');
      return;
    }

    const newMember = {
      name: '',
      registrationNumber: '',
      email: '',
      phoneNumber: '',
      school: '',
      program: '',
      programOther: '',
      branch: '',
      campus: currentMembers[0]?.campus || '',
      yearOfStudy: '',
      stay: ''
    };

    const updatedMembers = [...currentMembers, newMember];
    setTeamDraft({ ...teamDraft, members: updatedMembers });
    setSelectedMemberIndex(updatedMembers.length - 1);
  };

  const deleteMemberFromTeam = () => {
    if (!teamDraft) return;
    const currentMembers = Array.isArray(teamDraft.members) ? teamDraft.members : [];
    if (currentMembers.length <= 3) {
      alert('Cannot have less than 3 members in a team');
      return;
    }

    if (selectedMemberIndex < 0 || selectedMemberIndex >= currentMembers.length) {
      alert('Please select a member to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${currentMembers[selectedMemberIndex]?.name || 'this member'}?`)) {
      return;
    }

    const updatedMembers = currentMembers.filter((_: any, idx: number) => idx !== selectedMemberIndex);
    const nextDraft = { ...teamDraft, members: updatedMembers };
    setTeamDraft(nextDraft);

    // Keep lead valid after member deletion.
    const teamName = String(nextDraft.teamName || '').trim();
    if (teamName && updatedMembers.length > 0) {
      const existingLeadKey = teamLeadOverrides[teamName];
      const leadStillExists = updatedMembers.some((m: any, idx: number) => getMemberIdentity(m, idx) === existingLeadKey);
      if (!leadStillExists) {
        setTeamLead(teamName, updatedMembers, 0);
      }
    }

    setSelectedMemberIndex(Math.max(0, Math.min(selectedMemberIndex, updatedMembers.length - 1)));
  };

  const saveTeamAttendance = (teamName: string, value: string) => {
    if (!value) {
      alert('Please select an attendance status');
      return;
    }
    const key = `team_attendance_${teamName}`;
    localStorage.setItem(key, value);
    setTeamAttendance((prev) => ({ ...prev, [teamName]: value }));
    setDraftTeamAttendance((prev) => {
      const updated = { ...prev };
      delete updated[teamName];
      return updated;
    });
  };

  const saveMemberAttendance = (teamName: string, memberKey: string, value: string) => {
    if (!value) {
      alert('Please select an attendance status');
      return;
    }
    const key = `member_attendance_${teamName}_${memberKey}`;
    localStorage.setItem(key, value);
    setMemberAttendance((prev) => ({ ...prev, [key]: value }));
    setDraftMemberAttendance((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const getMemberAttendanceDisplay = (teamName: string, memberKey: string): string => {
    const memberKey_ = `member_attendance_${teamName}_${memberKey}`;
    const memberOverride = memberAttendance[memberKey_];
    if (memberOverride) return memberOverride;
    return teamAttendance[teamName] || '';
  };

  const getSpocNameFromAssignment = (assignment: any): string => {
    return String(assignment?.spoc?.name || assignment?.name || '').trim();
  };

  const getReportingAssignmentForTeam = (teamName: string): any => {
    const trimmed = String(teamName || '').trim();
    return reportingAssignmentsMap[trimmed] || reportingAssignmentsIndex[canonicalTeamKey(trimmed)] || {};
  };

  const getSpocForTeam = (teamName: string): string => {
    const assignment = getReportingAssignmentForTeam(teamName);
    const spocName = getSpocNameFromAssignment(assignment);
    return spocName || '-';
  };

  const getVenueForTeam = (team: any): string => {
    const teamName = String(team?.teamName || '').trim();
    const reportingVenue = String(getReportingAssignmentForTeam(teamName)?.venue || '').trim();
    if (reportingVenue) return reportingVenue;
    return String(team?.venue || team?.zone || '').trim();
  };

  const bulkSaveAllAttendance = () => {
    let count = 0;
    // Save all draft team attendance
    Object.entries(draftTeamAttendance).forEach(([teamName, value]) => {
      if (value) {
        saveTeamAttendance(teamName, value);
        count++;
      }
    });
    // Save all draft member attendance
    Object.entries(draftMemberAttendance).forEach(([key, value]) => {
      if (value && key.includes('_')) {
        const parts = key.split('_');
        const teamName = parts[2];
        const memberKey = parts.slice(3).join('_');
        saveMemberAttendance(teamName, memberKey, value);
        count++;
      }
    });
    if (count > 0) {
      alert(`Saved ${count} attendance record(s)`);
    } else {
      alert('No pending attendance changes to save');
    }
  };

  const resyncAllTeamLogins = async () => {
    if (isResyncingAll) return;
    if (isSpocView) {
      alert('Only admin can run bulk login resync.');
      return;
    }
    if (!isSupabaseConfigured()) {
      alert('Bulk login resync is available only in Supabase mode.');
      return;
    }

    const proceed = confirm('This will sync Auth passwords for all teams with known team passwords. Continue?');
    if (!proceed) return;

    setIsResyncingAll(true);
    setResyncAllStatus('Preparing team password map...');

    try {
      let localTeams: any[] = [];
      try {
        const parsed = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
        if (Array.isArray(parsed)) localTeams = parsed;
      } catch {
        localTeams = [];
      }

      const passwordByTeamId = new Map<string, string>();
      const passwordByTeamName = new Map<string, string>();

      for (const localTeam of localTeams) {
        const teamId = String(localTeam?.teamId || '').trim();
        const teamName = String(localTeam?.teamName || '').trim();
        const teamPassword = String(localTeam?.teamPassword || '').trim();
        if (!teamPassword) continue;
        if (teamId) passwordByTeamId.set(teamId, teamPassword);
        if (teamName) passwordByTeamName.set(canonicalTeamKey(teamName), teamPassword);
      }

      const targets = Array.isArray(registered) ? registered : [];
      let synced = 0;
      let failed = 0;
      let skipped = 0;
      const failedTeams: string[] = [];
      const skippedTeams: string[] = [];

      for (let i = 0; i < targets.length; i += 1) {
        const team = targets[i] || {};
        const teamId = String(team.teamId || '').trim();
        const teamName = String(team.teamName || '').trim() || `Team ${i + 1}`;
        const directPassword = String(team.teamPassword || '').trim();
        const mappedPassword = teamId
          ? passwordByTeamId.get(teamId)
          : passwordByTeamName.get(canonicalTeamKey(teamName));
        const teamPassword = String(directPassword || mappedPassword || '').trim();

        setResyncAllStatus(`Resyncing ${i + 1}/${targets.length}: ${teamName}`);

        if (!teamId || !teamPassword) {
          skipped += 1;
          skippedTeams.push(teamName);
          continue;
        }

        const ok = await syncTeamUsersPassword(teamId, teamPassword, { retries: 3 });
        if (ok) {
          synced += 1;
        } else {
          failed += 1;
          failedTeams.push(teamName);
        }
      }

      await reloadRegistered();

      const failedPreview = failedTeams.slice(0, 6).join(', ');
      const skippedPreview = skippedTeams.slice(0, 6).join(', ');
      const summary = [
        `Bulk resync completed.`,
        `Synced teams: ${synced}`,
        `Failed teams: ${failed}`,
        `Skipped teams (password unavailable): ${skipped}`,
        failedPreview ? `Failed (first 6): ${failedPreview}` : '',
        skippedPreview ? `Skipped (first 6): ${skippedPreview}` : '',
      ].filter(Boolean).join('\n');

      setResyncAllStatus(`Completed. Synced ${synced}, failed ${failed}, skipped ${skipped}.`);
      alert(summary);
    } catch (e: any) {
      console.warn(e);
      setResyncAllStatus('Bulk resync failed. Please retry.');
      alert(e?.message || 'Bulk resync failed.');
    } finally {
      setIsResyncingAll(false);
    }
  };

  const uniqueCampuses = Array.from(new Set(scopedRegistered.flatMap(t => (t.members||[]).map((m:any)=>m.campus)).filter(Boolean)));
  const uniquePrograms = Array.from(new Set(scopedRegistered.flatMap(t => (t.members||[]).map((m:any)=>m.program)).filter(Boolean)));
  const individualRows = scopedRegistered.flatMap((t:any)=>(t.members||[]).map((m:any,idx:number)=>(
    (() => {
      const leadMember = getLeadMember(t);
      const leadIdentity = leadMember ? getMemberIdentity(leadMember, 0) : '';
      const currentIdentity = getMemberIdentity(m, idx);
      return {
      ...m,
      teamName:t.teamName,
      domain:t.domain,
      venue:getVenueForTeam(t),
      spoc:getSpocForTeam(t.teamName),
      teamSize:(t.members||[]).length,
      memberIndex: idx,
      memberKey: m.email || m.registrationNumber || idx,
      position: leadIdentity && currentIdentity === leadIdentity ? 'Lead' : 'Member',
    };
    })()
  )));
  const uniqueDomains = DOMAIN_OPTIONS;
  const uniqueTeamSizes = [3, 4];
  const uniqueVenues = Array.from(new Set(scopedRegistered.map((t:any)=>getVenueForTeam(t)).filter(Boolean)));
  const uniqueSpocs = Array.from(new Set(scopedRegistered.map((t:any)=>getSpocForTeam(t.teamName)).filter((s:string)=>s && s!=='-')));

  const filteredTeams = scopedRegistered.filter((t:any)=>{
    if (campusFilter !== 'All') {
      const teamCampuses = Array.from(new Set((t.members||[]).map((m:any)=>m.campus)));
      if (!teamCampuses.includes(campusFilter)) return false;
    }
    if (domainFilter !== 'All') {
      if (normalizeDomain(t.domain) !== domainFilter) return false;
    }
    if (teamSizeFilter !== 'All') {
      if ((t.members||[]).length !== parseInt(teamSizeFilter)) return false;
    }
    if (venueFilter !== 'All') {
      const teamVenue = getVenueForTeam(t);
      if (teamVenue !== venueFilter) return false;
    }
    if (spocFilter !== 'All') {
      if (getSpocForTeam(t.teamName) !== spocFilter) return false;
    }
    if (attendanceFilter !== 'All') {
      const saved = teamAttendance[t.teamName];
      if (saved !== attendanceFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const leadName = (getLeadMember(t)?.name || '').toLowerCase();
      if (!(t.teamName||'').toLowerCase().includes(q) && !leadName.includes(q)) return false;
    }
    return true;
  });

  const filteredIndividualsBase = individualRows.filter((m:any)=>{
    if (campusFilter!=='All' && m.campus!==campusFilter) return false;
    if (domainFilter!=='All' && normalizeDomain(m.domain)!==domainFilter) return false;
    if (teamSizeFilter!=='All' && Number(m.teamSize || 0)!==parseInt(teamSizeFilter, 10)) return false;
    if (yearFilter!=='All' && m.yearOfStudy!==yearFilter) return false;
    if (positionFilter!=='All' && String(m.position || 'Member')!==positionFilter) return false;
    if (stayFilter!=='All' && m.stay!==stayFilter) return false;
    if (venueFilter!=='All' && (m.venue || '')!==venueFilter) return false;
    if (spocFilter!=='All' && (m.spoc || '')!==spocFilter) return false;
    if (attendanceFilter !== 'All') {
      const memberDisplay = getMemberAttendanceDisplay(m.teamName, m.memberKey);
      if (memberDisplay !== attendanceFilter) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (
        !(m.name||'').toLowerCase().includes(q) &&
        !(m.email||'').toLowerCase().includes(q) &&
        !(m.registrationNumber||'').toLowerCase().includes(q) &&
        !(m.teamName||'').toLowerCase().includes(q) &&
        !(m.phoneNumber||'').toLowerCase().includes(q) &&
        !(m.branch||'').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const uniqueSchools = Array.from(
    new Set(
      filteredIndividualsBase
        .map((m:any) => String(m.school || '').trim())
        .filter(Boolean)
    )
  );

  const filteredIndividuals = filteredIndividualsBase.filter((m:any) => {
    if (schoolFilter !== 'All' && String(m.school || '').trim() !== schoolFilter) return false;
    return true;
  });

  useEffect(() => {
    if (schoolFilter !== 'All' && !uniqueSchools.includes(schoolFilter)) {
      setSchoolFilter('All');
    }
  }, [schoolFilter, uniqueSchools]);

  const toCsvCell = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const downloadCsv = (fileName: string, headers: string[], rows: any[][]) => {
    const lines = [
      headers.join(','),
      ...rows.map((row) => row.map((v) => toCsvCell(v)).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getTeamAttendanceDisplay = (teamName: string) => {
    return draftTeamAttendance[teamName] !== undefined
      ? draftTeamAttendance[teamName]
      : (teamAttendance[teamName] || '');
  };

  const exportTeamsCsv = (rows: any[]) => {
    const headers = ['Campus', 'Domain', 'Team Name', 'Team Lead', 'Lead Phone', 'Size', 'Venue', 'SPOC', 'Attendance'];
    const body = rows.map((t: any) => {
      const lead = getLeadMember(t);
      return [
        (t.members || [])[0]?.campus || '-',
        normalizeDomain(t.domain) || '-',
        t.teamName || '-',
        lead?.name || '-',
        lead?.phoneNumber || '-',
        (t.members || []).length,
        getVenueForTeam(t) || '-',
        getSpocForTeam(t.teamName) || '-',
        getTeamAttendanceDisplay(String(t.teamName || '')) || '-',
      ];
    });
    downloadCsv('team_profiles_teams.csv', headers, body);
  };

  const exportIndividualsCsv = (rows: any[]) => {
    const headers = ['Campus', 'Domain', 'Team Name', 'Team Size', 'Name', 'Position', 'Email', 'Reg No', 'Phone No', 'Year', 'School', 'Branch', 'Stay', 'Venue', 'SPOC', 'Attendance'];
    const body = rows.map((m: any) => {
      const key = `member_attendance_${m.teamName}_${m.memberKey}`;
      const attendanceValue = draftMemberAttendance[key] !== undefined
        ? draftMemberAttendance[key]
        : (memberAttendance[key] || getMemberAttendanceDisplay(m.teamName, m.memberKey) || '');
      return [
        m.campus || '-',
        normalizeDomain(m.domain) || '-',
        m.teamName || '-',
        m.teamSize || '-',
        m.name || '-',
        m.position || 'Member',
        m.email || '-',
        m.registrationNumber || '-',
        m.phoneNumber || '-',
        m.yearOfStudy || '-',
        m.school || '-',
        m.branch || '-',
        m.stay || '-',
        m.venue || '-',
        m.spoc || '-',
        attendanceValue || '-',
      ];
    });
    downloadCsv('team_profiles_individuals.csv', headers, body);
  };

  const downloadJson = (fileName: string, payload: any) => {
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed');
    }
  };

  const purgeLocalForTeam = (teamName: string) => {
    try {
      const enc = encodeURIComponent(teamName);
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (!k) continue;
        // team-bound keys across the app
        if (
          k === `foodCoupons_${teamName}` ||
          k === `foodCoupons_${enc}` ||
          k.startsWith(`foodCoupons_${enc}`) ||
          k.startsWith(`foodCoupons_${teamName}`) ||
          k.startsWith(`noc_${enc}`) ||
          k.startsWith(`noc_${teamName}`) ||
          k.startsWith(`noc_declared_${enc}`) ||
          k.startsWith(`noc_declared_${teamName}`) ||
          k.startsWith(`noc_deadline_${enc}`) ||
          k.startsWith(`noc_deadline_${teamName}`) ||
          k.startsWith(`ppt_${enc}`) ||
          k.startsWith(`ppt_${teamName}`) ||
          k.startsWith(`ppt_deadline_${enc}`) ||
          k.startsWith(`ppt_deadline_${teamName}`) ||
          k.startsWith(`ppt_deadline_shown_${enc}`) ||
          k.startsWith(`ppt_deadline_shown_${teamName}`)
        ) {
          localStorage.removeItem(k);
        }
      }

      // reporting assignments map uses teamName key
      try {
        const raw = localStorage.getItem('reportingAssignments');
        if (raw) {
          const map = JSON.parse(raw || '{}') || {};
          if (map && typeof map === 'object' && map[teamName]) {
            delete map[teamName];
            localStorage.setItem('reportingAssignments', JSON.stringify(map));
          }
        }
      } catch { }

      // clear currentTeam session if it's this team
      try {
        const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
        if (current?.team?.teamName && String(current.team.teamName) === String(teamName)) {
          localStorage.removeItem('currentTeam');
        }
      } catch { }

      // clear team lead override for removed team
      try {
        const raw = localStorage.getItem('teamLeadOverrides');
        if (raw) {
          const map = JSON.parse(raw || '{}') || {};
          if (map && typeof map === 'object' && map[teamName]) {
            delete map[teamName];
            localStorage.setItem('teamLeadOverrides', JSON.stringify(map));
            setTeamLeadOverrides(map);
          }
        }
      } catch {}
    } catch { }
  };

  const purgeLocalForMember = (teamName: string, member: any) => {
    try {
      const ids = [member?.registrationNumber, member?.email, member?.phoneNumber, member?.name]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      const keys = Object.keys(localStorage);
      const teamEnc = encodeURIComponent(teamName);
      for (const id of ids) {
        const encId = encodeURIComponent(String(id));
        for (const k of keys) {
          if (!k) continue;
          // member-specific NOC keys
          if (
            k === `noc_${teamEnc}_${encId}` ||
            k === `noc_${teamName}_${id}` ||
            k === `noc_declared_${teamEnc}_${encId}` ||
            k === `noc_declared_${teamName}_${id}` ||
            k === `noc_deadline_${teamEnc}_${encId}` ||
            k === `noc_deadline_${teamName}_${id}`
          ) {
            localStorage.removeItem(k);
          }
        }
      }

      // If the currently logged-in session is this member, clear it.
      try {
        const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
        if (current?.team?.teamName && String(current.team.teamName) === String(teamName)) {
          const ident = String(current?.identifier || current?.identifierNormalized || current?.memberId || '').trim();
          if (ident) {
            const match = ids.some((v) => String(v).toLowerCase() === ident.toLowerCase() || String(v).replace(/\D/g, '') === ident.replace(/\D/g, ''));
            if (match) localStorage.removeItem('currentTeam');
          }
        }
      } catch { }
    } catch { }
  };

  const deleteTeam = async (team: any) => {
    const teamName = String(team?.teamName || '').trim();
    if (!teamName) return;
    const ok = confirm(`Delete team "${teamName}"? This will remove the team and all its members.`);
    if (!ok) return;

    if (isSupabaseConfigured() && team?.teamId) {
      try {
        // Best-effort cleanup for uploads tied to this team
        await Promise.all([
          deleteAllNocForTeam(teamName).catch(() => {}),
          deleteAllPptForTeam(String(team.teamId)).catch(() => {}),
        ]);
        await deleteTeamAndMembers(String(team.teamId));
        await reloadRegistered();
        alert('Team deleted');
        return;
      } catch (e: any) {
        console.warn(e);
        alert(e?.message || 'Could not delete from Supabase');
        return;
      }
    }

    const idx = registered.findIndex((t: any) => String(t.teamName) === teamName);
    if (idx === -1) return;
    const next = registered.filter((_: any, i: number) => i !== idx);
    purgeLocalForTeam(teamName);
    persistRegistered(next);
    // close editor if it was open
    if (teamDraft && String(teamDraft.teamName) === teamName) closeTeamEditor();
    alert('Team deleted');
  };

  const deleteIndividual = async (teamName: string, member: any) => {
    const tn = String(teamName || '').trim();
    const label = member?.name || member?.registrationNumber || member?.email || 'this member';
    const ok = confirm(`Delete ${label} from team "${tn}"?`);
    if (!ok) return;

    if (isSupabaseConfigured() && member?.id) {
      try {
        // If you later want to bulk-delete this member's NOC uploads, that can be added.
        await deleteMemberBackend(String(member.id));
        await reloadRegistered();
        alert('Member deleted');
        return;
      } catch (e: any) {
        console.warn(e);
        alert(e?.message || 'Could not delete member from Supabase');
        return;
      }
    }

    const teamIdx = registered.findIndex((t: any) => String(t.teamName) === tn);
    if (teamIdx === -1) return;
    const team = registered[teamIdx];
    const members = Array.isArray(team?.members) ? [...team.members] : [];

    const memberKey = (m: any) => {
      return String(m?.registrationNumber || m?.email || m?.phoneNumber || m?.name || '').trim().toLowerCase();
    };
    const targetKey = memberKey(member);
    const nextMembers = members.filter((m: any) => memberKey(m) !== targetKey);

    const next = [...registered];
    next[teamIdx] = { ...team, members: nextMembers };

    const overrideKey = teamLeadOverrides[tn];
    if (overrideKey) {
      const leadStillExists = nextMembers.some((m: any, idx: number) => getMemberIdentity(m, idx) === overrideKey);
      if (!leadStillExists) {
        if (nextMembers.length > 0) {
          setTeamLead(tn, nextMembers, 0);
        } else {
          const nextOverrides = { ...teamLeadOverrides };
          delete nextOverrides[tn];
          saveTeamLeadOverrides(nextOverrides);
        }
      }
    }

    purgeLocalForMember(tn, member);
    persistRegistered(next);

    // If the edited team is open, refresh the draft too
    if (teamDraft && String(teamDraft.teamName) === tn) {
      try {
        setTeamDraft({ ...teamDraft, members: nextMembers });
        setSelectedMemberIndex((prev) => Math.max(0, Math.min(prev, nextMembers.length - 1)));
      } catch { }
    }

    // If team becomes empty, remove the team entirely
    if (nextMembers.length === 0) {
      purgeLocalForTeam(tn);
      persistRegistered(next.filter((_: any, i: number) => i !== teamIdx));
    }

    alert('Member deleted');
  };

  return (
    <main className="min-h-screen bg-antique p-6">
      <div className="max-w-7xl mx-auto">
        {/* Page Header with border/shadow */}
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gitam-700">Team Profiles - Full View</h1>
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
              onClick={() => setSelectedTab('teams')} 
              className={`px-6 py-2 rounded-lg font-semibold transition ${selectedTab==='teams' ? 'bg-gitam-700 text-antique shadow':'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}>
              Teams
            </button>
            <button 
              onClick={() => setSelectedTab('individuals')} 
              className={`px-6 py-2 rounded-lg font-semibold transition ${selectedTab==='individuals' ? 'bg-gitam-700 text-antique shadow':'bg-gitam-50 text-gitam-700 hover:bg-gitam-100'}`}>
              Individuals
            </button>
          </div>
        </div>

        {selectedTab === 'teams' && (
          <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6">
            {/* Filters - clean horizontal layout */}
            <div className="mb-6 pb-6 border-b-2 border-gitam-300">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
                  <select value={campusFilter} onChange={(e)=>setCampusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueCampuses.map((c:any)=>(<option key={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain</label>
                  <select value={domainFilter} onChange={(e)=>setDomainFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueDomains.map((d:any)=>(<option key={d}>{d}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Team Size</label>
                  <select value={teamSizeFilter} onChange={(e)=>setTeamSizeFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueTeamSizes.map((s:any)=>(<option key={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
                  <select value={venueFilter} onChange={(e)=>setVenueFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueVenues.map((v:any)=>(<option key={v}>{v}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">SPOC</label>
                  <select value={spocFilter} onChange={(e)=>setSpocFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueSpocs.map((s:any)=>(<option key={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Attendance</label>
                  <select value={attendanceFilter} onChange={(e)=>setAttendanceFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    <option>Present</option>
                    <option>Absent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
                  <input value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} placeholder="Team / Lead" className="hh-input w-full border-2 border-gitam-200 text-sm" />
                </div>
              </div>
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="text-sm text-gitam-600">
                  Showing <span className="font-semibold text-gitam-700">{filteredTeams.length}</span> team{filteredTeams.length !== 1 ? 's' : ''}
                  {resyncAllStatus ? <span className="ml-3 text-xs text-gitam-700">{resyncAllStatus}</span> : null}
                </div>
                <div className="flex gap-2">
                  <button onClick={bulkSaveAllAttendance} className="hh-btn px-3 py-2 border-2 text-sm font-semibold">💾 Bulk Save ({Object.keys(draftTeamAttendance).length})</button>
                  <button onClick={()=>exportTeamsCsv(filteredTeams)} className="hh-btn-outline px-3 py-2 border-2 text-sm">Export CSV</button>
                  {!isSpocView ? (
                    <button
                      onClick={resyncAllTeamLogins}
                      disabled={isResyncingAll}
                      className="hh-btn-outline px-3 py-2 border-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isResyncingAll ? 'Resyncing...' : 'Resync All Logins'}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Teams Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gitam-50 border-b-2 border-gitam-300">
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Campus</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Domain</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Lead</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Lead Phone</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Size</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Venue</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">SPOC</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200 w-[150px]">Attendance</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 w-[170px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((t:any,i:number)=> (
                    <tr key={i} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100 transition">
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{(t.members||[])[0]?.campus||'-'}</td>
                      <td className="p-3 border-r border-gitam-100">
                        <span className="px-2 py-1 bg-gitam-100 text-gitam-700 rounded-full text-xs font-medium">
                          {normalizeDomain(t.domain)||'No Domain'}
                        </span>
                      </td>
                      <td className="p-3 border-r border-gitam-100">
                        <div className="font-semibold text-gitam-700">{t.teamName}</div>
                      </td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{getLeadMember(t)?.name || '-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{getLeadMember(t)?.phoneNumber || '-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{(t.members||[]).length}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{getVenueForTeam(t)||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{getSpocForTeam(t.teamName)}</td>
                      <td className="p-3 border-r border-gitam-100 w-[150px]">
                        <div className="flex gap-2 items-center whitespace-nowrap">
                          <select 
                            value={draftTeamAttendance[t.teamName] !== undefined ? draftTeamAttendance[t.teamName] : (teamAttendance[t.teamName] || '')}
                            onChange={(e) => setDraftTeamAttendance((prev) => ({ ...prev, [t.teamName]: e.target.value }))}
                            className="hh-input !w-[112px] border-2 border-gitam-200 text-xs px-2 py-1 shrink-0"
                          >
                            <option value="">-</option>
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                          </select>
                          <button 
                            onClick={() => saveTeamAttendance(t.teamName, draftTeamAttendance[t.teamName] !== undefined ? draftTeamAttendance[t.teamName] : (teamAttendance[t.teamName] || ''))}
                            className="hh-btn-outline px-2 py-1 text-xs border-2 whitespace-nowrap shrink-0"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="p-3 w-[170px]">
                        <div className="flex gap-1.5 whitespace-nowrap">
                          <button onClick={()=>openTeamEditor(t)} className="hh-btn px-2.5 py-1.5 text-xs">✏️ Edit</button>
                          <button onClick={()=>exportTeamsCsv([t])} className="hh-btn-outline px-2.5 py-1.5 text-xs">📄 Export</button>
                          <button onClick={()=>deleteTeam(t)} className="hh-btn-outline px-2 py-1.5 text-xs text-red-600 hover:bg-red-50">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {filteredTeams.length === 0 && (
              <div className="text-center py-16 text-gitam-600">
                <p className="text-lg font-medium">No teams found matching your filters.</p>
                <p className="text-sm mt-2">Try adjusting your search criteria.</p>
              </div>
            )}
          </div>
        )}

        {selectedTab === 'individuals' && (
          <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6">
            {/* Filters - NO scrolling, clean grid layout */}
            <div className="mb-6 pb-6 border-b-2 border-gitam-300">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-10 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Campus</label>
                  <select value={campusFilter} onChange={(e)=>setCampusFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueCampuses.map((c:any)=>(<option key={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Domain</label>
                  <select value={domainFilter} onChange={(e)=>setDomainFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueDomains.map((d:any)=>(<option key={d}>{d}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Team Size</label>
                  <select value={teamSizeFilter} onChange={(e)=>setTeamSizeFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueTeamSizes.map((s:any)=>(<option key={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Year</label>
                  <select value={yearFilter} onChange={(e)=>setYearFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    <option>1st Year</option>
                    <option>2nd Year</option>
                    <option>3rd Year</option>
                    <option>4th Year</option>
                    <option>5th Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">School</label>
                  <select value={schoolFilter} onChange={(e)=>setSchoolFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueSchools.map((s:any)=>(<option key={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Stay</label>
                  <select value={stayFilter} onChange={(e)=>setStayFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    <option>Hostel</option>
                    <option>Day Scholar</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Venue</label>
                  <select value={venueFilter} onChange={(e)=>setVenueFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueVenues.map((v:any)=>(<option key={v}>{v}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">SPOC</label>
                  <select value={spocFilter} onChange={(e)=>setSpocFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    {uniqueSpocs.map((s:any)=>(<option key={s}>{s}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Attendance</label>
                  <select value={attendanceFilter} onChange={(e)=>setAttendanceFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    <option>Present</option>
                    <option>Absent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Position</label>
                  <select value={positionFilter} onChange={(e)=>setPositionFilter(e.target.value)} className="hh-input w-full border-2 border-gitam-200 text-sm">
                    <option>All</option>
                    <option>Lead</option>
                    <option>Member</option>
                  </select>
                </div>
                <div className="max-w-[190px]">
                  <label className="block text-xs font-semibold text-gitam-700 mb-1.5">Search</label>
                  <input 
                    value={searchQuery} 
                    onChange={(e)=>setSearchQuery(e.target.value)} 
                    placeholder="Name, Reg no, Phone, Email, Branch" 
                    className="hh-input w-full border-2 border-gitam-200 text-sm" 
                  />
                </div>
              </div>
              <div className="flex justify-between items-center flex-wrap gap-3 mb-4">
                <div className="text-sm text-gitam-600">
                  Showing <span className="font-semibold text-gitam-700">{filteredIndividuals.length}</span> individual{filteredIndividuals.length !== 1 ? 's' : ''}
                </div>
                <div className="flex gap-2">
                  <button onClick={bulkSaveAllAttendance} className="hh-btn px-3 py-2 border-2 text-sm font-semibold">💾 Bulk Save ({Object.keys(draftMemberAttendance).length})</button>
                  <button onClick={()=>exportIndividualsCsv(filteredIndividuals)} className="hh-btn-outline px-3 py-2 border-2 text-sm">Export CSV</button>
                </div>
              </div>
            </div>

            {/* Individuals Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gitam-50 border-b-2 border-gitam-300">
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Campus</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Domain</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Name</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Team Size</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Name</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Position</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Email</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Reg No</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Phone No</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Year</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">School</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Branch</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Stay</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">Venue</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200">SPOC</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 border-r border-gitam-200 w-[150px]">Attendance</th>
                    <th className="p-3 text-left font-semibold text-gitam-700 w-[145px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIndividuals.map((m:any,idx:number)=>(
                    <tr key={idx} className="border-b border-gitam-200 odd:bg-white even:bg-gitam-50/40 hover:bg-gitam-100 transition">
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.campus||'-'}</td>
                      <td className="p-3 border-r border-gitam-100">
                        <span className="px-2 py-1 bg-gitam-100 text-gitam-700 rounded-full text-xs font-medium">
                          {normalizeDomain(m.domain)||'-'}
                        </span>
                      </td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.teamName||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.teamSize||'-'}</td>
                      <td className="p-3 font-medium text-gitam-700 border-r border-gitam-100">{m.name||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.position||'Member'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.email||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.registrationNumber||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.phoneNumber||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.yearOfStudy||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.school||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.branch||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.stay||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.venue||'-'}</td>
                      <td className="p-3 text-gitam-600 border-r border-gitam-100">{m.spoc||'-'}</td>
                      <td className="p-3 border-r border-gitam-100 w-[150px]">
                        <div className="flex gap-2 items-center whitespace-nowrap">
                          <select 
                            value={draftMemberAttendance[`member_attendance_${m.teamName}_${m.memberKey}`] !== undefined ? draftMemberAttendance[`member_attendance_${m.teamName}_${m.memberKey}`] : (memberAttendance[`member_attendance_${m.teamName}_${m.memberKey}`] || getMemberAttendanceDisplay(m.teamName, m.memberKey) || '')}
                            onChange={(e) => setDraftMemberAttendance((prev) => ({ ...prev, [`member_attendance_${m.teamName}_${m.memberKey}`]: e.target.value }))}
                            className="hh-input !w-[112px] border-2 border-gitam-200 text-xs px-2 py-1 shrink-0"
                          >
                            <option value="">-</option>
                            <option value="Present">Present</option>
                            <option value="Absent">Absent</option>
                          </select>
                          <button 
                            onClick={() => saveMemberAttendance(
                              m.teamName,
                              m.memberKey,
                              draftMemberAttendance[`member_attendance_${m.teamName}_${m.memberKey}`] !== undefined
                                ? draftMemberAttendance[`member_attendance_${m.teamName}_${m.memberKey}`]
                                : (memberAttendance[`member_attendance_${m.teamName}_${m.memberKey}`] || getMemberAttendanceDisplay(m.teamName, m.memberKey) || '')
                            )}
                            className="hh-btn-outline px-2 py-1 text-xs border-2 whitespace-nowrap shrink-0"
                          >
                            Save
                          </button>
                        </div>
                      </td>
                      <td className="p-3 w-[145px]">
                        <div className="flex gap-1.5 whitespace-nowrap">
                          <button
                            onClick={() => {
                              const team = registered.find((t: any) => t.teamName === m.teamName);
                              if (team) openTeamEditor(team, m.memberIndex || 0);
                            }}
                            className="hh-btn px-2 py-1 text-xs"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => deleteIndividual(String(m.teamName), m)}
                            className="hh-btn-outline px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Team editor modal (like Food Coupons) */}
      {teamDraft && editingTeamIndex !== null && (
        <div className="fixed inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl border-2 border-gitam-300 p-5 md:p-6 max-h-[92vh] overflow-hidden flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-lg">{teamDraft.teamName || 'Team'}</h3>
                <div className="text-sm text-gitam-700/75">Domain: {normalizeDomain(teamDraft.domain) || '-'} • Members: {(teamDraft.members || []).length}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={closeTeamEditor} className="hh-btn-ghost px-2 py-1">Close</button>
                <button onClick={saveAllMembers} className="hh-btn px-3 py-1">Save All</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-sm text-gitam-700">Team Name</label>
                <input
                  value={teamDraft.teamName || ''}
                  onChange={(e) => setTeamDraft({ ...teamDraft, teamName: e.target.value })}
                  className="hh-input"
                />
              </div>
              <div>
                <label className="text-sm text-gitam-700">Domain</label>
                <select
                  value={normalizeDomain(teamDraft.domain) || ''}
                  onChange={(e) => setTeamDraft({ ...teamDraft, domain: e.target.value })}
                  className="hh-input"
                >
                  <option value="">Select</option>
                  {DOMAIN_OPTIONS.map((d) => (<option key={d} value={d}>{d}</option>))}
                </select>
              </div>
            </div>

            <div className="mb-4 max-w-md">
              <div>
                <label className="text-sm text-gitam-700">Select Team Lead</label>
                <select
                  value="0"
                  onChange={(e) => {
                    const nextLeadIndex = Number(e.target.value);
                    if (!Number.isFinite(nextLeadIndex) || nextLeadIndex < 0) return;
                    setTeamLead(String(teamDraft.teamName || '').trim(), teamDraft.members || [], nextLeadIndex);
                  }}
                  className="hh-input"
                >
                  {(teamDraft.members || []).map((m: any, idx: number) => (
                    <option key={idx} value={idx}>
                      {m?.name || `Member ${idx + 1}`} {m?.registrationNumber ? `(${m.registrationNumber})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1 min-h-0 overflow-hidden">
              <div className="md:col-span-1 min-h-0 flex flex-col overflow-hidden border border-gitam-100 rounded-xl bg-white">
                <div className="space-y-3 flex-1 min-h-0 overflow-y-auto p-3 pr-2">
                  {(teamDraft.members || []).map((m:any, idx:number) => (
                    (() => {
                      const teamName = String(teamDraft.teamName || '').trim();
                      const isLead = idx === 0;
                      return (
                    <div
                      key={idx}
                      className={`p-3 border rounded cursor-pointer ${selectedMemberIndex === idx ? 'ring-2 ring-gitam-300' : ''}`}
                      onClick={() => setSelectedMemberIndex(idx)}
                    >
                      <div className="font-semibold flex items-center gap-2">
                        Member {idx + 1}: {m?.name || '-'}
                        {isLead && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gitam-700 text-antique">Lead</span>}
                      </div>
                      <div className="text-sm text-gitam-700/75">Reg: {m?.registrationNumber || '-'}</div>
                      <div className="text-sm text-gitam-700/75">Email: {m?.email || '-'}</div>
                      {!isLead && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTeamLead(teamName, teamDraft.members || [], idx);
                          }}
                          className="mt-2 hh-btn-outline px-2 py-1 text-xs"
                        >
                          Make Lead
                        </button>
                      )}
                    </div>
                      );
                    })()
                  ))}
                  {(!teamDraft.members || teamDraft.members.length === 0) && (
                    <div className="text-sm text-gitam-700/75">No members found for this team.</div>
                  )}
                </div>

                <div className="border-t border-gitam-100 p-3 bg-white shrink-0">
                  <button
                    onClick={addMemberToTeam}
                    disabled={(teamDraft.members || []).length >= 4}
                    className={`w-full p-3 border-2 border-dashed rounded-lg font-semibold transition ${
                      (teamDraft.members || []).length >= 4
                        ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                        : 'border-gitam-400 text-gitam-700 hover:bg-gitam-50 hover:border-gitam-600'
                    }`}
                    title={(teamDraft.members || []).length >= 4 ? 'Maximum 4 members allowed' : 'Add a new member to this team'}
                  >
                    + Add Member {(teamDraft.members || []).length >= 4 && '(Max 4)'}
                  </button>
                </div>
              </div>

              <div className="md:col-span-2 min-h-0 overflow-hidden">
                {Array.isArray(teamDraft.members) && teamDraft.members[selectedMemberIndex] ? (
                  <div className="p-4 border border-gitam-100 rounded-2xl bg-antique-50 h-full min-h-0 flex flex-col">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div>
                        <div className="font-semibold">Edit Member {selectedMemberIndex + 1}</div>
                        <div className="text-sm text-gitam-700/75">Update fields and click Save.</div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={deleteMemberFromTeam}
                          disabled={(teamDraft.members || []).length <= 3}
                          className={`px-3 py-1 rounded-lg font-semibold transition ${
                            (teamDraft.members || []).length <= 3
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                          title={(teamDraft.members || []).length <= 3 ? 'Minimum 3 members required' : 'Delete this member'}
                        >
                          Delete
                        </button>
                        <button onClick={() => saveMember(selectedMemberIndex)} className="hh-btn px-3 py-1">Save</button>
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm text-gitam-700">Campus</label>
                        <select
                          value={teamDraft.members[selectedMemberIndex]?.campus || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], campus: e.target.value };
                            setTeamDraft(copy);
                          }}
                          className="hh-input"
                        >
                          <option value="">Select Campus</option>
                          {registrationCampusOptions.map((c)=> (<option key={c} value={c}>{c}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">Full Name</label>
                        <input
                          value={teamDraft.members[selectedMemberIndex]?.name || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], name: e.target.value };
                            setTeamDraft(copy);
                          }}
                          placeholder="Full name"
                          className="hh-input"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">Registration Number</label>
                        <input
                          value={teamDraft.members[selectedMemberIndex]?.registrationNumber || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], registrationNumber: e.target.value };
                            setTeamDraft(copy);
                          }}
                          placeholder="Registration number"
                          className="hh-input"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">GITAM Mail</label>
                        <input
                          type="email"
                          value={teamDraft.members[selectedMemberIndex]?.email || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], email: e.target.value };
                            setTeamDraft(copy);
                          }}
                          placeholder="email@gitam.in"
                          className="hh-input"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">Phone Number</label>
                        <input
                          type="tel"
                          value={teamDraft.members[selectedMemberIndex]?.phoneNumber || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], phoneNumber: e.target.value };
                            setTeamDraft(copy);
                          }}
                          inputMode="numeric"
                          maxLength={10}
                          placeholder="10-digit phone number"
                          className="hh-input"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">School</label>
                        <select
                          value={teamDraft.members[selectedMemberIndex]?.school || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], school: e.target.value };
                            setTeamDraft(copy);
                          }}
                          className="hh-input"
                        >
                          <option value="">Select School</option>
                          {registrationSchoolOptions.map((s)=> (<option key={s} value={s}>{s}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">Program</label>
                        <select
                          value={teamDraft.members[selectedMemberIndex]?.program || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], program: e.target.value };
                            setTeamDraft(copy);
                          }}
                          className="hh-input"
                        >
                          <option value="">Select Program</option>
                          {registrationProgramOptions.map((p)=> (<option key={p} value={p}>{p}</option>))}
                        </select>
                      </div>
                      {teamDraft.members[selectedMemberIndex]?.program === 'Others' && (
                        <div>
                          <label className="text-sm text-gitam-700">Specify Your Program</label>
                          <input
                            value={teamDraft.members[selectedMemberIndex]?.programOther || ''}
                            onChange={(e)=>{
                              const copy = { ...teamDraft, members: [...teamDraft.members] };
                              copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], programOther: e.target.value };
                              setTeamDraft(copy);
                            }}
                            placeholder="Enter your program"
                            className="hh-input"
                          />
                        </div>
                      )}
                      <div>
                        <label className="text-sm text-gitam-700">Branch</label>
                        <input
                          value={teamDraft.members[selectedMemberIndex]?.branch || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], branch: e.target.value };
                            setTeamDraft(copy);
                          }}
                          placeholder="Branch (e.g., CSE, ECE)"
                          className="hh-input"
                        />
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">Year of Study</label>
                        <select
                          value={String(teamDraft.members[selectedMemberIndex]?.yearOfStudy || '')}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], yearOfStudy: e.target.value };
                            setTeamDraft(copy);
                          }}
                          className="hh-input"
                        >
                          <option value="">Select Year</option>
                          {registrationYearOptions.map((y)=> (<option key={y} value={y}>{y}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm text-gitam-700">Stay Type</label>
                        <select
                          value={teamDraft.members[selectedMemberIndex]?.stay || ''}
                          onChange={(e)=>{
                            const copy = { ...teamDraft, members: [...teamDraft.members] };
                            copy.members[selectedMemberIndex] = { ...copy.members[selectedMemberIndex], stay: e.target.value };
                            setTeamDraft(copy);
                          }}
                          className="hh-input"
                        >
                          <option value="">Select Stay Type</option>
                          <option value="Hostel">Hostel</option>
                          <option value="Day Scholar">Day Scholar</option>
                        </select>
                      </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gitam-700/75">Select a member on the left to edit.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
