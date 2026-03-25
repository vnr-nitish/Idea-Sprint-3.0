import { Suspense } from 'react';
import TeamClient from './TeamClient';

export const dynamic = 'force-dynamic';

export default function AdminTeamPage() {
  return (
    <Suspense fallback={<div className="hh-page p-6" />}>
      <TeamClient />
    </Suspense>
  );
}
