import { NextResponse } from 'next/server';

type MemberPayload = {
  name?: string;
  registrationNumber?: string;
  email?: string;
  phoneNumber?: string;
  school?: string;
  program?: string;
  programOther?: string;
  branch?: string;
  campus?: string;
  stay?: string;
  yearOfStudy?: string;
};

type RegistrationEmailPayload = {
  teamName?: string;
  teamPassword?: string;
  domain?: string;
  members?: MemberPayload[];
};

const htmlEscape = (value: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const safe = (value: unknown) => (String(value || '').trim() || '-');

const buildMemberRowsHtml = (members: MemberPayload[]) => {
  return members
    .map((m, idx) => {
      const role = idx === 0 ? 'Team Lead' : `Member ${idx}`;
      const programLabel = safe(m.program) === 'Others' || safe(m.program) === 'Other'
        ? `${safe(m.program)} (${safe(m.programOther)})`
        : safe(m.program);

      return `
        <tr>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(role)}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.name))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.email))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.registrationNumber))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.phoneNumber))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(programLabel)}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.branch))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.school))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.campus))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.stay))}</td>
          <td style="padding:8px;border:1px solid #d3e3e3;">${htmlEscape(safe(m.yearOfStudy))}</td>
        </tr>
      `;
    })
    .join('');
};

const buildTextBody = (teamName: string, teamPassword: string, domain: string, members: MemberPayload[]) => {
  const lines: string[] = [];
  lines.push('Team Registration Confirmed');
  lines.push('');
  lines.push(`Team Name: ${teamName}`);
  lines.push(`Domain: ${domain}`);
  lines.push(`Team Password: ${teamPassword}`);
  lines.push('');
  lines.push('Members:');

  members.forEach((m, idx) => {
    const role = idx === 0 ? 'Team Lead' : `Member ${idx}`;
    const program = String(m.program || '').trim();
    const programLabel = program === 'Others' || program === 'Other'
      ? `${program} (${safe(m.programOther)})`
      : safe(program);

    lines.push('');
    lines.push(`${role}: ${safe(m.name)}`);
    lines.push(`  Email: ${safe(m.email)}`);
    lines.push(`  Registration No: ${safe(m.registrationNumber)}`);
    lines.push(`  Phone: ${safe(m.phoneNumber)}`);
    lines.push(`  Program: ${programLabel}`);
    lines.push(`  Branch: ${safe(m.branch)}`);
    lines.push(`  School: ${safe(m.school)}`);
    lines.push(`  Campus: ${safe(m.campus)}`);
    lines.push(`  Stay: ${safe(m.stay)}`);
    lines.push(`  Year of Study: ${safe(m.yearOfStudy)}`);
  });

  lines.push('');
  lines.push('Please keep this email and your team password safe for login and future reference.');
  return lines.join('\n');
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as RegistrationEmailPayload;
    const members = Array.isArray(payload.members) ? payload.members : [];

    const teamName = String(payload.teamName || '').trim();
    const teamPassword = String(payload.teamPassword || '').trim();
    const domain = String(payload.domain || '').trim();

    if (!teamName || !teamPassword || !domain || members.length < 3) {
      return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
    }

    const recipients = Array.from(
      new Set(
        members
          .map((m) => String(m.email || '').trim().toLowerCase())
          .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      )
    );

    if (!recipients.length) {
      return NextResponse.json({ ok: false, error: 'No valid recipient emails found' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.REGISTRATION_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      // Do not block registration flow if email provider is not configured.
      return NextResponse.json({ ok: true, skipped: true, reason: 'Email provider not configured' }, { status: 200 });
    }

    const memberRows = buildMemberRowsHtml(members);
    const htmlBody = `
      <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0b4f52;">
        <h2 style="margin-bottom:8px;">Team Registration Confirmed</h2>
        <p style="margin:0 0 14px;">Your team has been registered successfully for Idea Sprint 3.0.</p>
        <div style="background:#f4f8f8;border:1px solid #d3e3e3;border-radius:8px;padding:12px 14px;margin-bottom:16px;">
          <p style="margin:4px 0;"><strong>Team Name:</strong> ${htmlEscape(teamName)}</p>
          <p style="margin:4px 0;"><strong>Domain:</strong> ${htmlEscape(domain)}</p>
          <p style="margin:4px 0;"><strong>Team Password:</strong> ${htmlEscape(teamPassword)}</p>
        </div>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Role</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Name</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Email</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Reg No</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Phone</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Program</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Branch</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">School</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Campus</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Stay</th>
              <th style="padding:8px;border:1px solid #d3e3e3;background:#ecf3f3;text-align:left;">Year</th>
            </tr>
          </thead>
          <tbody>${memberRows}</tbody>
        </table>
        <p style="margin-top:14px;">Please keep this email and your team password safe for login and future reference.</p>
      </div>
    `;

    const textBody = buildTextBody(teamName, teamPassword, domain, members);

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: recipients,
        subject: `Idea Sprint Registration Confirmed - ${teamName}`,
        html: htmlBody,
        text: textBody,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      return NextResponse.json({ ok: false, error: errText || 'Email provider error' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'Unknown error' }, { status: 500 });
  }
}
