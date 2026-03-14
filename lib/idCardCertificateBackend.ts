import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export type IdCardCertificateRecord = {
  teamName: string;
  memberId: string;
  memberName?: string;
  meal: string;
  day?: string;
  qr?: string;
  redeemed: boolean;
  updatedAt?: string;
};

export const listIdCardCertificatesForTeam = async (teamName: string): Promise<IdCardCertificateRecord[] | null> => {
  const tn = String(teamName || '').trim();
  if (!tn || !isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('id_card_certificates')
    .select('team_name, member_id, member_name, meal, day, qr, redeemed, updated_at')
    .eq('team_name', tn);

  if (error || !Array.isArray(data)) return null;
  return data.map((r: any) => ({
    teamName: String(r.team_name || ''),
    memberId: String(r.member_id || ''),
    memberName: String(r.member_name || ''),
    meal: String(r.meal || ''),
    day: String(r.day || ''),
    qr: String(r.qr || ''),
    redeemed: !!r.redeemed,
    updatedAt: r.updated_at || undefined,
  }));
};

export const replaceIdCardCertificatesForTeam = async (teamName: string, coupons: any[]): Promise<boolean> => {
  const tn = String(teamName || '').trim();
  if (!tn || !isSupabaseConfigured()) return false;
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { error: delError } = await supabase.from('id_card_certificates').delete().eq('team_name', tn);
  if (delError) return false;

  const payload = (coupons || []).map((c: any) => ({
    team_name: tn,
    member_id: String(c?.memberId || ''),
    member_name: String(c?.memberName || ''),
    meal: String(c?.meal || ''),
    day: String(c?.day || ''),
    qr: String(c?.qr || ''),
    redeemed: !!c?.redeemed,
    updated_at: new Date().toISOString(),
  })).filter((c: any) => c.member_id && c.meal);

  if (!payload.length) return true;
  const { error } = await supabase.from('id_card_certificates').insert(payload);
  return !error;
};
