import { describe, expect, it } from 'vitest';
import { IPC_CHANNEL_NAMES } from './channels';
import { ipcContract } from './contract';

describe('IPC contract', () => {
  it('lists exactly the same channels as the preload allowlist', () => {
    expect(Object.keys(ipcContract).sort()).toEqual([...IPC_CHANNEL_NAMES].sort());
  });

  it('normalises usernames and rejects bad PINs', () => {
    const login = ipcContract['auth:login'].input;
    expect(login.parse({ username: '  Owner ', pin: '1234' }).username).toBe('owner');
    expect(login.safeParse({ username: 'owner', pin: '12a4' }).success).toBe(false);
  });
});
