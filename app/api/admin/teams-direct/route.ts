import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const QUERY_TIMEOUT_MS = 12000;

type TeamMemberRecord = {
  id?: string;
  name: string;
  registrationNumber: string;
  email: string;
  phoneNumber: string;
  school: string;
  program: string;
  programOther?: string;
  branch?: string;
  campus: string;
  stay: string;
  yearOfStudy: string;
};

type TeamRecord = {
  teamId?: string;
  teamName: string;
  domain: string;
  teamPassword?: string;
  teamSize?: number;
  createdAt?: string;
  selectedProblem?: any;
  members: TeamMemberRecord[];
};

const mapMemberRecord = (row: any): TeamMemberRecord => {
  return {
    id: row.id,
    name: row.name,
    registrationNumber: row.registration_number,
    email: row.email,
    phoneNumber: row.phone_number,
    school: row.school,
    program: row.program,
    programOther: row.program_other,
    branch: row.branch,
    campus: row.campus,
    stay: row.stay,
    yearOfStudy: row.year_of_study,
  };
};

const mapTeamRecord = (row: any, members: any[]): TeamRecord => {
  return {
    teamId: row.id,
    teamName: row.team_name,
    domain: row.domain,
    createdAt: row.created_at,
    members: members.map(mapMemberRecord),
  };
};

export async function GET(request: NextRequest) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        {
          error: 'Supabase admin API not configured',
          hint: 'Add SUPABASE_SERVICE_ROLE_KEY to environment variables',
        },
        { status: 500 }
      );
    }

    // Prefer service-role key on the server to avoid brittle admin password logins.
    // This bypasses client-side CORS/RLS constraints for trusted server routes.
    const supabase = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Fetch teams
    const teamsResult = await Promise.race([
      supabase
        .from('teams')
        .select('id, team_name, domain, created_at')
        .order('created_at', { ascending: true }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ data: null, error: 'timeout' }), QUERY_TIMEOUT_MS)
      ),
    ]);

    if (!teamsResult || (teamsResult as any).error) {
      console.error('Teams fetch error:', (teamsResult as any).error);
      return NextResponse.json({ error: 'Failed to fetch teams' }, { status: 500 });
    }

    const teams = (teamsResult as any).data || [];

    if (!Array.isArray(teams) || teams.length === 0) {
      return NextResponse.json({ teams: [] });
    }

    const teamIds = teams.map((t: any) => t.id).filter(Boolean);

    // Fetch members
    const membersResult = await Promise.race([
      supabase
        .from('members')
        .select(
          'id, team_id, member_index, name, registration_number, email, phone_number, school, program, program_other, branch, campus, stay, year_of_study'
        )
        .in('team_id', teamIds)
        .order('member_index', { ascending: true }),
      new Promise((resolve) =>
        setTimeout(() => resolve({ data: null, error: 'timeout' }), QUERY_TIMEOUT_MS)
      ),
    ]);

    if (!membersResult || (membersResult as any).error) {
      console.error('Members fetch error:', (membersResult as any).error);
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 });
    }

    const members = (membersResult as any).data || [];

    const membersByTeam = new Map<string, any[]>();
    if (Array.isArray(members)) {
      for (const m of members) {
        const arr = membersByTeam.get(m.team_id) || [];
        arr.push(m);
        membersByTeam.set(m.team_id, arr);
      }
    }

    const result: TeamRecord[] = teams.map((t: any) =>
      mapTeamRecord(t, membersByTeam.get(t.id) || [])
    );

    return NextResponse.json({
      teams: result,
      count: result.length,
    });
  } catch (error) {
    console.error('Server error fetching teams:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
