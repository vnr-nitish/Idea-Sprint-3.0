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

const canonicalPhone = (phone: string) => {
  const digits = normalizePhone(phone);
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TEAMS_CACHE_TTL_MS = 30 * 1000;
const TEAMS_FALLBACK_CACHE_MAX_AGE_MS = 10 * 60 * 1000;
const TEAMS_CACHE_KEY = 'registeredTeamsSupabaseCache';
const TEAMS_CACHE_AT_KEY = 'registeredTeamsSupabaseCacheAt';
const QUERY_TIMEOUT_MS = 3000;
const API_QUERY_TIMEOUT_MS = 15000;
const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 10 * 60 * 1000;
const ADMIN_USER = 'tcd_gcgc@gitam.edu';
const ADMIN_PASS = 'TCD#GITAM@123';
const ADMIN_RECOVERY_COOLDOWN_MS = 60 * 1000;
const TEAM_AUTH_HEAL_COOLDOWN_MS = 15 * 60 * 1000;
const TEAM_AUTH_HEAL_AT_KEY_PREFIX = 'teamAuthHealAt:';
const LOGIN_NETWORK_TIMEOUT_MS = 10000;

let teamsMemoryCache: TeamRecord[] | null = null;
let teamsMemoryCacheAt = 0;
let teamsInFlight: Promise<TeamRecord[] | null> | null = null;
let circuitBreakerOpen = false;
let circuitBreakerFailures = 0;
let circuitBreakerOpenAt = 0;
let lastAdminRecoveryAttemptAt = 0;

const getCircuitBreakerStatus = (): boolean => {
  if (!circuitBreakerOpen) return false;
  if (Date.now() - circuitBreakerOpenAt > CIRCUIT_BREAKER_RESET_MS) {
    circuitBreakerOpen = false;
    circuitBreakerFailures = 0;
    return false;
  }
  return true;
};

const recordCircuitBreakerFailure = () => {
  circuitBreakerFailures += 1;
  if (circuitBreakerFailures >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
    circuitBreakerOpen = true;
    circuitBreakerOpenAt = Date.now();
  }
};

const recordCircuitBreakerSuccess = () => {
  circuitBreakerFailures = 0;
};

export const isSupabaseUnavailable = (): boolean => {
  return getCircuitBreakerStatus();
};

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
};

const withLoginTimeout = async <T>(promise: Promise<T>): Promise<T | null> => {
  return withTimeout(promise, LOGIN_NETWORK_TIMEOUT_MS);
};

const attemptAdminSessionRecovery = async (supabase: any): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  try {
    const isAdminLoggedIn = localStorage.getItem('adminLoggedIn') === '1';
    if (!isAdminLoggedIn) return false;

    const now = Date.now();
    if (now - lastAdminRecoveryAttemptAt < ADMIN_RECOVERY_COOLDOWN_MS) return false;
    lastAdminRecoveryAttemptAt = now;

    const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_USER, password: ADMIN_PASS });
    return !error;
  } catch {
    return false;
  }
};

const shouldRunTeamAuthHeal = (teamId: string): boolean => {
  if (typeof window === 'undefined') return false;
  const normalizedTeamId = String(teamId || '').trim();
  if (!normalizedTeamId) return false;
  const key = `${TEAM_AUTH_HEAL_AT_KEY_PREFIX}${normalizedTeamId}`;
  try {
    const lastRunAt = Number(localStorage.getItem(key) || '0');
    if (lastRunAt > 0 && Date.now() - lastRunAt < TEAM_AUTH_HEAL_COOLDOWN_MS) {
      return false;
    }
    localStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    return false;
  }
};

const fetchTeamsViaAPI = async (): Promise<TeamRecord[] | null> => {
  if (typeof window === 'undefined') return null;
  try {
    const response = await Promise.race([
      fetch('/api/admin/teams-direct'),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), API_QUERY_TIMEOUT_MS)
      ),
    ]);
    if (!response.ok) {
      console.warn('API responded with status:', response.status);
      return null;
    }
    const payload = await response.json();
    if (!Array.isArray(payload.teams)) {
      console.warn('API response missing teams array');
      return null;
    }
    const teams = payload.teams;
    if (teams.length > 0) {
      console.log('✓ Teams loaded via server API:', teams.length, 'teams');
      recordCircuitBreakerSuccess();
      return teams;
    }
    return null;
  } catch (e) {
    console.warn('API call failed:', e);
    return null;
  }
};

const cloneTeams = (rows: TeamRecord[] | null): TeamRecord[] | null => {
  if (!rows) return null;
  return JSON.parse(JSON.stringify(rows));
};

const readLegacyRegisteredTeams = (): TeamRecord[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('registeredTeams');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as TeamRecord[];
  } catch {
    return null;
  }
};

const readTeamsFallbackCache = (): TeamRecord[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const rawAt = Number(localStorage.getItem(TEAMS_CACHE_AT_KEY) || '0');
    if (!rawAt || Date.now() - rawAt > TEAMS_FALLBACK_CACHE_MAX_AGE_MS) return null;
    const raw = localStorage.getItem(TEAMS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as TeamRecord[];
  } catch {
    return null;
  }
};

const writeTeamsFallbackCache = (rows: TeamRecord[]) => {
  if (!Array.isArray(rows) || rows.length === 0) return;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify(rows));
    localStorage.setItem(TEAMS_CACHE_AT_KEY, String(Date.now()));
  } catch {
    // ignore localStorage quota/privacy failures
  }
};

const fetchTeamsWithMembersOnce = async (): Promise<TeamRecord[] | null> => {
  // PRIMARY PATH: Try server API first (avoids CORS issues)
  if (typeof window !== 'undefined') {
    const apiTeams = await fetchTeamsViaAPI();
    if (apiTeams && apiTeams.length > 0) {
      teamsMemoryCache = apiTeams;
      teamsMemoryCacheAt = Date.now();
      writeTeamsFallbackCache(apiTeams);
      return apiTeams;
    }
  }

  // FALLBACK PATH: Try direct Supabase queries
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const fetchTeamsRows = async () => {
      return withTimeout(
        Promise.resolve().then(() =>
          supabase
            .from('teams')
            .select('id, team_name, domain, created_at')
            .order('created_at', { ascending: true })
        ),
        QUERY_TIMEOUT_MS
      );
    };

    let teamsResult = await fetchTeamsRows();

    if (!teamsResult) {
      recordCircuitBreakerFailure();
      return null;
    }

    let { data: teams, error: teamsError } = teamsResult;

    if (!teamsError && Array.isArray(teams) && teams.length === 0) {
      const recovered = await attemptAdminSessionRecovery(supabase);
      if (recovered) {
        const retried = await fetchTeamsRows();
        if (retried) {
          teamsResult = retried;
          teams = retried.data as any;
          teamsError = retried.error as any;
        }
      }
    }

    if (teamsError) {
      recordCircuitBreakerFailure();
      return null;
    }
    if (!teams) return [];

    const teamIds = teams.map((t: any) => t.id).filter(Boolean);
    if (!teamIds.length) return [];

    const membersResult = await withTimeout(
      Promise.resolve().then(() =>
        supabase
          .from('members')
          .select(
            'id, team_id, member_index, name, registration_number, email, phone_number, school, program, program_other, branch, campus, stay, year_of_study'
          )
          .in('team_id', teamIds)
          .order('member_index', { ascending: true })
      ),
      QUERY_TIMEOUT_MS
    );

    if (!membersResult) {
      recordCircuitBreakerFailure();
      return null;
    }

    const { data: members, error: membersError } = membersResult;
    if (membersError) {
      recordCircuitBreakerFailure();
      return null;
    }

    const membersByTeam = new Map<string, any[]>();
    if (Array.isArray(members)) {
      for (const m of members) {
        const arr = membersByTeam.get(m.team_id) || [];
        arr.push(m);
        membersByTeam.set(m.team_id, arr);
      }
    }

    recordCircuitBreakerSuccess();
    return teams.map((t: any) => mapTeamRecord(t, membersByTeam.get(t.id) || []));
  } catch (e) {
    recordCircuitBreakerFailure();
    return null;
  }
};

export const syncTeamUsersPassword = async (
  teamId: string,
  teamPassword: string,
  options?: { retries?: number }
): Promise<boolean> => {
  const normalizedTeamId = String(teamId || '').trim();
  const normalizedPassword = String(teamPassword || '').trim();
  if (!normalizedTeamId || !normalizedPassword) return false;

  const retries = Math.max(1, Math.min(3, Number(options?.retries || 2)));

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch('/api/auth/bootstrap-team-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: normalizedTeamId, teamPassword: normalizedPassword }),
      });

      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.ok !== false) return true;
    } catch {
      // retry on transient failures
    }

    if (attempt < retries) {
      await wait(200 * attempt);
    }
  }

  return false;
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
  // API route works even if Supabase client is not configured on frontend
  // Returns cached data from fallback storage if circuit breaker is open
  if (!isSupabaseConfigured() && typeof window === 'undefined') return null;
  
  const now = Date.now();
  if (teamsMemoryCache && now - teamsMemoryCacheAt <= TEAMS_CACHE_TTL_MS) {
    return cloneTeams(teamsMemoryCache);
  }

  if (teamsInFlight) {
    const shared = await teamsInFlight;
    return cloneTeams(shared);
  }

  teamsInFlight = (async () => {
    const fallbackFromStorage = readTeamsFallbackCache();
    const legacyFallback = readLegacyRegisteredTeams();
    
    if (getCircuitBreakerStatus()) {
      if (teamsMemoryCache) return teamsMemoryCache;
      if (fallbackFromStorage) return fallbackFromStorage;
      if (legacyFallback) return legacyFallback;
      return null;
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const rows = await fetchTeamsWithMembersOnce();
      if (rows) {
        // Guard against false empty reads (e.g., transient auth/RLS/session mismatch).
        if (rows.length === 0) {
          if (teamsMemoryCache && teamsMemoryCache.length > 0) return teamsMemoryCache;
          if (fallbackFromStorage && fallbackFromStorage.length > 0) return fallbackFromStorage;
          if (legacyFallback && legacyFallback.length > 0) return legacyFallback;
        }

        teamsMemoryCache = rows;
        teamsMemoryCacheAt = Date.now();
        writeTeamsFallbackCache(rows);
        return rows;
      }
      if (attempt < 2) await wait(150);
    }

    if (teamsMemoryCache) return teamsMemoryCache;
    if (fallbackFromStorage) return fallbackFromStorage;
    if (legacyFallback) return legacyFallback;
    return null;
  })();

  try {
    const rows = await teamsInFlight;
    return cloneTeams(rows);
  } finally {
    teamsInFlight = null;
  }
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

export const loginWithIdentifierAndPassword = async (identifierInput: string, mobileInput: string): Promise<{ team: TeamRecord; identifierNormalized: string; memberId: string; teamId: string } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const identifierNormalized = normalizeIdentifier(identifierInput);
  const identifierRaw = String(identifierInput || '').trim();
  const mobileNormalized = canonicalPhone(String(mobileInput || ''));
  if (!identifierNormalized || !mobileNormalized) return null;

  let resolvedTeamFromApi: TeamRecord | null = null;
  const pickMemberMatchingMobile = (rows: any[]): any | null => {
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const exactMobile = rows.find((r: any) => canonicalPhone(String(r?.phone_number || '')) === mobileNormalized);
    if (exactMobile) return exactMobile;
    return rows[0] || null;
  };

  // Step 1: Resolve member by first identifier (email or registration number).
  let member: any | null = null;

  // Preferred path: service-role resolver route for cross-device reliability.
  try {
    const resolved = await withLoginTimeout(fetch('/api/auth/resolve-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: identifierNormalized, mobile: mobileInput }),
    }));
    if (!resolved) {
      // timed out, continue with other fallbacks
    } else if (resolved.ok) {
      const payload = await resolved.json().catch(() => null);
      if (payload?.member?.id && payload?.member?.teamId) {
        member = {
          id: payload.member.id,
          team_id: payload.member.teamId,
          name: payload.member.name,
          email: payload.member.email,
          phone_number: payload.member.phoneNumber,
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

  // RPC fallback for environments where API route is unavailable.
  try {
    if (!member) {
      const rpc = await supabase.rpc('find_member_for_login', { identifier: identifierNormalized });
      if (!rpc.error && rpc.data) {
        member = Array.isArray(rpc.data) ? pickMemberMatchingMobile(rpc.data) : rpc.data;
      }
    }
  } catch {
    // ignore
  }

  const identifierMatchesMember = (m: any) => {
    const emailNormalized = normalizeIdentifier(String(m?.email || ''));
    const regNormalized = normalizeIdentifier(String(m?.registration_number || ''));
    return emailNormalized === identifierNormalized || regNormalized === identifierNormalized;
  };

  // Fallback: direct query by phone first, then confirm identifier on the same member row.
  if (!member) {
    const { data, error } = await supabase
      .from('members')
      .select('id, team_id, name, email, phone_number, registration_number')
      .or(
        `phone_number_normalized.eq.${mobileNormalized},phone_number.eq.${mobileInput}`
      )
      .limit(25);
    if (!error && Array.isArray(data) && data.length > 0) {
      member = data.find(identifierMatchesMember) || null;
    }
  }

  // Last fallback: identifier-first query then phone match (for legacy data layouts).
  if (!member && identifierRaw) {
    const { data, error } = await supabase
      .from('members')
      .select('id, team_id, name, email, phone_number, registration_number')
      .or(
        `email_normalized.eq.${identifierNormalized},registration_number_normalized.eq.${identifierNormalized},email.ilike.${identifierRaw},registration_number.eq.${identifierRaw}`
      )
      .limit(25);
    if (!error && Array.isArray(data) && data.length > 0) {
      member = pickMemberMatchingMobile(data);
    }
  }

  if (!member?.team_id) return null;

  // Step 2: Verify second identifier strictly against member mobile number.
  let memberPhoneDigits = canonicalPhone(String(member.phone_number || ''));
  if (!memberPhoneDigits && resolvedTeamFromApi?.members?.length) {
    const matchedMember = resolvedTeamFromApi.members.find((m: any) => String(m?.id || '') === String(member.id || ''));
    memberPhoneDigits = canonicalPhone(String((matchedMember as any)?.phoneNumber || ''));
  }
  if (!memberPhoneDigits || memberPhoneDigits !== mobileNormalized) return null;

  // Step 3: Fetch full team data via SECURITY DEFINER RPC — works in any browser regardless of auth/RLS.
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

  // Step 4: Build TeamRecord from RPC data (preferred) or fall back to direct queries
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
      normalizeIdentifier(m.registration_number) === identifierNormalized
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
      normalizeIdentifier(m.registrationNumber) === identifierNormalized
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
