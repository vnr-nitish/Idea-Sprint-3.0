'use client';

import { FormEvent, useEffect, useState, memo, useCallback } from 'react';
import Link from 'next/link';
import MemberField from './MemberField';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { registerTeamWithMembers, listTeamsWithMembers } from '@/lib/teamsBackend';

const MAX_TEAM_REGISTRATIONS = 85; // internal hard cap (public-facing text shows 70)

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

type RegistrationStep = 'instructions' | 'declaration' | 'teamDetails' | 'memberDetails' | 'verification' | 'success';

const GUIDELINES_LINK = 'https://docs.google.com/document/d/1eCwcbLHWRgsoYqahqxeFWwV1yLhSQ9gp2R0UuoXy4Qg/edit?usp=sharing';

const DEMO_VERIFICATION_CODES: Record<string, string> = {
  'demo.email@gitam.in': '123456',
  'teamlead@student.gitam.edu': '654321',
};

export default function RegisterPage() {
  const [step, setStep] = useState<RegistrationStep>('instructions');
  const [instructionsAccepted, setInstructionsAccepted] = useState(false);
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [currentMemberIndex, setCurrentMemberIndex] = useState(0);
  
  const [teamData, setTeamData] = useState<TeamData>({
    teamName: '',
    domain: '',
    teamPassword: '',
    teamSize: 3,
  });

  const [members, setMembers] = useState<TeamMember[]>([
    { name: '', registrationNumber: '', email: '', phoneNumber: '', school: '', program: '', programOther: '', branch: '', campus: '', stay: '', yearOfStudy: '' },
  ]);

  const [verificationCodes, setVerificationCodes] = useState<Record<string, string>>({});
  const [verificationInput, setVerificationInput] = useState<Record<string, string>>({});
  const [verificationStatus, setVerificationStatus] = useState<Record<string, 'pending' | 'verified' | 'failed'>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState('');
  const [successData, setSuccessData] = useState<any>(null);
  const [sentCodes, setSentCodes] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (step !== 'memberDetails') return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [step]);

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
    setMembers(prevMembers => {
      const newMembers = [...prevMembers];
      newMembers[index] = { ...newMembers[index], [field]: value };
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
      if (!member.school) newErrors[`member${index}_school`] = 'School is required';
      if (!member.program) newErrors[`member${index}_program`] = 'Program is required';
      if (member.program === 'Other' && !member.programOther.trim()) newErrors[`member${index}_programOther`] = 'Please specify your program';
      if (member.program !== 'Other' && !member.branch.trim()) newErrors[`member${index}_branch`] = 'Branch is required';
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

  const handleTeamDetailsSubmit = () => {
    if (validateTeamDetails()) {
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
      // Simulate sending verification codes
      const codes: Record<string, string> = {};
      const status: Record<string, 'pending' | 'verified' | 'failed'> = {};
      members.forEach((member, index) => {
        // Generate demo code or use predefined
        codes[member.email] = DEMO_VERIFICATION_CODES[member.email] || Math.floor(100000 + Math.random() * 900000).toString();
        status[member.email] = 'pending';
      });
      setVerificationCodes(codes);
      setVerificationStatus(status);
      
      // Simulate email sending
      console.log('Sending verification codes to:', Object.keys(codes));
      Object.keys(codes).forEach(email => {
        console.log(`Email sent to ${email} with code: ${codes[email]}`);
      });
      setSentCodes(Object.keys(codes).reduce((acc, email) => ({ ...acc, [email]: true }), {}));
      
      setStep('verification');
      setErrors({});
      setGlobalError('');
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
    if (!allVerified()) return;
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
      setGlobalError(e?.message || 'Could not save registration to Supabase.');
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

    setIsSubmitting(false);
    setStep('success');
  };

  const handleNextMember = () => {
    const currentIndex = currentMemberIndex;
    const fieldError = (field: string) => errors[`member${currentIndex}_${field}`] || '';
    
    // Validate current member
    const newErrors: Record<string, string> = {};
    const member = members[currentIndex];
    
    if (!member.name.trim()) newErrors[`member${currentIndex}_name`] = 'Name is required';
    if (!member.registrationNumber.trim()) newErrors[`member${currentIndex}_registrationNumber`] = 'Registration number is required';
    if (!member.email.trim()) newErrors[`member${currentIndex}_email`] = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email)) newErrors[`member${currentIndex}_email`] = 'Invalid email';
    else if (!isValidGitamEmail(member.email)) newErrors[`member${currentIndex}_email`] = 'Use your GITAM mail only (@gitam.in or @student.gitam.edu)';
    if (!member.phoneNumber.trim()) newErrors[`member${currentIndex}_phoneNumber`] = 'Phone number is required';
    if (!member.school) newErrors[`member${currentIndex}_school`] = 'School is required';
    if (!member.program) newErrors[`member${currentIndex}_program`] = 'Program is required';
    if (member.program === 'Other' && !member.programOther.trim()) newErrors[`member${currentIndex}_programOther`] = 'Please specify your program';
    if (member.program !== 'Other' && !member.branch.trim()) newErrors[`member${currentIndex}_branch`] = 'Branch is required';
    if (!member.campus) newErrors[`member${currentIndex}_campus`] = 'Campus is required';
    if (!member.stay) newErrors[`member${currentIndex}_stay`] = 'Stay type is required';
    if (!member.yearOfStudy) newErrors[`member${currentIndex}_yearOfStudy`] = 'Year of study is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    if (currentMemberIndex < teamData.teamSize - 1) {
      setCurrentMemberIndex(currentMemberIndex + 1);
    }
  };

  const handlePreviousMember = () => {
    if (currentMemberIndex > 0) {
      setCurrentMemberIndex(currentMemberIndex - 1);
    }
  };

  const handleVerifyCode = (email: string) => {
    const enteredCode = verificationInput[email];
    if (enteredCode === verificationCodes[email]) {
      setVerificationStatus(prev => ({ ...prev, [email]: 'verified' }));
    } else {
      setVerificationStatus(prev => ({ ...prev, [email]: 'failed' }));
    }
  };

  const handleRetryCode = (email: string) => {
    setVerificationInput(prev => ({ ...prev, [email]: '' }));
    setVerificationStatus(prev => ({ ...prev, [email]: 'pending' }));
  };

  const allVerified = (): boolean => {
    return members.every(member => verificationStatus[member.email] === 'verified');
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

    if (step === 'verification') {
      // Go back to the last member to allow edits before verification
      setStep('memberDetails');
      setCurrentMemberIndex(Math.max(0, teamData.teamSize - 1));
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
                <li>Participants may take a day break if they choose to. Teams are allowed to leave the venue at 08:00 PM on 27th March and return by 08:00 AM on 28th March to continue the hackathon.</li>
                <li>Breakfast will not be provided on the morning of 28th March. However, dinner on 27th March and lunch on 28th March will be provided to all participants.</li>
                <li>Submission of a No Objection Certificate (NOC) is mandatory for all participants.</li>
                <li>Problem statements will be revealed on the spot, i.e. 27th March at 04:30 PM, shortly after the hackathon begins.</li>
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
                    className="hh-btn flex-1 py-3"
                  >
                    Next Member
                  </button>
                ) : (
                  <button
                    onClick={handleMembersSubmit}
                    className="hh-btn flex-1 py-3"
                  >
                    Go to Verification
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Verification Step */}
        {step === 'verification' && (
          <div className="hh-card p-8">
            <h1 className="text-3xl font-bold text-gitam-700 mb-6">Email Verification</h1>
            <p className="text-gitam-700/75 mb-8">
              Verification codes have been sent to all member emails. Enter and verify each code below.
            </p>

            <div className="bg-gitam-50 border border-gitam-100 p-4 rounded-lg mb-8">
              <p className="text-sm text-gitam-700">
                <strong>Demo Codes:</strong>
              </p>
              <ul className="text-xs text-gitam-700/80 mt-2">
                {Object.entries(DEMO_VERIFICATION_CODES).map(([email, code]) => (
                  <li key={email}>• {email} → {code}</li>
                ))}
              </ul>
            </div>

            <div className="space-y-6 mb-8">
              {members.map((member, index) => (
                <div key={member.email} className="bg-antique-50 p-6 rounded-lg border-2 border-gitam-100">
                  <h3 className="text-lg font-semibold text-gitam-700 mb-4">
                    {index === 0 ? 'Team Lead' : `Member ${index}`}
                  </h3>
                  <p className="text-sm text-gitam-700/75 mb-4">{member.email}</p>
                  
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={verificationInput[member.email] || ''}
                      onChange={(e) => setVerificationInput(prev => ({ ...prev, [member.email]: e.target.value }))}
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      disabled={verificationStatus[member.email] === 'verified'}
                      className={`hh-input flex-1 ${
                        verificationStatus[member.email] === 'verified'
                          ? 'border-gitam-600 bg-gitam-50'
                          : verificationStatus[member.email] === 'failed'
                          ? 'border-gitam-600 bg-antique-100'
                          : ''
                      }`}
                    />
                    
                    {verificationStatus[member.email] === 'verified' ? (
                      <button
                        disabled
                        className="hh-btn px-6 py-3"
                      >
                        ✓ Verified
                      </button>
                    ) : verificationStatus[member.email] === 'failed' ? (
                      <button
                        onClick={() => handleRetryCode(member.email)}
                        className="hh-btn-outline px-6 py-3"
                      >
                        Retry
                      </button>
                    ) : (
                      <button
                        onClick={() => handleVerifyCode(member.email)}
                        className="hh-btn px-6 py-3"
                      >
                        Verify
                      </button>
                    )}
                  </div>
                  
                  {verificationStatus[member.email] === 'failed' && (
                    <p className="text-gitam-700 text-sm mt-2">⚠️ Incorrect code, please try again</p>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleBack}
                className="hh-btn-outline flex-1 py-3"
              >
                Back
              </button>
              <button
                onClick={handleFinalRegistration}
                disabled={!allVerified() || isSubmitting}
                className="hh-btn flex-1 py-3"
              >
                {isSubmitting ? 'Registering...' : 'Register as a Team'}
              </button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {step === 'success' && successData && (
          <div className="hh-modal-backdrop flex items-center justify-center p-4 z-60">
            <div className="hh-modal w-full max-w-md">
              <div className="px-8 py-12">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gitam-50 border border-gitam-100 rounded-full mb-4">
                    <span className="text-3xl text-gitam-700">✓</span>
                  </div>
                  <h1 className="text-3xl font-bold text-gitam-700">Registration Successful!</h1>
                </div>

                <div className="space-y-4 bg-antique-50 border border-gitam-100 p-6 rounded-lg mb-6 max-h-96 overflow-y-auto">
                  <div>
                    <p className="text-xs text-gitam-700/70 font-semibold uppercase">Team Name</p>
                    <p className="text-lg text-gitam-700 break-words">{successData.teamName}</p>
                  </div>
                  
                  <div>
                    <p className="text-xs text-gitam-700/70 font-semibold uppercase">Team Password</p>
                    <p className="text-lg text-gitam-700 select-none">{successData.teamPassword}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gitam-700/70 font-semibold uppercase">Challenge Domain</p>
                    <p className="text-lg text-gitam-700">{successData.domain}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gitam-700/70 font-semibold uppercase">Team Lead</p>
                    <p className="text-lg text-gitam-700">{successData.teamLead.name}</p>
                    <p className="text-sm text-gitam-700/80">{successData.teamLead.email}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gitam-700/70 font-semibold uppercase">Team Members ({successData.allMembers.length})</p>
                    <div className="mt-2 space-y-2">
                      {successData.allMembers.map((member: TeamMember, idx: number) => (
                        <div key={idx} className="text-sm text-gitam-700/85">
                          <p className="font-semibold">{idx === 0 ? 'Team Lead' : `Member ${idx}`}: {member.name}</p>
                          <p className="text-xs text-gitam-700/70">{member.email}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gitam-50 border-l-4 border-gitam p-4 rounded mb-6">
                  <p className="text-sm text-gitam-700">
                    <strong>✓ Confirmation email has been sent to all team members</strong> with complete registration details including team name, challenge domain, team password, and all member information.
                  </p>
                </div>

                <Link href="/login">
                  <button className="hh-btn w-full py-3">
                    Go to Login
                  </button>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
