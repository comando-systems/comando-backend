import { ConfigurationError, loadConfig } from '@/app/config';
import { createContainer } from '@/app/container';
import { createApp } from '@/app/http/app';
import { supervise } from '@/infrastructure/process/supervisor';

// Set on the child processes so they serve instead of supervising again.
const WORKER_MARKER = 'COMANDO_WORKER';

function runSupervisor(workers: number): void {
  const supervisor = supervise({
    workers,
    start: () => {
      const child = Bun.spawn([process.execPath, Bun.main], {
        env: { ...process.env, [WORKER_MARKER]: '1' },
        stdout: 'inherit',
        stderr: 'inherit',
      });
      return { exited: child.exited, stop: () => child.kill('SIGTERM') };
    },
    onRestart: (exitCode) => {
      process.stderr.write(`worker exited with code ${exitCode}; restarting\n`);
    },
  });

  const stop = (): void => {
    void supervisor.shutdown().then(() => process.exit(0));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

async function main(): Promise<void> {
  const config = loadConfig();

  if (config.webConcurrency > 1 && process.env[WORKER_MARKER] !== '1') {
    runSupervisor(config.webConcurrency);
    return;
  }

  const container = createContainer(config);
  const app = createApp(container);

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: app.fetch,
    // Lets the worker processes listen on the same port; the kernel spreads connections.
    reusePort: config.webConcurrency > 1,
  });

  container.logger.info('server started', {
    host: config.host,
    port: config.port,
    environment: config.environment,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    container.logger.info('shutting down', { signal });
    server.stop();
    await container.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  if (error instanceof ConfigurationError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write('Failed to start application\n');
    if (error instanceof Error) {
      process.stderr.write(`${error.stack ?? error.message}\n`);
    }
  }
  process.exit(1);
});
