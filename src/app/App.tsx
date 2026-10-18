import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { RecoverScreen } from '@/features/auth/RecoverScreen';
import { SetupWizard } from '@/features/setup/SetupWizard';
import { Alert } from '@/components/ui/alert';
import { errorMessage } from '@/lib/ipc';
import { createQueryClient, useAppState } from './queries';
import { router } from './router';
import { SessionProvider } from './session';

export function App() {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <PhaseGate />
      <Toaster position="bottom-center" richColors closeButton />
    </QueryClientProvider>
  );
}

/** Chooses the screen for the current phase reported by the main process. */
function PhaseGate() {
  const { data: state, error, isPending } = useAppState();

  if (isPending) {
    return (
      <div className="grid h-screen place-items-center text-muted-foreground">
        <Loader2 className="size-8 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="mx-auto mt-24 max-w-lg">
        <Alert tone="danger" title="The app could not start">
          {errorMessage(error)}
        </Alert>
      </div>
    );
  }

  switch (state.phase) {
    case 'setup':
      return <SetupWizard />;
    case 'recover':
      return <RecoverScreen />;
    case 'login':
      return <LoginScreen shopName={state.shopName} />;
    case 'ready':
      return (
        <SessionProvider user={state.user!}>
          <RouterProvider router={router} context={{}} />
        </SessionProvider>
      );
  }
}
