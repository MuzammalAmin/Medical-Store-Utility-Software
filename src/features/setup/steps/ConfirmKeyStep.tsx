import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { ShopSettings } from '@shared/settings';
import { useSetAppState } from '@/app/queries';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { errorMessage, ipc } from '@/lib/ipc';
import type { OwnerDetails } from './DetailsStep';
import { recoveryKeyQuery } from './RecoveryKeyStep';

/** The Owner types back three groups from the saved copy to prove it was kept. */
export function ConfirmKeyStep({
  details,
  onBack,
}: {
  details: { shop: ShopSettings; owner: OwnerDetails };
  onBack: () => void;
}) {
  const setAppState = useSetAppState();
  const { data } = useQuery({ ...recoveryKeyQuery, staleTime: Infinity });
  const indexes = data?.confirmIndexes ?? [];
  const [groups, setGroups] = useState<string[]>(['', '', '']);

  const complete = useMutation({
    mutationFn: () => ipc('setup:complete', { ...details, confirmation: groups.join('-') }),
    onSuccess: setAppState,
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    complete.mutate();
  };

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Check your saved copy</CardTitle>
          <CardDescription>
            Without looking at the screen, type these groups from the copy you printed or saved.
            Groups are counted from the left, separated by dashes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4">
            {indexes.map((groupIndex, i) => (
              <Field key={groupIndex} label={`Group ${groupIndex + 1}`}>
                <Input
                  autoFocus={i === 0}
                  maxLength={4}
                  spellCheck={false}
                  autoComplete="off"
                  className="text-center font-mono text-lg tracking-widest uppercase"
                  value={groups[i]}
                  onChange={(e) =>
                    setGroups((g) => g.map((v, j) => (j === i ? e.target.value.toUpperCase() : v)))
                  }
                />
              </Field>
            ))}
          </div>
          {complete.error && <Alert tone="danger">{errorMessage(complete.error)}</Alert>}
        </CardContent>
        <CardFooter className="justify-between">
          <Button type="button" variant="ghost" onClick={onBack}>
            Show the key again
          </Button>
          <Button
            type="submit"
            size="lg"
            loading={complete.isPending}
            disabled={groups.some((g) => g.length !== 4)}
          >
            Finish setup
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
