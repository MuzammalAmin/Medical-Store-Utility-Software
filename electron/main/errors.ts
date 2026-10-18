import type { ErrorCode } from '../../shared/ipc/contract';

/**
 * An expected, user-facing failure. Its message is shown to the user as-is,
 * so it must never contain secrets or internal details. Anything that is not
 * an AppError is logged and reported to the UI as a generic INTERNAL error.
 */
export class AppError extends Error {
  override name = 'AppError';

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const fail = {
  unauthenticated: (message = 'Please log in again') => new AppError('UNAUTHENTICATED', message),
  forbidden: (message = 'You do not have permission to do this') =>
    new AppError('FORBIDDEN', message),
  notFound: (what: string) => new AppError('NOT_FOUND', `${what} was not found`),
  conflict: (message: string) => new AppError('CONFLICT', message),
  validation: (message: string, fieldErrors?: Record<string, string[]>) =>
    new AppError('VALIDATION', message, fieldErrors),
};
