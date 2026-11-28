// Seeds a small set of ready-to-use open tables. Safe to rerun: names that already have an
// active order are skipped. Uses the root user from `db:seed-root` as the actor.
import { createContainer } from '../src/app/container';

const ROOT_EMAIL = (process.env.ROOT_EMAIL ?? 'root@comando.com').trim().toLowerCase();
const TABLE_NAMES = Array.from(
  { length: 20 },
  (_, index) => `Mesa ${String(index + 1).padStart(2, '0')}`,
);

async function main(): Promise<void> {
  const container = createContainer();

  try {
    const actorUserId = await container.unitOfWork.read(async (repositories) => {
      const root = await repositories.users.findByEmail(ROOT_EMAIL);

      if (root === null) {
        throw new Error(`Root user ${ROOT_EMAIL} not found. Run db:seed-root first`);
      }

      return root.id;
    });

    let created = 0;

    for (const tableCode of TABLE_NAMES) {
      const existing = await container.unitOfWork.read((repositories) =>
        repositories.orders.list({
          page: 1,
          pageSize: 1,
          type: 'TABLE',
          statuses: ['OPEN', 'AWAITING_PAYMENT'],
          tableCode,
        }),
      );

      if (existing.total > 0) {
        continue;
      }

      await container.useCases.orders.openTable.execute({
        requestId: 'seed-tables',
        actorUserId,
        tableCode,
      });
      created += 1;
    }

    process.stdout.write(
      `Table seed complete: ${created} created, ${TABLE_NAMES.length - created} already active\n`,
    );
  } finally {
    await container.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
