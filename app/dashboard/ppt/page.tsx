'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { deletePpt, getPpt, getPptDeadline, MAX_PPT_BYTES, subscribePptChanges, upsertPpt } from '@/lib/pptBackend';
import { refreshCurrentTeamSession } from '@/lib/teamSession';

export default function PPTPage() {
  const MAX_PPT_MB = Math.round(MAX_PPT_BYTES / (1024 * 1024));
  const [teamData, setTeamData] = useState<any>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [file, setFile] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [currentIdentifier, setCurrentIdentifier] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [isLeader, setIsLeader] = useState<boolean>(false);
  const [effectiveDeadline, setEffectiveDeadline] = useState<Date>(new Date('2026-03-28T14:00:00'));
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const router = useRouter();

  const normalizeId = (value?: string) => {
    if (!value) return '';
    const trimmed = String(value || '').trim();
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly.length >= 8 && digitsOnly.length <= 15) return digitsOnly;
    return trimmed.toLowerCase();
  };

  const getCampus = (team: any): string => {
    return String(team?.members?.[0]?.campus || team?.campus || '').trim();
  };

  const getLeadMember = (team: any) => {
    const members = Array.isArray(team?.members) ? team.members : [];
    if (!members.length) return null;

    const explicitRoleIdx = members.findIndex((m: any) => String(m?.role || '').toLowerCase() === 'lead');
    if (explicitRoleIdx >= 0) return members[explicitRoleIdx];

    try {
      const last = JSON.parse(localStorage.getItem('lastRegisteredTeam') || 'null');
      const sameTeam = String(last?.teamName || '').trim().toLowerCase() === String(team?.teamName || '').trim().toLowerCase();
      if (sameTeam && last?.teamLead) {
        const leadEmail = normalizeId(String(last.teamLead.email || ''));
        const leadReg = normalizeId(String(last.teamLead.registrationNumber || ''));
        const fromSnapshot = members.find((m: any) => {
          const e = normalizeId(String(m?.email || ''));
          const r = normalizeId(String(m?.registrationNumber || ''));
          return (leadEmail && e === leadEmail) || (leadReg && r === leadReg);
        });
        if (fromSnapshot) return fromSnapshot;
      }
    } catch {
      // ignore
    }

    const byNameOrEmail = members.find((m: any) => {
      const name = String(m?.name || '').toLowerCase();
      const email = String(m?.email || '').toLowerCase();
      return name.includes('lead') || email.includes('.lead@');
    });
    if (byNameOrEmail) return byNameOrEmail;

    return members[0] || null;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const current = await refreshCurrentTeamSession();
        if (current) {
          setTeamData(current.team);
          setCurrentIdentifier(current.identifier || current.identifierNormalized || null);
          setCurrentMemberId(current.memberId || current.identifier || current.identifierNormalized || null);
          setTeamId(current.teamId || current.team?.teamId || null);

          try {
            const teamName = current.team?.teamName || 'team';
            const campus = getCampus(current.team) || 'campus';
            const key = `ppt_${encodeURIComponent(teamName)}_${encodeURIComponent(campus)}`;
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              setFile(parsed.file || null);
              setUploadedAt(parsed.uploadedAt || null);
              setPendingFile(null);
            }
          } catch {
            // ignore
          }
        }

        const lock = localStorage.getItem('ppt_general_deadline_locked');
        setIsFrozen(lock === 'true');
        const global = localStorage.getItem('ppt_general_deadline');
        if (global) {
          const d = new Date(global);
          if (!Number.isNaN(d.getTime())) setEffectiveDeadline(d);
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

  const refreshFromBackend = async () => {
    if (!isSupabaseConfigured()) return;
    try {
      const current = await refreshCurrentTeamSession();
      const tid = current?.teamId || current?.team?.teamId || null;
      const campus = getCampus(current?.team) || '';
      if (!tid || !campus) return;

      const rec = await getPpt(String(tid), campus);
      if (rec) {
        setFile({ name: rec.fileName, data: rec.url });
        setUploadedAt(Date.parse(rec.uploadedAt));
        setPendingFile(null);
      } else {
        setFile(null);
        setUploadedAt(null);
        setPendingFile(null);
      }

      const deadlineIso = await getPptDeadline(String(tid), campus);
      if (deadlineIso) {
        const d = new Date(deadlineIso);
        if (!Number.isNaN(d.getTime())) {
          setEffectiveDeadline(d);
          return;
        }
      }

      const global = localStorage.getItem('ppt_general_deadline');
      if (global) {
        const gd = new Date(global);
        if (!Number.isNaN(gd.getTime())) {
          setEffectiveDeadline(gd);
          return;
        }
      }

      setEffectiveDeadline(new Date('2026-03-28T14:00:00'));
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (!e.key || e.key === 'ppt_general_deadline' || e.key === 'ppt_general_deadline_locked') {
        try {
          const lock = localStorage.getItem('ppt_general_deadline_locked');
          setIsFrozen(lock === 'true');
          const global = localStorage.getItem('ppt_general_deadline');
          if (global) {
            const d = new Date(global);
            if (!Number.isNaN(d.getTime())) setEffectiveDeadline(d);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const campusDependency = teamData?.members?.[0]?.campus || '';

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    refreshFromBackend();
    const campus = getCampus(teamData) || '';
    if (!teamId || !campus) return;
    const unsub = subscribePptChanges(String(teamId), campus, () => {
      refreshFromBackend();
    });
    return () => {
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, campusDependency]);

  const getEffectiveDeadline = () => {
    try {
      if (!isSupabaseConfigured() && teamData) {
        const campus = getCampus(teamData) || '';
        const teamName = teamData.teamName || '';
        const key = `ppt_deadline_${encodeURIComponent(teamName)}_${encodeURIComponent(campus)}`;
        const v = localStorage.getItem(key);
        if (v) {
          const d = new Date(v);
          if (!Number.isNaN(d.getTime())) return d;
        }
      }
    } catch {
      // ignore
    }
    return effectiveDeadline;
  };

  const PPT_DEADLINE = getEffectiveDeadline();
  const now = () => new Date();
  const formatFriendly = (d: Date) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const day = d.getDate();
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const suffix = (n: number) => {
      if (n >= 11 && n <= 13) return 'th';
      switch (n % 10) {
        case 1:
          return 'st';
        case 2:
          return 'nd';
        case 3:
          return 'rd';
        default:
          return 'th';
      }
    };
    let hours = d.getHours();
    const minutes = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours === 0 ? 12 : hours;
    const mins = minutes === 0 ? null : (minutes < 10 ? `0${minutes}` : `${minutes}`);
    const time = mins ? `${hours}:${mins} ${ampm}` : `${hours} ${ampm}`;
    return `${months[d.getMonth()]} ${pad(day)}${suffix(day)}, ${time}`;
  };

  const canUpload = isLeader && now() < PPT_DEADLINE && !isFrozen;
  const removable = Boolean(file) && canUpload;



  useEffect(() => {
    try {
      if (!teamData) return;
      const leader = getLeadMember(teamData);
      const members = Array.isArray(teamData?.members) ? teamData.members : [];

      const currentTokens = Array.from(new Set([
        normalizeId(String(currentIdentifier || '')),
        normalizeId(String(currentMemberId || '')),
        String(currentMemberId || '').trim().toLowerCase(),
      ].filter(Boolean)));

      const leaderTokens = Array.from(new Set([
        normalizeId(String(leader?.id || '')),
        normalizeId(String(leader?.email || '')),
        normalizeId(String(leader?.phoneNumber || '')),
        normalizeId(String(leader?.registrationNumber || '')),
        String(leader?.id || '').trim().toLowerCase(),
      ].filter(Boolean)));

      let isLeadUser = currentTokens.some((token) => leaderTokens.includes(token));

      if (!isLeadUser && currentTokens.length) {
        const matchedMember = members.find((m: any) => {
          const tokens = Array.from(new Set([
            normalizeId(String(m?.id || '')),
            normalizeId(String(m?.email || '')),
            normalizeId(String(m?.phoneNumber || '')),
            normalizeId(String(m?.registrationNumber || '')),
            String(m?.id || '').trim().toLowerCase(),
          ].filter(Boolean)));
          return currentTokens.some((token) => tokens.includes(token));
        });

        if (matchedMember) {
          const matchedTokens = Array.from(new Set([
            normalizeId(String(matchedMember?.id || '')),
            normalizeId(String(matchedMember?.email || '')),
            normalizeId(String(matchedMember?.phoneNumber || '')),
            normalizeId(String(matchedMember?.registrationNumber || '')),
            String(matchedMember?.id || '').trim().toLowerCase(),
          ].filter(Boolean)));
          isLeadUser = matchedTokens.some((token) => leaderTokens.includes(token));
        }
      }

      setIsLeader(isLeadUser);
    } catch {
      setIsLeader(false);
    }
  }, [teamData, currentIdentifier, currentMemberId]);

  if (!sessionLoaded) {
    return <main className="hh-page" />;
  }

  const removePPT = async () => {
    if (!teamData) return;
    if (isFrozen) {
      alert('PPT uploads are frozen by admin.');
      return;
    }
    if (!canUpload) {
      alert('Deletion window has closed.');
      return;
    }

  setDeleting(true);

    const campus = getCampus(teamData) || 'campus';
    const tid = teamId;

    if (isSupabaseConfigured() && tid) {
      try {
        await deletePpt(String(tid), campus);
        setFile(null);
        setUploadedAt(null);
        setPendingFile(null);
        setDeleting(false);
        return;
      } catch (e: any) {
        setDeleting(false);
        alert(e?.message || 'Failed to delete PPT');
        return;
      }
    }

    try {
      const teamName = teamData.teamName || 'team';
      const key = `ppt_${encodeURIComponent(teamName)}_${encodeURIComponent(campus)}`;
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(e);
    }
    setFile(null);
    setUploadedAt(null);
    setPendingFile(null);
    setDeleting(false);
  };

  const handleFileSelect = (f: File | null) => {
    if (!f) {
      setPendingFile(null);
      return;
    }
    if (isFrozen) {
      alert('PPT uploads are frozen by admin.');
      return;
    }
    if (!isLeader) {
      alert('Only the team lead can upload PPT.');
      return;
    }
    if (!canUpload) {
      alert('Submission window has closed.');
      return;
    }
    if (f.type !== 'application/pdf') {
      alert('Only PDF format is accepted for PPT submissions.');
      return;
    }
    if (typeof f.size === 'number' && f.size > MAX_PPT_BYTES) {
      alert(`Max PPT size is ${MAX_PPT_MB} MB.`);
      return;
    }

    setPendingFile(f);
  };

  const handleSave = async () => {
    const f = pendingFile;
    if (!f) return;
    if (isFrozen) {
      alert('PPT uploads are frozen by admin.');
      return;
    }
    if (!isLeader) {
      alert('Only the team lead can upload PPT.');
      return;
    }
    if (!canUpload) {
      alert('Submission window has closed.');
      return;
    }

    setUploading(true);

    const campus = getCampus(teamData) || 'campus';
    if (isSupabaseConfigured() && teamId) {
      try {
        const rec = await upsertPpt(String(teamId), campus, f);
        if (rec) {
          setFile({ name: rec.fileName, data: rec.url });
          setUploadedAt(Date.parse(rec.uploadedAt));
          setPendingFile(null);
          setUploading(false);
          return;
        }
      } catch (e: any) {
        setUploading(false);
        alert(e?.message || 'Upload failed');
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      const payload = { name: f.name, data: reader.result };
      setFile(payload);
      const at = Date.now();
      setUploadedAt(at);
      setPendingFile(null);
      setUploading(false);
      try {
        const teamName = teamData?.teamName || 'team';
        const key = `ppt_${encodeURIComponent(teamName)}_${encodeURIComponent(campus)}`;
        localStorage.setItem(key, JSON.stringify({ file: payload, uploadedAt: at, teamName, campus }));
      } catch (e) {
        console.warn(e);
      }
    };
    reader.onerror = () => {
      setUploading(false);
      alert('Upload failed');
    };
    reader.readAsDataURL(f);
  };

  if (!teamData) {
    return <main className="hh-page flex items-center justify-center"><div className="hh-card p-6">No session found. Please login.</div></main>;
  }

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="hh-card border-2 border-gitam-200 p-6 mb-6 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-bold text-gitam-700">PPT Submission</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        <div className="hh-card p-6 border-2 border-gitam-200 mb-6">
          <h2 className="text-2xl font-semibold text-gitam-700 mb-4">Important Instructions</h2>
          <ul className="list-disc pl-6 space-y-2 text-gitam-700">
              <li>Only team lead can upload/delete PPT. Members can only view.</li>
              <li>Only PDF format is accepted for PPT submissions.</li>
              <li>Max file size: {MAX_PPT_MB} MB.</li>
          </ul>
        </div>

        <div className="hh-card p-6 border-2 border-gitam-200 space-y-4">
          <div>
            <h2 className="text-2xl font-semibold text-gitam-700">Upload PDF</h2>
            <p className="text-gitam-700/75 mt-1">Only PDF files are accepted.</p>
          </div>

          {file ? (
            <div className="p-4 bg-antique/60 border-2 border-gitam-200 rounded-xl text-gitam-700 space-y-2">
              <div className="font-semibold">Uploaded file: {file.name}</div>
              {uploadedAt ? <div className="text-sm text-gitam-700/75">Last updated: {new Date(uploadedAt).toLocaleString()}</div> : null}
              <div className="flex flex-wrap items-center gap-3">
                <a href={file.data} download={file.name} className="hh-btn-outline inline-block px-4 py-2">View / Download</a>
                {isLeader ? (
                  <button onClick={removePPT} disabled={!removable || deleting} className="hh-btn-outline px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    {deleting ? 'Deleting...' : 'Delete file'}
                  </button>
                ) : null}
              </div>
              {isLeader ? (
                !removable ? <div className="text-sm text-gitam-700/75">{isFrozen ? 'Deletion is frozen by admin.' : `Deletion is allowed only until ${formatFriendly(PPT_DEADLINE)}.`}</div> : <div className="text-sm text-gitam-700/75">You can view or delete this file until {formatFriendly(PPT_DEADLINE)}.</div>
              ) : (
                <div className="text-sm text-gitam-700/75">Members can only view/download this uploaded PPT.</div>
              )}
            </div>
          ) : isLeader ? (
            <div className="p-4 bg-antique/60 border-2 border-gitam-200 rounded-xl">
              <input accept="application/pdf,.pdf" type="file" onChange={(e) => handleFileSelect(e.target.files?.[0] || null)} disabled={!canUpload || uploading} className="block w-full text-gitam-700" />
              {pendingFile ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-gitam-700">
                  <span className="text-sm">Selected file: {pendingFile.name}</span>
                  <button onClick={handleSave} disabled={uploading || !canUpload} className="hh-btn px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    {uploading ? 'Saving...' : 'Save file'}
                  </button>
                  <button onClick={() => setPendingFile(null)} disabled={uploading} className="hh-btn-outline px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                    Clear
                  </button>
                </div>
              ) : null}
              {isFrozen && <p className="text-sm mt-3 text-red-600">PPT uploads are frozen by admin.</p>}
              {!isFrozen && !canUpload && <p className="text-sm mt-3 text-gitam-700/75">Submission closed. Uploads were allowed until {formatFriendly(PPT_DEADLINE)}.</p>}
              <p className="text-sm mt-3 text-gitam-700/75">Choose one PDF, then click Save file. Max size: {MAX_PPT_MB} MB.</p>
            </div>
          ) : (
            <div className="p-4 bg-antique/60 border-2 border-gitam-200 rounded-xl text-gitam-700/75">
              PPT is not yet uploaded.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
