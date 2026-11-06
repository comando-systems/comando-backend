export interface WorkerHandle {
  // Resolves when the process ends, with its exit code.
  readonly exited: Promise<number>;
  stop(): void;
}

export interface SupervisorOptions {
  readonly workers: number;
  start(): WorkerHandle;
  readonly restartDelayMs?: number;
  onRestart?(exitCode: number): void;
}

export interface Supervisor {
  // Stops every worker and resolves once they have all exited.
  shutdown(): Promise<void>;
}

/**
 * Keeps `workers` copies of the server running. Bun runs JavaScript on one thread, so several
 * processes sharing one port (`reusePort`) are how the API uses more than one CPU core.
 */
export function supervise(options: SupervisorOptions): Supervisor {
  const delay = options.restartDelayMs ?? 1_000;
  const running = new Set<WorkerHandle>();
  let stopping = false;

  const launch = (): void => {
    const worker = options.start();
    running.add(worker);

    void worker.exited.then(async (exitCode) => {
      running.delete(worker);
      if (stopping) {
        return;
      }

      options.onRestart?.(exitCode);
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (!stopping) {
        launch();
      }
    });
  };

  for (let index = 0; index < options.workers; index += 1) {
    launch();
  }

  return {
    async shutdown(): Promise<void> {
      stopping = true;
      const handles = [...running];
      for (const worker of handles) {
        worker.stop();
      }
      await Promise.all(handles.map((worker) => worker.exited));
    },
  };
}
