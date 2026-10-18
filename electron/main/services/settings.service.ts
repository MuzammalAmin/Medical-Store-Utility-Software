import {
  SETTINGS_GROUPS,
  settingsSchemas,
  type Settings,
  type SettingsGroup,
} from '../../../shared/settings';
import type { Db } from '../db/connection';
import { settings } from '../db/schema';
import { logger } from '../logger';
import { writeAudit } from './audit';

export class SettingsService {
  constructor(private readonly db: Db) {}

  getAll(): Settings {
    const stored = new Map(
      this.db
        .select()
        .from(settings)
        .all()
        .map((row) => [row.group, row.value]),
    );
    return Object.fromEntries(
      SETTINGS_GROUPS.map((group) => [group, this.parse(group, stored.get(group))]),
    ) as Settings;
  }

  get<G extends SettingsGroup>(group: G): Settings[G] {
    return this.getAll()[group];
  }

  update<G extends SettingsGroup>(group: G, value: Settings[G], userId: number | null): Settings {
    const before = this.get(group);
    const next = settingsSchemas[group].parse(value);
    this.db
      .insert(settings)
      .values({ group, value: next, updatedBy: userId })
      .onConflictDoUpdate({
        target: settings.group,
        set: { value: next, updatedBy: userId, updatedAt: Date.now() },
      })
      .run();
    writeAudit(this.db, {
      userId,
      action: 'settings.update',
      entity: 'settings',
      entityId: group,
      details: { before, after: next },
    });
    return this.getAll();
  }

  /** Stored values are re-validated on every read; anything invalid falls back to defaults. */
  private parse<G extends SettingsGroup>(group: G, raw: unknown): Settings[G] {
    const result = settingsSchemas[group].safeParse(raw ?? {});
    if (result.success) return result.data as Settings[G];
    logger.warn(`Settings group "${group}" was invalid and has been reset to defaults`);
    return settingsSchemas[group].parse({}) as Settings[G];
  }
}
