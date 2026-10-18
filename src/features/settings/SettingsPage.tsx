import { Tabs } from 'radix-ui';
import { useCan } from '@/app/session';
import { useSettings } from '@/app/queries';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { errorMessage } from '@/lib/ipc';
import { BackupTab } from './tabs/BackupTab';
import { PosTab } from './tabs/PosTab';
import { SecurityTab } from './tabs/SecurityTab';
import { ShopTab } from './tabs/ShopTab';
import { TaxTab } from './tabs/TaxTab';
import { UsersTab } from './tabs/UsersTab';

const TABS = [
  { value: 'shop', label: 'Shop', Component: ShopTab },
  { value: 'tax', label: 'Tax & pricing', Component: TaxTab },
  { value: 'pos', label: 'POS & receipts', Component: PosTab },
  { value: 'security', label: 'Security', Component: SecurityTab },
  { value: 'backup', label: 'Backups', Component: BackupTab },
  { value: 'users', label: 'Users', Component: UsersTab },
] as const;

export function SettingsPage() {
  const allowed = useCan('settings.manage');
  const { data: settings, error } = useSettings();

  if (!allowed) return <Alert tone="danger">Only the Owner can change settings.</Alert>;

  return (
    <>
      <PageHeader
        title="Settings"
        description="Shop details, tax defaults, security, backups and users."
      />
      {error && <Alert tone="danger">{errorMessage(error)}</Alert>}
      {settings && (
        <Tabs.Root defaultValue="shop" className="flex flex-col gap-6">
          <Tabs.List className="flex gap-1 border-b" aria-label="Settings sections">
            {TABS.map((t) => (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary"
              >
                {t.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {TABS.map(({ value, Component }) => (
            <Tabs.Content key={value} value={value} className="max-w-3xl">
              <Component settings={settings} />
            </Tabs.Content>
          ))}
        </Tabs.Root>
      )}
    </>
  );
}
