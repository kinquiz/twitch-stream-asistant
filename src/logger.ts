type Level = 'info' | 'warn' | 'error' | 'debug';

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: Level, scope: string, message: string, ...args: unknown[]): void {
  const line = `[${timestamp()}] [${level.toUpperCase()}] [${scope}] ${message}`;
  if (level === 'error') {
    console.error(line, ...args);
  } else if (level === 'warn') {
    console.warn(line, ...args);
  } else {
    console.log(line, ...args);
  }
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export function createLogger(scope: string): Logger {
  return {
    info: (message, ...args) => write('info', scope, message, ...args),
    warn: (message, ...args) => write('warn', scope, message, ...args),
    error: (message, ...args) => write('error', scope, message, ...args),
    debug: (message, ...args) => write('debug', scope, message, ...args),
  };
}
