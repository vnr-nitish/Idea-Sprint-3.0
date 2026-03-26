import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type MemberInput = {
  email?: string;
};

const normalizeEmail = (value: string) => String(value || '').trim().toLowerCase();

const LIST_USERS_PER_PAGE = 200;
const LIST_USERS_MAX_PAGES = 500;

const indexUsersByEmailFromList = async (admin: any, emails: string[]) => {
  const targets = new Set(emails.map((e) => normalizeEmail(e)));
  const byEmail = new Map<string, string>();
  let page = 1;
  const perPage = LIST_USERS_PER_PAGE;

  while (page <= LIST_USERS_MAX_PAGES && byEmail.size < targets.size) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;

    const users = Array.isArray(data?.users) ? data.users : [];
    for (const u of users) {
      const email = normalizeEmail(String(u?.email || ''));
      if (targets.has(email) && u?.id) {
        byEmail.set(email, String(u.id));
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }

  return byEmail;
};

const findAuthUserIdByEmail = async (admin: any, email: string): Promise<string | null> => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  // Fast exact match against auth.users.
  try {
    const { data } = await admin
      .schema('auth')
      .from('users')
      .select('id, email')
      .eq('email', normalized)
      .limit(1);

    const row = Array.isArray(data) ? data[0] : null;
    const userId = String((row as any)?.id || '').trim();
    if (userId) return userId;
  } catch {
    // continue to fallback path
  }

  // Case-insensitive fallback for legacy mixed-case emails.
  try {
    const { data } = await admin
      .schema('auth')
      .from('users')
      .select('id, email')
      .ilike('email', normalized)
      .limit(1);

    const row = Array.isArray(data) ? data[0] : null;
    const userId = String((row as any)?.id || '').trim();
    if (userId) return userId;
  } catch {
    // continue to listUsers fallback
  }

  // Final fallback: scan all pages via Admin API.
  const indexed = await indexUsersByEmailFromList(admin, [normalized]);
  return indexed.get(normalized) || null;
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

    // Fast path: query auth.users directly once using service role.
    // This avoids repeated paginated listUsers calls that can intermittently fail.
    const existingByEmail = new Map<string, string>();
    try {
      const { data: existingRows } = await admin
        .schema('auth')
        .from('users')
        .select('id, email')
        .in('email', emails);

      for (const row of existingRows || []) {
        const normalized = normalizeEmail(String((row as any)?.email || ''));
        const id = String((row as any)?.id || '').trim();
        if (normalized && id) existingByEmail.set(normalized, id);
      }
    } catch {
      // ignore and fall back per-email below
    }

    for (const email of emails) {
      try {
        let existingUserId = existingByEmail.get(email) || null;

        // Fallback for environments where auth.users query is unavailable.
        if (!existingUserId) {
          existingUserId = await findAuthUserIdByEmail(admin, email);
        }

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

        // Race/normalization fallback: user exists but fast lookup missed it.
        const msg = String(error.message || '').toLowerCase();
        const alreadyExists = msg.includes('already registered') || msg.includes('already exists');
        if (alreadyExists) {
          const recoveredUserId = await findAuthUserIdByEmail(admin, email);
          if (recoveredUserId) {
            const { error: updateErr } = await admin.auth.admin.updateUserById(recoveredUserId, {
              password: teamPassword,
              email_confirm: true,
            });
            if (!updateErr) {
              void admin.from('members').update({ auth_user_id: recoveredUserId }).eq('email_normalized', email);
              results.push({ email, status: 'updated' });
              continue;
            }
            results.push({ email, status: 'failed', error: updateErr.message });
            continue;
          }
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
