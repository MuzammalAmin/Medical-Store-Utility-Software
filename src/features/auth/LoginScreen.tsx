import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, UserRound } from 'lucide-react';
import { useState, type SyntheticEvent } from 'react';
import { queryKeys, useSetAppState } from '@/app/queries';
import { router } from '@/app/router';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { PinInput } from '@/components/ui/input';
import { errorMessage, ipc } from '@/lib/ipc';

/** Pick your name, then type your PIN: quick at a shared counter PC. */
export function LoginScreen({ shopName }: { shopName: string }) {
  const setAppState = useSetAppState();
  const [username, setUsername] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const { data: users = [] } = useQuery({
    queryKey: queryKeys.loginUsers,
    queryFn: () => ipc('auth:loginUsers'),
  });

  const login = useMutation({
    mutationFn: () => ipc('auth:login', { username: username!, pin }),
    onSuccess: (state) => {
      // Every login starts on the dashboard; the next person may not be the one who locked the screen.
      void router.navigate({ to: '/' });
      setAppState(state);
    },
    onError: () => setPin(''),
  });

  const selected = users.find((u) => u.username === username);
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (pin.length >= 4) login.mutate();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="text-center">
        <p className="text-2xl font-semibold">{shopName}</p>
        <p className="text-muted-foreground">Pharmacy Manager</p>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {selected ? `Hello, ${selected.fullName}` : 'Who is using the counter?'}
          </CardTitle>
          <CardDescription>
            {selected ? 'Enter your PIN to continue.' : 'Choose your name.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <ul className="flex flex-col gap-2">
              {users.map((user) => (
                <li key={user.username}>
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full justify-start"
                    onClick={() => setUsername(user.username)}
                  >
                    <UserRound /> {user.fullName}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={submit}>
              <Field label="PIN">
                <PinInput
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              {login.error && <Alert tone="danger">{errorMessage(login.error)}</Alert>}
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setUsername(null);
                    setPin('');
                    login.reset();
                  }}
                >
                  <ArrowLeft /> Not you?
                </Button>
                <Button type="submit" size="lg" loading={login.isPending} disabled={pin.length < 4}>
                  Log in
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
