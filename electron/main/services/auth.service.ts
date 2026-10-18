import { eq } from 'drizzle-orm';
import type { SessionUser } from '../../../shared/ipc/contract';
import { permissionsFor } from '../../../shared/domain/permissions';
import type { Db } from '../db/connection';
import { users } from '../db/schema';
import { AppError, fail } from '../errors';
import { hashPin, verifyPin } from '../security/pin';
import { writeAudit } from './audit';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;
// Verifying against this when the username is unknown keeps response times identical.
const DUMMY_HASH_PROMISE = hashPin('00000000');

type UserRecord = typeof users.$inferSelect;

export function toSessionUser(
  user: Pick<UserRecord, 'id' | 'username' | 'fullName' | 'role'>,
): SessionUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: permissionsFor(user.role),
  };
}

export class AuthService {
  /** Recent wrong Owner-override PINs, for rate limiting (they can't be tied to one account). */
  private overrideFailures: number[] = [];

  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Owner override at the counter (voids, out-of-policy returns): any active
   * Owner types their PIN on the cashier's screen. Returns that Owner's id.
   * After 5 wrong PINs within 5 minutes, overrides are blocked for 5 minutes.
   */
  async approveAsOwner(pin: string, action: string, requestedBy: number): Promise<number> {
    const now = this.now();
    this.overrideFailures = this.overrideFailures.filter((t) => now - t < LOCKOUT_MS);
    if (this.overrideFailures.length >= MAX_ATTEMPTS) {
      throw new AppError('LOCKED_OUT', 'Too many wrong Owner PINs. Try again in 5 minutes');
    }
    const owners = this.db
      .select()
      .from(users)
      .where(eq(users.role, 'owner'))
      .all()
      .filter((u) => u.active && !(u.lockedUntil && u.lockedUntil > now));
    for (const owner of owners) {
      if (await verifyPin(pin, owner.pinHash)) {
        writeAudit(this.db, {
          userId: requestedBy,
          action: 'auth.owner_override',
          details: { for: action, approvedBy: owner.id },
        });
        return owner.id;
      }
    }
    this.overrideFailures.push(now);
    writeAudit(this.db, {
      userId: requestedBy,
      action: 'auth.owner_override_failed',
      details: { for: action },
    });
    throw fail.unauthenticated('That is not an Owner PIN');
  }

  async login(username: string, pin: string): Promise<SessionUser> {
    const user = this.db.select().from(users).where(eq(users.username, username)).get();
    if (!user || !user.active) {
      await verifyPin(pin, await DUMMY_HASH_PROMISE);
      writeAudit(this.db, { userId: null, action: 'auth.failed', details: { username } });
      throw fail.unauthenticated('Wrong username or PIN');
    }
    await this.checkPin(user, pin, 'auth.failed');
    this.db.update(users).set({ lastLoginAt: this.now() }).where(eq(users.id, user.id)).run();
    writeAudit(this.db, { userId: user.id, action: 'auth.login' });
    return toSessionUser(user);
  }

  logout(userId: number): void {
    writeAudit(this.db, { userId, action: 'auth.logout' });
  }

  /** Re-checks the PIN of an already logged-in user before a sensitive action. */
  async confirmPin(userId: number, pin: string, action: string): Promise<void> {
    const user = this.db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || !user.active) throw fail.unauthenticated();
    await this.checkPin(user, pin, 'auth.confirm_failed');
    writeAudit(this.db, { userId, action: 'auth.confirmed', details: { for: action } });
  }

  async changeOwnPin(userId: number, currentPin: string, newPin: string): Promise<void> {
    await this.confirmPin(userId, currentPin, 'auth.change_pin');
    this.db
      .update(users)
      .set({ pinHash: await hashPin(newPin), updatedAt: this.now() })
      .where(eq(users.id, userId))
      .run();
    writeAudit(this.db, { userId, action: 'auth.pin_changed', entity: 'user', entityId: userId });
  }

  private async checkPin(user: UserRecord, pin: string, failAction: string): Promise<void> {
    const now = this.now();
    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil((user.lockedUntil - now) / 60_000);
      throw new AppError('LOCKED_OUT', `Too many wrong PINs. Try again in ${minutes} minute(s)`);
    }
    if (await verifyPin(pin, user.pinHash)) {
      if (user.failedAttempts > 0 || user.lockedUntil) {
        this.db
          .update(users)
          .set({ failedAttempts: 0, lockedUntil: null })
          .where(eq(users.id, user.id))
          .run();
      }
      return;
    }
    const attempts = user.failedAttempts + 1;
    const locked = attempts >= MAX_ATTEMPTS;
    this.db
      .update(users)
      .set({ failedAttempts: locked ? 0 : attempts, lockedUntil: locked ? now + LOCKOUT_MS : null })
      .where(eq(users.id, user.id))
      .run();
    writeAudit(this.db, { userId: user.id, action: failAction, details: { attempts, locked } });
    if (locked) throw new AppError('LOCKED_OUT', 'Too many wrong PINs. Try again in 5 minutes');
    throw fail.unauthenticated(`Wrong PIN. ${MAX_ATTEMPTS - attempts} attempt(s) left`);
  }
}
