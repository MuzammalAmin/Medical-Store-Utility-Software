import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IpcInput } from '@shared/ipc/contract';
import { queryKeys } from '@/app/queries';
import { ipc } from '@/lib/ipc';

/** Saves one settings group and refreshes everything that shows settings (e.g. shop name, auto-lock). */
export function useSaveSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: IpcInput<'settings:update'>) => ipc('settings:update', input),
    onSuccess: (settings) => {
      client.setQueryData(queryKeys.settings, settings);
      void client.invalidateQueries({ queryKey: queryKeys.appState });
      toast.success('Settings saved');
    },
  });
}
