'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteNoc,
  getNoc,
  getNocDeadline,
  listNocUploadsForTeams,
  MAX_NOC_BYTES,
  subscribeAdminNocChanges,
  upsertNoc,
} from '@/lib/nocBackend';
import { isSupabaseConfigured } from '@/lib/supabaseClient';
import { refreshCurrentTeamSession } from '@/lib/teamSession';

type UploadFile = {
  name: string;
  data: string;
};

const DEFAULT_DEADLINE = new Date('2026-03-27T18:00:00');

const normalizeToken = (value: unknown) => String(value || '').trim().toLowerCase();

const candidateTokens = (member: any): string[] => {
  const rawValues = [
    member?.id,
    member?.memberId,
    member?.registrationNumber,
    member?.regNo,
    member?.email,
    member?.phoneNumber,
    member?.phone,
    member?.name,
  ];
  return Array.from(new Set(rawValues.map(normalizeToken).filter(Boolean)));
};

const memberRowId = (member: any, index: number) =>
  member?.registrationNumber || member?.regNo || member?.email || member?.name || `member-${index}`;

const formatFriendly = (date: Date) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = date.getDate();
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

  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${months[date.getMonth()]} ${day}${suffix(day)}, ${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''} ${ampm}`;
};

export default function NOCPage() {
  const router = useRouter();
  const maxNocMb = Math.round(MAX_NOC_BYTES / (1024 * 1024));

  const [tab, setTab] = useState<'individual' | 'team'>('individual');
  const [teamData, setTeamData] = useState<any>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [file, setFile] = useState<UploadFile | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [effectiveDeadline, setEffectiveDeadline] = useState<Date>(DEFAULT_DEADLINE);
  const [isFrozen, setIsFrozen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [memberUploadStatus, setMemberUploadStatus] = useState<Record<string, boolean>>({});

  const refreshFromLocal = () => {
    try {
      const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
      if (!current?.team) return;

      const resolvedMemberId = isSupabaseConfigured()
        ? current.memberId || current.identifier || current.identifierNormalized || current.id || null
        : current.identifier || current.identifierNormalized || current.memberId || current.id || null;

      setTeamData(current.team);
      setCurrentMemberId(resolvedMemberId ? String(resolvedMemberId) : null);

      const globalLocked = localStorage.getItem('noc_general_deadline_locked') === 'true';
      setIsFrozen(globalLocked);

      let nextDeadline = DEFAULT_DEADLINE;
      const globalDeadline = localStorage.getItem('noc_general_deadline');
      if (globalDeadline) {
        const parsedGlobal = new Date(globalDeadline);
        if (!Number.isNaN(parsedGlobal.getTime()) && parsedGlobal > nextDeadline) {
          nextDeadline = parsedGlobal;
        }
      }

      if (resolvedMemberId) {
        const memberDeadlineKey = `noc_deadline_${encodeURIComponent(current.team.teamName)}_${encodeURIComponent(String(resolvedMemberId))}`;
        const memberDeadline = localStorage.getItem(memberDeadlineKey);
        if (memberDeadline) {
          const parsedMember = new Date(memberDeadline);
          if (!Number.isNaN(parsedMember.getTime()) && parsedMember > nextDeadline) {
            nextDeadline = parsedMember;
          }
        }

        const fileKey = `noc_${encodeURIComponent(current.team.teamName)}_${encodeURIComponent(String(resolvedMemberId))}`;
        const raw = localStorage.getItem(fileKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          setFile(parsed?.file || null);
          setUploadedAt(parsed?.uploadedAt || null);
          setPendingFile(null);
        } else {
          setFile(null);
          setUploadedAt(null);
        }
      } else {
        setFile(null);
        setUploadedAt(null);
        setPendingFile(null);
      }

      setEffectiveDeadline(nextDeadline);

      const nextStatus: Record<string, boolean> = {};
      (current.team.members || []).forEach((member: any, index: number) => {
        const hasUpload = candidateTokens(member).some((token) => {
          const encodedKey = `noc_${encodeURIComponent(current.team.teamName)}_${encodeURIComponent(token)}`;
          const plainKey = `noc_${current.team.teamName}_${token}`;
          return Boolean(localStorage.getItem(encodedKey) || localStorage.getItem(plainKey));
        });
        nextStatus[memberRowId(member, index)] = hasUpload;
      });
      setMemberUploadStatus(nextStatus);
    } catch (error) {
      console.warn(error);
    }
  };

  const refreshFromBackend = async () => {
    try {
      const current = await refreshCurrentTeamSession();
      if (!current?.team) return;

      const resolvedMemberId = current.memberId || current.identifier || current.identifierNormalized || null;
      setTeamData(current.team);
      setCurrentMemberId(resolvedMemberId ? String(resolvedMemberId) : null);

      const globalLocked = localStorage.getItem('noc_general_deadline_locked') === 'true';
      setIsFrozen(globalLocked);

      if (resolvedMemberId) {
        const rec = await getNoc(current.team.teamName, String(resolvedMemberId));
        if (rec) {
          setFile({ name: rec.fileName, data: rec.url });
          setUploadedAt(Date.parse(rec.uploadedAt));
          setPendingFile(null);
        } else {
          setFile(null);
          setUploadedAt(null);
        }

        const deadlineIso = await getNocDeadline(current.team.teamName, String(resolvedMemberId));
        if (deadlineIso) {
          const parsed = new Date(deadlineIso);
          setEffectiveDeadline(Number.isNaN(parsed.getTime()) ? DEFAULT_DEADLINE : parsed);
        } else {
          setEffectiveDeadline(DEFAULT_DEADLINE);
        }
      } else {
        setFile(null);
        setUploadedAt(null);
        setPendingFile(null);
        setEffectiveDeadline(DEFAULT_DEADLINE);
      }

      const rows = await listNocUploadsForTeams([current.team.teamName]);
      const uploadedTokens = new Set(rows.map((row) => normalizeToken(row.memberId)).filter(Boolean));
      const nextStatus: Record<string, boolean> = {};
      (current.team.members || []).forEach((member: any, index: number) => {
        nextStatus[memberRowId(member, index)] = candidateTokens(member).some((token) => uploadedTokens.has(token));
      });
      setMemberUploadStatus(nextStatus);
    } catch (error) {
      console.warn(error);
    }
  };

  useEffect(() => {
    if (isSupabaseConfigured()) {
      void refreshFromBackend();
      const unsubscribe = subscribeAdminNocChanges(() => {
        void refreshFromBackend();
      });
      return () => {
        unsubscribe();
      };
    }

    refreshFromLocal();
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key.startsWith('noc_')) {
        refreshFromLocal();
      }
    };
    window.addEventListener('storage', onStorage);
    const poll = setInterval(refreshFromLocal, 2500);
    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  const handleFileSelect = (selectedFile: File | null) => {
    if (!selectedFile) {
      setPendingFile(null);
      return;
    }
    if (isFrozen) {
      alert('NOC uploads have been frozen by admin.');
      return;
    }
    if (new Date() > effectiveDeadline) {
      alert('Upload window has closed.');
      return;
    }
    if (selectedFile.type !== 'application/pdf') {
      alert('Only PDF files are allowed.');
      return;
    }
    if (typeof selectedFile.size === 'number' && selectedFile.size > MAX_NOC_BYTES) {
      alert(`Max NOC size is ${maxNocMb} MB.`);
      return;
    }

    setPendingFile(selectedFile);
  };

  const handleFileSave = () => {
    if (!pendingFile || !teamData || !currentMemberId) return;

    setUploading(true);

    if (isSupabaseConfigured()) {
      (async () => {
        try {
          const rec = await upsertNoc(teamData.teamName, String(currentMemberId), pendingFile);
          if (rec) {
            setFile({ name: rec.fileName, data: rec.url });
            setUploadedAt(Date.parse(rec.uploadedAt));
            setPendingFile(null);
            await refreshFromBackend();
          }
        } catch (error) {
          console.warn(error);
          alert('Upload failed.');
        } finally {
          setUploading(false);
        }
      })();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const payload = { name: pendingFile.name, data: String(reader.result || '') };
      const at = Date.now();
      try {
        const fileKey = `noc_${encodeURIComponent(teamData.teamName)}_${encodeURIComponent(String(currentMemberId))}`;
        localStorage.setItem(fileKey, JSON.stringify({ file: payload, uploadedAt: at }));
      } catch (error) {
        console.warn(error);
      }
      setFile(payload);
      setUploadedAt(at);
      setPendingFile(null);
      setUploading(false);
      refreshFromLocal();
    };
    reader.onerror = () => {
      setUploading(false);
      alert('Upload failed.');
    };
    reader.readAsDataURL(pendingFile);
  };

  const handleDelete = () => {
    if (!teamData || !currentMemberId || !file) return;
    if (isFrozen) {
      alert('NOC uploads have been frozen by admin.');
      return;
    }
    if (new Date() > effectiveDeadline) {
      alert('Deletion window has closed.');
      return;
    }

    setDeleting(true);

    if (isSupabaseConfigured()) {
      (async () => {
        try {
          await deleteNoc(teamData.teamName, String(currentMemberId));
          setFile(null);
          setUploadedAt(null);
          setPendingFile(null);
          await refreshFromBackend();
        } catch (error) {
          console.warn(error);
          alert('Delete failed.');
        } finally {
          setDeleting(false);
        }
      })();
      return;
    }

    try {
      const fileKey = `noc_${encodeURIComponent(teamData.teamName)}_${encodeURIComponent(String(currentMemberId))}`;
      localStorage.removeItem(fileKey);
      setFile(null);
      setUploadedAt(null);
      setPendingFile(null);
      refreshFromLocal();
    } catch (error) {
      console.warn(error);
      alert('Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  if (!teamData) {
    return (
      <main className="hh-page flex items-center justify-center">
        <div className="hh-card p-6">No session found. Please login.</div>
      </main>
    );
  }

  const members = Array.isArray(teamData.members) ? teamData.members : [];
  const canUpload = !isFrozen && Boolean(currentMemberId) && new Date() < effectiveDeadline;
  const canDelete = !isFrozen && Boolean(currentMemberId) && Boolean(file) && new Date() < effectiveDeadline;

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="hh-card border-2 border-gitam-200 p-6 mb-6 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-bold text-gitam-700">NOC Upload</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        <div className="mb-6 flex gap-3">
          <button
            onClick={() => setTab('individual')}
            className={`px-5 py-2 rounded-xl border-2 font-semibold transition ${tab === 'individual' ? 'bg-gitam-700 text-antique border-gitam-700' : 'bg-antique border-gitam-200 text-gitam-700'}`}
          >
            Individual
          </button>
          <button
            onClick={() => setTab('team')}
            className={`px-5 py-2 rounded-xl border-2 font-semibold transition ${tab === 'team' ? 'bg-gitam-700 text-antique border-gitam-700' : 'bg-antique border-gitam-200 text-gitam-700'}`}
          >
            Team
          </button>
        </div>

        {tab === 'individual' ? (
          <div className="space-y-6">
            <div className="hh-card p-6 border-2 border-gitam-200">
              <h2 className="text-2xl font-semibold text-gitam-700 mb-4">Important Instructions</h2>
              <ul className="list-disc pl-6 space-y-2 text-gitam-700">
                <li>Please upload a signed PDF NOC before March 27th, 6 PM.</li>
                <li>Make sure the uploaded file is the correct signed document to avoid disqualification.</li>
                <li>Max file size: {maxNocMb} MB.</li>
                <li>
                  Click here to view the{' '}
                  <a
                    href="https://docs.google.com/document/d/1Z-0R7xSJj503JsBz7IYobgn1zdGQv01f_9LNCeoktVw/edit?usp=sharing"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-semibold"
                  >
                    NOC form
                  </a>
                  .
                </li>
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
                  {uploadedAt ? <div className="text-sm text-gitam-700/75">Last updated: {formatFriendly(new Date(uploadedAt))}</div> : null}
                  <div className="flex flex-wrap items-center gap-3">
                    <a href={file.data} download={file.name} target="_blank" rel="noreferrer" className="hh-btn-outline inline-block px-4 py-2">View / Download</a>
                    <button onClick={handleDelete} disabled={!canDelete || deleting} className="hh-btn-outline px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                      {deleting ? 'Deleting...' : 'Delete file'}
                    </button>
                  </div>
                  {!canDelete ? <div className="text-sm text-gitam-700/75">{isFrozen ? 'Deletion is frozen by admin.' : `Deletion is allowed only until ${formatFriendly(effectiveDeadline)}.`}</div> : <div className="text-sm text-gitam-700/75">You can view or delete this file until {formatFriendly(effectiveDeadline)}.</div>}
                </div>
              ) : null}

              {!file ? (
                <div className="p-4 bg-antique/60 border-2 border-gitam-200 rounded-xl">
                  <input
                    accept="application/pdf,.pdf"
                    type="file"
                    onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                    disabled={!canUpload || uploading}
                    className="block w-full text-gitam-700"
                  />
                  {pendingFile ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-gitam-700">
                      <span className="text-sm">Selected file: {pendingFile.name}</span>
                      <button onClick={handleFileSave} disabled={uploading} className="hh-btn px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        {uploading ? 'Saving...' : 'Save file'}
                      </button>
                      <button onClick={() => setPendingFile(null)} disabled={uploading} className="hh-btn-outline px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        Clear
                      </button>
                    </div>
                  ) : null}
                  {uploading ? <p className="text-sm mt-3 text-gitam-700/75">Uploading...</p> : null}
                  {!currentMemberId ? <p className="text-sm mt-3 text-red-600">Unable to identify the current member for NOC upload.</p> : null}
                  {isFrozen ? <p className="text-sm mt-3 text-red-600">NOC uploads have been frozen by admin.</p> : null}
                  {!isFrozen && currentMemberId && new Date() >= effectiveDeadline ? (
                    <p className="text-sm mt-3 text-red-600">Upload window closed on {formatFriendly(effectiveDeadline)}.</p>
                  ) : null}
                  <p className="text-sm mt-3 text-gitam-700/75">Choose one PDF, then click Save file. Max size: {maxNocMb} MB.</p>
                </div>
              ) : (
                <div className="p-4 bg-antique/60 border-2 border-gitam-200 rounded-xl text-gitam-700/75">
                  Only one NOC file is allowed. Use View / Download to check it or Delete file to replace it before the deadline.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="hh-card p-6 border-2 border-gitam-200 overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gitam-200">
              <thead>
                <tr className="bg-gitam-50 text-gitam-700">
                  <th className="p-3 text-left font-semibold border border-gitam-200">Name</th>
                  <th className="p-3 text-left font-semibold border border-gitam-200">Registration No.</th>
                  <th className="p-3 text-left font-semibold border border-gitam-200">Email</th>
                  <th className="p-3 text-left font-semibold border border-gitam-200">Phone</th>
                  <th className="p-3 text-center font-semibold border border-gitam-200">NOC Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member: any, index: number) => {
                  const rowKey = memberRowId(member, index);
                  const uploaded = Boolean(memberUploadStatus[rowKey]);
                  return (
                    <tr key={rowKey} className="hover:bg-gitam-50/40">
                      <td className="p-3 text-gitam-700 border border-gitam-200">{member.name || '-'}</td>
                      <td className="p-3 text-gitam-700 border border-gitam-200">{member.registrationNumber || member.regNo || '-'}</td>
                      <td className="p-3 text-gitam-700 border border-gitam-200">{member.email || '-'}</td>
                      <td className="p-3 text-gitam-700 border border-gitam-200">{member.phoneNumber || member.phone || '-'}</td>
                      <td className="p-3 text-center border border-gitam-200">
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-xs font-medium ${uploaded ? 'bg-gitam-50 text-gitam-700 border-gitam-200' : 'bg-antique/60 text-gitam-700 border-gitam-100'}`}>
                          {uploaded ? 'Uploaded' : 'Not uploaded'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {members.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gitam-700/60 border border-gitam-200">No members found.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
