import type { Db } from '../db/connection';
import { auditLog } from '../db/schema';
import { redact } from '../logger';

export interface AuditEntry {
  userId: number | null;
  action: string;
  entity?: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
}

/** Appends one row to the permanent audit log. Secret-looking fields are redacted. */
export function writeAudit(db: Db, entry: AuditEntry): void {
  db.insert(auditLog)
    .values({
      userId: entry.userId,
      action: entry.action,
      entity: entry.entity ?? null,
      entityId: entry.entityId === undefined ? null : String(entry.entityId),
      details: entry.details ? redact(entry.details) : null,
    })
    .run();
}
