#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const generatePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@$#';
  const length = 10;
  let pwd = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    pwd += chars[bytes[i] % chars.length];
  }
  return pwd;
};

const upsertAuthUserForEmail = async (email, password) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  // Try direct lookup in auth.users
  let userId = null;
  try {
    const { data } = await supabase
      .schema('auth')
      .from('users')
      .select('id, email')
      .eq('email', normalized)
      .limit(1);
    if (Array.isArray(data) && data[0]?.id) {
      userId = String(data[0].id);
    }
  } catch {
    // ignore and fall back to create
  }

  if (userId) {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error(`Failed to update user for ${normalized}:`, error.message);
      return null;
    }
    return userId;
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true,
  });
  if (createErr) {
    console.error(`Failed to create user for ${normalized}:`, createErr.message);
    return null;
  }
  return created?.user?.id ? String(created.user.id) : null;
};

async function main() {
  console.error('Fetching teams...');

  const { data: teams, error: teamErr } = await supabase
    .from('teams')
    .select('id, team_name')
    .order('created_at', { ascending: true });

  if (teamErr) {
    console.error('ERROR: Could not fetch teams:', teamErr.message);
    process.exit(1);
  }

  if (!Array.isArray(teams) || teams.length === 0) {
    console.error('No teams found in database.');
    process.exit(1);
  }

  console.error(`Found ${teams.length} teams. Generating passwords and bootstrapping auth users...`);

  const results = [];

  for (const team of teams) {
    const teamId = String(team.id);
    const teamName = String(team.team_name || '');

    const password = generatePassword();

    console.error(`Team ${teamName} (${teamId}): generating auth users...`);

    const { data: memberRows, error: memberErr } = await supabase
      .from('members')
      .select('id, email, email_normalized')
      .eq('team_id', teamId)
      .order('member_index', { ascending: true });

    if (memberErr) {
      console.error(`  ERROR: Could not fetch members: ${memberErr.message}`);
      continue;
    }

    const emails = Array.from(
      new Set(
        (memberRows || [])
          .map((m) => normalizeEmail(m?.email_normalized || m?.email || ''))
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )
    );

    if (!emails.length) {
      console.error('  WARNING: No valid member emails for this team, skipping auth bootstrap.');
      results.push({ teamId, teamName, password, members: 0, status: 'no_emails' });
      continue;
    }

    let createdOrUpdated = 0;
    for (const email of emails) {
      const userId = await upsertAuthUserForEmail(email, password);
      if (userId) {
        createdOrUpdated += 1;
        // Best-effort: bind member rows to auth user id for RLS-friendly access.
        // Do not block on this.
        supabase
          .from('members')
          .update({ auth_user_id: userId })
          .eq('email_normalized', email)
          .then(() => {})
          .catch(() => {});
      }
    }

    results.push({ teamId, teamName, password, members: createdOrUpdated, status: 'ok' });
  }

  // Print CSV to stdout so it can be saved and shared.
  console.log('team_id,team_name,team_password,bootstrapped_members,status');
  for (const row of results) {
    const safeName = (row.teamName || '').replace(/"/g, '""');
    console.log(
      `${row.teamId},"${safeName}",${row.password},${row.members},${row.status}`
    );
  }

  console.error('Done. Copy or redirect this output to a CSV file and keep it safe.');
}

main().catch((e) => {
  console.error('FATAL:', e?.message || e);
  process.exit(1);
});
