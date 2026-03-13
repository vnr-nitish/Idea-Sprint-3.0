"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { updateMember } from '@/lib/teamsBackend';
import { refreshCurrentTeamSession } from '@/lib/teamSession';

export default function ProfilePage() {
  const [teamData, setTeamData] = useState<any>(null);
  const [teamDraft, setTeamDraft] = useState<any>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [identifier, setIdentifier] = useState<string>("");
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const draftDirtyRef = useRef(false);

  const normalizeId = (value: string) => {
    const trimmed = String(value || '').trim();
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) return digitsOnly;
    return trimmed.toLowerCase();
  };

  useEffect(() => {
    const load = async () => {
      try {
        const current = await refreshCurrentTeamSession();
        if (current) {
          setTeamData(current.team);
          setIdentifier(current.identifier || current.identifierNormalized || "");
          setTeamDraft((prev: any) => {
            if (draftDirtyRef.current && prev) {
              return prev;
            }
            return JSON.parse(JSON.stringify(current.team));
          });
        }
      } catch (e) {
        console.warn(e);
      }
      finally { setSessionLoaded(true); }
    };

    void load();

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'currentTeam') {
        void load();
      }
    };

    window.addEventListener('storage', onStorage);
    const poll = setInterval(() => {
      void load();
    }, 2000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  const getLeadIndex = (): number => {
    const members = Array.isArray(teamDraft?.members) ? teamDraft.members : [];
    if (!members.length) return 0;

    const explicitRoleIdx = members.findIndex((m: any) => String(m?.role || '').toLowerCase() === 'lead');
    if (explicitRoleIdx >= 0) return explicitRoleIdx;

    // Try stable registration snapshot (if available) before fallback rules.
    try {
      const last = JSON.parse(localStorage.getItem('lastRegisteredTeam') || 'null');
      const sameTeam = String(last?.teamName || '').trim().toLowerCase() === String(teamDraft?.teamName || '').trim().toLowerCase();
      if (sameTeam && last?.teamLead) {
        const leadEmail = normalizeId(String(last.teamLead.email || ''));
        const leadReg = normalizeId(String(last.teamLead.registrationNumber || ''));
        const fromSnapshot = members.findIndex((m: any) => {
          const e = normalizeId(String(m?.email || ''));
          const r = normalizeId(String(m?.registrationNumber || ''));
          return (leadEmail && e === leadEmail) || (leadReg && r === leadReg);
        });
        if (fromSnapshot >= 0) return fromSnapshot;
      }
    } catch (e) {
      // ignore
    }

    // Fallback for legacy/demo datasets where lead marker was not persisted.
    const byNameOrEmail = members.findIndex((m: any) => {
      const name = String(m?.name || '').toLowerCase();
      const email = String(m?.email || '').toLowerCase();
      return name.includes('lead') || email.includes('.lead@');
    });
    if (byNameOrEmail >= 0) return byNameOrEmail;

    return 0;
  };

  const leadIndex = getLeadIndex();
  const lead = teamDraft?.members?.[leadIndex];
  const idNorm = normalizeId(identifier || '');
  const leadTokens = [lead?.email, lead?.phoneNumber, lead?.registrationNumber].map((v: any) => normalizeId(String(v || '')));
  const isLead = leadTokens.includes(idNorm);

  const memberIndices = Array.isArray(teamDraft?.members)
    ? teamDraft.members.map((_: any, idx: number) => idx)
    : [];
  const orderedMemberIndices = memberIndices.length
    ? [leadIndex, ...memberIndices.filter((idx: number) => idx !== leadIndex)]
    : [];

  const getMemberLabel = (memberIdx: number) => {
    if (memberIdx === leadIndex) return 'Lead';
    const memberNumber = orderedMemberIndices.filter((idx: number) => idx !== leadIndex).indexOf(memberIdx) + 1;
    return memberNumber > 0 ? `Member ${memberNumber}` : 'Member';
  };

  const schoolOptions = [
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

  const programOptions = ['B.Tech', 'M.Tech', 'B.Sc', 'M.Sc', 'BBA', 'MBA', 'Others', 'Other'];
  const campusOptions = ['Visakhapatnam'];
  const yearOptions = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];
  const stayOptions = ['Hostel', 'Day Scholar'];

  useEffect(() => {
    if (!Array.isArray(teamDraft?.members) || teamDraft.members.length === 0) return;
    if (selectedIndex === null || selectedIndex < 0 || selectedIndex >= teamDraft.members.length) {
      setSelectedIndex(leadIndex);
    }
  }, [teamDraft, selectedIndex, leadIndex]);

  if (!sessionLoaded)
    return (
      <main className="hh-page flex items-center justify-center">
        <div className="hh-card p-6">Loading session...</div>
      </main>
    );

  const updateMemberField = (memberIdx: number, field: string, value: string) => {
    if (!isLead || !teamDraft?.members?.[memberIdx]) return;
    draftDirtyRef.current = true;
    setTeamDraft((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev || {}));
      if (!next?.members?.[memberIdx]) return prev;
      next.members[memberIdx][field] = value;

      // Keep program-specific fields aligned with registration behavior.
      if (field === 'program') {
        const normalized = String(value || '').trim().toLowerCase();
        const isOther = normalized === 'other' || normalized === 'others';
        if (!isOther) next.members[memberIdx].programOther = '';
      }

      return next;
    });
  };

  const persistAllMembers = async (nextMembers: any[]) => {
    const normalizedTeamName = String(teamData?.teamName || teamDraft?.teamName || '').trim().toLowerCase();

    // Update local registered teams so admin/member views reflect changes.
    let registered = [];
    try { registered = JSON.parse(localStorage.getItem('registeredTeams') || '[]'); } catch { registered = []; }
    const updatedRegistered = (registered || []).map((t: any) => {
      if (String(t?.teamName || '').trim().toLowerCase() !== normalizedTeamName) return t;
      return { ...t, members: nextMembers };
    });
    localStorage.setItem('registeredTeams', JSON.stringify(updatedRegistered));

    // Keep current session in sync.
    let current: any = null;
    try { current = JSON.parse(localStorage.getItem('currentTeam') || 'null'); } catch { current = null; }
    if (current?.team) {
      const currentTeamName = String(current.team?.teamName || '').trim().toLowerCase();
      if (currentTeamName === normalizedTeamName) {
        const nextCurrent = { ...current, team: { ...current.team, members: nextMembers } };
        localStorage.setItem('currentTeam', JSON.stringify(nextCurrent));
      }
    }

    // Keep optional success payload in sync when this is the same team.
    try {
      const last = JSON.parse(localStorage.getItem('lastRegisteredTeam') || 'null');
      if (last && String(last.teamName || '').trim().toLowerCase() === normalizedTeamName) {
        localStorage.setItem('lastRegisteredTeam', JSON.stringify({ ...last, allMembers: nextMembers, teamLead: lead || nextMembers?.[0] || last.teamLead }));
      }
    } catch (e) {
      // ignore
    }
  };

  const saveSelectedMember = async () => {
    if (!isLead || !teamDraft || selectedIndex === null) return;
    setSaving(true);
    try {
      const nextMembers = teamDraft.members || [];
      await persistAllMembers(nextMembers);

      // Sync backend where member ids exist.
      if (isSupabaseConfigured()) {
        const m = nextMembers[selectedIndex];
        if (m?.id) {
          await updateMember(String(m.id), {
            name: m.name || '',
            registrationNumber: m.registrationNumber || '',
            email: m.email || '',
            phoneNumber: m.phoneNumber || m.phone || '',
            school: m.school || '',
            program: m.program || '',
            programOther: m.programOther || '',
            branch: m.branch || '',
            campus: m.campus || '',
            stay: m.stay || '',
            yearOfStudy: m.yearOfStudy || '',
          });
        }
      }

      const savedDraft = JSON.parse(JSON.stringify(teamDraft));
      draftDirtyRef.current = false;
      setTeamData(savedDraft);
      setTeamDraft(savedDraft);
      alert('Member details saved successfully.');
    } catch (e) {
      console.warn(e);
      alert('Unable to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!teamData || !teamDraft)
    return (
      <main className="hh-page flex items-center justify-center">
        <div className="hh-card p-6">No session found. Please login.</div>
      </main>
    );

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="hh-card border-2 border-gitam-200 p-6 mb-6 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-bold text-gitam-700">Team Profiles - Full View</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        <div className="hh-card p-6 border-2 border-gitam-200">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-gitam-700">{teamDraft.teamName}</h2>
              <div className="text-gitam-700/75">Domain: {teamDraft.domain || '-'} • Members: {(teamDraft.members || []).length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Member list */}
            <div className="md:col-span-1">
              <h3 className="font-semibold text-gitam mb-3">Members ({teamDraft.members.length})</h3>
              <div className="space-y-3">
                {orderedMemberIndices.map((memberIdx: number, position: number) => {
                  const m = teamDraft.members[memberIdx];
                  const isCardLead = memberIdx === leadIndex;
                  return (
                    <button
                      key={memberIdx}
                      onClick={() => setSelectedIndex(memberIdx)}
                      className={`w-full text-left p-3 rounded-xl border-2 transition hover:shadow ${selectedIndex === memberIdx ? 'border-gitam-600 bg-gitam-50' : 'border-gitam-200 bg-antique/60'}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-gitam-700">{m.name}</div>
                          <div className="mt-1 flex items-center gap-2">
                            {isCardLead ? (
                              <span className="inline-flex items-center rounded-full bg-gitam-700 text-antique text-xs font-semibold px-2 py-0.5">Lead</span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-gitam-50 border border-gitam-200 text-gitam-700 text-xs font-semibold px-2 py-0.5">{getMemberLabel(memberIdx)}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-gitam-700/75">{m.registrationNumber}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Detail panel */}
            <div className="md:col-span-2">
              {selectedIndex === null ? (
                <div className="p-4 bg-antique/60 border-2 border-gitam-200 rounded-xl">Select a member to view details.</div>
              ) : (
                (() => {
                  const m = teamDraft.members[selectedIndex];
                  const isSelectedLead = selectedIndex === leadIndex;
                  const isOtherProgram = ['other', 'others'].includes(String(m.program || '').trim().toLowerCase());
                  const selectedLabel = getMemberLabel(selectedIndex);

                  return (
                    <div className="bg-antique/60 border-2 border-gitam-200 p-6 rounded-xl">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-3xl font-bold text-gitam-700">{selectedLabel}</h3>
                        </div>
                        {isLead ? (
                          <button
                            onClick={saveSelectedMember}
                            className="hh-btn px-5 py-2"
                            disabled={saving}
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <div className="text-xs text-gitam-700/60">Campus</div>
                          <select value={m.campus || ''} onChange={(e) => updateMemberField(selectedIndex, 'campus', e.target.value)} disabled={!isLead} className="hh-input text-sm">
                            <option value="" disabled hidden>Select Campus</option>
                            {campusOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">Full Name</div>
                          <input value={m.name || ''} onChange={(e) => updateMemberField(selectedIndex, 'name', e.target.value)} disabled={!isLead} className="hh-input text-sm" />
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">Registration Number</div>
                          <input value={m.registrationNumber || ''} onChange={(e) => updateMemberField(selectedIndex, 'registrationNumber', e.target.value)} disabled={!isLead} className="hh-input text-sm" />
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">GITAM Mail</div>
                          <input value={m.email || ''} onChange={(e) => updateMemberField(selectedIndex, 'email', e.target.value)} disabled={!isLead} className="hh-input text-sm" />
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">Phone Number</div>
                          <input value={m.phoneNumber || m.phone || ''} onChange={(e) => updateMemberField(selectedIndex, 'phoneNumber', e.target.value)} disabled={!isLead} className="hh-input text-sm" />
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">School</div>
                          <select value={m.school || ''} onChange={(e) => updateMemberField(selectedIndex, 'school', e.target.value)} disabled={!isLead} className="hh-input text-sm">
                            <option value="" disabled hidden>Select School</option>
                            {schoolOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">Program</div>
                          <select value={m.program || ''} onChange={(e) => updateMemberField(selectedIndex, 'program', e.target.value)} disabled={!isLead} className="hh-input text-sm">
                            <option value="" disabled hidden>Select Program</option>
                            {programOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                        {isOtherProgram && (
                          <div>
                            <div className="text-xs text-gitam-700/60">Specify Your Program</div>
                            <input value={m.programOther || ''} onChange={(e) => updateMemberField(selectedIndex, 'programOther', e.target.value)} disabled={!isLead} className="hh-input text-sm" placeholder="Enter your program" />
                          </div>
                        )}
                        <div>
                          <div className="text-xs text-gitam-700/60">Branch</div>
                          <input value={m.branch || ''} onChange={(e) => updateMemberField(selectedIndex, 'branch', e.target.value)} disabled={!isLead} className="hh-input text-sm" placeholder="Branch (e.g., CSE, ECE)" />
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">Year of Study</div>
                          <select value={m.yearOfStudy || ''} onChange={(e) => updateMemberField(selectedIndex, 'yearOfStudy', e.target.value)} disabled={!isLead} className="hh-input text-sm">
                            <option value="" disabled hidden>Select Year</option>
                            {yearOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                        <div>
                          <div className="text-xs text-gitam-700/60">Stay Type</div>
                          <select value={m.stay || ''} onChange={(e) => updateMemberField(selectedIndex, 'stay', e.target.value)} disabled={!isLead} className="hh-input text-sm">
                            <option value="" disabled hidden>Select Stay Type</option>
                            {stayOptions.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );

}
