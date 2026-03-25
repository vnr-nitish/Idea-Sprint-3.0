import { isSupabaseConfigured } from './supabaseClient';
import { getTeamByIdOrName, type TeamRecord } from './teamsBackend';
import { getTeamProblemSelection } from './problemBackend';

type CurrentTeamSession = {
  team: TeamRecord;
  identifier?: string;
  identifierNormalized?: string;
  memberId?: string;
  teamId?: string;
};

const TEAM_REFRESH_AT_KEY = 'currentTeamRefreshedAt';
const TEAM_REFRESH_MIN_INTERVAL_MS = 30 * 1000;

export const refreshCurrentTeamSession = async (): Promise<CurrentTeamSession | null> => {
  let current: CurrentTeamSession | null = null;
  try {
    const parsed = JSON.parse(localStorage.getItem('currentTeam') || 'null');
    if (parsed) {
      if (parsed.teamId && !parsed.team) {
        // Migration measure for old invalid session payload
        current = {
          team: parsed,
          teamId: parsed.teamId,
        };
      } else {
        current = parsed;
      }
    }
  } catch {
    current = null;
  }

  if (!current || !current.team) return null;
  if (!isSupabaseConfigured()) return current;

  try {
    const lastRefreshAt = Number(localStorage.getItem(TEAM_REFRESH_AT_KEY) || '0');
    if (lastRefreshAt > 0 && Date.now() - lastRefreshAt < TEAM_REFRESH_MIN_INTERVAL_MS) {
      return current;
    }
    localStorage.setItem(TEAM_REFRESH_AT_KEY, String(Date.now()));
  } catch {
    // ignore localStorage failures
  }

  try {
    const refreshedTeam = await getTeamByIdOrName(current.teamId || current.team?.teamId, current.team?.teamName);
    if (!refreshedTeam) return current;

    // Fetch latest problem selection from backend
    let selectedProblem = current.team?.selectedProblem;
    try {
      const remoteCode = await getTeamProblemSelection(String(refreshedTeam.teamName || ''));
      if (remoteCode != null) selectedProblem = remoteCode;
    } catch {
      // keep local value
    }

    const nextSession: CurrentTeamSession = {
      ...current,
      team: {
        ...refreshedTeam,
        selectedProblem,
      },
      teamId: current.teamId || refreshedTeam.teamId,
    };

    localStorage.setItem('currentTeam', JSON.stringify(nextSession));
    return nextSession;
  } catch {
    return current;
  }
};
