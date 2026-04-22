import { appendFileSync, mkdirSync, openSync, writeSync, closeSync } from 'node:fs';
import path from 'node:path';

/**
 * Tee console.log / console.error to a file in <dataDir>/logs/<name>-<ts>.log.
 *
 * Uses synchronous writes via an open file descriptor so nothing is buffered
 * in userland — if the process is force-killed or the machine loses power,
 * every line that was already logged is safely on disk. O_APPEND semantics
 * on Windows mean each writeSync is atomic relative to other processes.
 *
 * Returns the log file path so callers can print it at startup.
 */
export function startFileLogger(commandName: string, dataDir: string): string {
  const logsDir = path.join(dataDir, 'logs');
  mkdirSync(logsDir, { recursive: true });

  // Filename-safe ISO timestamp: 2026-04-21T20-34-01Z
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
  const logPath = path.join(logsDir, `${commandName}-${ts}.log`);

  const fd = openSync(logPath, 'a');

  const header = `=== ${commandName} started at ${new Date().toISOString()} (pid=${process.pid}) ===\n`;
  writeSync(fd, header);

  const write = (chunk: string): void => {
    try {
      writeSync(fd, chunk.endsWith('\n') ? chunk : chunk + '\n');
    } catch {
      // Disk full or fd closed — don't let logging crash the pipeline.
    }
  };

  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  console.log = (...args: unknown[]) => {
    origLog(...args);
    write(formatArgs(args));
  };
  console.error = (...args: unknown[]) => {
    origErr(...args);
    write(formatArgs(args));
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    write(formatArgs(args));
  };

  const close = (reason: string) => {
    try {
      writeSync(fd, `=== ${commandName} ended: ${reason} at ${new Date().toISOString()} ===\n`);
      closeSync(fd);
    } catch {
      // Best-effort on shutdown.
    }
  };

  process.once('exit', (code) => close(`exit code ${code}`));
  process.once('SIGINT', () => {
    close('SIGINT');
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    close('SIGTERM');
    process.exit(143);
  });
  process.once('uncaughtException', (err) => {
    try {
      appendFileSync(logPath, `UNCAUGHT: ${err.stack ?? err.message}\n`);
    } catch {
      // Swallow — we're already dying.
    }
    close('uncaughtException');
    process.exit(1);
  });

  return logPath;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a;
      if (a instanceof Error) return a.stack ?? a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(' ');
}
