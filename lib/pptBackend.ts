import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export type PptUploadRecord = {
  teamId: string;
  campus: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
};

const BUCKET = 'ppt';

export const MAX_PPT_BYTES = 5 * 1024 * 1024; // 5 MB

const safeSegment = (value: string) => encodeURIComponent(String(value || '').trim());

const pptObjectPath = (teamId: string, campus: string) => {
  // Fixed path so uploading again overwrites the previous file.
  return `${safeSegment(teamId)}/${safeSegment(campus || 'campus')}/ppt.pdf`;
};

export const getPpt = async (teamId: string, campus: string): Promise<{ url: string; fileName: string; uploadedAt: string } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('ppt_uploads')
    .select('team_id, campus, file_name, file_path, uploaded_at')
    .eq('team_id', teamId)
    .eq('campus', campus)
    .maybeSingle();

  if (error || !data) return null;

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(data.file_path, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) return null;

  return { url: signed.data.signedUrl, fileName: data.file_name, uploadedAt: data.uploaded_at };
};

export const listPptUploadsForTeams = async (teamIds: string[]): Promise<PptUploadRecord[]> => {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const uniq = Array.from(new Set(teamIds.filter(Boolean)));
  if (!uniq.length) return [];

  const { data, error } = await supabase
    .from('ppt_uploads')
    .select('team_id, campus, file_name, file_path, uploaded_at')
    .in('team_id', uniq);

  if (error || !data) return [];

  return data.map((r: any) => ({
    teamId: String(r.team_id),
    campus: String(r.campus),
    fileName: r.file_name,
    filePath: r.file_path,
    uploadedAt: r.uploaded_at,
  }));
};

export const upsertPpt = async (teamId: string, campus: string, file: File): Promise<{ url: string; fileName: string; uploadedAt: string } | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  if (typeof file?.size === 'number' && file.size > MAX_PPT_BYTES) {
    throw new Error('PPT PDF must be 5 MB or smaller.');
  }

  const filePath = pptObjectPath(teamId, campus);

  const upload = await supabase.storage
    .from(BUCKET)
    .upload(filePath, file, {
      upsert: true,
      contentType: file.type || 'application/pdf',
    });

  if (upload.error) throw upload.error;

  const uploadedAt = new Date().toISOString();
  const { error: upsertError } = await supabase
    .from('ppt_uploads')
    .upsert(
      {
        team_id: teamId,
        campus,
        file_name: file.name || 'ppt.pdf',
        file_path: filePath,
        uploaded_at: uploadedAt,
      },
      { onConflict: 'team_id,campus' }
    );

  if (upsertError) throw upsertError;

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60);
  if (signed.error || !signed.data?.signedUrl) throw signed.error;

  return { url: signed.data.signedUrl, fileName: file.name || 'ppt.pdf', uploadedAt };
};

export const deletePpt = async (teamId: string, campus: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase
    .from('ppt_uploads')
    .select('file_path')
    .eq('team_id', teamId)
    .eq('campus', campus)
    .maybeSingle();

  if (data?.file_path) {
    await supabase.storage.from(BUCKET).remove([data.file_path]);
  }

  await supabase.from('ppt_uploads').delete().eq('team_id', teamId).eq('campus', campus);
};

export const deleteAllPptForTeam = async (teamId: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { data } = await supabase
    .from('ppt_uploads')
    .select('file_path')
    .eq('team_id', teamId);

  const paths = (Array.isArray(data) ? data : []).map((r: any) => r?.file_path).filter(Boolean);
  if (paths.length) {
    try {
      await supabase.storage.from(BUCKET).remove(paths);
    } catch {
      // ignore
    }
  }

  await supabase.from('ppt_uploads').delete().eq('team_id', teamId);
  await supabase.from('ppt_deadlines').delete().eq('team_id', teamId);
};

export const getPptDeadline = async (teamId: string, campus: string): Promise<string | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('ppt_deadlines')
    .select('deadline')
    .eq('team_id', teamId)
    .eq('campus', campus)
    .maybeSingle();

  if (error || !data?.deadline) return null;
  return data.deadline;
};

export const setPptDeadline = async (teamId: string, campus: string, deadlineIso: string): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('ppt_deadlines')
    .upsert(
      { team_id: teamId, campus, deadline: deadlineIso },
      { onConflict: 'team_id,campus' }
    );

  if (error) throw error;
};

export const subscribePptChanges = (teamId: string, campus: string, onChange: () => void): (() => void) => {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`ppt:${teamId}:${campus}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ppt_uploads', filter: `team_id=eq.${teamId},campus=eq.${campus}` },
      () => onChange()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'ppt_deadlines', filter: `team_id=eq.${teamId},campus=eq.${campus}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeAdminPptChanges = (onChange: () => void): (() => void) => {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel('ppt_admin')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ppt_uploads' }, () => onChange())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ppt_deadlines' }, () => onChange())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
