import type { SessionUser } from '../../../shared/ipc/contract';
import type { ShopSettings } from '../../../shared/settings';
import { fail } from '../errors';
import { confirmationGroups } from '../security/recovery-key';
import { toSessionUser } from './auth.service';
import type { SettingsService } from './settings.service';
import type { UsersService } from './users.service';

export interface SetupInput {
  shop: ShopSettings;
  owner: { fullName: string; username: string; pin: string };
  confirmation: string;
}

// Same look-alike mapping as parseRecoveryKey: the key alphabet has no I, L or O.
const normalise = (text: string) =>
  text.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');

/**
 * First-run setup (PRD §6.2): the Owner must prove the recovery key was saved
 * by typing back three of its groups before the owner account is created.
 */
export class SetupService {
  constructor(
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly recoveryKey: string,
  ) {}

  recoveryKeyInfo(): { recoveryKey: string; confirmIndexes: number[] } {
    return {
      recoveryKey: this.recoveryKey,
      confirmIndexes: confirmationGroups(this.recoveryKey).indexes,
    };
  }

  async complete(input: SetupInput): Promise<SessionUser> {
    if (this.users.hasOwner()) throw fail.conflict('Setup has already been completed');
    const { expected } = confirmationGroups(this.recoveryKey);
    if (normalise(input.confirmation) !== normalise(expected)) {
      throw fail.validation(
        'The recovery key groups you typed do not match. Check your saved copy',
        {
          confirmation: ['Does not match the recovery key'],
        },
      );
    }
    const owner = await this.users.create({ ...input.owner, role: 'owner' }, null);
    this.settings.update('shop', input.shop, owner.id);
    return toSessionUser(owner);
  }
}
