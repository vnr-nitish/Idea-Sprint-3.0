import { isSupabaseUnavailable } from './teamsBackend';

export type DataSource = 'live' | 'cache' | 'offline';

export const getDataSource = (): DataSource => {
  if (isSupabaseUnavailable()) {
    return 'cache';
  }
  return 'live';
};

export const getStatusMessage = (): string => {
  const source = getDataSource();
  if (source === 'cache') {
    return '[Warning] Using cached data (Supabase temporarily unavailable)';
  }
  return '';
};

export const getStatusBgColor = (): string => {
  const source = getDataSource();
  if (source === 'cache') {
    return 'bg-yellow-100 border-yellow-400 text-yellow-700';
  }
  return '';
};
