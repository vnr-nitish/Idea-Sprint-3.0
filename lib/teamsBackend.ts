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

const mapTeamRecord = (team: any, members: any[]): TeamRecord => ({
  teamId: team.id,
  teamName: team.team_name,
  domain: team.domain || '',
  teamPassword: '',
  createdAt: team.created_at,
  members: members.map((m: any) => ({
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
});

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

  return teams.map((t: any) => mapTeamRecord(t, membersByTeam.get(t.id) || []));
};

export const getTeamByIdOrName = async (teamId?: string | null, teamName?: string | null): Promise<TeamRecord | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  let teamQuery = supabase.from('teams').select('id, team_name, domain, created_at');
  if (teamId) {
    teamQuery = teamQuery.eq('id', teamId);
  } else if (teamName) {
    teamQuery = teamQuery.eq('team_name', teamName);
  } else {
    return null;
  }

  const { data: teamRow, error: teamError } = await teamQuery.maybeSingle();
  if (teamError || !teamRow?.id) return null;

  const { data: members, error: membersError } = await supabase
    .from('members')
    .select('id, team_id, member_index, name, registration_number, email, phone_number, school, program, program_other, branch, campus, stay, year_of_study')
    .eq('team_id', teamRow.id)
    .order('member_index', { ascending: true });

  if (membersError) return null;
  return mapTeamRecord(teamRow, Array.isArray(members) ? members : []);
};

export const registerTeamWithMembers = async (team: { teamName: string; domain: string }, members: TeamMemberRecord[]): Promise<{ teamId: string; members: { id: string; email: string }[] } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const normalizedMembers = Array.isArray(members) ? members : [];
  if (normalizedMembers.length < 3 || normalizedMembers.length > 4) {
    throw new Error('Team must have 3 or 4 members');
  }

  const hasInvalidMember = normalizedMembers.some((m) => {
    const member = m || ({} as TeamMemberRecord);
    return !String(member.name || '').trim() ||
      !String(member.registrationNumber || '').trim() ||
      !String(member.email || '').trim() ||
      !String(member.phoneNumber || '').trim() ||
      !String(member.school || '').trim() ||
      !String(member.program || '').trim() ||
      !String(member.branch || '').trim() ||
      !String(member.campus || '').trim() ||
      !String(member.stay || '').trim() ||
      !String(member.yearOfStudy || '').trim() ||
      (String(member.program || '').trim() === 'Others' && !String(member.programOther || '').trim());
  });

  if (hasInvalidMember) {
    throw new Error('All member fields are required');
  }

  // Preferred path: single atomic RPC transaction in the database.
  // If RPC is unavailable (not deployed yet), fall back to legacy two-step flow below.
  const requestId =
    typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'
      ? (crypto as any).randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const rpcAttempt = await supabase.rpc('register_team_atomic', {
    p_team_name: String(team.teamName || '').trim(),
    p_domain: String(team.domain || '').trim(),
    p_members: normalizedMembers,
    p_request_id: requestId,
  });

  if (!rpcAttempt.error && rpcAttempt.data) {
    const result = rpcAttempt.data as any;
    if (!result?.ok) {
      throw new Error(String(result?.reason || 'Registration failed'));
    }

    const teamId = String(result?.teamId || '').trim();
    if (!teamId) {
      throw new Error('Atomic registration did not return team id');
    }

    // Try to return fresh member ids/emails; if query is blocked by RLS, return best-effort email list.
    try {
      const { data: memberRows } = await supabase
        .from('members')
        .select('id, email')
        .eq('team_id', teamId)
        .order('member_index', { ascending: true });

      if (Array.isArray(memberRows) && memberRows.length) {
        return {
          teamId,
          members: memberRows.map((r: any) => ({ id: String(r.id || ''), email: String(r.email || '') })),
        };
      }
    } catch {
      // ignore member select failures
    }

    return {
      teamId,
      members: normalizedMembers.map((m) => ({ id: '', email: String(m.email || '') })),
    };
  }

  const rpcMissing = String(rpcAttempt.error?.message || '').toLowerCase().includes('register_team_atomic');
  if (!rpcMissing && rpcAttempt.error) {
    throw rpcAttempt.error;
  }

  const { data: teamRow, error: teamErr } = await supabase
    .from('teams')
    .insert({
      team_name: team.teamName,
      domain: team.domain,
    })
    .select('id')
    .single();

  if (teamErr || !teamRow?.id) throw teamErr || new Error('Could not create team');

  const payload = normalizedMembers.map((m, idx) => ({
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

  if (memErr || !memberRows) {
    // Roll back parent team to avoid orphan rows (team with no members) in admin views.
    try {
      await supabase.from('teams').delete().eq('id', teamRow.id);
    } catch {
      // ignore rollback failures; original error is more important
    }
    throw memErr || new Error('Could not create members');
  }

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

export const syncTeamMembers = async (teamId: string, members: TeamMemberRecord[]): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const normalizedMembers = Array.isArray(members) ? members : [];

  const { data: existingRows, error: existingErr } = await supabase
    .from('members')
    .select('id')
    .eq('team_id', teamId);
  if (existingErr) throw existingErr;

  const existingIds = new Set((existingRows || []).map((r: any) => String(r.id)));
  const incomingIds = new Set(
    normalizedMembers
      .map((m: any) => String(m?.id || '').trim())
      .filter(Boolean)
  );

  const idsToDelete = Array.from(existingIds).filter((id) => !incomingIds.has(id));
  if (idsToDelete.length > 0) {
    const { error: delErr } = await supabase.from('members').delete().in('id', idsToDelete);
    if (delErr) throw delErr;
  }

  for (let idx = 0; idx < normalizedMembers.length; idx += 1) {
    const m: any = normalizedMembers[idx] || {};
    const row = {
      team_id: teamId,
      member_index: idx + 1,
      name: String(m.name || ''),
      registration_number: String(m.registrationNumber || ''),
      registration_number_normalized: normalizeReg(String(m.registrationNumber || '')),
      email: String(m.email || ''),
      email_normalized: normalizeEmail(String(m.email || '')),
      phone_number: String(m.phoneNumber || ''),
      phone_number_normalized: normalizePhone(String(m.phoneNumber || '')),
      school: String(m.school || ''),
      program: String(m.program || ''),
      program_other: String(m.programOther || ''),
      branch: String(m.branch || ''),
      campus: String(m.campus || ''),
      stay: String(m.stay || ''),
      year_of_study: String(m.yearOfStudy || ''),
    };

    const memberId = String(m.id || '').trim();
    if (memberId) {
      const { error: upErr } = await supabase.from('members').update(row).eq('id', memberId);
      if (upErr) throw upErr;
    } else {
      const { error: insErr } = await supabase.from('members').insert(row);
      if (insErr) throw insErr;
    }
  }
};

export const loginWithIdentifierAndPassword = async (identifierInput: string, password: string): Promise<{ team: TeamRecord; identifierNormalized: string; memberId: string; teamId: string } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const identifierNormalized = normalizeIdentifier(identifierInput);
  const identifierLooksLikeEmail = identifierNormalized.includes('@');
  const directEmail = String(identifierInput || '').trim().toLowerCase();
  let passwordVerified = false;
  let authUserId: string | undefined;
  let resolvedTeamFromApi: TeamRecord | null = null;
  const trySignInWithEmail = async (email: string, pwd: string) => {
    try {
      return await supabase.auth.signInWithPassword({ email, password: pwd });
    } catch {
      return null;
    }
  };

  // Fast path for email logins: verify credentials first in Auth.
  // This improves cross-browser reliability when member lookup queries are RLS-restricted.
  if (identifierLooksLikeEmail) {
    try {
      const signInDirect = await supabase.auth.signInWithPassword({ email: directEmail, password });
      if (!signInDirect.error) {
        passwordVerified = true;
        authUserId = signInDirect.data?.user?.id || undefined;
      } else {
        const msg = String(signInDirect.error.message || '').toLowerCase();
        const isEmailNotConfirmed = msg.includes('email not confirmed') || (signInDirect.error as any).code === 'email_not_confirmed';
        if (isEmailNotConfirmed) {
          // Password is valid; user just has not confirmed email.
          passwordVerified = true;
        }
      }
    } catch {
      // ignore
    }

    if (!authUserId && passwordVerified) {
      try {
        const { data: userData } = await supabase.auth.getUser();
        authUserId = userData?.user?.id || undefined;
      } catch {
        // ignore
      }
    }
  }

  // Step 1: Find member — RPC is SECURITY DEFINER so it works even with RLS enabled.
  // The RPC returns a TABLE (array), so extract the first element.
  let member: any | null = null;

  // First fallback: resolve identifier server-side (service-role) so lookup works from any device/browser.
  try {
    const resolved = await fetch('/api/auth/resolve-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifierNormalized }),
    });
    if (resolved.ok) {
      const payload = await resolved.json().catch(() => null);
      if (payload?.member?.id && payload?.member?.teamId) {
        member = {
          id: payload.member.id,
          team_id: payload.member.teamId,
          email: payload.member.email,
        };
      }
      if (payload?.team?.teamId && payload?.team?.teamName && Array.isArray(payload?.team?.members)) {
        resolvedTeamFromApi = {
          teamId: String(payload.team.teamId),
          teamName: String(payload.team.teamName),
          domain: String(payload.team.domain || ''),
          teamPassword: '',
          createdAt: String(payload.team.createdAt || ''),
          members: payload.team.members,
        } as TeamRecord;
      }
    }
  } catch {
    // ignore
  }

  try {
    if (!member) {
      const rpc = await supabase.rpc('find_member_for_login', { identifier: identifierNormalized });
      if (!rpc.error && rpc.data) {
        member = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
      }
    }
  } catch {
    // ignore
  }

  // Fallback: direct query (works when RLS is disabled)
  if (!member) {
    const { data, error } = await supabase
      .from('members')
      .select('id, team_id, email')
      .or(
        `email_normalized.eq.${identifierNormalized},phone_number_normalized.eq.${identifierNormalized},registration_number_normalized.eq.${identifierNormalized}`
      )
      .maybeSingle();
    if (!error && data) {
      member = data;
    }
  }

  // Fallback for RLS-restricted lookups: if Auth is available, resolve member by auth_user_id.
  if (!member && authUserId) {
    try {
      const { data } = await supabase
        .from('members')
        .select('id, team_id, email')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (data) member = data;
    } catch {
      // ignore
    }
  }

  // Last fallback: claim row by normalized email after auth sign-in, then read it.
  if (!member && authUserId && identifierLooksLikeEmail) {
    try {
      const { data } = await supabase
        .from('members')
        .update({ auth_user_id: authUserId })
        .eq('email_normalized', identifierNormalized)
        .select('id, team_id, email')
        .maybeSingle();
      if (data) member = data;
    } catch {
      // ignore
    }
  }

  if (!member?.team_id) return null;
  const email = String(member.email || (identifierLooksLikeEmail ? directEmail : '')).trim();
  if (!email) return null;

  // Step 2: Fetch full team data via SECURITY DEFINER RPC — works in ANY browser regardless of auth/RLS.
  // Run this SQL in your Supabase SQL editor to create the function:
  //
  // CREATE OR REPLACE FUNCTION public.get_login_team_data(p_team_id uuid)
  // RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
  // DECLARE v_result json; BEGIN
  //   SELECT json_build_object('id',t.id::text,'team_name',t.team_name,'domain',t.domain,
  //     'created_at',t.created_at::text,'members',(SELECT json_agg(json_build_object(
  //       'id',m.id::text,'member_index',m.member_index,'name',m.name,
  //       'registration_number',m.registration_number,'email',m.email,
  //       'phone_number',m.phone_number,'school',m.school,'program',m.program,
  //       'program_other',m.program_other,'branch',m.branch,'campus',m.campus,
  //       'stay',m.stay,'year_of_study',m.year_of_study) ORDER BY m.member_index)
  //     FROM public.members m WHERE m.team_id=p_team_id))
  //   INTO v_result FROM public.teams t WHERE t.id=p_team_id;
  //   RETURN v_result; END; $$;
  let teamRpcData: any = null;
  try {
    const { data, error } = await supabase.rpc('get_login_team_data', { p_team_id: member.team_id });
    if (!error && data) teamRpcData = data;
  } catch {
    // ignore — will fall back to direct queries below
  }

  // Step 3: Verify password via Supabase Auth.
  if (!passwordVerified) {
    const signIn = await trySignInWithEmail(email, password);
    if (!signIn) return null;
    if (signIn.error) {
      // "Email not confirmed" means Supabase DID validate the password — credentials are correct.
      const isEmailNotConfirmed =
        signIn.error.message?.toLowerCase().includes('email not confirmed') ||
        (signIn.error as any).code === 'email_not_confirmed';

      if (isEmailNotConfirmed) {
        passwordVerified = true;
      } else {
        // Cross-device reliability: if Auth user is missing for this email,
        // bootstrap it with the same credentials and continue.
        // Set redirect to production URL so any confirmation link is never localhost.
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          'https://ideasprint-tmgc-gcgc.vercel.app';

        const signUp = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${appUrl}/login` },
        });

        if (signUp.error) {
          const msg = String(signUp.error.message || '').toLowerCase();
          const alreadyExists = msg.includes('already registered') || msg.includes('already exists');
          if (!alreadyExists) return null;

          // Legacy-team self-heal: for already-registered users whose Auth password drifted,
          // sync this team's member users to the submitted team password, then retry sign-in.
          try {
            await fetch('/api/auth/bootstrap-team-users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ teamId: String(member.team_id), teamPassword: password }),
            });

            const retry = await trySignInWithEmail(email, password);
            if (retry && !retry.error) {
              passwordVerified = true;
              authUserId = retry.data?.user?.id || authUserId;
            } else {
              const retryEmailNotConfirmed =
                String(retry?.error?.message || '').toLowerCase().includes('email not confirmed') ||
                (retry?.error as any)?.code === 'email_not_confirmed';
              if (retryEmailNotConfirmed) {
                passwordVerified = true;
              } else {
                return null;
              }
            }
          } catch {
            return null;
          }
          if (!passwordVerified) return null;
        }

        passwordVerified = true;
        authUserId = signUp.data?.user?.id || authUserId;
      }
    } else {
      passwordVerified = true;
      authUserId = signIn.data?.user?.id || authUserId;
    }
  }

  // Step 4: Bind auth uid to member row (best-effort, non-blocking)
  try {
    const userId = authUserId || (await supabase.auth.getUser()).data?.user?.id;
    if (userId) {
      void supabase.from('members').update({ auth_user_id: userId }).eq('id', member.id);
    }
  } catch { /* ignore */ }

  // Step 5: Build TeamRecord from RPC data (preferred) or fall back to direct queries
  if (teamRpcData) {
    const rpcMembers: any[] = Array.isArray(teamRpcData.members) ? teamRpcData.members : [];
    const team: TeamRecord = {
      teamId: teamRpcData.id,
      teamName: teamRpcData.team_name,
      domain: teamRpcData.domain || '',
      teamPassword: '',
      createdAt: teamRpcData.created_at,
      members: rpcMembers.map((m: any) => ({
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
    const resolvedMember = rpcMembers.find((m: any) =>
      normalizeIdentifier(m.email) === identifierNormalized ||
      normalizeIdentifier(m.registration_number) === identifierNormalized ||
      normalizeIdentifier(m.phone_number) === identifierNormalized
    );
    return {
      team,
      identifierNormalized,
      memberId: resolvedMember?.id || String(member.id),
      teamId: teamRpcData.id,
    };
  }

  if (resolvedTeamFromApi) {
    const resolvedMember = resolvedTeamFromApi.members.find((m: any) =>
      normalizeIdentifier(m.email) === identifierNormalized ||
      normalizeIdentifier(m.registrationNumber) === identifierNormalized ||
      normalizeIdentifier(m.phoneNumber) === identifierNormalized
    );
    return {
      team: resolvedTeamFromApi,
      identifierNormalized,
      memberId: String(resolvedMember?.id || member.id),
      teamId: String(resolvedTeamFromApi.teamId || member.team_id),
    };
  }

  // Fallback: direct queries (works when RLS is disabled or auth session is established)
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
