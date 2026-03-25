import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const QUERY_TIMEOUT_MS = 7000;

const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
};

const normalizeIdentifier = (value: string) => {
  const trimmed = String(value || '').trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) return digitsOnly;
  return trimmed.toLowerCase();
};

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const canonicalPhone = (value: string) => {
  const digits = normalizePhone(value);
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawIdentifier = String(body?.identifier || body?.identifierNormalized || '').trim();
    const rawMobile = String(body?.mobile || '').trim();
    const identifier = normalizeIdentifier(rawIdentifier);
    const mobile = canonicalPhone(rawMobile);
    console.log('[resolve-member] Input:', { rawIdentifier, rawMobile, identifier, mobile });
    if (!identifier) {
      console.log('[resolve-member] Missing identifier');
      return NextResponse.json({ ok: false, error: 'identifier is required' }, { status: 400 });
    }
    if (!mobile) {
      console.log('[resolve-member] Missing mobile');
      return NextResponse.json({ ok: false, error: 'mobile is required' }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      console.log('[resolve-member] Supabase not configured');
      return NextResponse.json({ ok: false, error: 'resolver_not_configured' }, { status: 503 });
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Query for member by both registration number and phone number
    const orQuery = [
      `registration_number_normalized.eq.${identifier},phone_number_normalized.eq.${mobile}`,
      `registration_number.eq.${rawIdentifier},phone_number_normalized.eq.${mobile}`,
      `registration_number_normalized.eq.${identifier},phone_number.eq.${rawMobile}`,
      `registration_number.eq.${rawIdentifier},phone_number.eq.${rawMobile}`
    ].join(',');
    console.log('[resolve-member] Supabase query:', orQuery);
    const memberResult = await withTimeout(
      Promise.resolve().then(() =>
        supabase
          .from('members')
          .select('id, team_id, name, email, phone_number, email_normalized, phone_number_normalized, registration_number, registration_number_normalized')
          .or(orQuery)
          .limit(1)
      ),
      QUERY_TIMEOUT_MS
    );

    if (!memberResult) {
      console.log('[resolve-member] Supabase query timeout');
      return NextResponse.json({ ok: false, error: 'member_lookup_timeout' }, { status: 504 });
    }

    const candidateMembers: any[] = Array.isArray((memberResult as any)?.data)
      ? (memberResult as any).data
      : [];
    const memberError = (memberResult as any)?.error;
    console.log('[resolve-member] Query result:', { candidateMembers, memberError });

    // Accept the first match
    const member = candidateMembers[0] || null;

    if (memberError || !member?.team_id) {
      console.log('[resolve-member] No member found or error', { memberError, member });
      return NextResponse.json({ ok: false, error: 'member_not_found' }, { status: 404 });
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
      member: {
        id: String(member.id),
        teamId: String(member.team_id),
        name: String((member as any).name || ''),
        email: String(member.email || ''),
        phoneNumber: String((member as any).phone_number || ''),
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
    return NextResponse.json({ ok: false, error: e?.message || 'resolver_failed' }, { status: 500 });
  }
}
