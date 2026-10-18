import { and, asc, eq, ne } from 'drizzle-orm';
import type { UserRow } from '../../../shared/ipc/contract';
import type { Role } from '../../../shared/domain/permissions';
import type { Db } from '../db/connection';
import { users } from '../db/schema';
import { fail } from '../errors';
import { hashPin } from '../security/pin';
import { writeAudit } from './audit';

const rowColumns = {
  id: users.id,
  username: users.username,
  fullName: users.fullName,
  role: users.role,
  active: users.active,
  lastLoginAt: users.lastLoginAt,
};

export interface NewUser {
  fullName: string;
  username: string;
  role: Role;
  pin: string;
}

export class UsersService {
  constructor(private readonly db: Db) {}

  list(): UserRow[] {
    return this.db.select(rowColumns).from(users).orderBy(asc(users.fullName)).all();
  }

  /** Active users for the login screen: name only, never role or status. */
  loginList(): { username: string; fullName: string }[] {
    return this.db
      .select({ username: users.username, fullName: users.fullName })
      .from(users)
      .where(eq(users.active, true))
      .orderBy(asc(users.fullName))
      .all();
  }

  hasOwner(): boolean {
    return Boolean(
      this.db.select({ id: users.id }).from(users).where(eq(users.role, 'owner')).get(),
    );
  }

  async create(input: NewUser, actorId: number | null): Promise<UserRow> {
    if (
      this.db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).get()
    ) {
      throw fail.conflict(`The username "${input.username}" is already taken`);
    }
    const pinHash = await hashPin(input.pin);
    const created = this.db
      .insert(users)
      .values({ fullName: input.fullName, username: input.username, role: input.role, pinHash })
      .returning(rowColumns)
      .get();
    writeAudit(this.db, {
      userId: actorId ?? created.id,
      action: 'user.create',
      entity: 'user',
      entityId: created.id,
      details: { username: created.username, role: created.role },
    });
    return created;
  }

  update(
    id: number,
    changes: {
      fullName?: string | undefined;
      role?: Role | undefined;
      active?: boolean | undefined;
    },
    actorId: number,
  ): UserRow {
    const existing = this.db.select(rowColumns).from(users).where(eq(users.id, id)).get();
    if (!existing) throw fail.notFound('User');

    const losingOwner =
      existing.role === 'owner' &&
      existing.active &&
      ((changes.role !== undefined && changes.role !== 'owner') || changes.active === false);
    if (losingOwner && !this.otherActiveOwnerExists(id)) {
      throw fail.conflict('There must always be at least one active owner');
    }
    if (id === actorId && changes.active === false) {
      throw fail.conflict('You cannot deactivate your own account');
    }

    const updated = this.db
      .update(users)
      .set({ ...changes, updatedAt: Date.now() })
      .where(eq(users.id, id))
      .returning(rowColumns)
      .get();
    writeAudit(this.db, {
      userId: actorId,
      action: 'user.update',
      entity: 'user',
      entityId: id,
      details: { before: existing, after: updated },
    });
    return updated;
  }

  async resetPin(id: number, pin: string, actorId: number): Promise<void> {
    const pinHash = await hashPin(pin);
    const result = this.db
      .update(users)
      .set({ pinHash, failedAttempts: 0, lockedUntil: null, updatedAt: Date.now() })
      .where(eq(users.id, id))
      .run();
    if (result.changes === 0) throw fail.notFound('User');
    writeAudit(this.db, {
      userId: actorId,
      action: 'user.reset_pin',
      entity: 'user',
      entityId: id,
    });
  }

  private otherActiveOwnerExists(excludeId: number): boolean {
    return Boolean(
      this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'owner'), eq(users.active, true), ne(users.id, excludeId)))
        .get(),
    );
  }
}
