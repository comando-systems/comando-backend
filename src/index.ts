import { ConfigurationError, loadConfig } from '@/app/config';
import { createContainer } from '@/app/container';
import { createApp } from '@/app/http/app';

async function main(): Promise<void> {
  const config = loadConfig();
  const container = createContainer(config);
  const app = createApp(container);

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    fetch: app.fetch,
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
