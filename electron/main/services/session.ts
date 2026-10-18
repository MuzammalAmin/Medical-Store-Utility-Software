import type { SessionUser } from '../../../shared/ipc/contract';
import { fail } from '../errors';

/**
 * The one logged-in user of this single-window app. Any call after the
 * auto-lock period of inactivity ends the session (PRD §2).
 */
export class SessionManager {
  private current: { user: SessionUser; lastActivity: number } | null = null;

  constructor(
    private readonly autoLockMs: () => number,
    private readonly now: () => number = Date.now,
  ) {}

  start(user: SessionUser): void {
    this.current = { user, lastActivity: this.now() };
  }

  end(): void {
    this.current = null;
  }

  /** The active user, or null if nobody is logged in or the session has timed out. */
  peek(): SessionUser | null {
    if (!this.current) return null;
    if (this.now() - this.current.lastActivity > this.autoLockMs()) {
      this.current = null;
      return null;
    }
    return this.current.user;
  }

  /** Like peek(), but throws when there is no session and counts the call as activity. */
  require(): SessionUser {
    const user = this.peek();
    if (!user || !this.current)
      throw fail.unauthenticated('The screen was locked. Please log in again');
    this.current.lastActivity = this.now();
    return user;
  }
}
