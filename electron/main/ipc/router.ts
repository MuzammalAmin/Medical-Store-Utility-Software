import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { IPC_CHANNEL_NAMES, IPC_PREFIX } from '../../../shared/ipc/channels';
import {
  ipcContract,
  type IpcChannel,
  type IpcContract,
  type IpcError,
  type IpcOutput,
  type IpcResult,
  type SessionUser,
} from '../../../shared/ipc/contract';
import { hasPermission } from '../../../shared/domain/permissions';
import { AppError, fail } from '../errors';
import { logger } from '../logger';
import type { Runtime } from '../runtime';

export interface HandlerContext {
  /** The logged-in user; null only on `setup` and `public` channels. */
  user: SessionUser | null;
  event: IpcMainInvokeEvent;
}

export type Handlers = {
  [C in IpcChannel]: (
    input: z.output<IpcContract[C]['input']>,
    ctx: HandlerContext,
  ) => IpcOutput<C> | Promise<IpcOutput<C>>;
};

/** The logged-in user, for handlers on `session` or permission channels. */
export function requireUser(ctx: HandlerContext): SessionUser {
  if (!ctx.user) throw fail.unauthenticated();
  return ctx.user;
}

function authorise(channel: IpcChannel, runtime: Runtime): SessionUser | null {
  const access = ipcContract[channel].access;
  if (access === 'public') return runtime.session.peek();
  if (access === 'setup') {
    const phase = runtime.phase();
    if (phase !== 'setup' && phase !== 'recover') throw fail.forbidden('Setup is already complete');
    return null;
  }
  const user = runtime.session.require();
  if (access !== 'session' && !hasPermission(user.role, access)) throw fail.forbidden();
  return user;
}

function toIpcError(error: unknown, channel: string): IpcError {
  if (error instanceof z.ZodError) {
    const flat = z.flattenError(error);
    return {
      code: 'VALIDATION',
      message: flat.formErrors[0] ?? 'Some fields are not valid',
      fieldErrors: flat.fieldErrors,
    };
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
    };
  }
  logger.error(`IPC ${channel} failed`, error);
  return {
    code: 'INTERNAL',
    message: 'Something went wrong. The details were saved in the log file',
  };
}

/**
 * Registers every channel of the contract. For each call it checks the sender,
 * validates the input, checks access in the main process, runs the handler and
 * passes the result through the output schema, which also strips any field not
 * in the contract (so internal data such as PIN hashes can never leak).
 */
export function registerIpc(
  runtime: Runtime,
  handlers: Handlers,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  for (const channel of IPC_CHANNEL_NAMES) {
    const def = ipcContract[channel];
    const handler = handlers[channel] as (input: unknown, ctx: HandlerContext) => unknown;

    ipcMain.handle(
      IPC_PREFIX + channel,
      async (event, raw: unknown): Promise<IpcResult<unknown>> => {
        if (!isTrustedSender(event)) {
          logger.warn(
            `Blocked IPC ${channel} from untrusted sender ${event.senderFrame?.url ?? 'unknown'}`,
          );
          return { ok: false, error: { code: 'FORBIDDEN', message: 'Blocked' } };
        }
        try {
          const user = authorise(channel, runtime);
          const input = def.input.parse(raw);
          const output = await handler(input, { user, event });
          return { ok: true, data: def.output.parse(output) };
        } catch (error) {
          return { ok: false, error: toIpcError(error, channel) };
        }
      },
    );
  }
}
