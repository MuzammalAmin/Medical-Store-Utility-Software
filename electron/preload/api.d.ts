import type { IpcChannelName } from '../../shared/ipc/channels';

declare global {
  interface Window {
    /** Exposed by electron/preload/index.ts. Use `src/lib/ipc.ts` instead of calling this directly. */
    readonly ayyaz: {
      invoke(channel: IpcChannelName, input?: unknown): Promise<unknown>;
    };
  }
}

export {};
