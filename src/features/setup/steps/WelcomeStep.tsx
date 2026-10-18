import { ArchiveRestore, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function WelcomeStep({ onNew, onRestore }: { onNew: () => void; onRestore: () => void }) {
  const option =
    'flex w-full items-start gap-4 rounded-lg border bg-surface p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft/40';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome</CardTitle>
        <CardDescription>Let's get the pharmacy set up on this computer.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <button type="button" className={option} onClick={onNew}>
          <Sparkles className="mt-0.5 size-5 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">Start a new setup</span>
            <span className="text-sm text-muted-foreground">
              First time using the app. Takes about 3 minutes.
            </span>
          </span>
        </button>
        <button type="button" className={option} onClick={onRestore}>
          <ArchiveRestore className="mt-0.5 size-5 text-primary" aria-hidden />
          <span>
            <span className="block font-medium">Restore from a backup</span>
            <span className="text-sm text-muted-foreground">
              Moving to a new PC. You need a backup file (.apbak) and your recovery key.
            </span>
          </span>
        </button>
      </CardContent>
    </Card>
  );
}
