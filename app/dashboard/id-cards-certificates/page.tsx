'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listIdCardCertificatesForTeam } from '@/lib/idCardCertificateBackend';
import { refreshCurrentTeamSession } from '@/lib/teamSession';

export default function IdCardsCertificatesPage() {
  const [teamData, setTeamData] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Synchronous bootstrap — show content instantly from cached session
    try {
      const snapshot = JSON.parse(localStorage.getItem('currentTeam') || 'null');
      if (snapshot?.team) setTeamData(snapshot.team);
    } catch { /* ignore */ }

    const load = async () => {
      try {
        const current = await refreshCurrentTeamSession();
        if (current) setTeamData(current.team);
      } catch (e) { console.warn(e); }
      finally { setSessionLoaded(true); }
    };

    void load();

    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'currentTeam') {
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

  useEffect(() => {
    if (!teamData) return;
    const key = `idCardsCertificates_${encodeURIComponent(teamData.teamName)}`;
    const load = async () => {
      try {
        const remote = await listIdCardCertificatesForTeam(String(teamData.teamName || ''));
        if (Array.isArray(remote)) {
          setCoupons(remote as any[]);
          return;
        }
      } catch {
        // Fallback to local cache.
      }

      try {
        const raw = localStorage.getItem(key);
        if (raw) setCoupons(JSON.parse(raw));
      } catch (e) { console.warn(e); }
    };
    void load();
    const onStorage = (e: StorageEvent) => { if (e.key === key) void load(); };
    window.addEventListener('storage', onStorage);
    const poll = setInterval(() => {
      void load();
    }, 2500);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, [teamData]);

  if (!sessionLoaded && !teamData) {
    return <main className="hh-page" />;
  }

  if (!teamData) return (
    <main className="hh-page flex items-center justify-center">
      <div className="hh-card p-6">No session found. Please login.</div>
    </main>
  );

  const members: any[] = Array.isArray(teamData.members) ? teamData.members : [];

  const normalizeToken = (value: any) => String(value || '').trim().toLowerCase();

  const memberTokens = (member: any, index: number): string[] => {
    const values = [
      member?.id,
      member?.memberId,
      member?.registrationNumber,
      member?.regNo,
      member?.email,
      member?.phoneNumber,
      member?.phone,
      member?.name,
      `member${index}`,
    ];
    return Array.from(new Set(values.map(normalizeToken).filter(Boolean)));
  };

  const getMealStatus = (member: any, index: number, meal: 'ID Cards' | 'Certificates') => {
    const tokens = memberTokens(member, index);
    const found = coupons.find((c: any) => {
      const couponMemberId = normalizeToken(c?.memberId);
      const couponMemberName = normalizeToken(c?.memberName);
      const samePerson = tokens.includes(couponMemberId) || (couponMemberName && tokens.includes(couponMemberName));
      return samePerson && String(c?.meal || '') === meal;
    });
    return found?.redeemed ? 'Redeemed' : 'Not redeemed';
  };

  return (
    <main className="hh-page p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header card */}
        <div className="hh-card border-2 border-gitam-200 p-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-gitam-700">ID Card &amp; Certificates</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        {/* Table card */}
        <div className="hh-card border-2 border-gitam-200 p-6 overflow-x-auto">
          <table className="w-full text-sm border-collapse border border-gitam-200">
            <thead>
              <tr className="bg-gitam-50 text-gitam-700">
                <th className="p-3 text-left font-semibold border border-gitam-200">Name</th>
                <th className="p-3 text-left font-semibold border border-gitam-200">Registration No.</th>
                <th className="p-3 text-left font-semibold border border-gitam-200">Email</th>
                <th className="p-3 text-left font-semibold border border-gitam-200">Phone</th>
                <th className="p-3 text-center font-semibold border border-gitam-200">ID Cards</th>
                <th className="p-3 text-center font-semibold border border-gitam-200">Certificates</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m: any, i: number) => {
                const idCardsStatus = getMealStatus(m, i, 'ID Cards');
                const certificatesStatus = getMealStatus(m, i, 'Certificates');
                return (
                  <tr key={i} className="hover:bg-gitam-50/40">
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.name || '-'}</td>
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.registrationNumber || m.regNo || '-'}</td>
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.email || '-'}</td>
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.phoneNumber || m.phone || '-'}</td>
                    <td className="p-3 text-center border border-gitam-200">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-xs font-medium ${idCardsStatus === 'Redeemed' ? 'bg-gitam-50 text-gitam-700 border-gitam-200' : 'bg-antique/60 text-gitam-700 border-gitam-100'}`}>
                        {idCardsStatus}
                      </span>
                    </td>
                    <td className="p-3 text-center border border-gitam-200">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-xs font-medium ${certificatesStatus === 'Redeemed' ? 'bg-gitam-50 text-gitam-700 border-gitam-200' : 'bg-antique/60 text-gitam-700 border-gitam-100'}`}>
                        {certificatesStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gitam-700/60 border border-gitam-200">No members found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}


