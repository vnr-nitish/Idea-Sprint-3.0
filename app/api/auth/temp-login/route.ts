import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  normalizeLoginEmail,
  normalizeLoginIdentifier,
  validateTempSpocCredential,
} from '@/lib/server/tempLoginCredentials';

const QUERY_TIMEOUT_MS = 7000;

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
};

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const canonicalPhone = (value: string) => {
  const digits = normalizePhone(value);
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const isTempMemberSecretMatch = (member: any, secretInput: string) => {
  const inputRaw = String(secretInput || '').trim();
  const inputPhone = canonicalPhone(inputRaw);

  const memberPhone = canonicalPhone(String(member?.phone_number || ''));

  if (inputPhone && memberPhone && inputPhone === memberPhone) return true;
  return false;
};

const isTempSpocSecretMatch = (spoc: any, secretInput: string) => {
  const inputPhone = canonicalPhone(secretInput);
  const spocPhone = canonicalPhone(String(spoc?.phone || ''));
  return !!inputPhone && !!spocPhone && inputPhone === spocPhone;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawIdentifier = String(body?.identifier || '').trim();
    const rawSecret = String(body?.secret || body?.mobile || '').trim();

    if (!rawIdentifier || !rawSecret) {
      return NextResponse.json({ ok: false, error: 'missing_credentials' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      return NextResponse.json({ ok: false, error: 'resolver_not_configured' }, { status: 503 });
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const normalizedEmail = normalizeLoginEmail(rawIdentifier);
    const spocResult = await withTimeout(
      Promise.resolve().then(() =>
        supabase
          .from('reporting_spocs')
          .select('id, name, email, phone')
          .eq('email', normalizedEmail)
          .maybeSingle()
      ),
      QUERY_TIMEOUT_MS
    );

    const spocRow = (spocResult as any)?.data;
    if (spocRow?.email) {
      const spocPasswordMatch = validateTempSpocCredential(normalizedEmail, rawSecret);
      const spocPhoneMatch = isTempSpocSecretMatch(spocRow, rawSecret);
      if (spocPasswordMatch || spocPhoneMatch) {
        return NextResponse.json({
          ok: true,
          role: 'spoc',
          spoc: {
            id: String(spocRow.id || normalizedEmail),
            name: String(spocRow.name || normalizedEmail.split('@')[0]),
            email: String(spocRow.email || normalizedEmail).toLowerCase(),
            phone: String(spocRow.phone || ''),
          },
        });
      }
    }

    const normalizedIdentifier = normalizeLoginIdentifier(rawIdentifier);

    const memberResult = await withTimeout(
      Promise.resolve().then(() =>
        supabase
          .from('members')
          .select('id, team_id, name, email, phone_number, email_normalized, registration_number, registration_number_normalized')
          .or(
            `email_normalized.eq.${normalizedIdentifier},registration_number_normalized.eq.${normalizedIdentifier},email.ilike.${rawIdentifier},registration_number.eq.${rawIdentifier}`
          )
          .limit(5)
      ),
      QUERY_TIMEOUT_MS
    );

    if (!memberResult) {
      return NextResponse.json({ ok: false, error: 'member_lookup_timeout' }, { status: 504 });
    }

    const candidates: any[] = Array.isArray((memberResult as any)?.data) ? (memberResult as any).data : [];
    const member =
      candidates.find((m) => {
        const e = normalizeLoginIdentifier(String(m?.email_normalized || m?.email || ''));
        const r = normalizeLoginIdentifier(String(m?.registration_number_normalized || m?.registration_number || ''));
        return e === normalizedIdentifier || r === normalizedIdentifier;
      }) || null;

    if (!member?.team_id) {
      return NextResponse.json({ ok: false, error: 'member_not_found' }, { status: 404 });
    }

    if (!isTempMemberSecretMatch(member, rawSecret)) {
      return NextResponse.json({ ok: false, error: 'invalid_temp_credentials' }, { status: 401 });
    }

    const teamAndMembers = await withTimeout(
      Promise.all([
        Promise.resolve().then(() =>
          supabase
            .from('teams')
            .select('id, team_name, domain, created_at')
            .eq('id', member.team_id)
            .maybeSingle()
        ),
        Promise.resolve().then(() =>
          supabase
            .from('members')
            .select('id, member_index, name, registration_number, email, phone_number, school, program, program_other, branch, campus, stay, year_of_study')
            .eq('team_id', member.team_id)
            .order('member_index', { ascending: true })
        ),
      ]),
      QUERY_TIMEOUT_MS
    );

    if (!teamAndMembers) {
      return NextResponse.json({ ok: false, error: 'team_lookup_timeout' }, { status: 504 });
    }

    const [{ data: teamRow }, { data: memberRows }] = teamAndMembers;

    if (!teamRow || !Array.isArray(memberRows)) {
      return NextResponse.json({ ok: false, error: 'team_not_found' }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      role: 'team',
      member: {
        id: String(member.id),
        teamId: String(member.team_id),
        name: String(member.name || ''),
        email: String(member.email || ''),
        phoneNumber: String(member.phone_number || ''),
      },
      team: {
        teamId: String(teamRow.id),
        teamName: String(teamRow.team_name || ''),
        domain: String(teamRow.domain || ''),
        createdAt: String(teamRow.created_at || ''),
        members: memberRows.map((m: any) => ({
          id: String(m.id),
          name: String(m.name || ''),
          registrationNumber: String(m.registration_number || ''),
          email: String(m.email || ''),
          phoneNumber: String(m.phone_number || ''),
          school: String(m.school || ''),
          program: String(m.program || ''),
          programOther: String(m.program_other || ''),
          branch: String(m.branch || ''),
          campus: String(m.campus || ''),
          stay: String(m.stay || ''),
          yearOfStudy: String(m.year_of_study || ''),
        })),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'temp_login_failed' }, { status: 500 });
  }
}
