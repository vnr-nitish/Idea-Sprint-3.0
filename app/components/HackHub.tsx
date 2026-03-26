import Link from 'next/link';

export default function HackHub() {
  return (
    <section className="bg-gradient-to-br from-gitam-400 to-gitam-700 text-antique py-20">
      <div className="max-w-6xl mx-auto px-4 text-center">
        <h1 className="text-5xl md:text-6xl font-extrabold mb-2 drop-shadow">Idea Sprint 3.0</h1>
        <p className="text-2xl md:text-3xl mb-4 opacity-95">24-Hour Innovation Challenge</p>
        <p className="text-base md:text-lg opacity-90 mb-6">Organized by Directorate of Training, Mentoring & Career Guidance, GCGC GITAM</p>
        <Link href="/register" className="inline-block px-8 py-3 bg-antique text-gitam-700 font-semibold rounded-lg shadow-md hover:shadow-lg transition">
          Register Now
        </Link>
      </div>
    </section>
  );
}
