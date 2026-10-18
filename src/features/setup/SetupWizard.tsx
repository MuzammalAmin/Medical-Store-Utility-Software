import { useState } from 'react';
import type { ShopSettings } from '@shared/settings';
import { AuthLayout } from '../auth/AuthLayout';
import { ConfirmKeyStep } from './steps/ConfirmKeyStep';
import { DetailsStep, type OwnerDetails } from './steps/DetailsStep';
import { RecoveryKeyStep } from './steps/RecoveryKeyStep';
import { RestoreStep } from './steps/RestoreStep';
import { WelcomeStep } from './steps/WelcomeStep';

type Step = 'welcome' | 'details' | 'key' | 'confirm' | 'restore';
const PROGRESS: Step[] = ['details', 'key', 'confirm'];
const LABELS: Record<string, string> = {
  details: 'Shop & owner',
  key: 'Recovery key',
  confirm: 'Confirm',
};

/**
 * First-run setup (PRD §6.2): shop details and owner account, then the
 * recovery key, which must be saved and confirmed before setup can finish.
 */
export function SetupWizard() {
  const [step, setStep] = useState<Step>('welcome');
  const [details, setDetails] = useState<{ shop: ShopSettings; owner: OwnerDetails } | null>(null);

  return (
    <AuthLayout wide={step !== 'welcome'}>
      {PROGRESS.includes(step) && (
        <ol className="mb-4 flex items-center gap-2 text-sm" aria-label="Setup progress">
          {PROGRESS.map((s, i) => {
            const state = s === step ? 'current' : PROGRESS.indexOf(step) > i ? 'done' : 'todo';
            return (
              <li
                key={s}
                className="flex flex-1 items-center gap-2"
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span
                  className={
                    state === 'todo'
                      ? 'grid size-6 place-items-center rounded-full border text-xs text-muted-foreground'
                      : 'grid size-6 place-items-center rounded-full bg-primary text-xs text-primary-foreground'
                  }
                >
                  {i + 1}
                </span>
                <span className={state === 'todo' ? 'text-muted-foreground' : 'font-medium'}>
                  {LABELS[s]}
                </span>
                {i < PROGRESS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
              </li>
            );
          })}
        </ol>
      )}

      {step === 'welcome' && (
        <WelcomeStep onNew={() => setStep('details')} onRestore={() => setStep('restore')} />
      )}
      {step === 'details' && (
        <DetailsStep
          initial={details}
          onBack={() => setStep('welcome')}
          onNext={(value) => {
            setDetails(value);
            setStep('key');
          }}
        />
      )}
      {step === 'key' && (
        <RecoveryKeyStep onBack={() => setStep('details')} onNext={() => setStep('confirm')} />
      )}
      {step === 'confirm' && details && (
        <ConfirmKeyStep details={details} onBack={() => setStep('key')} />
      )}
      {step === 'restore' && <RestoreStep onBack={() => setStep('welcome')} />}
    </AuthLayout>
  );
}
