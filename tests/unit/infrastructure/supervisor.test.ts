import { describe, expect, test } from 'bun:test';
import { supervise, type WorkerHandle } from '@/infrastructure/process/supervisor';

function fakeWorker() {
  let exit: (code: number) => void = () => {};
  const exited = new Promise<number>((resolve) => {
    exit = resolve;
  });
  const stopped: string[] = [];
  const handle: WorkerHandle = {
    exited,
    stop: () => {
      stopped.push('stop');
      exit(0);
    },
  };
  return { handle, exit, stopped };
}

describe('supervise', () => {
  test('starts the requested number of workers', () => {
    const workers = [fakeWorker(), fakeWorker(), fakeWorker()];
    let started = 0;

    supervise({
      workers: 3,
      start: () => (workers[started++] as ReturnType<typeof fakeWorker>).handle,
    });

    expect(started).toBe(3);
  });

  test('restarts a worker that dies and reports its exit code', async () => {
    const first = fakeWorker();
    const second = fakeWorker();
    const queue = [first, second];
    const restarts: number[] = [];
    let started = 0;

    supervise({
      workers: 1,
      restartDelayMs: 0,
      start: () => (queue[started++] as ReturnType<typeof fakeWorker>).handle,
      onRestart: (code) => restarts.push(code),
    });

    first.exit(137);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(started).toBe(2);
    expect(restarts).toEqual([137]);
  });

  test('shutdown stops every worker and does not restart them', async () => {
    const workers = [fakeWorker(), fakeWorker()];
    let started = 0;
    const supervisor = supervise({
      workers: 2,
      restartDelayMs: 0,
      start: () => (workers[started++] as ReturnType<typeof fakeWorker>).handle,
      onRestart: () => {
        throw new Error('must not restart while stopping');
      },
    });

    await supervisor.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(workers.map((worker) => worker.stopped.length)).toEqual([1, 1]);
    expect(started).toBe(2);
  });

  test('a worker that dies while the delay runs is not started after shutdown', async () => {
    const worker = fakeWorker();
    let started = 0;
    const supervisor = supervise({
      workers: 1,
      restartDelayMs: 20,
      start: () => {
        started += 1;
        return worker.handle;
      },
    });

    worker.exit(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await supervisor.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(started).toBe(1);
  });
});
