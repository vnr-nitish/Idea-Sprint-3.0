'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function TeamClient() {
  const search = useSearchParams();
  const idxParam = search.get('idx');
  const idx = idxParam ? parseInt(idxParam, 10) : NaN;

  const [team, setTeam] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const reg = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
      if (!isNaN(idx) && reg[idx]) {
        setTeam(JSON.parse(JSON.stringify(reg[idx])));
      } else {
        setTeam(null);
      }
    } catch (e) {
      setTeam(null);
    } finally {
      setLoaded(true);
    }
  }, [idx]);

  const saveTeam = () => {
    if (!team) return;
    try {
      const reg = JSON.parse(localStorage.getItem('registeredTeams') || '[]');
      if (!isNaN(idx) && reg[idx]) {
        reg[idx] = team;
        localStorage.setItem('registeredTeams', JSON.stringify(reg));
        alert('Saved');
      } else {
        alert('Invalid team index');
      }
    } catch (e) {
      alert('Save failed');
    }
  };

  if (!loaded) return null;

  return (
    <main className="hh-page p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gitam-700">Team Details</h1>
          <div className="flex gap-2">
            <button onClick={() => window.close()} className="hh-btn-ghost px-3 py-1">Close</button>
            <button onClick={saveTeam} className="hh-btn px-3 py-1">Save</button>
          </div>
        </div>

        {!team && (
          <div className="hh-card p-4">Team not found for index {String(idx)}</div>
        )}

        {team && (
          <div className="hh-card p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Team Name</label>
                <input value={team.teamName} onChange={(e) => setTeam((p: any) => ({ ...p, teamName: e.target.value }))} className="hh-input w-full" />
              </div>
              <div>
                <label className="text-sm">Domain</label>
                <input value={team.domain} onChange={(e) => setTeam((p: any) => ({ ...p, domain: e.target.value }))} className="hh-input w-full" />
              </div>
              <div>
                <label className="text-sm">Team Password</label>
                <input value={team.teamPassword} onChange={(e) => setTeam((p: any) => ({ ...p, teamPassword: e.target.value }))} className="hh-input w-full" />
              </div>
              <div>
                <label className="text-sm">Created</label>
                <div className="px-2 py-1 text-sm text-gitam-700/75">{team.createdAt || '-'}</div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold">Members</h3>
              <div className="grid grid-cols-1 gap-3 mt-2">
                {(team.members || []).map((m: any, i: number) => (
                  <div key={i} className="p-3 border border-gitam-100 rounded-xl bg-antique/60 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input value={m.name} onChange={(e) => { const copy = { ...team }; copy.members[i].name = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Name" />
                    <input value={m.registrationNumber} onChange={(e) => { const copy = { ...team }; copy.members[i].registrationNumber = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Registration Number" />
                    <input value={m.email} onChange={(e) => { const copy = { ...team }; copy.members[i].email = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Email" />
                    <input value={m.phoneNumber} onChange={(e) => { const copy = { ...team }; copy.members[i].phoneNumber = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Phone" />
                    <input value={m.school} onChange={(e) => { const copy = { ...team }; copy.members[i].school = e.target.value; setTeam(copy); }} className="hh-input" placeholder="School" />
                    <input value={m.program} onChange={(e) => { const copy = { ...team }; copy.members[i].program = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Program" />
                    <input value={m.programOther} onChange={(e) => { const copy = { ...team }; copy.members[i].programOther = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Program Other" />
                    <input value={m.branch} onChange={(e) => { const copy = { ...team }; copy.members[i].branch = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Branch" />
                    <input value={m.campus} onChange={(e) => { const copy = { ...team }; copy.members[i].campus = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Campus" />
                    <input value={m.stay} onChange={(e) => { const copy = { ...team }; copy.members[i].stay = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Stay (Hostel/Day Scholar)" />
                    <input value={m.yearOfStudy} onChange={(e) => { const copy = { ...team }; copy.members[i].yearOfStudy = e.target.value; setTeam(copy); }} className="hh-input" placeholder="Year of Study" />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => window.close()} className="hh-btn-ghost px-3 py-1">Close</button>
              <button onClick={saveTeam} className="hh-btn px-3 py-1">Save</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
