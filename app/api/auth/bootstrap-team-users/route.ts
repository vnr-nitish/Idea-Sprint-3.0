import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type MemberInput = {
  email?: string;
};

const normalizeEmail = (value: string) => String(value || '').trim().toLowerCase();

const findAuthUserIdByEmail = async (
  admin: any,
  email: string
): Promise<string | null> => {
  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  // Team sizes are very small, but the auth user list can be large.
  // Walk pages with a hard cap to avoid unbounded API calls.
  while (page <= 25) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;

    const users = Array.isArray(data?.users) ? data.users : [];
    const hit = users.find((u: any) => normalizeEmail(String(u?.email || '')) === target);
    if (hit?.id) return String(hit.id);

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const teamPassword = String(body?.teamPassword || '').trim();
    const teamId = String(body?.teamId || '').trim();

    if (!teamPassword || !teamId) {
      return NextResponse.json({ ok: false, error: 'invalid_payload' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: 'service_role_not_configured' }, { status: 503 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: memberRows, error: memberErr } = await admin
      .from('members')
      .select('id, email, email_normalized')
      .eq('team_id', teamId)
      .order('member_index', { ascending: true });

    if (memberErr) {
      return NextResponse.json({ ok: false, error: memberErr.message || 'member_lookup_failed' }, { status: 500 });
    }

    const emails = Array.from(
      new Set(
        (memberRows || [])
          .map((m: any) => normalizeEmail(String(m?.email_normalized || m?.email || '')))
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )
    );

    if (!emails.length) {
      return NextResponse.json({ ok: false, error: 'no_member_emails_found' }, { status: 400 });
    }

    const results: Array<{ email: string; status: 'created' | 'updated' | 'failed'; error?: string }> = [];

    for (const email of emails) {
      try {
        const existingUserId = await findAuthUserIdByEmail(admin, email);

        if (existingUserId) {
          const { error: updateErr } = await admin.auth.admin.updateUserById(existingUserId, {
            password: teamPassword,
            email_confirm: true,
          });

          if (updateErr) {
            results.push({ email, status: 'failed', error: updateErr.message });
            continue;
          }

          // Best-effort: bind member rows to auth user id for RLS-friendly access.
          void admin.from('members').update({ auth_user_id: existingUserId }).eq('email_normalized', email);
          results.push({ email, status: 'updated' });
          continue;
        }

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: teamPassword,
          email_confirm: true,
        });

        if (!error) {
          const userId = String(data?.user?.id || '').trim();
          if (userId) {
            void admin.from('members').update({ auth_user_id: userId }).eq('email_normalized', email);
          }
          results.push({ email, status: 'created' });
          continue;
        }

        results.push({ email, status: 'failed', error: error.message });
      } catch (e: any) {
        results.push({ email, status: 'failed', error: e?.message || 'unknown' });
      }
    }

    const failures = results.filter((r) => r.status === 'failed');
    if (failures.length > 0) {
      return NextResponse.json({ ok: false, error: 'some_users_failed', results }, { status: 207 });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
