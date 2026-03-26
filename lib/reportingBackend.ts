import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export type ReportingSpocRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ReportingAssignmentRecord = {
  teamName: string;
  venue?: string;
  date?: string;
  time?: string;
  spocId?: string;
  spoc?: { name?: string; email?: string; phone?: string };
  updatedAt?: string;
};

const normalizeSpocRow = (row: any): ReportingSpocRecord => ({
  id: String(row?.id || '').trim(),
  name: String(row?.name || '').trim(),
  email: String(row?.email || '').trim(),
  phone: String(row?.phone || '').trim(),
  createdAt: row?.created_at || row?.createdAt || undefined,
  updatedAt: row?.updated_at || row?.updatedAt || undefined,
});

const normalizeAssignmentRow = (row: any): ReportingAssignmentRecord => ({
  teamName: String(row?.team_name || row?.teamName || '').trim(),
  venue: String(row?.venue || '').trim(),
  date: String(row?.date || '').trim(),
  time: String(row?.time || '').trim(),
  spocId: String(row?.spoc_id || row?.spocId || '').trim() || undefined,
  spoc: {
    name: String(row?.spoc_name || row?.spoc?.name || '').trim() || undefined,
    email: String(row?.spoc_email || row?.spoc?.email || '').trim() || undefined,
    phone: String(row?.spoc_phone || row?.spoc?.phone || '').trim() || undefined,
  },
  updatedAt: row?.updated_at || row?.updatedAt || undefined,
});

export const listReportingSpocs = async (): Promise<ReportingSpocRecord[] | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('reporting_spocs')
    .select('id, name, email, phone, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error || !Array.isArray(data)) return null;
  return data.map(normalizeSpocRow).filter((s) => s.id);
};

export const upsertReportingSpocs = async (spocs: ReportingSpocRecord[]): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const payload = (spocs || [])
    .filter((s) => s?.id)
    .map((s) => ({
      id: s.id,
      name: s.name || '',
      email: s.email || '',
      phone: s.phone || '',
      created_at: s.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

  if (!payload.length) return true;
  const { error } = await supabase.from('reporting_spocs').upsert(payload, { onConflict: 'id' });
  return !error;
};

export const deleteReportingSpoc = async (spocId: string): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { error } = await supabase.from('reporting_spocs').delete().eq('id', spocId);
  return !error;
};

export const listReportingAssignments = async (): Promise<Record<string, ReportingAssignmentRecord> | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('reporting_assignments')
    .select('team_name, venue, date, time, spoc_id, spoc_name, spoc_email, spoc_phone, updated_at');

  if (error || !Array.isArray(data)) return null;

  const map: Record<string, ReportingAssignmentRecord> = {};
  for (const row of data) {
    const normalized = normalizeAssignmentRow(row);
    if (!normalized.teamName) continue;
    map[normalized.teamName] = normalized;
  }
  return map;
};

export const getReportingAssignmentForTeam = async (teamName: string): Promise<ReportingAssignmentRecord | null> => {
  const key = String(teamName || '').trim();
  if (!key || !isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('reporting_assignments')
    .select('team_name, venue, date, time, spoc_id, spoc_name, spoc_email, spoc_phone, updated_at')
    .eq('team_name', key)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeAssignmentRow(data);
};

export const upsertReportingAssignment = async (assignment: ReportingAssignmentRecord): Promise<boolean> => {
  const key = String(assignment?.teamName || '').trim();
  if (!key || !isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error } = await supabase.from('reporting_assignments').upsert(
    {
      team_name: key,
      venue: assignment.venue || null,
      date: assignment.date || null,
      time: assignment.time || null,
      spoc_id: assignment.spocId || null,
      spoc_name: assignment.spoc?.name || null,
      spoc_email: assignment.spoc?.email || null,
      spoc_phone: assignment.spoc?.phone || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'team_name' }
  );

  return !error;
};

export const upsertManyReportingAssignments = async (assignments: Record<string, ReportingAssignmentRecord>): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const payload = Object.entries(assignments || {})
    .filter(([teamName]) => !!String(teamName || '').trim())
    .map(([teamName, a]) => ({
      team_name: String(teamName).trim(),
      venue: a?.venue || null,
      date: a?.date || null,
      time: a?.time || null,
      spoc_id: a?.spocId || null,
      spoc_name: a?.spoc?.name || null,
      spoc_email: a?.spoc?.email || null,
      spoc_phone: a?.spoc?.phone || null,
      updated_at: new Date().toISOString(),
    }));

  if (!payload.length) return true;
  const { error } = await supabase.from('reporting_assignments').upsert(payload, { onConflict: 'team_name' });
  return !error;
};
