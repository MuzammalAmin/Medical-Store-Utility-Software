import type { IpcChannel, IpcError, IpcInput, IpcOutput, IpcResult } from '@shared/ipc/contract';

/** An IPC failure surfaced to the UI. `message` is safe to show to the user. */
export class IpcClientError extends Error {
  override name = 'IpcClientError';
  readonly code: IpcError['code'];
  readonly fieldErrors: Record<string, string[]>;

  constructor(error: IpcError) {
    super(error.message);
    this.code = error.code;
    this.fieldErrors = error.fieldErrors ?? {};
  }
}

// Channels whose input is `z.void()` take no argument; all others require one.
type Args<C extends IpcChannel> =
  undefined extends IpcInput<C> ? [input?: IpcInput<C>] : [input: IpcInput<C>];

/** Typed call into the main process. Resolves with the data or throws IpcClientError. */
export async function ipc<C extends IpcChannel>(
  channel: C,
  ...args: Args<C>
): Promise<IpcOutput<C>> {
  const result = (await window.ayyaz.invoke(channel, args[0])) as IpcResult<IpcOutput<C>>;
  if (!result.ok) throw new IpcClientError(result.error);
  return result.data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof IpcClientError) return error.message;
  return 'Something went wrong. Please try again';
}
