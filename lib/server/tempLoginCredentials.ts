type SpocCredential = {
  email: string;
  password: string;
};

const normalizeIdentifier = (value: string): string => {
  const trimmed = String(value || '').trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 8 && digitsOnly.length <= 15) return digitsOnly;
  return trimmed.toLowerCase();
};

const normalizeEmail = (value: string) => String(value || '').trim().toLowerCase();

// Temporary fallback credentials for SPOCs.
// Keep this server-side only and remove after credentials are reset.
const HARDCODED_SPOC_CREDENTIALS: SpocCredential[] = [
  { email: 'smathala@gitam.in', password: 'Sindhu$538' },
  { email: 'ethottem@gitam.in', password: 'Eesha@457' },
  { email: 'baripill@gitam.in', password: 'Bhavana#914' },
  { email: 'aakanksh@gitam.in', password: 'Akanksha$051' },
  { email: 'sgurugub@gitam.in', password: 'Sathwik@889' },
  { email: 'anistala@gitam.in', password: 'Anuradha$792' },
  { email: 'mdwarapu2@gitam.in', password: 'Monisha&638' },
  { email: 'sjoseph@student.gitam.edu', password: 'Step$029' },
];

const parseJsonArray = <T,>(raw: string | undefined): T[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
};

export const getTempSpocCredentials = (): SpocCredential[] => {
  const fromEnv = parseJsonArray<SpocCredential>(process.env.TEMP_SPOC_LOGIN_CREDENTIALS_JSON)
    .map((row) => ({
      email: normalizeEmail(String(row?.email || '')),
      password: String(row?.password || ''),
    }))
    .filter((row) => !!row.email && !!row.password);

  if (fromEnv.length > 0) return fromEnv;
  return HARDCODED_SPOC_CREDENTIALS;
};

export const validateTempSpocCredential = (emailInput: string, passwordInput: string): boolean => {
  const email = normalizeEmail(emailInput);
  const password = String(passwordInput || '');
  if (!email || !password) return false;

  const creds = getTempSpocCredentials();
  return creds.some((row) => row.email === email && row.password === password);
};

export const normalizeLoginEmail = normalizeEmail;
export const normalizeLoginIdentifier = normalizeIdentifier;
