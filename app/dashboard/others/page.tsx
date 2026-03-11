'use client';

import { useRouter } from 'next/navigation';
import { OTHER_LINKS } from '@/lib/otherLinks';

export default function OthersPage() {
  const router = useRouter();

  const openLink = (title: string, url: string) => {
    if (!url) {
      alert(`${title} link is not configured yet.`);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="hh-page p-6">
      <div className="max-w-6xl mx-auto">
        <div className="hh-card border-2 border-gitam-200 p-6 mb-6 flex items-center justify-between gap-3">
          <h1 className="text-4xl font-bold text-gitam-700">Others</h1>
          <button onClick={() => router.push('/dashboard')} className="hh-btn-outline px-4 py-2">← Back to dashboard</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {OTHER_LINKS.map((item) => (
            <div key={item.title} className="hh-card border-2 border-gitam-200 p-5 flex flex-col gap-4">
              <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-600 text-antique flex items-center justify-center text-2xl">
                ↗
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gitam-700">{item.title}</h2>
                <p className="text-sm text-gitam-700/75 mt-1">{item.description}</p>
              </div>
              <button onClick={() => openLink(item.title, item.url)} className="hh-btn px-4 py-2 self-start">
                Open
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}