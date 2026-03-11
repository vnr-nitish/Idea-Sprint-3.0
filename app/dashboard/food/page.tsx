'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function FoodPage() {
  const [teamData, setTeamData] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const router = useRouter();

  useEffect(() => {
    try {
      const current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
      if (current) setTeamData(current.team);
    } catch (e) { console.warn(e); }
  }, []);

  useEffect(() => {
    if (!teamData) return;
    const key = `foodCoupons_${encodeURIComponent(teamData.teamName)}`;
    const load = () => {
      try {
        const raw = localStorage.getItem(key);
        if (raw) setCoupons(JSON.parse(raw));
      } catch (e) { console.warn(e); }
    };
    load();
    const onStorage = (e: StorageEvent) => { if (e.key === key) load(); };
    window.addEventListener('storage', onStorage);
    const poll = setInterval(load, 2500);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, [teamData]);

  if (!teamData) return (
    <main className="hh-page flex items-center justify-center">
      <div className="hh-card p-6">No session found. Please login.</div>
    </main>
  );

  const members: any[] = Array.isArray(teamData.members) ? teamData.members : [];

  const getMealStatus = (memberId: string, meal: 'Dinner' | 'Lunch') => {
    const found = coupons.find((c: any) => String(c.memberId) === String(memberId) && String(c.meal) === meal);
    return found?.redeemed ? 'Redeemed' : 'Not redeemed';
  };

  return (
    <main className="hh-page p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header card */}
        <div className="hh-card border-2 border-gitam-200 p-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-gitam-700">Food Coupons</h1>
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
                <th className="p-3 text-center font-semibold border border-gitam-200">Dinner</th>
                <th className="p-3 text-center font-semibold border border-gitam-200">Lunch</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m: any, i: number) => {
                const memberId = m.registrationNumber || m.regNo || m.email || m.name || `member${i}`;
                const dinnerStatus = getMealStatus(memberId, 'Dinner');
                const lunchStatus = getMealStatus(memberId, 'Lunch');
                return (
                  <tr key={i} className="hover:bg-gitam-50/40">
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.name || '-'}</td>
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.registrationNumber || m.regNo || '-'}</td>
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.email || '-'}</td>
                    <td className="p-3 text-gitam-700 border border-gitam-200">{m.phoneNumber || m.phone || '-'}</td>
                    <td className="p-3 text-center border border-gitam-200">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-xs font-medium ${dinnerStatus === 'Redeemed' ? 'bg-gitam-50 text-gitam-700 border-gitam-200' : 'bg-antique/60 text-gitam-700 border-gitam-100'}`}>
                        {dinnerStatus}
                      </span>
                    </td>
                    <td className="p-3 text-center border border-gitam-200">
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-xs font-medium ${lunchStatus === 'Redeemed' ? 'bg-gitam-50 text-gitam-700 border-gitam-200' : 'bg-antique/60 text-gitam-700 border-gitam-100'}`}>
                        {lunchStatus}
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


