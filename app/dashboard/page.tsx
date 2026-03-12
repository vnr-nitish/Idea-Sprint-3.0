"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { refreshCurrentTeamSession } from '@/lib/teamSession';

type TeamMember = {
  name?: string;
  email?: string;
  phoneNumber?: string;
  registrationNumber?: string;
  school?: string;
  program?: string;
  programOther?: string;
  branch?: string;
};

export default function DashboardPage() {
  const [teamData, setTeamData] = useState<any>(null);
  const [active, setActive] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState<string>("");
  const router = useRouter();

  const juries = [
    { name: "Dr. Rajesh Kumar", designation: "Lead Mentor", photo: "👨‍💼" },
    { name: "Prof. Priya Singh", designation: "Tech Lead", photo: "👩‍💼" },
    { name: "Mr. Arjun Patel", designation: "Industry Expert", photo: "👨‍💼" },
    { name: "Ms. Kavya Reddy", designation: "Product Specialist", photo: "👩‍💼" },
    { name: "Dr. Sandeep Verma", designation: "Innovation Mentor", photo: "👨‍💼" },
  ];

  const contacts = [
    { name: "Nitish Raj Vinnakota", email: "nvinnako2@gitam.in", phone: "6304003099", designation: "University Lead" },
    { name: "Eesha Chowdary Thottempudi", email: "ethottem@gitam.in", phone: "6300427457", designation: "Campus Lead" },
    { name: "Akanksha", email: "aakanksh@gitam.in", phone: "7032076051", designation: "University Lead - Upcoming" },
    { name: "Jothisk Nandan Palla", email: "jpalla2@gitam.in", phone: "6304110542", designation: "Campus Lead - Upcoming" },
  ];

  useEffect(() => {
    const load = async () => {
      try {
        const current = await refreshCurrentTeamSession();
        if (current) {
          setTeamData(current.team);
          setIdentifier(current.identifier || current.identifierNormalized || "");
        }
      } catch (e) {
        console.warn(e);
      }
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
    }, 3000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    // If no team session, redirect to login after a short delay
    if (!teamData) {
      const id = setTimeout(() => {
        try { router.push('/login'); } catch (e) { /* ignore */ }
      }, 700);
      return () => clearTimeout(id);
    }
  }, [teamData, router]);

  if (!teamData) {
    return (
      <main className="hh-page pt-20 flex items-center justify-center">
        <div className="hh-card p-8">No team session found. Please login.</div>
      </main>
    );
  }

  const participant = teamData?.members?.find((m: any) => {
    const id = (identifier || "").toLowerCase();
    return [m.email, m.phoneNumber, m.registrationNumber]
      .map((s: string) => (s || "").toLowerCase())
      .includes(id);
  });
  const participantName = participant?.name || teamData?.members?.[0]?.name || "";

  const TeamProfile = () => (
    <section>
      <h2 className="text-2xl font-bold mb-4">Team: {teamData.teamName}</h2>
      <p className="mb-4">Domain: {teamData.domain}</p>
      <div className="space-y-4">
        {teamData.members.map((m: TeamMember, idx: number) => (
          <div
            key={idx}
            className={`p-4 rounded border ${
              (m.email || "").toLowerCase() === (identifier || "").toLowerCase() ? "border-gitam-600 bg-gitam-50" : "border-gitam-100 bg-antique-50"
            }`}
          >
            <p className="font-semibold">{idx === 0 ? "Team Lead" : `Member ${idx}`}: {m.name}</p>
            <p className="text-sm">Email: {m.email}</p>
            <p className="text-sm">Phone: {m.phoneNumber}</p>
            <p className="text-sm">Reg No: {m.registrationNumber}</p>
          </div>
        ))}
      </div>
    </section>
  );

  const FoodCoupons = () => {
    const [coupons, setCoupons] = useState(() => [
      { day: "Day 1", meal: "Breakfast", qr: "QR1", redeemed: false },
      { day: "Day 1", meal: "Lunch", qr: "QR2", redeemed: false },
      { day: "Day 1", meal: "Dinner", qr: "QR3", redeemed: false },
    ]);
    const redeem = (i: number) => setCoupons((prev) => prev.map((c, idx) => (idx === i ? { ...c, redeemed: true } : c)));
    return (
      <section>
        <h2 className="text-2xl font-bold mb-4">Food Coupons</h2>
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left">
              <th className="p-2">Itinerary</th>
              <th className="p-2">QR Code</th>
              <th className="p-2">Redeemed</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{c.day} — {c.meal}</td>
                <td className="p-2">{c.redeemed ? "—" : c.qr}</td>
                <td className="p-2">{c.redeemed ? "Yes" : "No"}</td>
                <td className="p-2">{!c.redeemed && <button onClick={() => redeem(i)} className="hh-btn px-3 py-1">Redeem</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  };

  const NOCUpload = () => {
    const [file, setFile] = useState<any>(null);
    const [uploadedAt, setUploadedAt] = useState<number | null>(null);
    const handleFile = (f: File | null) => {
      if (!f) return;
      if (f.type !== "application/pdf") {
        alert("Only PDF allowed");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFile({ name: f.name, data: reader.result });
        setUploadedAt(Date.now());
      };
      reader.readAsDataURL(f);
    };

    const removable = !uploadedAt || (Date.now() - (uploadedAt || 0)) < 1000 * 60 * 60;

    return (
      <section>
        <h2 className="text-2xl font-bold mb-4">NOC Upload</h2>
        {file ? (
          <div className="space-y-2">
            <p className="font-semibold">Uploaded: {file.name}</p>
            {removable ? <button onClick={() => setFile(null)} className="hh-btn-outline px-3 py-1">Remove</button> : <p className="text-sm text-gitam-700/75">Removal window expired</p>}
          </div>
        ) : (
          <div>
            <input accept="application/pdf" type="file" onChange={(e) => handleFile(e.target.files?.[0] || null)} />
          </div>
        )}
      </section>
    );
  };

  const PPTSubmission = () => {
    const [file, setFile] = useState<any>(null);
    const handleFile = (f: File | null) => {
      if (!f) return;
      const allowed = ["application/pdf", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];
      if (!allowed.includes(f.type)) return alert("Only PPT or PDF allowed");
      setFile({ name: f.name });
    };
    return (
      <section>
        <h2 className="text-2xl font-bold mb-4">PPT Submission</h2>
        {file ? <div className="space-y-2"><p className="font-semibold">Uploaded: {file.name}</p></div> : <div><input accept=".pdf,.ppt,.pptx" type="file" onChange={(e) => handleFile(e.target.files?.[0] || null)} /></div>}
      </section>
    );
  };

  const ProblemStatement = () => {
    const [selected, setSelected] = useState<string | null>(teamData.selectedProblem || null);
    const isLead = (teamData.members?.[0]?.email || "").toLowerCase() === (identifier || "").toLowerCase();
    const options = ["Improve Campus Sustainability", "Smart Attendance", "AI for Healthcare"];

    const choose = (opt: string) => {
      if (!isLead) return;
      setSelected(opt);
      try {
        const registered = JSON.parse(localStorage.getItem("registeredTeams") || "[]");
        const updated = registered.map((t: any) => t.teamName === teamData.teamName ? { ...t, selectedProblem: opt } : t);
        localStorage.setItem("registeredTeams", JSON.stringify(updated));
        localStorage.setItem("currentTeam", JSON.stringify({ team: { ...teamData, selectedProblem: opt }, identifier }));
      } catch { /* ignore */ }
    };

    return (
      <section>
        <h2 className="text-2xl font-bold mb-4">Problem Statement</h2>
        {selected ? (
          <div>
            <p className="font-semibold">Selected: {selected}</p>
            {!isLead && <p className="text-sm text-gitam-700/75">Only team lead can select/change</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <p>Select a problem (team lead only):</p>
            <div className="flex gap-2 flex-wrap">
              {options.map((o) => <button key={o} onClick={() => choose(o)} disabled={!isLead} className="hh-btn-outline px-3 py-1 disabled:opacity-50">{o}</button>)}
            </div>
          </div>
        )}
      </section>
    );
  };

  const Reporting = () => (
    <section>
      <h2 className="text-2xl font-bold mb-4">Reporting Details</h2>
      <p>Reporting Date: 2026-02-10</p>
      <p>Reporting Time: 09:00 AM</p>
      <p>Venue: Main Auditorium, GITAM</p>
      <p>Contact: +91 98765 43210 (Event Office)</p>
    </section>
  );

  return (
    <main className="hh-page pt-8 pb-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-gitam-700">Dashboard</h1>
          <div className="text-sm text-gitam-700/80">Team: <span className="font-semibold text-gitam-700">{teamData.teamName}</span></div>
          <div className="mt-2 text-lg text-gitam-700">Welcome, <span className="font-semibold text-gitam-700">{participantName}</span></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <button onClick={() => { setActive('profile'); router.push('/dashboard/profile'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='profile' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">👥</div>
            <div className="mt-3 text-gitam-700">Team Profile</div>
          </button>

          <button onClick={() => { setActive('food'); router.push('/dashboard/food'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='food' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">🍽️</div>
            <div className="mt-3 text-gitam-700">Food Coupons</div>
          </button>

          <button onClick={() => { setActive('noc'); router.push('/dashboard/noc'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='noc' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">📄</div>
            <div className="mt-3 text-gitam-700">NOC Upload</div>
          </button>

          <button onClick={() => { setActive('ppt'); router.push('/dashboard/ppt'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='ppt' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">📊</div>
            <div className="mt-3 text-gitam-700">PPT Submission</div>
          </button>

          <button onClick={() => { setActive('problem'); router.push('/dashboard/problem'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='problem' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">🧩</div>
            <div className="mt-3 text-gitam-700">Problem Statement</div>
          </button>

          <button onClick={() => { setActive('reporting'); router.push('/dashboard/reporting'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='reporting' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">🗓️</div>
            <div className="mt-3 text-gitam-700">Reporting Details</div>
          </button>

          <button onClick={() => { setActive('spoc'); router.push('/dashboard/spoc'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='spoc' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">🧑‍💼</div>
            <div className="mt-3 text-gitam-700">SPOC</div>
          </button>

          <button onClick={() => { setActive('others'); router.push('/dashboard/others'); }} className={`col-span-1 p-4 bg-antique-50 hover:bg-gitam-50 rounded-lg border-2 border-gitam-300 flex flex-col items-center justify-center ${active==='others' ? 'ring-4 ring-gitam/20' : ''}`}>
            <div className="w-14 h-14 rounded-full border-2 border-gitam-600 bg-antique flex items-center justify-center text-2xl shadow-sm">🔗</div>
            <div className="mt-3 text-gitam-700">Others</div>
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-6">
          <div className="pt-2 pb-4">
            <h3 className="text-4xl font-bold text-center mb-8 text-gitam-700">Hackathon Timeline</h3>
            <div className="max-w-3xl mx-auto">
              <div className="p-8 rounded-2xl bg-gradient-to-br from-gitam to-gitam-700 text-antique shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm opacity-80">Start Date & Time</p>
                      <p className="text-xl font-semibold">March 27th, 2026 • 4:00 PM</p>
                    </div>
                    <div>
                      <p className="text-sm opacity-80">End Date & Time</p>
                      <p className="text-xl font-semibold">March 28th, 2026 • 4:00 PM</p>
                    </div>
                    <p className="text-sm opacity-80">Duration: 24 Hours</p>
                  </div>
                  <div className="md:border-l md:border-antique/30 md:pl-8 space-y-4">
                    <div>
                      <p className="text-sm opacity-80">Venue</p>
                      <p className="text-xl font-semibold">Shivaji Auditorium, ICT Bhavan, GITAM Visakhapatnam</p>
                    </div>
                    <div>
                      <p className="text-sm opacity-80">Reporting Time</p>
                      <p className="text-xl font-semibold">March 27th, 2026 • 4:00 PM</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="py-4 px-1 bg-gitam-50 rounded-2xl">
            <h3 className="text-4xl font-bold text-center mb-10 text-gitam-700">Meet the Jury</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {juries.map((jury, index) => (
                <div key={index} className="relative hh-card p-8 hover:shadow-xl transition text-center overflow-hidden">
                  <div className="blur-sm select-none">
                    <div className="text-7xl mb-4">{jury.photo}</div>
                    <h4 className="text-2xl font-bold text-gitam-700 mb-2">{jury.name}</h4>
                    <p className="text-lg text-gitam font-semibold">{jury.designation}</p>
                  </div>
                  <div className="absolute inset-0 bg-antique/45 backdrop-blur-[2px] flex items-center justify-center">
                    <span className="px-4 py-1.5 rounded-full border-2 border-gitam-300 bg-antique/90 text-gitam-700 font-semibold text-sm tracking-wide">
                      Coming Soon
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="py-4">
            <h3 className="text-4xl font-bold text-center mb-10 text-gitam-700">Cash Prizes</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-8 rounded-2xl border border-gitam-100 bg-gitam-700 text-antique shadow-lg text-center transform hover:scale-[1.02] transition">
                <div className="text-5xl mb-4">🥇</div>
                <h4 className="text-2xl font-bold mb-2">1st Prize</h4>
                <p className="text-3xl font-bold">₹ 10,000</p>
              </div>
              <div className="p-8 rounded-2xl border border-gitam-100 bg-gitam-600 text-antique shadow-lg text-center transform hover:scale-[1.02] transition">
                <div className="text-5xl mb-4">🥈</div>
                <h4 className="text-2xl font-bold mb-2">2nd Prize</h4>
                <p className="text-3xl font-bold">₹ 6,000</p>
              </div>
              <div className="p-8 rounded-2xl border border-gitam-100 bg-gitam text-antique shadow-lg text-center transform hover:scale-[1.02] transition">
                <div className="text-5xl mb-4">🥉</div>
                <h4 className="text-2xl font-bold mb-2">3rd Prize</h4>
                <p className="text-3xl font-bold">₹ 4,000</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-gitam-700 to-gitam-800 text-antique py-12 px-6 rounded-2xl">
            <h3 className="text-4xl font-bold text-center mb-10">Contact Us</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {contacts.map((contact, index) => (
                <div key={index} className="bg-gitam-600/35 border border-antique/20 p-8 rounded-xl hover:bg-gitam-600/45 transition">
                  <h4 className="text-2xl font-bold mb-4">{contact.name}</h4>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-antique/80">Designation</p>
                      <p className="font-semibold">{contact.designation}</p>
                    </div>
                    <div>
                      <p className="text-antique/80">Email ID</p>
                      <p className="font-semibold break-words">{contact.email}</p>
                    </div>
                    <div>
                      <p className="text-antique/80">Phone Number</p>
                      <p className="font-semibold">{contact.phone}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gitam-50 py-8 px-6 rounded-2xl">
            <h3 className="text-3xl font-bold text-center mb-2 text-gitam-700">Stay Connected</h3>
            <p className="text-center text-gitam-700/80 mb-6">
              Join our official channels for announcements, reminders, and updates.
            </p>
            <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                href="https://www.instagram.com/tmcg_gcgc"
                target="_blank"
                rel="noopener noreferrer"
                className="hh-card border-2 border-gitam-200 p-5 rounded-xl hover:shadow-md transition flex items-center gap-4"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-gitam-300 bg-antique text-gitam-700">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                    <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5z" />
                    <path d="M12 7.15A4.85 4.85 0 1 1 7.15 12 4.86 4.86 0 0 1 12 7.15zm0 1.8A3.05 3.05 0 1 0 15.05 12 3.05 3.05 0 0 0 12 8.95z" />
                    <circle cx="17.5" cy="6.6" r="1.15" />
                  </svg>
                </span>
                <div>
                  <p className="font-bold text-gitam-700">Instagram</p>
                  <p className="text-gitam-700/75 text-sm">@tmcg_gcgc</p>
                </div>
              </a>

              <a
                href="https://chat.whatsapp.com/LwwmzMvLT8PAGDLIpAOvti?mode=gi_t"
                target="_blank"
                rel="noopener noreferrer"
                className="hh-card border-2 border-gitam-200 p-5 rounded-xl hover:shadow-md transition flex items-center gap-4"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-gitam-300 bg-antique text-gitam-700">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                    <path d="M12.02 2.04a9.86 9.86 0 0 0-8.4 15.03L2 22l5.08-1.59a9.97 9.97 0 0 0 4.93 1.3h.01a9.87 9.87 0 1 0 0-19.74zm0 17.94h-.01a8.15 8.15 0 0 1-4.16-1.14l-.3-.18-3.01.94.98-2.93-.2-.31a8.06 8.06 0 1 1 6.7 3.62z" />
                    <path d="M16.54 13.88c-.25-.13-1.47-.72-1.69-.8s-.39-.12-.55.13-.64.8-.78.96-.29.18-.54.06a6.62 6.62 0 0 1-1.96-1.21 7.41 7.41 0 0 1-1.37-1.7c-.14-.24-.02-.37.11-.5.11-.11.25-.29.37-.43a1.7 1.7 0 0 0 .25-.42.46.46 0 0 0-.02-.44c-.07-.13-.55-1.33-.75-1.82-.2-.47-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3A2.76 2.76 0 0 0 7 10.11a4.8 4.8 0 0 0 1 2.53 10.9 10.9 0 0 0 4.17 3.69 14.3 14.3 0 0 0 1.39.51 3.34 3.34 0 0 0 1.52.1 2.5 2.5 0 0 0 1.64-1.16 2.05 2.05 0 0 0 .14-1.16c-.05-.08-.2-.13-.44-.25z" />
                  </svg>
                </span>
                <div>
                  <p className="font-bold text-gitam-700">WhatsApp Group</p>
                  <p className="text-gitam-700/75 text-sm">Join the participant community</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}