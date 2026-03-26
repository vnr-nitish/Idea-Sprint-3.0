import HackHub from '@/app/components/HackHub';
import RegistrationTicker from '@/app/components/RegistrationTicker';

export default function Home() {
  const domains = [
    { name: "App Development", icon: "📱", color: "bg-gitam-100" },
    { name: "Cyber Security", icon: "🔒", color: "bg-antique" },
    { name: "AI", icon: "🤖", color: "bg-gitam-200" },
    { name: "ML & DS", icon: "📊", color: "bg-gitam-100" },
  ];

  const juries = [
    { name: "Dr. Rajesh Kumar", designation: "Lead Mentor", photo: "👨‍💼" },
    { name: "Prof. Priya Singh", designation: "Tech Lead", photo: "👩‍💼" },
    { name: "Mr. Arjun Patel", designation: "Industry Expert", photo: "👨‍💼" },
    { name: "Ms. Kavya Reddy", designation: "Product Specialist", photo: "👩‍💼" },
    { name: "Dr. Sandeep Verma", designation: "Innovation Mentor", photo: "👨‍💼" },
  ];

  const faqs = [
    { q: "Who can participate?", a: "All GITAM students from the Visakhapatnam campus are eligible to participate." },
    { q: "What is the team size?", a: "Team size must be 3 to 4 members, including the team lead." },
    { q: "Is there any registration fee?", a: "No, registration is completely free for all students." },
    { q: "Will certificates be provided?", a: "Yes, all participants will receive participation certificates." },
    { q: "Is accommodation provided?", a: "No. Accommodation is not provided. This is a 24-hour hackathon and participants are expected to manage accordingly." },
    { q: "Will food be provided?", a: "Yes. Dinner will be provided on 26th March and lunch will be provided on 27th March. Breakfast on 27th March must be arranged by participants." },
    { q: "How do I register?", a: "Go to the Register page (/register) and submit your team details." },
  ];

  const importantInstructions = [
    "Each team must consist of 3 to 4 members only.",
    "Registrations are on a first come, first serve basis, and only 70 teams will be allowed.",
    "Participants may take a day break if they choose to. Teams are allowed to leave the venue at 8:00 PM on 26th March and return by 8:00 AM on 27th March to continue the hackathon.",
    "Breakfast will not be provided on the morning of 27th March. However, dinner on 26th March and lunch on 27th March will be provided to all participants.",
    "Submission of a No Objection Certificate (NOC) is mandatory for all participants.",
    "Problem statements will be revealed on the spot, i.e. 26th March at 04:30 PM, shortly after the hackathon begins.",
  ];

  const contacts = [
    { name: "Nitish Raj Vinnakota", email: "nvinnako2@gitam.in", phone: "6304003099", designation: "University Lead" },
    { name: "Eesha Chowdary Thottempudi", email: "ethottem@gitam.in", phone: "6300427457", designation: "Campus Lead" },
    { name: "Akanksha", email: "aakanksh@gitam.in", phone: "7032076051", designation: "University Lead - Upcoming" },
    { name: "Jothisk Nandan Palla", email: "jpalla2@gitam.in", phone: "6304110542", designation: "Campus Lead - Upcoming" },
  ];

  return (
    <main className="hh-page">
      {/* Hero Section */}
      <HackHub />

      {/* Live registration countdown — only visible once ≤60 slots remain */}
      <RegistrationTicker />

      {/* Challenge Domains */}
      <section className="pt-10 pb-8 px-4 bg-antique">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-8 text-gitam-700">Challenge Domains (Themes)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {domains.map((domain, index) => (
              <div
                key={index}
                className={`${domain.color} p-6 rounded-xl border border-gitam-100 shadow-md hover:shadow-lg transition transform hover:scale-105 text-center`}
              >
                <div className="text-5xl mb-4">{domain.icon}</div>
                <h3 className="font-bold text-gitam-700">{domain.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline Section */}
      <section className="pt-8 pb-16 px-4 bg-antique">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-gitam-700">Hackathon Timeline</h2>
          <div className="max-w-3xl mx-auto">
            <div className="p-8 rounded-2xl bg-gradient-to-br from-gitam to-gitam-700 text-antique shadow-lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm opacity-80">Start Date & Time</p>
                    <p className="text-xl font-semibold">March 26th, 2026 • 4:00 PM</p>
                  </div>
                  <div>
                    <p className="text-sm opacity-80">End Date & Time</p>
                    <p className="text-xl font-semibold">March 27th, 2026 • 4:00 PM</p>
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
                    <p className="text-xl font-semibold">March 26th, 2026 • 4:00 PM</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Important Instructions */}
      <section className="pb-16 px-4 bg-antique">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-4 text-gitam-700">Important Instructions</h2>
          <p className="text-center text-gitam-700/80 mb-10">Please review these rules before coming to the venue.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {importantInstructions.map((instruction, index) => (
              <article
                key={index}
                className="hh-card p-6 md:p-7 border-l-4 border-l-gitam hover:shadow-xl transition"
              >
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gitam text-antique font-bold">
                    {index + 1}
                  </span>
                  <p
                    className={`leading-relaxed ${index === 1 || index === 3 ? "font-bold text-gitam-800" : "text-gitam-700"}`}
                  >
                    {instruction}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Eligibility Section */}
      <section className="py-16 px-4 bg-gitam-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-8 text-gitam-700">Eligibility</h2>
          <div className="hh-card p-8">
            <p className="text-xl text-gitam-700 text-center">
              <span className="font-bold text-gitam">All GITAM students from Visakhapatnam campus only</span> are eligible to participate.
            </p>
          </div>
        </div>
      </section>

      {/* Cash Prizes Section */}
      <section className="py-16 px-4 bg-antique">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-gitam-700">Cash Prizes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 1st Prize */}
            <div className="p-8 rounded-2xl border border-gitam-100 bg-gitam-700 text-antique shadow-lg text-center transform hover:scale-[1.02] transition">
              <div className="text-5xl mb-4">🥇</div>
              <h3 className="text-2xl font-bold mb-2">1st Prize</h3>
              <p className="text-3xl font-bold">₹ 10,000</p>
            </div>

            {/* 2nd Prize */}
            <div className="p-8 rounded-2xl border border-gitam-100 bg-gitam-600 text-antique shadow-lg text-center transform hover:scale-[1.02] transition">
              <div className="text-5xl mb-4">🥈</div>
              <h3 className="text-2xl font-bold mb-2">2nd Prize</h3>
              <p className="text-3xl font-bold">₹ 6,000</p>
            </div>

            {/* 3rd Prize */}
            <div className="p-8 rounded-2xl border border-gitam-100 bg-gitam text-antique shadow-lg text-center transform hover:scale-[1.02] transition">
              <div className="text-5xl mb-4">🥉</div>
              <h3 className="text-2xl font-bold mb-2">3rd Prize</h3>
              <p className="text-3xl font-bold">₹ 4,000</p>
            </div>
          </div>
        </div>
      </section>

      {/* Jury Section */}
      <section className="py-16 px-4 bg-gitam-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-gitam-700">Meet the Jury</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
            {juries.map((jury, index) => (
              <div key={index} className="relative hh-card p-8 hover:shadow-xl transition text-center overflow-hidden">
                <div className="blur-sm select-none">
                  <div className="text-7xl mb-4">{jury.photo}</div>
                  <h3 className="text-2xl font-bold text-gitam-700 mb-2">{jury.name}</h3>
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
      </section>

      {/* FAQs Section */}
      <section className="py-16 px-4 bg-antique">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12 text-gitam-700">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <details key={index} className="group cursor-pointer">
                <summary className="flex items-center justify-between p-6 bg-gitam-50 border border-gitam-100 rounded-lg hover:bg-gitam-100 transition font-semibold text-gitam-700">
                  {faq.q}
                  <span className="transition group-open:rotate-180">▼</span>
                </summary>
                <p className="p-6 text-gitam-700 bg-antique-50 rounded-b-lg border-l-4 border-gitam">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Section / Footer */}
      <section className="bg-gradient-to-br from-gitam-700 to-gitam-800 text-antique py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-12">Contact Us</h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
            {contacts.map((contact, index) => (
              <div key={index} className="bg-gitam-600/35 border border-antique/20 p-8 rounded-xl hover:bg-gitam-600/45 transition">
                <h3 className="text-2xl font-bold mb-4">{contact.name}</h3>
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

          <div className="mb-12">
            <h3 className="text-2xl font-bold text-center mb-2">Stay Connected</h3>
            <p className="text-center text-antique/85 mb-6">
              Join our official channels for announcements, reminders, and updates.
            </p>
            <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              <a
                href="https://www.instagram.com/tmcg_gcgc"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gitam-600/35 border border-antique/20 p-5 rounded-xl hover:bg-gitam-600/45 transition flex items-center gap-4"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-antique text-gitam-700">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                    <path d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5z" />
                    <path d="M12 7.15A4.85 4.85 0 1 1 7.15 12 4.86 4.86 0 0 1 12 7.15zm0 1.8A3.05 3.05 0 1 0 15.05 12 3.05 3.05 0 0 0 12 8.95z" />
                    <circle cx="17.5" cy="6.6" r="1.15" />
                  </svg>
                </span>
                <div>
                  <p className="font-bold">Instagram</p>
                  <p className="text-antique/80 text-sm">@tmcg_gcgc</p>
                </div>
              </a>

              <a
                href="https://chat.whatsapp.com/LwwmzMvLT8PAGDLIpAOvti?mode=gi_t"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gitam-600/35 border border-antique/20 p-5 rounded-xl hover:bg-gitam-600/45 transition flex items-center gap-4"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-antique text-gitam-700">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                    <path d="M12.02 2.04a9.86 9.86 0 0 0-8.4 15.03L2 22l5.08-1.59a9.97 9.97 0 0 0 4.93 1.3h.01a9.87 9.87 0 1 0 0-19.74zm0 17.94h-.01a8.15 8.15 0 0 1-4.16-1.14l-.3-.18-3.01.94.98-2.93-.2-.31a8.06 8.06 0 1 1 6.7 3.62z" />
                    <path d="M16.54 13.88c-.25-.13-1.47-.72-1.69-.8s-.39-.12-.55.13-.64.8-.78.96-.29.18-.54.06a6.62 6.62 0 0 1-1.96-1.21 7.41 7.41 0 0 1-1.37-1.7c-.14-.24-.02-.37.11-.5.11-.11.25-.29.37-.43a1.7 1.7 0 0 0 .25-.42.46.46 0 0 0-.02-.44c-.07-.13-.55-1.33-.75-1.82-.2-.47-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3A2.76 2.76 0 0 0 7 10.11a4.8 4.8 0 0 0 1 2.53 10.9 10.9 0 0 0 4.17 3.69 14.3 14.3 0 0 0 1.39.51 3.34 3.34 0 0 0 1.52.1 2.5 2.5 0 0 0 1.64-1.16 2.05 2.05 0 0 0 .14-1.16c-.05-.08-.2-.13-.44-.25z" />
                  </svg>
                </span>
                <div>
                  <p className="font-bold">WhatsApp Group</p>
                  <p className="text-antique/80 text-sm">Join the participant community</p>
                </div>
              </a>
            </div>
          </div>

          {/* Footer Bottom */}
          <div className="border-t border-antique/25 pt-8 text-center">
            <p className="text-antique/75">© 2026 TMCG GITAM | Directorate of Training, Mentoring & Career Guidance, GCGC GITAM</p>
          </div>
        </div>
      </section>
    </main>
  );
}
