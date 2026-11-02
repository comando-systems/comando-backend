import type { LogLevel } from '@/app/config';
import type { LogContext, Logger } from '@/app/ports/logger';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_PATTERN = /password|passwd|secret|token|authorization|cookie|jwt|credential/i;

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((entry) => redactValue(entry, seen));
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      redacted[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactValue(entry, seen);
    }
    return redacted;
  }

  return value;
}

function redact(context: LogContext): LogContext {
  return redactValue(context, new WeakSet()) as LogContext;
}

export class JsonLogger implements Logger {
  constructor(
    private readonly minimumLevel: LogLevel,
    private readonly baseContext: LogContext = {},
  ) {}

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, undefined, context);
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, undefined, context);
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, undefined, context);
  }

  error(message: string, error?: unknown, context?: LogContext): void {
    this.write('error', message, error, context);
  }

  child(context: LogContext): Logger {
    return new JsonLogger(this.minimumLevel, { ...this.baseContext, ...context });
  }

  private write(level: LogLevel, message: string, error?: unknown, context?: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.minimumLevel]) {
      return;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...redact(this.baseContext),
      ...(context ? redact(context) : {}),
      ...(error === undefined ? {} : { error: redactValue(error, new WeakSet()) }),
    };

    const line = JSON.stringify(payload);
    if (level === 'error') {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }
  }
}
