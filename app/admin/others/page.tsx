'use client';

import { useRouter } from 'next/navigation';
import { OTHER_LINKS } from '@/lib/otherLinks';

export default function AdminOthersPage() {
  const router = useRouter();

  const openLink = (title: string, url: string) => {
    if (!url) {
      alert(`${title} link is not configured yet.`);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="min-h-screen bg-antique p-6">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-md border-2 border-gitam-300 p-6 mb-6">
          <div className="flex justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gitam-700">Others</h1>
              <p className="text-sm text-gitam-700/75 mt-1">Use this section for external forms and shared documents.</p>
            </div>
            <button
              onClick={() => router.push('/admin/dashboard')}
              className="hh-btn-outline px-4 py-2 border-2"
            >
              ← Back to dashboard
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="grid grid-cols-4 gap-4 min-w-[980px]">
          {OTHER_LINKS.map((item) => (
            <div key={item.title} className="bg-white rounded-2xl border-2 border-gitam-200 shadow-sm p-5 flex flex-col gap-4">
              <div className="w-14 h-14 rounded-full border-2 border-antique/80 bg-gitam-600 text-antique flex items-center justify-center text-2xl">
                ↗
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gitam-700">{item.title}</h2>
                <p className="text-sm text-gitam-700/75 mt-1">{item.description}</p>
              </div>
              <button
                onClick={() => openLink(item.title, item.url)}
                className="hh-btn px-4 py-2 self-start"
              >
                Open
              </button>
            </div>
          ))}
          </div>
        </div>
      </div>
    </main>
  );
}