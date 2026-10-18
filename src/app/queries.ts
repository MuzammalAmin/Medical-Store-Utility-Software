import {
  useMutation,
  useQuery,
  useQueryClient,
  QueryClient,
  QueryCache,
  MutationCache,
} from '@tanstack/react-query';
import type { AppState } from '@shared/ipc/contract';
import { ipc, IpcClientError } from '@/lib/ipc';

export const queryKeys = {
  appState: ['app-state'] as const,
  settings: ['settings'] as const,
  users: ['users'] as const,
  backupStatus: ['backup-status'] as const,
  dashboard: ['dashboard'] as const,
  loginUsers: ['login-users'] as const,
  items: ['items'] as const,
  inventory: ['inventory'] as const,
  sales: ['sales'] as const,
  held: ['held-bills'] as const,
  reports: ['reports'] as const,
};

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
    // When the main process says the session ended (auto-lock), re-read the app
    // state so the login screen appears.
    queryCache: new QueryCache({ onError: (error) => onSessionError(client, error) }),
    mutationCache: new MutationCache({ onError: (error) => onSessionError(client, error) }),
  });
  return client;
}

function onSessionError(client: QueryClient, error: unknown): void {
  if (error instanceof IpcClientError && error.code === 'UNAUTHENTICATED') {
    void client.invalidateQueries({ queryKey: queryKeys.appState });
  }
}

export function useAppState() {
  return useQuery({
    queryKey: queryKeys.appState,
    queryFn: () => ipc('app:state'),
    staleTime: Infinity,
  });
}

/** Stores a fresh AppState returned by login/setup/unlock and clears cached data of the previous user. */
export function useSetAppState() {
  const client = useQueryClient();
  return (state: AppState) => {
    client.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.appState[0] });
    client.setQueryData(queryKeys.appState, state);
  };
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => ipc('auth:logout'),
    onSettled: () => {
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.appState[0] });
      void client.invalidateQueries({ queryKey: queryKeys.appState });
    },
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => ipc('settings:get') });
}
