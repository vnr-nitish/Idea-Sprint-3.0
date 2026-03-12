import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export type ProblemStatementRecord = {
  id: string;
  domain: string;
  code: string;
  description: string;
  outcome: string;
  createdAt: string;
};

export const listProblemStatements = async (): Promise<ProblemStatementRecord[] | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('problem_statements')
    .select('id, domain, code, description, outcome, created_at')
    .order('created_at', { ascending: false });

  if (error || !Array.isArray(data)) return null;
  return data.map((p: any) => ({
    id: String(p.id || ''),
    domain: String(p.domain || ''),
    code: String(p.code || ''),
    description: String(p.description || ''),
    outcome: String(p.outcome || ''),
    createdAt: String(p.created_at || new Date().toISOString()),
  }));
};

export const upsertProblemStatements = async (rows: ProblemStatementRecord[]): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const payload = (rows || []).map((p) => ({
    id: p.id,
    domain: p.domain,
    code: p.code,
    description: p.description,
    outcome: p.outcome,
    created_at: p.createdAt || new Date().toISOString(),
  }));

  if (!payload.length) return true;
  const { error } = await supabase.from('problem_statements').upsert(payload, { onConflict: 'id' });
  return !error;
};

export const deleteProblemStatementById = async (id: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { error } = await supabase.from('problem_statements').delete().eq('id', id);
  return !error;
};

export const listTeamProblemSelections = async (): Promise<Record<string, string> | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('team_problem_selections')
    .select('team_name, problem_code');

  if (error || !Array.isArray(data)) return null;
  const map: Record<string, string> = {};
  data.forEach((r: any) => {
    const teamName = String(r.team_name || '').trim();
    if (!teamName) return;
    map[teamName] = String(r.problem_code || '').trim();
  });
  return map;
};

export const getTeamProblemSelection = async (teamName: string): Promise<string | null> => {
  const tn = String(teamName || '').trim();
  if (!tn || !isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('team_problem_selections')
    .select('problem_code')
    .eq('team_name', tn)
    .maybeSingle();

  if (error || !data) return null;
  return String(data.problem_code || '').trim() || null;
};

export const upsertTeamProblemSelection = async (teamName: string, problemCode: string): Promise<boolean> => {
  const tn = String(teamName || '').trim();
  if (!tn || !isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('team_problem_selections')
    .upsert({ team_name: tn, problem_code: String(problemCode || '').trim(), updated_at: new Date().toISOString() }, { onConflict: 'team_name' });

  return !error;
};
