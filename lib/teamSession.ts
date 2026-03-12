import { isSupabaseConfigured } from './supabaseClient';
import { getTeamByIdOrName, type TeamRecord } from './teamsBackend';

type CurrentTeamSession = {
  team: TeamRecord;
  identifier?: string;
  identifierNormalized?: string;
  memberId?: string;
  teamId?: string;
};

export const refreshCurrentTeamSession = async (): Promise<CurrentTeamSession | null> => {
  let current: CurrentTeamSession | null = null;
  try {
    current = JSON.parse(localStorage.getItem('currentTeam') || 'null');
  } catch {
    current = null;
  }

  if (!current?.team) return null;
  if (!isSupabaseConfigured()) return current;

  try {
    const refreshedTeam = await getTeamByIdOrName(current.teamId || current.team?.teamId, current.team?.teamName);
    if (!refreshedTeam) return current;

    const nextSession: CurrentTeamSession = {
      ...current,
      team: {
        ...refreshedTeam,
        selectedProblem: current.team?.selectedProblem,
      },
      teamId: current.teamId || refreshedTeam.teamId,
    };

    localStorage.setItem('currentTeam', JSON.stringify(nextSession));
    return nextSession;
  } catch {
    return current;
  }
};
