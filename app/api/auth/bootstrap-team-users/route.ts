import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type MemberInput = {
  email?: string;
};

const normalizeEmail = (value: string) => String(value || '').trim().toLowerCase();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const teamPassword = String(body?.teamPassword || '').trim();
    const members = Array.isArray(body?.members) ? (body.members as MemberInput[]) : [];

    if (!teamPassword || members.length === 0) {
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

    const emails = Array.from(
      new Set(
        members
          .map((m) => normalizeEmail(String(m?.email || '')))
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )
    );

    const results: Array<{ email: string; status: 'created' | 'exists' | 'failed'; error?: string }> = [];

    for (const email of emails) {
      try {
        const { error } = await admin.auth.admin.createUser({
          email,
          password: teamPassword,
          email_confirm: true,
        });

        if (!error) {
          results.push({ email, status: 'created' });
          continue;
        }

        const msg = String(error.message || '').toLowerCase();
        const exists = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
        if (exists) {
          results.push({ email, status: 'exists' });
        } else {
          results.push({ email, status: 'failed', error: error.message });
        }
      } catch (e: any) {
        results.push({ email, status: 'failed', error: e?.message || 'unknown' });
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'unknown_error' }, { status: 500 });
  }
}
