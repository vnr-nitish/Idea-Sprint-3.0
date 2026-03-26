export type SpocUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
};

export const SPOC_LOGGED_IN_KEY = 'spocLoggedIn';
export const SPOC_USER_KEY = 'spocUser';

const normalize = (value: unknown) => String(value || '').trim();
const normalizeLower = (value: unknown) => normalize(value).toLowerCase();
const canonicalTeamKey = (teamName: unknown) => normalizeLower(teamName);

export const isSpocLoggedIn = (): boolean => {
  try {
    return localStorage.getItem(SPOC_LOGGED_IN_KEY) === '1';
  } catch {
    return false;
  }
};

export const getStoredSpocUser = (): SpocUser | null => {
  try {
    const raw = localStorage.getItem(SPOC_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const user: SpocUser = {
      id: normalize(parsed?.id),
      name: normalize(parsed?.name),
      email: normalizeLower(parsed?.email),
      phone: normalize(parsed?.phone) || undefined,
    };
    if (!user.id || !user.email) return null;
    return user;
  } catch {
    return null;
  }
};

export const setStoredSpocUser = (user: SpocUser) => {
  localStorage.setItem(SPOC_LOGGED_IN_KEY, '1');
  localStorage.setItem(
    SPOC_USER_KEY,
    JSON.stringify({
      id: normalize(user?.id),
      name: normalize(user?.name),
      email: normalizeLower(user?.email),
      phone: normalize(user?.phone),
    })
  );
};

export const clearStoredSpocUser = () => {
  try {
    localStorage.removeItem(SPOC_LOGGED_IN_KEY);
    localStorage.removeItem(SPOC_USER_KEY);
  } catch {
    // ignore
  }
};

export const getAssignmentForTeam = (assignments: Record<string, any>, teamName: string) => {
  const direct = assignments?.[teamName];
  if (direct) return direct;
  const key = canonicalTeamKey(teamName);
  const matchedKey = Object.keys(assignments || {}).find((k) => canonicalTeamKey(k) === key);
  if (!matchedKey) return null;
  return assignments?.[matchedKey] || null;
};

export const isTeamAssignedToSpoc = (
  assignments: Record<string, any>,
  teamName: string,
  spocUser: SpocUser | null
): boolean => {
  if (!spocUser) return false;
  const assignment = getAssignmentForTeam(assignments || {}, teamName);
  if (!assignment) return false;

  const assignedEmail = normalizeLower(assignment?.spoc?.email);
  const assignedName = normalizeLower(assignment?.spoc?.name);

  const userEmail = normalizeLower(spocUser?.email);
  const userName = normalizeLower(spocUser?.name);

  if (assignedEmail && userEmail && assignedEmail === userEmail) return true;
  if (assignedName && userName && assignedName === userName) return true;
  return false;
};

export const filterTeamsForSpoc = <T extends { teamName?: string }>(
  teams: T[],
  assignments: Record<string, any>,
  spocUser: SpocUser | null
): T[] => {
  if (!spocUser) return [];
  return (teams || []).filter((team) => {
    const teamName = normalize(team?.teamName);
    if (!teamName) return false;
    return isTeamAssignedToSpoc(assignments || {}, teamName, spocUser);
  });
};
