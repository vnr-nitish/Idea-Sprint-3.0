import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export type TeamMemberRecord = {
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

export type TeamRecord = {
  teamId?: string;
  teamName: string;
  domain: string;
  teamPassword?: string;
  teamSize?: number;
  createdAt?: string;
  selectedProblem?: any;
  members: TeamMemberRecord[];
};

export const normalizeIdentifier = (value: string): string => {
  const trimmed = (value || '').trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) return digitsOnly;
  return trimmed.toLowerCase();
};

const normalizeEmail = (email: string) => normalizeIdentifier(email);
const normalizeReg = (reg: string) => normalizeIdentifier(reg);
const normalizePhone = (phone: string) => {
  const digitsOnly = String(phone || '').trim().replace(/\D/g, '');
  return digitsOnly;
};

export const listTeamsWithMembers = async (): Promise<TeamRecord[] | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('id, team_name, domain, created_at')
    .order('created_at', { ascending: true });

  if (teamsError || !teams) return [];

  const teamIds = teams.map((t: any) => t.id).filter(Boolean);
  const { data: members, error: membersError } = await supabase
    .from('members')
    .select(
      'id, team_id, member_index, name, registration_number, email, phone_number, school, program, program_other, branch, campus, stay, year_of_study'
    )
    .in('team_id', teamIds)
    .order('member_index', { ascending: true });

  const membersByTeam = new Map<string, any[]>();
  if (!membersError && Array.isArray(members)) {
    for (const m of members) {
      const arr = membersByTeam.get(m.team_id) || [];
      arr.push(m);
      membersByTeam.set(m.team_id, arr);
    }
  }

  return teams.map((t: any) => {
    const ms = membersByTeam.get(t.id) || [];
    return {
      teamId: t.id,
      teamName: t.team_name,
      domain: t.domain || '',
      teamPassword: '',
      createdAt: t.created_at,
      members: ms.map((m: any) => ({
        id: m.id,
        name: m.name || '',
        registrationNumber: m.registration_number || '',
        email: m.email || '',
        phoneNumber: m.phone_number || '',
        school: m.school || '',
        program: m.program || '',
        programOther: m.program_other || '',
        branch: m.branch || '',
        campus: m.campus || '',
        stay: m.stay || '',
        yearOfStudy: m.year_of_study || '',
      })),
    } satisfies TeamRecord;
  });
};

export const registerTeamWithMembers = async (team: { teamName: string; domain: string }, members: TeamMemberRecord[]): Promise<{ teamId: string; members: { id: string; email: string }[] } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: teamRow, error: teamErr } = await supabase
    .from('teams')
    .insert({
      team_name: team.teamName,
      domain: team.domain,
    })
    .select('id')
    .single();

  if (teamErr || !teamRow?.id) throw teamErr || new Error('Could not create team');

  const payload = (members || []).map((m, idx) => ({
    team_id: teamRow.id,
    member_index: idx + 1,
    name: m.name,
    registration_number: m.registrationNumber,
    registration_number_normalized: normalizeReg(m.registrationNumber),
    email: m.email,
    email_normalized: normalizeEmail(m.email),
    phone_number: m.phoneNumber,
    phone_number_normalized: normalizePhone(m.phoneNumber),
    school: m.school,
    program: m.program,
    program_other: m.programOther || '',
    branch: m.branch || '',
    campus: m.campus,
    stay: m.stay,
    year_of_study: m.yearOfStudy,
  }));

  const { data: memberRows, error: memErr } = await supabase
    .from('members')
    .insert(payload)
    .select('id, email');

  if (memErr || !memberRows) throw memErr || new Error('Could not create members');

  return {
    teamId: teamRow.id,
    members: memberRows.map((r: any) => ({ id: r.id, email: r.email })),
  };
};

export const updateTeam = async (teamId: string, patch: Partial<{ teamName: string; domain: string }>): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const update: any = {};
  if (patch.teamName !== undefined) update.team_name = patch.teamName;
  if (patch.domain !== undefined) update.domain = patch.domain;

  const { error } = await supabase.from('teams').update(update).eq('id', teamId);
  if (error) throw error;
};

export const updateMember = async (memberId: string, patch: Partial<TeamMemberRecord>): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const update: any = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.registrationNumber !== undefined) {
    update.registration_number = patch.registrationNumber;
    update.registration_number_normalized = normalizeReg(patch.registrationNumber);
  }
  if (patch.email !== undefined) {
    update.email = patch.email;
    update.email_normalized = normalizeEmail(patch.email);
  }
  if (patch.phoneNumber !== undefined) {
    update.phone_number = patch.phoneNumber;
    update.phone_number_normalized = normalizePhone(patch.phoneNumber);
  }
  if (patch.school !== undefined) update.school = patch.school;
  if (patch.program !== undefined) update.program = patch.program;
  if (patch.programOther !== undefined) update.program_other = patch.programOther;
  if (patch.branch !== undefined) update.branch = patch.branch;
  if (patch.campus !== undefined) update.campus = patch.campus;
  if (patch.stay !== undefined) update.stay = patch.stay;
  if (patch.yearOfStudy !== undefined) update.year_of_study = patch.yearOfStudy;

  const { error } = await supabase.from('members').update(update).eq('id', memberId);
  if (error) throw error;
};

export const deleteMember = async (memberId: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.from('members').delete().eq('id', memberId);
  if (error) throw error;
};

export const deleteTeamAndMembers = async (teamId: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  // Delete members first to avoid FK issues if cascade isn't enabled.
  const delMembers = await supabase.from('members').delete().eq('team_id', teamId);
  if (delMembers.error) throw delMembers.error;

  const delTeam = await supabase.from('teams').delete().eq('id', teamId);
  if (delTeam.error) throw delTeam.error;
};

export const loginWithIdentifierAndPassword = async (identifierInput: string, password: string): Promise<{ team: TeamRecord; identifierNormalized: string; memberId: string; teamId: string } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const identifierNormalized = normalizeIdentifier(identifierInput);

  // Prefer RPC if you created it (see SUPABASE_SETUP.md)
  let member: any | null = null;
  try {
    const rpc = await supabase.rpc('find_member_for_login', { identifier: identifierNormalized });
    if (!rpc.error && rpc.data) member = rpc.data;
  } catch {
    // ignore
  }

  if (!member) {
    const { data, error } = await supabase
      .from('members')
      .select('id, team_id, email')
      .or(
        `email_normalized.eq.${identifierNormalized},phone_number_normalized.eq.${identifierNormalized},registration_number_normalized.eq.${identifierNormalized}`
      )
      .maybeSingle();
    if (error || !data) return null;
    member = data;
  }

  const email = String(member.email || '').trim();
  if (!email) return null;

  // Try sign-in (Auth). If user doesn't exist yet, we attempt sign-up.
  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    const signUp = await supabase.auth.signUp({ email, password });
    if (signUp.error) return null;
  }

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;

  // Bind auth uid to this member row (best-effort)
  if (userId) {
    await supabase.from('members').update({ auth_user_id: userId }).eq('id', member.id);
  }

  // Load team and all members for UI
  const { data: teamRow } = await supabase.from('teams').select('id, team_name, domain, created_at').eq('id', member.team_id).maybeSingle();
  const { data: memberRows } = await supabase
    .from('members')
    .select('id, member_index, name, registration_number, email, phone_number, school, program, program_other, branch, campus, stay, year_of_study')
    .eq('team_id', member.team_id)
    .order('member_index', { ascending: true });

  if (!teamRow || !memberRows) return null;

  const team: TeamRecord = {
    teamId: teamRow.id,
    teamName: teamRow.team_name,
    domain: teamRow.domain || '',
    teamPassword: '',
    createdAt: teamRow.created_at,
    members: memberRows.map((m: any) => ({
      id: m.id,
      name: m.name || '',
      registrationNumber: m.registration_number || '',
      email: m.email || '',
      phoneNumber: m.phone_number || '',
      school: m.school || '',
      program: m.program || '',
      programOther: m.program_other || '',
      branch: m.branch || '',
      campus: m.campus || '',
      stay: m.stay || '',
      yearOfStudy: m.year_of_study || '',
    })),
  };

  return {
    team,
    identifierNormalized,
    memberId: String(member.id),
    teamId: String(member.team_id),
  };
};
