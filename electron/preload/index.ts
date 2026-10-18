import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNEL_NAMES, IPC_PREFIX, type IpcChannelName } from '../../shared/ipc/channels';

/**
 * The only bridge between the sandboxed UI and the main process. It exposes a
 * single `invoke` function restricted to the allowlisted channels; Electron and
 * Node APIs are never exposed to the renderer (PRD §6.2).
 */
const allowed = new Set<string>(IPC_CHANNEL_NAMES);

const api = {
  invoke(channel: IpcChannelName, input?: unknown): Promise<unknown> {
    if (!allowed.has(channel)) {
      return Promise.reject(new Error(`Blocked IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(IPC_PREFIX + channel, input);
  },
};

contextBridge.exposeInMainWorld('ayyaz', Object.freeze(api));
