'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import MemberField from './MemberField';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { registerTeamWithMembers, listTeamsWithMembers } from '@/lib/teamsBackend';

const MAX_TEAM_REGISTRATIONS = 85; // internal hard cap (public-facing text shows 70)
const REGISTRATION_DRAFT_KEY = 'registerDraft';
const REGISTRATION_DRAFT_MAX_AGE_MS = 30 * 60 * 1000;

interface TeamMember {
  name: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  school: string;
  program: string;
  programOther: string;
  branch: string;
  campus: string;
  stay: string;
  yearOfStudy: string;
}

interface TeamData {
  teamName: string;
  domain: string;
  teamPassword: string;
  teamSize: number;
}

type RegistrationStep = 'instructions' | 'declaration' | 'teamDetails' | 'memberDetails' | 'success';

const GUIDELINES_LINK = 'https://docs.google.com/document/d/1eCwcbLHWRgsoYqahqxeFWwV1yLhSQ9gp2R0UuoXy4Qg/edit?usp=sharing';

export default function RegisterPage() {
  const [step, setStep] = useState<RegistrationStep>('instructions');
  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [currentMemberIndex, setCurrentMemberIndex] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  
  const [teamData, setTeamData] = useState<TeamData>({
    teamName: '',
    domain: '',
    teamPassword: '',
    teamSize: 3,
  });

  const [members, setMembers] = useState<TeamMember[]>([
    { name: '', registrationNumber: '', email: '', phoneNumber: '', school: '', program: '', programOther: '', branch: '', campus: '', stay: '', yearOfStudy: '' },
  ]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [successData, setSuccessData] = useState<any>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'failed' | 'skipped'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingMember, setIsCheckingMember] = useState(false);

  useEffect(() => {
    if (step !== 'memberDetails' && step !== 'success') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [step]);

  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(REGISTRATION_DRAFT_KEY);
      if (!rawDraft) {
        setDraftReady(true);
        return;
      }

      const parsed = JSON.parse(rawDraft);
      const updatedAt = Number(parsed?.updatedAt || 0);
      const isFresh = updatedAt > 0 && Date.now() - updatedAt <= REGISTRATION_DRAFT_MAX_AGE_MS;

      if (!isFresh) {
        localStorage.removeItem(REGISTRATION_DRAFT_KEY);
        setDraftReady(true);
        return;
      }

      if (parsed?.teamData) setTeamData(parsed.teamData);
      if (Array.isArray(parsed?.members) && parsed.members.length) setMembers(parsed.members);
      if (typeof parsed?.currentMemberIndex === 'number') setCurrentMemberIndex(parsed.currentMemberIndex);
      // Step and checkboxes are intentionally NOT restored — a page refresh always starts at instructions.
    } catch {
      localStorage.removeItem(REGISTRATION_DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(() => {
    if (!draftReady || step === 'success') return;

    try {
      localStorage.setItem(
        REGISTRATION_DRAFT_KEY,
        JSON.stringify({
          step,
          instructionsAccepted,
          declarationAccepted,
          currentMemberIndex,
          teamData,
          members,
          updatedAt: Date.now(),
        })
      );
    } catch {
      // Ignore storage failures so registration flow stays usable.
    }
  }, [draftReady, step, instructionsAccepted, declarationAccepted, currentMemberIndex, teamData, members]);

  const clearRegistrationDraft = () => {
    try {
      localStorage.removeItem(REGISTRATION_DRAFT_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  };

  // Reset to instructions after 30 minutes of inactivity (detected when the tab regains focus)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const rawDraft = localStorage.getItem(REGISTRATION_DRAFT_KEY);
        if (!rawDraft) return;
        const parsed = JSON.parse(rawDraft);
        const updatedAt = Number(parsed?.updatedAt || 0);
        if (updatedAt > 0 && Date.now() - updatedAt > REGISTRATION_DRAFT_MAX_AGE_MS) {
          localStorage.removeItem(REGISTRATION_DRAFT_KEY);
          setStep('instructions');
          setInstructionsAccepted(false);
          setDeclarationAccepted(false);
          setTeamData({ teamName: '', domain: '', teamPassword: '', teamSize: 3 });
          setMembers([{ name: '', registrationNumber: '', email: '', phoneNumber: '', school: '', program: '', programOther: '', branch: '', campus: '', stay: '', yearOfStudy: '' }]);
          setCurrentMemberIndex(0);
          setErrors({});
          setGlobalError('');
        }
      } catch {
        // Ignore
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Validate team password
  const validateTeamPassword = (password: string): string | null => {
    if (!password || password.length < 6) return 'Password must be at least 6 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*]/.test(password)) return 'Password must contain at least one special character (!@#$%^&*)';
    return null;
  };

  const isValidGitamEmail = (email: string): boolean => {
    const value = String(email || '').trim().toLowerCase();
    return value.endsWith('@gitam.in') || value.endsWith('@student.gitam.edu');
  };

  const normalizeEmail = (value: string) => String(value || '').trim().toLowerCase();
  const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');
  const normalizeRegistration = (value: string) => String(value || '').trim().toLowerCase();

  const memberLabel = (index: number) => (index === 0 ? 'Team Lead' : `Member ${index}`);

  const getCrossTeamConflictMessage = (candidateMembers: TeamMember[]): string | null => {
    let registeredTeams: any[] = [];
    try {
      registeredTeams = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
    } catch {
      registeredTeams = [];
    }

    if (!Array.isArray(registeredTeams) || !registeredTeams.length) return null;

    for (let i = 0; i < candidateMembers.length; i += 1) {
      const candidate = candidateMembers[i];
      const candidateEmail = normalizeEmail(candidate.email);
      const candidatePhone = normalizePhone(candidate.phoneNumber);
      const candidateReg = normalizeRegistration(candidate.registrationNumber);

      for (const existingTeam of registeredTeams) {
        const existingMembers = Array.isArray(existingTeam?.members) ? existingTeam.members : [];
        for (const existingMember of existingMembers) {
          const existingEmail = normalizeEmail(existingMember?.email || '');
          const existingPhone = normalizePhone(existingMember?.phoneNumber || '');
          const existingReg = normalizeRegistration(existingMember?.registrationNumber || '');

          if (candidateEmail && existingEmail && candidateEmail === existingEmail) {
            return `${memberLabel(i)} email is already registered in team "${existingTeam?.teamName || 'Unknown Team'}".`;
          }

          if (candidatePhone && existingPhone && candidatePhone === existingPhone) {
            return `${memberLabel(i)} phone number is already registered in team "${existingTeam?.teamName || 'Unknown Team'}".`;
          }

          if (candidateReg && existingReg && candidateReg === existingReg) {
            return `${memberLabel(i)} registration number is already registered in team "${existingTeam?.teamName || 'Unknown Team'}".`;
          }
        }
      }
    }

    return null;
  };

  const handleTeamDataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTeamData(prev => ({
      ...prev,
      [name]: name === 'teamSize' ? parseInt(value) : value,
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleMemberChange = useCallback((index: number, field: keyof TeamMember, value: string) => {
    const normalizedValue = (() => {
      if (field === 'phoneNumber') return String(value || '').replace(/\D/g, '').slice(0, 10);
      return value;
    })();

    setMembers(prevMembers => {
      const newMembers = [...prevMembers];
      const nextMember = { ...newMembers[index], [field]: normalizedValue };
      if (field === 'program' && normalizedValue !== 'Others') {
        nextMember.programOther = '';
      }
      newMembers[index] = nextMember;
      return newMembers;
    });
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`member${index}_${field}`];
      return newErrors;
    });
  }, []);

  const validateTeamDetails = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!teamData.teamName.trim()) newErrors.teamName = 'Team name is required';
    if (!teamData.domain) newErrors.domain = 'Domain is required';
    if (!teamData.teamPassword) newErrors.teamPassword = 'Team password is required';
    if (!teamData.teamSize) newErrors.teamSize = 'Team size is required';
    if (teamData.teamSize && (teamData.teamSize < 3 || teamData.teamSize > 4)) {
      newErrors.teamSize = 'Team size must be between 3 and 4 members';
    }
    
    const passwordError = validateTeamPassword(teamData.teamPassword);
    if (passwordError) newErrors.teamPassword = passwordError;

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }
    return true;
  };

  const isTeamNameAlreadyUsed = async (candidateTeamName: string): Promise<boolean> => {
    const normalizedCandidate = String(candidateTeamName || '').trim().toLowerCase();
    if (!normalizedCandidate) return false;

    try {
      if (isSupabaseConfigured()) {
        const rows = await listTeamsWithMembers();
        if (Array.isArray(rows)) {
          return rows.some((team: any) => String(team?.teamName || '').trim().toLowerCase() === normalizedCandidate);
        }
      }
    } catch {
      // Fall back to local cache.
    }

    try {
      const localRows = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
      if (Array.isArray(localRows)) {
        return localRows.some((team: any) => String(team?.teamName || '').trim().toLowerCase() === normalizedCandidate);
      }
    } catch {
      // Ignore malformed cache.
    }

    return false;
  };

  const validateMembers = (): boolean => {
    const newErrors: Record<string, string> = {};
    setGlobalError('');

    // Validate all fields are filled for all members
    members.forEach((member, index) => {
      if (!member.name.trim()) newErrors[`member${index}_name`] = 'Name is required';
      if (!member.registrationNumber.trim()) newErrors[`member${index}_registrationNumber`] = 'Registration number is required';
      if (!member.email.trim()) newErrors[`member${index}_email`] = 'Email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) newErrors[`member${index}_email`] = 'Invalid email';
      else if (!isValidGitamEmail(member.email)) newErrors[`member${index}_email`] = 'Use your GITAM mail only (@gitam.in or @student.gitam.edu)';
      if (!member.phoneNumber.trim()) newErrors[`member${index}_phoneNumber`] = 'Phone number is required';
      else if (!/^\d{10}$/.test(member.phoneNumber)) newErrors[`member${index}_phoneNumber`] = 'Phone number must be exactly 10 digits';
      if (!member.school) newErrors[`member${index}_school`] = 'School is required';
      if (!member.program) newErrors[`member${index}_program`] = 'Program is required';
      if (member.program === 'Others' && !member.programOther.trim()) newErrors[`member${index}_programOther`] = 'Please specify your program';
      if (!member.branch.trim()) newErrors[`member${index}_branch`] = 'Branch is required';
      if (!member.campus) newErrors[`member${index}_campus`] = 'Campus is required';
      if (!member.stay) newErrors[`member${index}_stay`] = 'Stay type is required';
      if (!member.yearOfStudy) newErrors[`member${index}_yearOfStudy`] = 'Year of study is required';
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return false;
    }

    // Check for duplicates and same campus
    const campuses = new Set<string>();
    const emails = new Map<string, number>();
    const phones = new Map<string, number>();
    const regNumbers = new Map<string, number>();
    let globalErrorMsg = '';

    members.forEach((member, index) => {
      if (member.campus) campuses.add(member.campus);
      
      const emailKey = normalizeEmail(member.email);
      const phoneKey = normalizePhone(member.phoneNumber);
      const regKey = normalizeRegistration(member.registrationNumber);

      if (emailKey) {
        if (emails.has(emailKey)) {
          const otherIndex = emails.get(emailKey)!;
          const member1Label = otherIndex === 0 ? 'Team Lead' : `Member ${otherIndex}`;
          const member2Label = index === 0 ? 'Team Lead' : `Member ${index}`;
          globalErrorMsg = `${member1Label} and ${member2Label} have the same email`;
          return;
        }
        emails.set(emailKey, index);
      }

      if (phoneKey) {
        if (phones.has(phoneKey)) {
          const otherIndex = phones.get(phoneKey)!;
          const member1Label = otherIndex === 0 ? 'Team Lead' : `Member ${otherIndex}`;
          const member2Label = index === 0 ? 'Team Lead' : `Member ${index}`;
          globalErrorMsg = `${member1Label} and ${member2Label} have the same phone number`;
          return;
        }
        phones.set(phoneKey, index);
      }

      if (regKey) {
        if (regNumbers.has(regKey)) {
          const otherIndex = regNumbers.get(regKey)!;
          const member1Label = otherIndex === 0 ? 'Team Lead' : `Member ${otherIndex}`;
          const member2Label = index === 0 ? 'Team Lead' : `Member ${index}`;
          globalErrorMsg = `${member1Label} and ${member2Label} have the same registration number`;
          return;
        }
        regNumbers.set(regKey, index);
      }
    });

    if (globalErrorMsg) {
      setGlobalError(globalErrorMsg);
      return false;
    }

    if (campuses.size > 1) {
      setGlobalError('All team members must be from the same campus');
      return false;
    }

    const crossTeamConflict = getCrossTeamConflictMessage(members);
    if (crossTeamConflict) {
      setGlobalError(crossTeamConflict);
      return false;
    }

    return true;
  };

  const handleProceedToTeamDetails = () => {
    setStep('declaration');
  };

  const handleProceedToRegistration = () => {
    setStep('teamDetails');
  };

  const handleTeamDetailsSubmit = async () => {
    if (validateTeamDetails()) {
      const alreadyUsed = await isTeamNameAlreadyUsed(teamData.teamName);
      if (alreadyUsed) {
        setErrors((prev) => ({ ...prev, teamName: 'Team name is already used. Please choose a different team name.' }));
        return;
      }

      // Initialize members array based on team size
      const newMembers = Array(teamData.teamSize).fill(null).map(() => ({
        name: '',
        registrationNumber: '',
        email: '',
        phoneNumber: '',
        school: '',
        program: '',
        programOther: '',
        branch: '',
        campus: '',
        stay: '',
        yearOfStudy: '',
      }));
      setMembers(newMembers);
      setCurrentMemberIndex(0);
      setStep('memberDetails');
    }
  };

  const handleMembersSubmit = () => {
    if (validateMembers()) {
      setErrors({});
      setGlobalError('');
      void handleFinalRegistration();
    }
  };

  const getRegisteredTeamCount = async (): Promise<number> => {
    try {
      if (isSupabaseConfigured()) {
        const rows = await listTeamsWithMembers();
        if (Array.isArray(rows)) return rows.length;
      }
    } catch { /* fall through */ }
    try {
      const stored = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
      if (Array.isArray(stored)) return stored.length;
    } catch { /* ignore */ }
    return 0;
  };

  const handleFinalRegistration = async () => {
    setGlobalError('');

    // Check registration cap (internal limit: 85)
    const totalRegistered = await getRegisteredTeamCount();
    if (totalRegistered >= MAX_TEAM_REGISTRATIONS) {
      setGlobalError('Registrations are closed. The maximum number of teams has already been reached.');
      return;
    }

    const crossTeamConflict = getCrossTeamConflictMessage(members);
    if (crossTeamConflict) {
      setGlobalError(crossTeamConflict);
      return;
    }

    setIsSubmitting(true);

    let supabaseTeamId: string | null = null;
    let supabaseMembers: { id: string; email: string }[] | null = null;

    try {
      if (isSupabaseConfigured()) {
        const result = await registerTeamWithMembers(
          { teamName: teamData.teamName, domain: teamData.domain },
          members
        );
        supabaseTeamId = result?.teamId || null;
        supabaseMembers = result?.members || null;
      }
    } catch (e: any) {
      console.warn(e);
      const raw = String(e?.message || '').toLowerCase();
      const friendly = raw.includes('team_name') || raw.includes('duplicate key')
        ? 'Team name is already used. Please choose a different team name.'
        : (e?.message || 'Could not save registration to Supabase.');
      setGlobalError(friendly);
      setIsSubmitting(false);
      return;
    }

    setSuccessData({
      teamName: teamData.teamName,
      teamPassword: teamData.teamPassword,
      domain: teamData.domain,
      teamLead: members[0],
      allMembers: members,
      teamId: supabaseTeamId,
      supabaseMembers,
    });

    // Ensure every member email has an Auth user with the team password.
    // This avoids cross-device login issues where only one member can sign in.
    if (isSupabaseConfigured()) {
      try {
        await fetch('/api/auth/bootstrap-team-users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId: supabaseTeamId,
            teamPassword: teamData.teamPassword,
            members,
          }),
        });
      } catch {
        // Non-blocking: registration should still complete even if bootstrap call fails.
      }
    }

    setEmailStatus('sending');

    // Send registration email to all team members (non-blocking for registration).
    try {
      const response = await fetch('/api/registration-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: teamData.teamName,
          teamPassword: teamData.teamPassword,
          domain: teamData.domain,
          members,
        }),
      });

      if (!response.ok) {
        setEmailStatus('failed');
      } else {
        const result = await response.json().catch(() => ({}));
        if (result?.skipped) setEmailStatus('skipped');
        else setEmailStatus('sent');
      }
    } catch {
      setEmailStatus('failed');
    }

    // Persist registration to localStorage so user can login later (fallback/offline)
    try {
      let existing = [];
      try { existing = JSON.parse(localStorage.getItem('registeredTeams' ) || '[]'); } catch { existing = []; }
      const newEntry = {
        teamName: teamData.teamName,
        teamPassword: teamData.teamPassword,
        domain: teamData.domain,
        members,
        createdAt: new Date().toISOString(),
        teamId: supabaseTeamId,
      };
      localStorage.setItem('registeredTeams', JSON.stringify([...existing, newEntry]));
      localStorage.setItem('lastRegisteredTeam', JSON.stringify(newEntry));
    } catch (e) {
      console.warn('Could not persist registration', e);
    }

    clearRegistrationDraft();
    setIsSubmitting(false);
    setStep('success');
  };

  const checkMemberAgainstRegistered = async (member: TeamMember, memberIdx: number, currentMembers: TeamMember[]): Promise<string | null> => {
    const candidateEmail = normalizeEmail(member.email);
    const candidatePhone = normalizePhone(member.phoneNumber);
    const candidateReg = normalizeRegistration(member.registrationNumber);
    const mLabel = memberLabel(memberIdx);

    // Check against already-entered members in this registration
    for (let i = 0; i < memberIdx; i++) {
      const prev = currentMembers[i];
      const prevLabel = memberLabel(i);
      if (candidateEmail && normalizeEmail(prev.email) === candidateEmail)
        return `${mLabel}'s email is the same as ${prevLabel}'s. Please use a different email.`;
      if (candidatePhone && normalizePhone(prev.phoneNumber) === candidatePhone)
        return `${mLabel}'s phone number is the same as ${prevLabel}'s. Please use a different phone number.`;
      if (candidateReg && normalizeRegistration(prev.registrationNumber) === candidateReg)
        return `${mLabel}'s registration number is the same as ${prevLabel}'s. Please use a different registration number.`;
    }

    // Check against already-registered teams (Supabase first, then localStorage)
    let registeredTeams: any[] = [];
    try {
      if (isSupabaseConfigured()) {
        const rows = await listTeamsWithMembers();
        if (Array.isArray(rows)) registeredTeams = rows;
      }
    } catch { /* fall through */ }
    if (!registeredTeams.length) {
      try { registeredTeams = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); } catch { registeredTeams = []; }
    }

    for (const existingTeam of registeredTeams) {
      const existingMembers = Array.isArray(existingTeam?.members) ? existingTeam.members : [];
      const eName = String(existingTeam?.teamName || 'another team');
      for (const existingMember of existingMembers) {
        if (candidateEmail && normalizeEmail(existingMember?.email || '') === candidateEmail)
          return `${mLabel}'s email is already registered in team "${eName}". Please use a different email.`;
        if (candidatePhone && normalizePhone(existingMember?.phoneNumber || '') === candidatePhone)
          return `${mLabel}'s phone number is already registered in team "${eName}". Please use a different phone number.`;
        if (candidateReg && normalizeRegistration(existingMember?.registrationNumber || '') === candidateReg)
          return `${mLabel}'s registration number is already registered in team "${eName}". Please use a different registration number.`;
      }
    }

    return null;
  };

  const handleNextMember = async () => {
    const currentIndex = currentMemberIndex;

    // Validate current member fields
    const newErrors: Record<string, string> = {};
    const member = members[currentIndex];

    if (!member.name.trim()) newErrors[`member${currentIndex}_name`] = 'Name is required';
    if (!member.registrationNumber.trim()) newErrors[`member${currentIndex}_registrationNumber`] = 'Registration number is required';
    if (!member.email.trim()) newErrors[`member${currentIndex}_email`] = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) newErrors[`member${currentIndex}_email`] = 'Invalid email';
    else if (!isValidGitamEmail(member.email)) newErrors[`member${currentIndex}_email`] = 'Use your GITAM mail only (@gitam.in or @student.gitam.edu)';
    if (!member.phoneNumber.trim()) newErrors[`member${currentIndex}_phoneNumber`] = 'Phone number is required';
    else if (!/^\d{10}$/.test(member.phoneNumber)) newErrors[`member${currentIndex}_phoneNumber`] = 'Phone number must be exactly 10 digits';
    if (!member.school) newErrors[`member${currentIndex}_school`] = 'School is required';
    if (!member.program) newErrors[`member${currentIndex}_program`] = 'Program is required';
    if (member.program === 'Others' && !member.programOther.trim()) newErrors[`member${currentIndex}_programOther`] = 'Please specify your program';
    if (!member.branch.trim()) newErrors[`member${currentIndex}_branch`] = 'Branch is required';
    if (!member.campus) newErrors[`member${currentIndex}_campus`] = 'Campus is required';
    if (!member.stay) newErrors[`member${currentIndex}_stay`] = 'Stay type is required';
    if (!member.yearOfStudy) newErrors[`member${currentIndex}_yearOfStudy`] = 'Year of study is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Check for duplicate email / phone / reg against team-mates and registered teams
    setErrors({});
    setGlobalError('');
    setIsCheckingMember(true);
    const conflict = await checkMemberAgainstRegistered(member, currentIndex, members);
    setIsCheckingMember(false);
    if (conflict) {
      setGlobalError(conflict);
      return;
    }

    if (currentMemberIndex < teamData.teamSize - 1) {
      setCurrentMemberIndex(currentMemberIndex + 1);
    }
  };

  const handleBack = () => {
    if (step === 'declaration') {
      setStep('instructions');
      return;
    }

    if (step === 'teamDetails') {
      setStep('declaration');
      return;
    }

    if (step === 'memberDetails') {
      // If we're on a later member, go back to the previous member
      if (currentMemberIndex > 0) {
        setCurrentMemberIndex(currentMemberIndex - 1);
      } else {
        // If we're at the first member, go back to team details
        setStep('teamDetails');
      }
      return;
    }
  };

  

  return (
    <main className="hh-page pt-8 md:pt-10 pb-10">
      <div className="max-w-2xl mx-auto px-4">
        {/* Instructions Step */}
        {step === 'instructions' && (
          <div className="hh-card p-8">
            <h1 className="text-3xl font-bold text-gitam-700 mb-6">Important Instructions</h1>
            
            <div className="bg-gitam-50 border border-gitam-100 p-6 rounded-lg mb-6 max-h-96 overflow-y-auto space-y-4">
              <ol className="list-decimal pl-5 space-y-3 text-gitam-700">
                <li>Each team must consist of 3 to 4 members only.</li>
                <li>Registrations are on a first come, first serve basis, and only 70 teams will be allowed.</li>
                <li>Participants may take a day break if they choose to. Teams are allowed to leave the venue at 08:00 PM on 26th March and return by 08:00 AM on 27th March to continue the hackathon.</li>
                <li>Breakfast will not be provided on the morning of 27th March. However, dinner on 26th March and lunch on 27th March will be provided to all participants.</li>
                <li>Submission of a No Objection Certificate (NOC) is mandatory for all participants.</li>
                <li>Problem statements will be revealed on the spot, i.e. 26th March at 04:30 PM, shortly after the hackathon begins.</li>
              </ol>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <input
                type="checkbox"
                id="instructions"
                checked={instructionsAccepted}
                onChange={(e) => setInstructionsAccepted(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-gitam cursor-pointer accent-gitam"
              />
              <label htmlFor="instructions" className="text-gitam-700 font-semibold">
                I have read and understood the instructions
              </label>
            </div>

            <button
              onClick={handleProceedToTeamDetails}
              disabled={!instructionsAccepted}
              className="hh-btn w-full py-3"
            >
              Proceed to Declaration
            </button>
          </div>
        )}

        {/* Declaration Step */}
        {step === 'declaration' && (
          <div className="hh-card p-8">
            <h1 className="text-3xl font-bold text-gitam-700 mb-6">Declaration</h1>

            <div className="bg-gitam-50 border border-gitam-100 p-6 rounded-lg mb-6">
              <p className="text-gitam-700 leading-relaxed">
                I declare that I have read, understood, and agree to abide by the hackathon guidelines and rule book.
                {' '}
                <Link href={GUIDELINES_LINK} target="_blank" className="font-semibold underline text-gitam-700 hover:text-gitam-600">
                  View Guidelines &amp; Rule Book
                </Link>
              </p>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <input
                type="checkbox"
                id="declaration"
                checked={declarationAccepted}
                onChange={(e) => setDeclarationAccepted(e.target.checked)}
                className="w-5 h-5 rounded border-2 border-gitam cursor-pointer accent-gitam"
              />
              <label htmlFor="declaration" className="text-gitam-700 font-semibold">
                I accept this declaration.
              </label>
            </div>

            <div className="flex gap-4">
              <button onClick={handleBack} className="hh-btn-outline flex-1 py-3">Back</button>
              <button
                onClick={handleProceedToRegistration}
                disabled={!declarationAccepted}
                className="hh-btn flex-1 py-3"
              >
                Proceed to Registration
              </button>
            </div>
          </div>
        )}

        {/* Team Details Step */}
        {step === 'teamDetails' && (
          <div className="hh-card p-8">
            {globalError && (
              <div className="mb-6 p-4 bg-antique-100 border-l-4 border-gitam-600 text-gitam-700 rounded">
                {globalError}
              </div>
            )}

            <h1 className="text-3xl font-bold text-gitam-700 mb-6">Team Details</h1>

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-2">Team Name <span className="text-gitam">*</span></label>
                <input
                  type="text"
                  name="teamName"
                  value={teamData.teamName}
                  onChange={handleTeamDataChange}
                  placeholder="Enter team name"
                  className={`hh-input ${errors.teamName ? 'border-gitam-600 bg-antique-100' : ''}`}
                />
                {errors.teamName && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.teamName}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-2">Challenge Domain <span className="text-gitam">*</span></label>
                <select
                  name="domain"
                  value={teamData.domain}
                  onChange={handleTeamDataChange}
                  className={`hh-input ${errors.domain ? 'border-gitam-600 bg-antique-100' : ''}`}
                >
                  <option value="" disabled hidden>Select Domain</option>
                  <option value="App Development">App Development</option>
                  <option value="Cyber Security">Cyber Security</option>
                  <option value="AI">AI</option>
                  <option value="ML & DS">ML & DS</option>
                </select>
                {errors.domain && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.domain}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-2">Team Password <span className="text-gitam">*</span></label>
                <input
                  type="password"
                  name="teamPassword"
                  value={teamData.teamPassword}
                  onChange={handleTeamDataChange}
                  placeholder="Enter team password"
                  className={`hh-input ${errors.teamPassword ? 'border-gitam-600 bg-antique-100' : ''}`}
                />
                {errors.teamPassword && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.teamPassword}</p>}
                <p className="text-xs text-gitam-700/70 mt-1">Must contain: uppercase, lowercase, number, special character (!@#$%^&*)</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gitam-700 mb-2">Team Size <span className="text-gitam">*</span></label>
                <select
                  name="teamSize"
                  value={teamData.teamSize}
                  onChange={handleTeamDataChange}
                  className={`hh-input ${errors.teamSize ? 'border-gitam-600 bg-antique-100' : ''}`}
                >
                  <option value="" disabled hidden>Select Team Size</option>
                  <option value={3}>3 Members (including Team Lead)</option>
                  <option value={4}>4 Members (including Team Lead)</option>
                </select>
                {errors.teamSize && <p className="text-gitam-700 text-sm mt-1">⚠️ {errors.teamSize}</p>}
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={handleBack}
                className="hh-btn-outline flex-1 py-3"
              >
                Back
              </button>
              <button
                onClick={handleTeamDetailsSubmit}
                className="hh-btn flex-1 py-3"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Team Lead & Members Step */}
        {step === 'memberDetails' && (
          <div className="hh-modal-backdrop flex items-start md:items-center justify-center p-4 pt-6 md:pt-0 z-60">
            <div className="hh-modal w-full max-w-5xl max-h-[90vh] flex flex-col min-h-0 mt-16">
              {/* Header */}
              <div className="px-8 py-6 border-b border-gitam-100">
                {globalError && (
                  <div className="mb-4 p-4 bg-antique-100 border-l-4 border-gitam-600 text-gitam-700 rounded">
                    {globalError}
                  </div>
                )}
                <h1 className="text-3xl font-bold text-gitam-700 mb-2">Team Member Details</h1>
                <p className="text-gitam-700/75 mb-4">
                  Member {currentMemberIndex + 1} of {teamData.teamSize} {currentMemberIndex === 0 ? '(Team Lead)' : ''}
                </p>
                <div className="w-full bg-gitam-100 rounded-full h-2">
                  <div 
                    className="bg-gitam h-2 rounded-full transition-all duration-300"
                    style={{ width: `${((currentMemberIndex + 1) / teamData.teamSize) * 100}%` }}
                  ></div>
                </div>
              </div>

              {/* Content - No Scrolling */}
              <div className="flex-1 px-8 py-6 bg-antique min-h-0 overflow-y-auto">
                <MemberField
                  index={currentMemberIndex}
                  member={members[currentMemberIndex]}
                  isTeamLead={currentMemberIndex === 0}
                  onChange={handleMemberChange}
                  errors={errors}
                />
              </div>

              {/* Footer */}
              <div className="px-8 py-6 border-t border-gitam-100 flex gap-4">
                <button
                  onClick={handleBack}
                  className="hh-btn-outline flex-1 py-3"
                >
                  Back
                </button>

                {currentMemberIndex < teamData.teamSize - 1 ? (
                  <button
                    onClick={handleNextMember}
                    disabled={isCheckingMember}
                    className="hh-btn flex-1 py-3 disabled:opacity-60"
                  >
                    {isCheckingMember ? 'Checking...' : 'Next Member'}
                  </button>
                ) : (
                  <button
                    onClick={handleMembersSubmit}
                    disabled={isSubmitting}
                    className="hh-btn flex-1 py-3 disabled:opacity-60"
                  >
                    {isSubmitting ? 'Registering...' : 'Register as a Team'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && successData && (
          <div className="hh-modal-backdrop flex items-center justify-center p-4 z-60">
            <div className="hh-modal w-full max-w-4xl max-h-[85vh] overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]">
                <div className="px-8 py-8 md:px-10 md:py-10 border-b md:border-b-0 md:border-r border-gitam-100 bg-gitam-50/40 max-h-[85vh] overflow-y-auto">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gitam-50 border border-gitam-100 rounded-full mb-5">
                    <span className="text-3xl text-gitam-700">✓</span>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-bold text-gitam-700 mb-3">Registration Successful!</h1>
                  <p className="text-gitam-700/80 leading-relaxed mb-8">
                    Your team has been registered successfully. Keep the team password safe because it will be needed for login.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-antique-50 border border-gitam-100 rounded-xl p-4">
                      <p className="text-xs text-gitam-700/70 font-semibold uppercase mb-1">Team Name</p>
                      <p className="text-lg text-gitam-700 break-words">{successData.teamName}</p>
                    </div>
                    <div className="bg-antique-50 border border-gitam-100 rounded-xl p-4">
                      <p className="text-xs text-gitam-700/70 font-semibold uppercase mb-1">Challenge Domain</p>
                      <p className="text-lg text-gitam-700">{successData.domain}</p>
                    </div>
                    <div className="bg-antique-50 border border-gitam-100 rounded-xl p-4">
                      <p className="text-xs text-gitam-700/70 font-semibold uppercase mb-1">Team Password</p>
                      <p className="text-lg text-gitam-700 select-none">{successData.teamPassword}</p>
                    </div>
                    <div className="bg-antique-50 border border-gitam-100 rounded-xl p-4">
                      <p className="text-xs text-gitam-700/70 font-semibold uppercase mb-1">Team Lead</p>
                      <p className="text-lg text-gitam-700">{successData.teamLead.name}</p>
                      <p className="text-sm text-gitam-700/80 break-all">{successData.teamLead.email}</p>
                    </div>
                  </div>

                  <div className="bg-gitam-50 border-l-4 border-gitam p-4 rounded mt-8">
                    <p className="text-sm text-gitam-700">
                      <strong>Details saved successfully.</strong> You can now continue to login using the registered team credentials.
                    </p>
                    {emailStatus === 'sending' && (
                      <p className="text-sm text-gitam-700 mt-2">
                        Sending confirmation email to all team members...
                      </p>
                    )}
                    {emailStatus === 'sent' && (
                      <p className="text-sm text-gitam-700 mt-2">
                        Confirmation email has been sent to all team member emails.
                      </p>
                    )}
                    {emailStatus === 'skipped' && (
                      <p className="text-sm text-gitam-700 mt-2">
                        Email service is not configured yet; registration is saved successfully.
                      </p>
                    )}
                    {emailStatus === 'failed' && (
                      <p className="text-sm text-gitam-700 mt-2">
                        Registration is saved, but sending confirmation email failed.
                      </p>
                    )}
                  </div>
                </div>

                <div className="px-8 py-10 md:px-10 md:py-12 flex flex-col min-h-0">
                  <div className="mb-5">
                    <p className="text-xs text-gitam-700/70 font-semibold uppercase">Team Members</p>
                    <h2 className="text-2xl font-bold text-gitam-700 mt-1">{successData.allMembers.length} Registered Members</h2>
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
                    {successData.allMembers.map((member: TeamMember, idx: number) => (
                      <div key={idx} className="bg-antique-50 border border-gitam-100 rounded-xl p-4">
                        <p className="font-semibold text-gitam-700">{idx === 0 ? 'Team Lead' : `Member ${idx}`}: {member.name}</p>
                        <p className="text-sm text-gitam-700/80 break-all mt-1">{member.email}</p>
                        <p className="text-xs text-gitam-700/65 mt-1">{member.registrationNumber || 'Registration number not provided'}</p>
                      </div>
                    ))}
                  </div>

                  <Link href="/login" className="mt-6">
                    <button className="hh-btn w-full py-3">
                      Go to Login
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
