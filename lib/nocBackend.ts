import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export type NocRecord = {
  teamName: string;
  memberId: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
};

const BUCKET = 'noc';

export const MAX_NOC_BYTES = 2 * 1024 * 1024; // 2 MB

const safeSegment = (value: string) => encodeURIComponent(String(value));

const nocObjectPath = (teamName: string, memberId: string) => {
  // Fixed path so uploading again overwrites the previous file.
  return `${safeSegment(teamName)}/${safeSegment(memberId)}/noc.pdf`;
};

export const getNoc = async (teamName: string, memberId: string): Promise<{ url: string; fileName: string; uploadedAt: string } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('noc_uploads')
    .select('team_name, member_id, file_name, file_path, uploaded_at')
    .eq('team_name', teamName)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error || !data) return null;

  // Prefer signed URLs (works for private buckets). If the bucket is public, you can swap to getPublicUrl.
  const signed = await supabase.storage.from(BUCKET).createSignedUrl(data.file_path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) return null;

  return { url: signed.data.signedUrl, fileName: data.file_name, uploadedAt: data.uploaded_at };
};

export const listNocUploadsForTeams = async (teamNames: string[]): Promise<NocRecord[]> => {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const uniq = Array.from(new Set(teamNames.filter(Boolean)));
  if (!uniq.length) return [];

  const { data, error } = await supabase
    .from('noc_uploads')
    .select('team_name, member_id, file_name, file_path, uploaded_at')
    .in('team_name', uniq);

  if (error || !data) return [];
  return data.map((r: any) => ({
    teamName: r.team_name,
    memberId: r.member_id,
    fileName: r.file_name,
    filePath: r.file_path,
    uploadedAt: r.uploaded_at,
  }));
};

export const subscribeAdminNocChanges = (onChange: () => void): (() => void) => {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel('noc_admin')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'noc_uploads' },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'noc_deadlines' },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const upsertNoc = async (teamName: string, memberId: string, file: File): Promise<{ url: string; fileName: string; uploadedAt: string } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  if (typeof file?.size === 'number' && file.size > MAX_NOC_BYTES) {
    throw new Error('NOC PDF must be 2 MB or smaller.');
  }

  const filePath = nocObjectPath(teamName, memberId);

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type || 'application/pdf',
    });

  if (upload.error) throw upload.error;

  const uploadedAt = new Date().toISOString();
  const { error: upsertError } = await supabase
    .from('noc_uploads')
    .upsert(
      {
        team_name: teamName,
        member_id: memberId,
        file_name: file.name || 'noc.pdf',
        file_path: filePath,
        uploaded_at: uploadedAt,
      },
      { onConflict: 'team_name,member_id' }
    );

  if (upsertError) throw upsertError;

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error;

  return { url: signed.data.signedUrl, fileName: file.name || 'noc.pdf', uploadedAt };
};

export const deleteNoc = async (teamName: string, memberId: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase
    .from('noc_uploads')
    .select('file_path')
    .eq('team_name', teamName)
    .eq('member_id', memberId)
    .maybeSingle();

  if (data?.file_path) {
    await supabase.storage.from(BUCKET).remove([data.file_path]);
  }

  await supabase.from('noc_uploads').delete().eq('team_name', teamName).eq('member_id', memberId);
};

export const deleteAllNocForTeam = async (teamName: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase
    .from('noc_uploads')
    .select('file_path')
    .eq('team_name', teamName);

  const paths = (Array.isArray(data) ? data : []).map((r: any) => r?.file_path).filter(Boolean);
  if (paths.length) {
    // Best-effort: ignore remove failures (some files may already be gone)
    try {
      await supabase.storage.from(BUCKET).remove(paths);
    } catch {
      // ignore
    }
  }

  await supabase.from('noc_uploads').delete().eq('team_name', teamName);
  await supabase.from('noc_deadlines').delete().eq('team_name', teamName);
};

export const getNocDeadline = async (teamName: string, memberId: string): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('noc_deadlines')
    .select('deadline')
    .eq('team_name', teamName)
    .eq('member_id', memberId)
    .maybeSingle();

  if (error || !data?.deadline) return null;
  return data.deadline;
};

export const setNocDeadline = async (teamName: string, memberId: string, deadlineIso: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('noc_deadlines')
    .upsert(
      { team_name: teamName, member_id: memberId, deadline: deadlineIso },
      { onConflict: 'team_name,member_id' }
    );

  if (error) throw error;
};

export const subscribeNocChanges = (
  teamName: string,
  memberId: string,
  onChange: () => void
): (() => void) => {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`noc:${teamName}:${memberId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'noc_uploads',
        filter: `team_name=eq.${teamName},member_id=eq.${memberId}`,
      },
      () => onChange()
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'noc_deadlines',
        filter: `team_name=eq.${teamName},member_id=eq.${memberId}`,
      },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
