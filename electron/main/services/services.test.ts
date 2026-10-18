import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { backupSettingsSchema } from '../../../shared/settings';
import { settings as settingsTable } from '../db/schema';
import { AppError } from '../errors';
import { confirmationGroups, formatRecoveryKey } from '../security/recovery-key';
import { AuthService } from './auth.service';
import { BackupScheduler, BackupService } from './backup.service';
import { SettingsService } from './settings.service';
import { SetupService } from './setup.service';
import { UsersService } from './users.service';
import { createTestDb, type TestDb } from './test-db';

let t: TestDb;
beforeEach(() => {
  t = createTestDb();
});
afterEach(() => t.dispose());

async function expectCode(promise: Promise<unknown> | (() => unknown), code: string) {
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe('AuthService', () => {
  it('logs in, and locks the account after 5 wrong PINs', async () => {
    let now = 1_000_000;
    const users = new UsersService(t.db);
    const auth = new AuthService(t.db, () => now);
    await users.create({ fullName: 'Ali Raza', username: 'ali', role: 'staff', pin: '1357' }, null);

    expect((await auth.login('ali', '1357')).permissions).toContain('pos.sell');
    for (let i = 0; i < 4; i++) await expectCode(auth.login('ali', '0000'), 'UNAUTHENTICATED');
    await expectCode(auth.login('ali', '0000'), 'LOCKED_OUT');
    // Even the right PIN is refused while locked…
    await expectCode(auth.login('ali', '1357'), 'LOCKED_OUT');
    // …and accepted again after 5 minutes.
    now += 5 * 60_000 + 1;
    expect((await auth.login('ali', '1357')).username).toBe('ali');
  });

  it('gives the same answer for unknown users and wrong PINs', async () => {
    await expectCode(new AuthService(t.db).login('nobody', '1234'), 'UNAUTHENTICATED');
  });
});

describe('UsersService', () => {
  it('keeps at least one active owner and refuses duplicate usernames', async () => {
    const users = new UsersService(t.db);
    const owner = await users.create(
      { fullName: 'Owner', username: 'owner', role: 'owner', pin: '2468' },
      null,
    );
    const staff = await users.create(
      { fullName: 'Staff', username: 'staff', role: 'staff', pin: '1357' },
      owner.id,
    );

    await expectCode(
      users.create({ fullName: 'X', username: 'owner', role: 'staff', pin: '1111' }, owner.id),
      'CONFLICT',
    );
    await expectCode(() => users.update(owner.id, { role: 'staff' }, staff.id), 'CONFLICT');
    await expectCode(() => users.update(owner.id, { active: false }, owner.id), 'CONFLICT');

    users.update(staff.id, { role: 'owner' }, owner.id);
    expect(users.update(owner.id, { role: 'staff' }, staff.id).role).toBe('staff');
  });
});

describe('SettingsService', () => {
  it('returns defaults, saves changes and falls back when stored data is invalid', () => {
    const settings = new SettingsService(t.db);
    expect(settings.get('tax')).toEqual({ defaultPriceMode: 'add_gst', defaultGstRateBp: 1800 });

    settings.update('tax', { defaultPriceMode: 'price_only', defaultGstRateBp: 1700 }, null);
    expect(settings.get('tax').defaultPriceMode).toBe('price_only');

    t.db
      .insert(settingsTable)
      .values({ group: 'security', value: { autoLockMinutes: 'abc' } })
      .run();
    expect(settings.get('security').autoLockMinutes).toBe(10);
  });
});

describe('SetupService', () => {
  it('requires the recovery key groups before creating the owner', async () => {
    const users = new UsersService(t.db);
    const key = formatRecoveryKey(t.key);
    const setup = new SetupService(users, new SettingsService(t.db), key);
    const input = {
      shop: {
        name: 'Ayyaz Pharmacy',
        address: '',
        phone: '',
        licenceNo: '',
        ntn: '',
        strn: '',
        receiptFooter: '',
      },
      owner: { fullName: 'Ayyaz Ahmed', username: 'ayyaz', pin: '482915' },
    };

    await expectCode(setup.complete({ ...input, confirmation: 'AAAA-BBBB-CCCC' }), 'VALIDATION');
    expect(users.hasOwner()).toBe(false);

    const user = await setup.complete({
      ...input,
      confirmation: confirmationGroups(key).expected.toLowerCase(),
    });
    expect(user.role).toBe('owner');
    await expectCode(
      setup.complete({ ...input, confirmation: confirmationGroups(key).expected }),
      'CONFLICT',
    );
  });
});

describe('BackupService', () => {
  const clock = { now: 0 };
  function makeService(keepCount = 5, usbFolder = '') {
    const folder = join(t.dir, 'backups');
    mkdirSync(folder, { recursive: true });
    clock.now = new Date(2026, 9, 18, 10, 0).getTime();
    const service = new BackupService({
      sqlite: t.sqlite,
      key: t.key,
      folder,
      settings: () => backupSettingsSchema.parse({ keepCount, usbFolder }),
      now: () => (clock.now += 1000),
    });
    return { service, folder };
  }

  it('creates verified backups with checksums and keeps only the newest N', () => {
    const { service, folder } = makeService(5);
    for (let i = 0; i < 7; i++) service.create('manual');
    const files = readdirSync(folder);
    expect(files.filter((f) => f.endsWith('.apbak'))).toHaveLength(5);
    expect(files.filter((f) => f.endsWith('.sha256'))).toHaveLength(5);
    expect(() => service.verifiedPath(service.list()[0]!.fileName)).not.toThrow();
  });

  it('copies to the USB folder when it exists', () => {
    const usb = join(t.dir, 'usb');
    mkdirSync(usb);
    const { service } = makeService(5, usb);
    service.create('manual');
    expect(readdirSync(usb).some((f) => f.endsWith('.apbak'))).toBe(true);
    expect(service.status().usbAvailable).toBe(true);
  });

  it('rejects path tricks and damaged files', async () => {
    const { service, folder } = makeService();
    const backup = service.create('manual');
    await expectCode(() => service.verifiedPath('../test.db'), 'VALIDATION');
    await expectCode(
      () => service.verifiedPath('ayyaz-20260101-000000000-manual.apbak'),
      'NOT_FOUND',
    );
    writeFileSync(join(folder, backup.fileName), 'corrupted');
    await expectCode(() => service.verifiedPath(backup.fileName), 'VALIDATION');
  });

  it('schedules one daily backup after the configured time', () => {
    const { service } = makeService();
    const scheduler = new BackupScheduler(
      service,
      () => backupSettingsSchema.parse({ dailyTime: '21:00' }),
      () => clock.now,
    );
    clock.now = new Date(2026, 9, 18, 20, 0).getTime();
    scheduler.tick();
    expect(service.list()).toHaveLength(0);
    clock.now = new Date(2026, 9, 18, 21, 5).getTime();
    scheduler.tick();
    scheduler.tick();
    expect(service.list().filter((b) => b.reason === 'daily')).toHaveLength(1);
    expect(existsSync(service.status().folder)).toBe(true);
  });
});
