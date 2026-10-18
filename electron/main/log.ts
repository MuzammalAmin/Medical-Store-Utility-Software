import { join } from 'node:path';
import log from 'electron-log/main';
import { setLogger } from './logger';

export function initLogging(logsDir: string): void {
  log.transports.file.resolvePathFn = () => join(logsDir, 'main.log');
  log.transports.file.maxSize = 5 * 1024 * 1024;
  log.transports.file.level = 'info';
  log.transports.console.level = 'debug';
  log.errorHandler.startCatching({ showDialog: false });
  setLogger(log);
}
